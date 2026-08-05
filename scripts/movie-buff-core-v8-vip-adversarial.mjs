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
const dbHost = process.env.MOVIE_BUFF_LOCAL_DB_HOST ?? "127.0.0.1";
const dbPort = process.env.MOVIE_BUFF_LOCAL_DB_PORT ?? "55322";
const dbName = process.env.MOVIE_BUFF_LOCAL_DB_NAME ?? "postgres";
const dbUser = process.env.MOVIE_BUFF_LOCAL_DB_USER ?? "postgres";
const dbPassword = process.env.MOVIE_BUFF_LOCAL_DB_PASSWORD ?? "postgres";
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-core-v8-vip-adversarial-evidence.json",
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
    "Set MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES for disposable local fixture cleanup.",
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
assert.ok(["localhost", "127.0.0.1", "::1"].includes(dbHost));
assert.match(dbPort, /^\d{2,5}$/);
assert.equal(dbName, "postgres");
assert.equal(dbUser, "postgres");

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
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
  "src/lib/game/movieBuffVipPhasePolicy.ts",
  "src/lib/game/movieBuffVipService.ts",
  "scripts/movie-buff-core-v8-vip-adversarial.mjs",
];

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      kind: "Error",
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  if (error && typeof error === "object") {
    const safe = {};
    for (const key of ["name", "message", "code", "details", "hint", "status"]) {
      const value = error[key];
      if (["string", "number", "boolean"].includes(typeof value) || value === null) {
        safe[key] = value;
      }
    }
    return {
      kind: "object",
      constructor: error.constructor?.name ?? null,
      keys: Object.keys(error).sort(),
      safe,
    };
  }
  return { kind: typeof error, value: String(error) };
}

function uuid(value, label = "uuid") {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, label);
  return value;
}
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function sqlUuid(value) {
  return `${sqlText(uuid(value))}::uuid`;
}
function runOwnerSql(sql) {
  return execFileSync(
    "psql",
    [
      "-h", dbHost,
      "-p", dbPort,
      "-U", dbUser,
      "-d", dbName,
      "-v", "ON_ERROR_STOP=1",
      "-X",
      "-At",
    ],
    {
      input: sql,
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: dbPassword },
      maxBuffer: 4 * 1024 * 1024,
    },
  ).trim();
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
  schemaVersion: 2,
  lane: "MOV-16",
  classification: "UNKNOWN",
  exitCode: null,
  command: commandLabel,
  gitSha,
  expectedGitSha,
  nodeVersion: process.version,
  target: {
    kind: "disposable-localhost",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
    fixtureAuthority: "local-database-owner",
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

function createContext(participantIndexes, roundNumber = 1) {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  const hostId = sessions[participantIndexes[0]].user.id;
  const memberValues = participantIndexes
    .map((index, position) =>
      `(${sqlUuid(roomId)},${sqlUuid(sessions[index].user.id)},true,${position === 0 ? "true" : "false"},${sqlText(now)}::timestamptz,${sqlText(now)}::timestamptz)`,
    )
    .join(",\n");
  const matchPlayerValues = participantIndexes
    .map((index) => `(${sqlUuid(matchId)},${sqlUuid(sessions[index].user.id)})`)
    .join(",\n");
  runOwnerSql(`
    begin;
    insert into public.game_rooms (
      id, room_code, host_id, room_type, status, category_id, difficulty,
      total_rounds, max_players, current_round, is_ranked, started_at
    ) values (
      ${sqlUuid(roomId)}, ${sqlText(roomCode())}, ${sqlUuid(hostId)}, 'private',
      'active', null, 'medium', 10, 4, ${Number(roundNumber)}, false,
      ${sqlText(now)}::timestamptz
    );
    insert into public.room_players (
      room_id, player_id, is_ready, is_host, joined_at, last_seen_at
    ) values ${memberValues};
    insert into public.matches (
      id, room_id, category_id, difficulty, total_rounds, status, started_at
    ) values (
      ${sqlUuid(matchId)}, ${sqlUuid(roomId)}, null, 'medium', 10, 'active',
      ${sqlText(now)}::timestamptz
    );
    insert into public.match_players (match_id, player_id)
    values ${matchPlayerValues};
    insert into public.match_rounds (
      id, match_id, round_number, time_limit_seconds, started_at
    ) values (
      ${sqlUuid(roundId)}, ${sqlUuid(matchId)}, ${Number(roundNumber)}, 30,
      ${sqlText(now)}::timestamptz
    );
    commit;
  `);
  createdRooms.add(roomId);
  return { roomId, matchId, roundId, participantIndexes };
}

function createDefinition(name, activationWindow = "answer") {
  const id = crypto.randomUUID();
  const code = `mov16_${crypto.randomUUID().replaceAll("-", "")}`;
  runOwnerSql(`
    insert into public.movie_buff_vip_definitions (
      id, code, name, description, effect_scope, activation_window,
      is_stackable, max_per_round, cooldown_seconds, is_active,
      eligibility_configured, allowed_room_types, allowed_difficulties,
      allow_any_category, allowed_category_ids, minimum_round_number,
      maximum_round_number, allow_ranked, allow_unranked
    ) values (
      ${sqlUuid(id)}, ${sqlText(code)}, ${sqlText(name)},
      'Disposable local MOV-16 adversarial proof VIP.', 'personal',
      ${sqlText(activationWindow)}, false, 1, 0, true, true,
      array['private']::text[], array['medium']::text[], true, array[]::uuid[],
      1, 10, false, true
    );
  `);
  createdDefinitions.add(id);
  return id;
}

function grantInventory(playerIndex, vipId, quantity = 2) {
  const id = crypto.randomUUID();
  runOwnerSql(`
    insert into public.movie_buff_vip_inventory (
      id, player_id, vip_id, quantity_remaining
    ) values (
      ${sqlUuid(id)}, ${sqlUuid(sessions[playerIndex].user.id)},
      ${sqlUuid(vipId)}, ${Number(quantity)}
    );
  `);
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
async function finalize(context, deadline) {
  return admin.rpc("finalize_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
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
  assert.equal(data?.length ?? 0, 0, "test identities already have active rooms");
}

function cleanupOwnerFixtures() {
  for (const roomId of [...createdRooms]) {
    try {
      const createdAt = runOwnerSql(
        `select created_at::text from public.game_rooms where id=${sqlUuid(roomId)};`,
      );
      if (createdAt && Date.parse(createdAt) < runStartedAt - 5000) {
        throw new Error("refused pre-run room deletion");
      }
      runOwnerSql(`delete from public.game_rooms where id=${sqlUuid(roomId)};`);
      createdRooms.delete(roomId);
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({
        kind: "room",
        id: roomId,
        classification: "FAIL",
        error: serializeError(error),
      });
    }
  }
  for (const vipId of [...createdDefinitions]) {
    try {
      runOwnerSql(`
        delete from public.movie_buff_vip_inventory where vip_id=${sqlUuid(vipId)};
        delete from public.movie_buff_vip_definitions where id=${sqlUuid(vipId)};
      `);
      createdDefinitions.delete(vipId);
      evidence.cleanup.push({ kind: "vip", id: vipId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({
        kind: "vip",
        id: vipId,
        classification: "FAIL",
        error: serializeError(error),
      });
    }
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
  record("clean authenticated four-persona preflight");

  const noWindow = createContext([0], 1);
  const noWindowRelease = await releaseRequired(noWindow, 0, "reconnect_grace_expired");
  assert.equal(noWindowRelease.error, null);
  assert.equal(noWindowRelease.data.status, "unavailable");
  assert.equal(noWindowRelease.data.released, false);
  record("release before VIP window is a safe idempotent no-op");

  const windowRace = createContext([0, 1], 2);
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

  const invalidIdentityWindow = createContext([0], 3);
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
  record("window race preserves one immutable identity snapshot");

  const vipA = createDefinition("MOV-16 Race VIP A", "answer");
  const vipB = createDefinition("MOV-16 Race VIP B", "answer");
  grantInventory(0, vipA, 3);
  grantInventory(0, vipB, 2);

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

  const contradictoryContext = createContext([0], 4);
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
  record("release removes identity and prior lock from readiness");

  const activationContext = createContext([0], 5);
  await openWindow(activationContext, [0], new Date(Date.now() + 60_000));
  const activationVip = createDefinition("MOV-16 Activation VIP", "answer");
  const activationInventory = grantInventory(0, activationVip, 2);
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
  assert.equal(activationA.payload.activation.lockId, activationB.payload.activation.lockId);
  const inventoryRemaining = Number(
    runOwnerSql(
      `select quantity_remaining from public.movie_buff_vip_inventory where id=${sqlUuid(activationInventory)};`,
    ),
  );
  assert.equal(inventoryRemaining, 1);
  const activationLockId = runOwnerSql(`
    select id::text from public.movie_buff_vip_round_locks
    where round_id=${sqlUuid(activationContext.roundId)}
      and player_id=${sqlUuid(sessions[0].user.id)};
  `);
  uuid(activationLockId, "activation lock id");
  const consumptionCount = Number(
    runOwnerSql(
      `select count(*) from public.movie_buff_vip_consumptions where lock_id=${sqlUuid(activationLockId)};`,
    ),
  );
  assert.equal(consumptionCount, 1);
  record("wrong phase fails and concurrent activation consumes exactly once");

  const finalizerContext = createContext([2, 3], 6);
  const finalizerDeadline = new Date(Date.now() + 1800);
  const finalizerOpen = await openWindow(finalizerContext, [2, 3], finalizerDeadline);
  assert.equal(finalizerOpen.error, null);
  const earlyFinalize = await finalize(finalizerContext, finalizerDeadline);
  assert.equal(earlyFinalize.error, null);
  assert.equal(earlyFinalize.data.advanceReady, false);
  assert.equal(earlyFinalize.data.status, "open");
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, finalizerDeadline.getTime() - Date.now() + 200)),
  );
  const [finalizeA, finalizeB] = await Promise.all([
    finalize(finalizerContext, finalizerDeadline),
    finalize(finalizerContext, finalizerDeadline),
  ]);
  assert.equal(finalizeA.error, null);
  assert.equal(finalizeB.error, null);
  assert.deepEqual(finalizeA.data, finalizeB.data);
  assert.equal(finalizeA.data.advanceReady, true);
  assert.equal(finalizeA.data.status, "closed");
  const finalizerReplay = await finalize(finalizerContext, finalizerDeadline);
  assert.equal(finalizerReplay.error, null);
  assert.deepEqual(finalizerReplay.data, finalizeA.data);
  const contradictoryDeadline = new Date(finalizerDeadline.getTime() + 1000);
  const contradictoryFinalize = await finalize(finalizerContext, contradictoryDeadline);
  assert.ok(contradictoryFinalize.error);
  assert.match(contradictoryFinalize.error.message, /contradictory/i);
  const passCount = Number(
    runOwnerSql(`
      select count(*) from public.movie_buff_vip_round_locks
      where round_id=${sqlUuid(finalizerContext.roundId)}
        and player_id in (${sqlUuid(sessions[2].user.id)},${sqlUuid(sessions[3].user.id)})
        and vip_id is null and inventory_id is null;
    `),
  );
  assert.equal(passCount, 2);
  record("deadline finalizer creates stable explicit no-VIP passes");

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error = serializeError(error);
} finally {
  cleanupOwnerFixtures();
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(
  JSON.stringify({
    outputPath,
    classification: evidence.classification,
    exitCode: evidence.exitCode,
    gitSha,
    checks: evidence.checks.length,
  }),
);
if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
