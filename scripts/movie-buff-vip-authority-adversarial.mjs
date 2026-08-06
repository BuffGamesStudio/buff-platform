import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersJson = process.env.MOVIE_BUFF_VIP_TEST_USERS;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const commandLabel = process.env.MOVIE_BUFF_EVIDENCE_COMMAND?.trim();
const allowLocalDeletions = process.env.MOVIE_BUFF_ALLOW_LOCAL_DELETIONS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-authority-adversarial-evidence.json",
);

if (
  !supabaseUrl ||
  !publishableKey ||
  !serviceRoleKey ||
  !appUrl ||
  !usersJson ||
  !expectedGitSha ||
  !commandLabel
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_APP_URL, MOVIE_BUFF_VIP_TEST_USERS, MOVIE_BUFF_EXPECTED_GIT_SHA, and MOVIE_BUFF_EVIDENCE_COMMAND are required.",
  );
}

if (allowLocalDeletions !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES to authorize cleanup of only objects created by this disposable local proof.",
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
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedGitSha, "checkout HEAD does not match expected SHA");

const users = JSON.parse(usersJson);
assert.equal(users.length, 4, "exactly four local test credentials are required");
assert.equal(new Set(users.map((user) => user.email)).size, 4);

const sourceFiles = [
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "src/lib/game/movieBuffVipPhasePolicy.ts",
  "src/lib/game/movieBuffVipService.ts",
  "src/app/games/movie-buff/round-intro/layout.tsx",
  "scripts/movie-buff-vip-authority-adversarial.mjs",
];

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

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
const createdRooms = new Set();
const createdDefinitions = new Set();
const runStartedAt = Date.now();

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  exitCode: null,
  gitSha,
  expectedGitSha,
  command: commandLabel,
  nodeVersion: process.version,
  target: {
    kind: "local",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
  },
  sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha256(file)])),
  startedAt: new Date(runStartedAt).toISOString(),
  checks: [],
  cleanup: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    observedAt: new Date().toISOString(),
    details,
  });
}

function randomKey(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function roomCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

async function routeCall(index, pathname, body) {
  const token = sessions[index]?.access_token;
  assert.ok(token, `missing bearer token for user ${index + 1}`);
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
  return { status: response.status, payload };
}

async function routeOk(index, pathname, body) {
  const result = await routeCall(index, pathname, body);
  assert.equal(
    result.status,
    200,
    `${pathname} returned ${result.status}: ${JSON.stringify(result.payload)}`,
  );
  return result.payload;
}

async function routeFails(index, pathname, body, pattern) {
  const result = await routeCall(index, pathname, body);
  assert.ok(result.status >= 400, `${pathname} unexpectedly succeeded`);
  assert.match(String(result.payload?.error ?? ""), pattern);
  return result;
}

async function createContext(participantIndexes, roundNumber = 1) {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  const hostId = sessions[participantIndexes[0]].user.id;

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: roomCode(),
    host_id: hostId,
    room_type: "private",
    status: "active",
    category_id: null,
    difficulty: "medium",
    total_rounds: 10,
    max_players: 4,
    current_round: roundNumber,
    is_ranked: false,
    started_at: now,
  });
  if (roomError) throw roomError;
  createdRooms.add(roomId);

  const { error: memberError } = await admin.from("room_players").insert(
    participantIndexes.map((index, position) => ({
      room_id: roomId,
      player_id: sessions[index].user.id,
      is_ready: true,
      is_host: position === 0,
      left_at: null,
      joined_at: now,
      last_seen_at: now,
    })),
  );
  if (memberError) throw memberError;

  const { error: matchError } = await admin.from("matches").insert({
    id: matchId,
    room_id: roomId,
    category_id: null,
    difficulty: "medium",
    total_rounds: 10,
    status: "active",
    started_at: now,
  });
  if (matchError) throw matchError;

  const { error: matchPlayerError } = await admin.from("match_players").insert(
    participantIndexes.map((index) => ({
      match_id: matchId,
      player_id: sessions[index].user.id,
    })),
  );
  if (matchPlayerError) throw matchPlayerError;

  const { error: roundError } = await admin.from("match_rounds").insert({
    id: roundId,
    match_id: matchId,
    round_number: roundNumber,
    time_limit_seconds: 30,
    started_at: now,
  });
  if (roundError) throw roundError;

  return { roomId, matchId, roundId, participantIndexes };
}

async function createDefinition(name, activationWindow = "answer") {
  const id = crypto.randomUUID();
  const { error } = await admin.from("movie_buff_vip_definitions").insert({
    id,
    code: `mov16_${crypto.randomUUID().replaceAll("-", "")}`,
    name,
    description: "Disposable local MOV-16 adversarial proof VIP.",
    effect_scope: "personal",
    activation_window: activationWindow,
    is_stackable: false,
    max_per_round: 1,
    cooldown_seconds: 0,
    is_active: true,
    eligibility_configured: true,
    allowed_room_types: ["private"],
    allowed_difficulties: ["medium"],
    allow_any_category: true,
    allowed_category_ids: [],
    minimum_round_number: 1,
    maximum_round_number: 10,
    allow_ranked: false,
    allow_unranked: true,
  });
  if (error) throw error;
  createdDefinitions.add(id);
  return id;
}

async function grant(playerIndex, vipId, quantity = 2) {
  const id = crypto.randomUUID();
  const { error } = await admin.from("movie_buff_vip_inventory").insert({
    id,
    player_id: sessions[playerIndex].user.id,
    vip_id: vipId,
    quantity_remaining: quantity,
  });
  if (error) throw error;
  return id;
}

async function openWindow(context, indexes, deadline) {
  return admin.rpc("open_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_match_id: context.matchId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
    p_required_player_ids: indexes.map((index) => sessions[index].user.id),
  });
}

async function setActivationPhase(context, phase) {
  const { error } = await admin.rpc("set_movie_buff_vip_activation_phase", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_activation_phase: phase,
  });
  if (error) throw error;
}

async function releaseRequired(context, playerIndex, reason) {
  return admin.rpc("release_movie_buff_vip_required_player", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_player_id: sessions[playerIndex].user.id,
    p_release_reason: reason,
  });
}

async function assertCleanIdentities() {
  const ids = sessions.map((session) => session.user.id);
  const { data, error } = await admin
    .from("room_players")
    .select("room_id,player_id")
    .in("player_id", ids)
    .is("left_at", null);
  if (error) throw error;
  assert.equal(
    data?.length ?? 0,
    0,
    "test identities already have active rooms; use a clean disposable local database",
  );
}

async function cleanup() {
  for (const roomId of [...createdRooms]) {
    const { data: room, error: roomError } = await admin
      .from("game_rooms")
      .select("id,created_at")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) {
      evidence.cleanup.push({ roomId, error: roomError.message });
      continue;
    }
    if (!room) {
      createdRooms.delete(roomId);
      continue;
    }
    if (Date.parse(room.created_at) < runStartedAt - 5000) {
      evidence.cleanup.push({ roomId, error: "refused pre-run room deletion" });
      continue;
    }
    const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
    evidence.cleanup.push({
      roomId,
      deleted: !error,
      error: error?.message ?? null,
    });
    if (!error) createdRooms.delete(roomId);
  }

  for (const vipId of [...createdDefinitions]) {
    await admin.from("movie_buff_vip_inventory").delete().eq("vip_id", vipId);
    const { error } = await admin
      .from("movie_buff_vip_definitions")
      .delete()
      .eq("id", vipId);
    evidence.cleanup.push({ vipId, deleted: !error, error: error?.message ?? null });
    if (!error) createdDefinitions.delete(vipId);
  }
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );
  assert.equal(new Set(sessions.map((session) => session.user.id)).size, 4);
  await assertCleanIdentities();
  record("clean local four-persona preflight");

  const noWindow = await createContext([0], 1);
  const noWindowRelease = await releaseRequired(noWindow, 0, "reconnect_grace_expired");
  assert.equal(noWindowRelease.error, null);
  assert.equal(noWindowRelease.data.status, "unavailable");
  assert.equal(noWindowRelease.data.released, false);
  record("release before VIP window is a safe idempotent no-op");

  const windowRace = await createContext([0, 1], 2);
  const deadline = new Date(Date.now() + 60_000);
  const [openA, openB] = await Promise.all([
    openWindow(windowRace, [0, 1], deadline),
    openWindow(windowRace, [0, 1], deadline),
  ]);
  assert.equal(openA.error, null);
  assert.equal(openB.error, null);
  assert.deepEqual(openA.data, openB.data);

  const conflictingWindow = await openWindow(windowRace, [0], deadline);
  assert.ok(conflictingWindow.error);
  assert.match(conflictingWindow.error.message, /contradictory/i);

  const invalidIdentityWindow = await createContext([0], 3);
  const invalidOpen = await openWindow(invalidIdentityWindow, [0, 2], deadline);
  assert.ok(invalidOpen.error);
  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);

  const { data: requiredRows, error: requiredError } = await admin
    .from("movie_buff_vip_round_required_players")
    .select("player_id,released_at")
    .eq("round_id", windowRace.roundId)
    .order("player_id");
  if (requiredError) throw requiredError;
  assert.deepEqual(
    requiredRows.map((row) => row.player_id),
    [sessions[0].user.id, sessions[1].user.id].sort(),
  );
  record("window race preserves one exact immutable identity snapshot");

  const vipA = await createDefinition("MOV-16 Race VIP A", "answer");
  const vipB = await createDefinition("MOV-16 Race VIP B", "answer");
  await grant(0, vipA, 3);
  await grant(0, vipB, 2);

  const identicalLockKey = randomKey("identical-lock");
  const [lockA, lockB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: windowRace.roomId,
      roundId: windowRace.roundId,
      vipId: vipA,
      idempotencyKey: identicalLockKey,
      playerId: sessions[1].user.id,
      quantityRemaining: 999,
    }),
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: windowRace.roomId,
      roundId: windowRace.roundId,
      vipId: vipA,
      idempotencyKey: identicalLockKey,
    }),
  ]);
  assert.equal(lockA.status, 200);
  assert.equal(lockB.status, 200);
  assert.equal(lockA.payload.lock.lockId, lockB.payload.lock.lockId);

  const contradictoryContext = await createContext([0], 4);
  await openWindow(contradictoryContext, [0], new Date(Date.now() + 60_000));
  const contradictoryResults = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipA,
      idempotencyKey: randomKey("choice-a"),
    }),
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipB,
      idempotencyKey: randomKey("choice-b"),
    }),
  ]);
  assert.equal(contradictoryResults.filter((result) => result.status === 200).length, 1);
  assert.equal(contradictoryResults.filter((result) => result.status >= 400).length, 1);
  assert.match(
    String(contradictoryResults.find((result) => result.status >= 400)?.payload?.error ?? ""),
    /different choice/i,
  );
  record("identical and contradictory lock races converge safely");

  const firstRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");
  assert.equal(firstRelease.error, null);
  assert.equal(firstRelease.data.released, true);
  const repeatedRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");
  assert.equal(repeatedRelease.error, null);
  assert.equal(repeatedRelease.data.idempotent, true);
  const contradictoryRelease = await releaseRequired(windowRace, 0, "manual_abandonment");
  assert.ok(contradictoryRelease.error);
  assert.match(contradictoryRelease.error.message, /different reason/i);

  await routeFails(
    0,
    "/api/movie-buff/vip/view",
    { roomId: windowRace.roomId, roundId: windowRace.roundId },
    /not required/i,
  );
  const remainingView = await routeOk(1, "/api/movie-buff/vip/view", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
  });
  assert.equal(remainingView.view.requiredPlayerCount, 1);
  assert.equal(remainingView.view.lockedCount, 0);
  record("released identity and its old lock no longer count toward readiness");

  await routeOk(1, "/api/movie-buff/vip/lock", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
    vipId: null,
    idempotencyKey: randomKey("remaining-pass"),
  });
  const closedView = await routeOk(1, "/api/movie-buff/vip/view", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
  });
  assert.equal(closedView.view.status, "closed");
  assert.equal(closedView.view.advanceReady, true);

  const activationContext = await createContext([0], 5);
  await openWindow(activationContext, [0], new Date(Date.now() + 60_000));
  const activationVip = await createDefinition("MOV-16 Activation VIP", "answer");
  const activationInventory = await grant(0, activationVip, 2);
  await routeOk(0, "/api/movie-buff/vip/lock", {
    roomId: activationContext.roomId,
    roundId: activationContext.roundId,
    vipId: activationVip,
    idempotencyKey: randomKey("activation-lock"),
  });

  await setActivationPhase(activationContext, "playback");
  await routeFails(
    0,
    "/api/movie-buff/vip/activate",
    {
      roomId: activationContext.roomId,
      roundId: activationContext.roundId,
      activationKey: randomKey("wrong-phase"),
    },
    /current server phase/i,
  );

  await setActivationPhase(activationContext, "answer");
  const activationKey = randomKey("activation");
  const [activationA, activationB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationContext.roomId,
      roundId: activationContext.roundId,
      activationKey,
    }),
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationContext.roomId,
      roundId: activationContext.roundId,
      activationKey,
    }),
  ]);
  assert.equal(activationA.status, 200);
  assert.equal(activationB.status, 200);
  assert.equal(
    activationA.payload.activation.lockId,
    activationB.payload.activation.lockId,
  );

  const { data: inventoryAfter, error: inventoryAfterError } = await admin
    .from("movie_buff_vip_inventory")
    .select("quantity_remaining")
    .eq("id", activationInventory)
    .single();
  if (inventoryAfterError) throw inventoryAfterError;
  assert.equal(inventoryAfter.quantity_remaining, 1);

  const { count: consumptionCount, error: consumptionError } = await admin
    .from("movie_buff_vip_consumptions")
    .select("id", { count: "exact", head: true })
    .eq("round_id", activationContext.roundId);
  // The current table is keyed by lock, not round; verify through the lock row if
  // PostgREST rejects the optional round filter on an older local schema.
  if (consumptionError && !/round_id/i.test(consumptionError.message)) {
    throw consumptionError;
  }
  const { data: activationLock, error: activationLockError } = await admin
    .from("movie_buff_vip_round_locks")
    .select("id")
    .eq("round_id", activationContext.roundId)
    .eq("player_id", sessions[0].user.id)
    .single();
  if (activationLockError) throw activationLockError;
  const { count: lockConsumptionCount, error: lockConsumptionError } = await admin
    .from("movie_buff_vip_consumptions")
    .select("id", { count: "exact", head: true })
    .eq("lock_id", activationLock.id);
  if (lockConsumptionError) throw lockConsumptionError;
  assert.equal(lockConsumptionCount, 1);
  record("wrong phase fails and concurrent activation consumes exactly once", {
    optionalRoundConsumptionCount: consumptionCount ?? null,
  });

  evidence.classification = "PASS";
  evidence.exitCode = 0;
  evidence.finishedAt = new Date().toISOString();
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  await cleanup();
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      outputPath,
      classification: evidence.classification,
      exitCode: evidence.exitCode,
      gitSha,
      checks: evidence.checks.length,
    },
    null,
    2,
  ),
);

if (evidence.exitCode !== 0) {
  process.exitCode = evidence.exitCode;
}
