import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersJson = process.env.MOVIE_BUFF_PHASE_TEST_USERS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT ??
    "movie-buff-reconnect-race-evidence.json",
);

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !appUrl || !usersJson) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_APP_URL, and MOVIE_BUFF_PHASE_TEST_USERS are required.",
  );
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed.origin;
}

const localSupabaseOrigin = requireLocal(supabaseUrl, "Supabase");
const localAppOrigin = requireLocal(appUrl, "application");
const users = JSON.parse(usersJson);
assert.equal(users.length, 3, "exactly three distinct local test credentials are required");
assert.equal(new Set(users.map((user) => user.email)).size, 3);

function browserClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clients = users.map(() => browserClient());
const sessions = [];
let cleanupRoomId = null;

const evidence = {
  schemaVersion: 1,
  target: {
    kind: "local",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
  },
  startedAt: new Date().toISOString(),
  checks: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    observedAt: new Date().toISOString(),
    details,
  });
}

async function routePost(index, pathname, body, expectedStatus = 200) {
  const token = sessions[index]?.access_token;
  assert.ok(token, `missing access token for player ${index + 1}`);
  const response = await fetch(`${localAppOrigin}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expectedStatus,
    `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function phaseView(index, roomId) {
  const payload = await routePost(index, "/api/movie-buff/match/view", { roomId });
  return payload.view;
}

async function createDisposableMatch() {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  cleanupRoomId = roomId;

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
    host_id: sessions[0].user.id,
    room_type: "private",
    status: "active",
    difficulty: "medium",
    total_rounds: 2,
    max_players: 3,
    current_round: 1,
    is_ranked: false,
    started_at: now,
  });
  if (roomError) throw roomError;

  const { error: membersError } = await admin.from("room_players").insert(
    sessions.map((session, index) => ({
      room_id: roomId,
      player_id: session.user.id,
      is_ready: true,
      is_host: index === 0,
      left_at: null,
      joined_at: new Date(Date.now() + index).toISOString(),
      last_seen_at: now,
    })),
  );
  if (membersError) throw membersError;

  const { error: matchError } = await admin.from("matches").insert({
    id: matchId,
    room_id: roomId,
    difficulty: "medium",
    total_rounds: 2,
    status: "active",
    started_at: now,
  });
  if (matchError) throw matchError;

  const { error: playersError } = await admin.from("match_players").insert(
    sessions.map((session) => ({
      match_id: matchId,
      player_id: session.user.id,
    })),
  );
  if (playersError) throw playersError;

  const { error: roundError } = await admin.from("match_rounds").insert({
    id: roundId,
    match_id: matchId,
    clip_id: null,
    round_number: 1,
    time_limit_seconds: 5,
    started_at: null,
  });
  if (roundError) throw roundError;

  return { roomId, matchId, roundId };
}

async function seatFor(matchId, playerId) {
  const { data, error } = await admin
    .from("movie_buff_match_participant_seats")
    .select(
      "seat_index,original_player_id,controller_type,controller_player_id,participant_state,reconnect_deadline_at,replacement_ready_at",
    )
    .eq("match_id", matchId)
    .eq("original_player_id", playerId)
    .single();
  if (error) throw error;
  return data;
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(
          `Unable to authenticate player ${index + 1}: ${error?.message ?? "unknown"}`,
        );
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );

  const context = await createDisposableMatch();
  const initialViews = await Promise.all(
    clients.map((_client, index) => phaseView(index, context.roomId)),
  );
  assert.ok(initialViews.every((view) => view.phase === "round_intro"));
  assert.equal(new Set(initialViews.map((view) => view.phaseVersion)).size, 1);

  const reconnectIndex = 0;
  const otherIndex = 1;
  const reconnectPlayerId = sessions[reconnectIndex].user.id;

  const preDeadlineReconnect = new Date(Date.now() + 30_000).toISOString();
  const { error: preDeadlineSetupError } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      controller_type: "human",
      controller_player_id: reconnectPlayerId,
      last_seen_at: new Date(Date.now() - 15_000).toISOString(),
      reconnect_deadline_at: preDeadlineReconnect,
      replacement_ready_at: null,
    })
    .eq("match_id", context.matchId)
    .eq("original_player_id", reconnectPlayerId);
  if (preDeadlineSetupError) throw preDeadlineSetupError;

  const { data: preDeadlineResult, error: preDeadlineError } =
    await clients[reconnectIndex].rpc("touch_movie_buff_match_participant", {
      p_room_id: context.roomId,
    });
  if (preDeadlineError) throw preDeadlineError;
  assert.equal(preDeadlineResult.resumeAllowed, true);
  assert.equal(preDeadlineResult.participantState, "active");
  const resumedSeat = await seatFor(context.matchId, reconnectPlayerId);
  assert.equal(resumedSeat.participant_state, "active");
  assert.equal(resumedSeat.reconnect_deadline_at, null);
  record("preDeadlineReconnect restores the stable human seat", {
    preDeadlineReconnect,
    resumeAllowed: preDeadlineResult.resumeAllowed,
  });

  const expiredDeadline = new Date(Date.now() - 1_000).toISOString();
  const { error: expiredSetupError } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      controller_type: "human",
      controller_player_id: reconnectPlayerId,
      last_seen_at: new Date(Date.now() - 60_000).toISOString(),
      reconnect_deadline_at: expiredDeadline,
      abandoned_at: null,
      replacement_ready_at: null,
    })
    .eq("match_id", context.matchId)
    .eq("original_player_id", reconnectPlayerId);
  if (expiredSetupError) throw expiredSetupError;

  const expiredReconnectRace = await Promise.allSettled([
    clients[reconnectIndex].rpc("touch_movie_buff_match_participant", {
      p_room_id: context.roomId,
    }),
    routePost(otherIndex, "/api/movie-buff/match/advance", {
      roomId: context.roomId,
      expectedVersion: initialViews[otherIndex].phaseVersion,
    }),
  ]);

  const reconnectAttempt = expiredReconnectRace[0];
  if (reconnectAttempt.status === "fulfilled") {
    assert.notEqual(reconnectAttempt.value.data?.resumeAllowed, true);
  }

  const abandonedSeat = await seatFor(context.matchId, reconnectPlayerId);
  assert.equal(abandonedSeat.participant_state, "abandoned");
  assert.equal(abandonedSeat.controller_type, "human");
  assert.equal(abandonedSeat.controller_player_id, reconnectPlayerId);
  assert.ok(abandonedSeat.replacement_ready_at);

  const { data: abandonedMember, error: abandonedMemberError } = await admin
    .from("room_players")
    .select("left_at")
    .eq("room_id", context.roomId)
    .eq("player_id", reconnectPlayerId)
    .single();
  if (abandonedMemberError) throw abandonedMemberError;
  assert.ok(abandonedMember.left_at);
  record("expiredReconnectRace cannot restore after the deadline", {
    expiredDeadline,
    reconnectAttemptStatus: reconnectAttempt.status,
    resumeAllowed:
      reconnectAttempt.status === "fulfilled"
        ? reconnectAttempt.value.data?.resumeAllowed ?? false
        : false,
  });

  const { error: readyError } = await admin
    .from("movie_buff_match_participant_seats")
    .update({ replacement_ready_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("match_id", context.matchId)
    .eq("original_player_id", reconnectPlayerId);
  if (readyError) throw readyError;

  const introView = await phaseView(otherIndex, context.roomId);
  assert.equal(introView.phase, "round_intro");
  assert.equal((await seatFor(context.matchId, reconnectPlayerId)).controller_type, "human");

  const { error: vipPhaseError } = await admin
    .from("movie_buff_match_phase_state")
    .update({
      phase: "vip_lock",
      phase_version: introView.phaseVersion + 1,
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + 30_000).toISOString(),
      selector_deadline_at: null,
    })
    .eq("match_id", context.matchId);
  if (vipPhaseError) throw vipPhaseError;

  const vipBoundaryView = await phaseView(otherIndex, context.roomId);
  assert.equal(vipBoundaryView.phase, "vip_lock");
  assert.equal((await seatFor(context.matchId, reconnectPlayerId)).controller_type, "human");
  record("Buster remains inactive through Round Intro and private VIP lock");

  const abandonedSelectorSeat = await seatFor(context.matchId, reconnectPlayerId);
  const { error: boardPhaseError } = await admin
    .from("movie_buff_match_phase_state")
    .update({
      phase: "board_select",
      phase_version: vipBoundaryView.phaseVersion + 1,
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + 20_000).toISOString(),
      selector_seat_index: abandonedSelectorSeat.seat_index,
      selector_deadline_at: new Date(Date.now() + 20_000).toISOString(),
    })
    .eq("match_id", context.matchId);
  if (boardPhaseError) throw boardPhaseError;

  const boardBoundaryView = await phaseView(otherIndex, context.roomId);
  assert.equal(boardBoundaryView.phase, "board_select");
  assert.equal(boardBoundaryView.selectorControllerType, "buster");
  assert.equal((await seatFor(context.matchId, reconnectPlayerId)).controller_type, "buster");
  record("Buster activates only when the authoritative phase reaches board_select");

  evidence.classification = "PASS";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath,
        classification: "PASS",
        checks: evidence.checks.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  evidence.classification = "FAIL";
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  if (cleanupRoomId) {
    await admin.from("game_rooms").delete().eq("id", cleanupRoomId);
  }
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
}
