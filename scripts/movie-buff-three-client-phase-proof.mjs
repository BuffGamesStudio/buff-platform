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
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-three-client-phase-evidence.json",
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
const cleanupRoomIds = new Set();
const cleanupMovieIds = new Set();

const evidence = {
  schemaVersion: 1,
  target: {
    kind: "local",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
  },
  startedAt: new Date().toISOString(),
  checks: [],
  phaseSequence: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    observedAt: new Date().toISOString(),
    details,
  });
}

function randomCode(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
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

async function expectRouteFailure(index, pathname, body, pattern) {
  const token = sessions[index]?.access_token;
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
  assert.ok(response.status >= 400, `${pathname} unexpectedly succeeded`);
  assert.match(String(payload?.error ?? ""), pattern);
  return { status: response.status, error: payload?.error };
}

async function phaseView(index, roomId) {
  const payload = await routePost(index, "/api/movie-buff/match/view", {
    roomId,
  });
  evidence.phaseSequence.push({
    playerIndex: index,
    phase: payload.view.phase,
    phaseVersion: payload.view.phaseVersion,
    roundNumber: payload.view.roundNumber,
    serverNow: payload.view.serverNow,
  });
  return payload.view;
}

async function createDisposableMatch() {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const boardId = crypto.randomUUID();
  const hostId = sessions[0].user.id;
  cleanupRoomIds.add(roomId);

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
    host_id: hostId,
    room_type: "private",
    status: "active",
    difficulty: "medium",
    total_rounds: 2,
    max_players: 3,
    current_round: 1,
    is_ranked: false,
    started_at: new Date().toISOString(),
  });
  if (roomError) throw roomError;

  const { error: memberError } = await admin.from("room_players").insert(
    sessions.map((session, index) => ({
      room_id: roomId,
      player_id: session.user.id,
      is_ready: true,
      is_host: index === 0,
      left_at: null,
      joined_at: new Date(Date.now() + index).toISOString(),
      last_seen_at: new Date().toISOString(),
    })),
  );
  if (memberError) throw memberError;

  const { error: matchError } = await admin.from("matches").insert({
    id: matchId,
    room_id: roomId,
    difficulty: "medium",
    total_rounds: 2,
    status: "active",
    started_at: new Date().toISOString(),
  });
  if (matchError) throw matchError;

  const { error: matchPlayerError } = await admin.from("match_players").insert(
    sessions.map((session) => ({
      match_id: matchId,
      player_id: session.user.id,
    })),
  );
  if (matchPlayerError) throw matchPlayerError;

  const { error: roundError } = await admin.from("match_rounds").insert({
    id: roundId,
    match_id: matchId,
    clip_id: null,
    round_number: 1,
    time_limit_seconds: 5,
    started_at: null,
  });
  if (roundError) throw roundError;

  const { error: boardError } = await admin.from("movie_buff_boards").insert({
    id: boardId,
    room_id: roomId,
    status: "ready",
    selector_player_id: hostId,
    tiles_used_count: 0,
    total_tiles_count: 3,
  });
  if (boardError) throw boardError;

  const tileIds = [];
  const titles = [];
  for (let index = 0; index < 3; index += 1) {
    const movieId = crypto.randomUUID();
    const clipId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const tileId = crypto.randomUUID();
    const title = `MOV-17 Phase Proof ${crypto.randomUUID()}`;
    cleanupMovieIds.add(movieId);
    titles.push(title);
    tileIds.push(tileId);

    const { error: movieError } = await admin.from("movies").insert({
      id: movieId,
      title,
      normalized_title: title.toLowerCase(),
      release_year: 2000 + index,
      difficulty: "medium",
      is_active: true,
    });
    if (movieError) throw movieError;

    const { error: clipError } = await admin.from("clips").insert({
      id: clipId,
      movie_id: movieId,
      clip_type: "video",
      media_url: `/api/movie-buff/generated/mov17-proof-${index}.mp4`,
      start_seconds: 0,
      end_seconds: 5,
      difficulty: "medium",
      licensing_status: "public_domain",
      is_active: true,
    });
    if (clipError) throw clipError;

    const { error: categoryError } = await admin
      .from("movie_buff_board_categories")
      .insert({
        id: categoryId,
        board_id: boardId,
        display_order: index,
        label: `Proof ${index + 1}`,
      });
    if (categoryError) throw categoryError;

    const { error: tileError } = await admin
      .from("movie_buff_board_tiles")
      .insert({
        id: tileId,
        board_id: boardId,
        board_category_id: categoryId,
        tile_order: 0,
        band: "fan_200",
        point_value: 200,
        clip_id: clipId,
        is_used: false,
      });
    if (tileError) throw tileError;
  }

  return { roomId, matchId, roundId, boardId, tileIds, titles };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

  const { error: profileError } = await admin.from("profiles").upsert(
    sessions.map((session, index) => ({
      id: session.user.id,
      display_name: `MOV-17 Phase Player ${index + 1}`,
    })),
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const context = await createDisposableMatch();

  const initialViews = await Promise.all(
    clients.map((_client, index) => phaseView(index, context.roomId)),
  );
  assert.ok(initialViews.every((view) => view.phase === "round_intro"));
  assert.equal(new Set(initialViews.map((view) => view.phaseVersion)).size, 1);
  record("three clients share one Round Intro phase/version");

  const { error: earlyAnswerError } = await clients[0].rpc(
    "submit_movie_buff_answer",
    {
      p_room_id: context.roomId,
      p_submitted_answer: context.titles[0],
    },
  );
  assert.ok(earlyAnswerError);
  assert.match(earlyAnswerError.message, /answer window is not open/i);
  record("direct answer before authoritative answer phase is rejected");

  await wait(4_250);
  const vipView = await phaseView(0, context.roomId);
  assert.equal(vipView.phase, "vip_lock");

  await Promise.all(
    clients.map((_client, index) =>
      routePost(index, "/api/movie-buff/vip/lock", {
        roomId: context.roomId,
        roundId: vipView.roundId,
        vipId: null,
        idempotencyKey: randomCode(`no_vip_${index}`),
      }),
    ),
  );
  record("MOV-16 required-human snapshot accepts one private lock per human");

  const boardViews = await Promise.all(
    clients.map((_client, index) => phaseView(index, context.roomId)),
  );
  assert.ok(boardViews.every((view) => view.phase === "board_select"));
  const selectorIndex = boardViews.findIndex((view) => view.callerIsSelector);
  assert.ok(selectorIndex >= 0);
  const nonSelectorIndex = (selectorIndex + 1) % 3;

  await expectRouteFailure(
    nonSelectorIndex,
    "/api/movie-buff/match/select",
    {
      roomId: context.roomId,
      tileId: context.tileIds[0],
      expectedVersion: boardViews[nonSelectorIndex].phaseVersion,
      idempotencyKey: randomCode("non_selector"),
    },
    /current active human selector/i,
  );
  record("non-selector cannot choose a board tile");

  const selectionKey = randomCode("selector");
  const selection = await routePost(
    selectorIndex,
    "/api/movie-buff/match/select",
    {
      roomId: context.roomId,
      tileId: context.tileIds[0],
      expectedVersion: boardViews[selectorIndex].phaseVersion,
      idempotencyKey: selectionKey,
    },
  );
  const duplicateSelection = await routePost(
    selectorIndex,
    "/api/movie-buff/match/select",
    {
      roomId: context.roomId,
      tileId: context.tileIds[0],
      expectedVersion: boardViews[selectorIndex].phaseVersion,
      idempotencyKey: selectionKey,
    },
  );
  assert.equal(selection.selection.tileId, duplicateSelection.selection.tileId);
  assert.equal(selection.selection.clipId, duplicateSelection.selection.clipId);

  await expectRouteFailure(
    selectorIndex,
    "/api/movie-buff/match/select",
    {
      roomId: context.roomId,
      tileId: context.tileIds[1],
      expectedVersion: boardViews[selectorIndex].phaseVersion,
      idempotencyKey: selectionKey,
    },
    /Contradictory duplicate/i,
  );
  record("selector selection is idempotent and contradictory replay fails");

  await wait(3_250);
  const playbackViews = await Promise.all(
    clients.map((_client, index) => phaseView(index, context.roomId)),
  );
  assert.ok(playbackViews.every((view) => view.phase === "playback"));
  assert.equal(
    new Set(playbackViews.map((view) => view.playbackStartsAt)).size,
    1,
  );
  record("three clients receive one synchronized playback timestamp", {
    playbackStartsAt: playbackViews[0].playbackStartsAt,
  });

  await wait(5_250);
  const answerViews = await Promise.all(
    clients.map((_client, index) => phaseView(index, context.roomId)),
  );
  assert.ok(answerViews.every((view) => view.phase === "answer"));
  assert.equal(
    new Set(answerViews.map((view) => view.answerDeadlineAt)).size,
    1,
  );

  await Promise.all(
    clients.map((client) =>
      client.rpc("submit_movie_buff_answer", {
        p_room_id: context.roomId,
        p_submitted_answer: context.titles[0],
      }),
    ),
  ).then((results) => {
    for (const result of results) {
      if (result.error) throw result.error;
    }
  });

  const resultsView = await phaseView(0, context.roomId);
  assert.equal(resultsView.phase, "results");
  record("all human answers advance once to synchronized results");

  await wait(8_250);
  const roundTwoView = await phaseView(0, context.roomId);
  assert.equal(roundTwoView.phase, "round_intro");
  assert.equal(roundTwoView.roundNumber, 2);
  assert.notEqual(
    roundTwoView.selectorSeatIndex,
    initialViews[0].selectorSeatIndex,
  );
  record("results advance automatically to next Round Intro and rotate selector");

  const busterPlayerId = roundTwoView.selectorPlayerId;
  const busterIndex = sessions.findIndex(
    (session) => session.user.id === busterPlayerId,
  );
  assert.ok(busterIndex >= 0);

  const { error: graceError } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      last_seen_at: new Date(Date.now() - 60_000).toISOString(),
      reconnect_deadline_at: new Date(Date.now() - 1_000).toISOString(),
    })
    .eq("match_id", context.matchId)
    .eq("original_player_id", busterPlayerId);
  if (graceError) throw graceError;

  const otherIndex = (busterIndex + 1) % 3;
  await routePost(otherIndex, "/api/movie-buff/match/advance", {
    roomId: context.roomId,
    expectedVersion: roundTwoView.phaseVersion,
  });

  await expectRouteFailure(
    busterIndex,
    "/api/movie-buff/match/view",
    { roomId: context.roomId },
    /(Room access denied|abandoned)/i,
  );
  record("grace expiry abandons the stable seat and blocks resume");

  await wait(4_250);
  const roundTwoVip = await phaseView(otherIndex, context.roomId);
  assert.equal(roundTwoVip.phase, "vip_lock");

  const remainingIndexes = [0, 1, 2].filter((index) => index !== busterIndex);
  await Promise.all(
    remainingIndexes.map((index) =>
      routePost(index, "/api/movie-buff/vip/lock", {
        roomId: context.roomId,
        roundId: roundTwoVip.roundId,
        vipId: null,
        idempotencyKey: randomCode(`round2_no_vip_${index}`),
      }),
    ),
  );

  const busterBoardView = await phaseView(otherIndex, context.roomId);
  assert.equal(busterBoardView.phase, "board_select");
  assert.equal(busterBoardView.selectorControllerType, "buster");

  const { error: deadlineError } = await admin
    .from("movie_buff_match_phase_state")
    .update({ selector_deadline_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("match_id", context.matchId);
  if (deadlineError) throw deadlineError;

  const timeoutView = await phaseView(otherIndex, context.roomId);
  assert.equal(timeoutView.phase, "transition");
  assert.equal(timeoutView.selectionSource, "buster_timeout");
  assert.equal(timeoutView.selectedTileId, context.tileIds[1]);
  record("abandoned selector cannot stall and Buster picks deterministically");

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
  for (const roomId of cleanupRoomIds) {
    await admin.from("game_rooms").delete().eq("id", roomId);
  }
  for (const movieId of cleanupMovieIds) {
    await admin.from("movies").delete().eq("id", movieId);
  }
  await Promise.all(clients.map((client) => client.auth.signOut()));
}
