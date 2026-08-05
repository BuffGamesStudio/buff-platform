import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MOVIE_BUFF_APP_URL",
  "MOVIE_BUFF_VIP_TEST_USERS",
  "MOVIE_BUFF_EXPECTED_GIT_SHA",
  "MOVIE_BUFF_EVIDENCE_COMMAND",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (process.env.MOVIE_BUFF_ALLOW_LOCAL_DELETIONS !== "YES") {
  throw new Error("MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES is required");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const users = JSON.parse(process.env.MOVIE_BUFF_VIP_TEST_USERS);
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-core-v8-vip-adversarial-v2-evidence.json",
);
const dbHost = process.env.MOVIE_BUFF_LOCAL_DB_HOST ?? "127.0.0.1";
const dbPort = process.env.MOVIE_BUFF_LOCAL_DB_PORT ?? "55322";
const dbName = process.env.MOVIE_BUFF_LOCAL_DB_NAME ?? "postgres";
const dbUser = process.env.MOVIE_BUFF_LOCAL_DB_USER ?? "postgres";
const dbPassword = process.env.MOVIE_BUFF_LOCAL_DB_PASSWORD ?? "postgres";

function localOrigin(value, label) {
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label}: ${parsed.origin}`);
  }
  return parsed.origin;
}
const localSupabase = localOrigin(supabaseUrl, "Supabase");
const localApp = localOrigin(appUrl, "application");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(dbHost));
assert.equal(dbName, "postgres");
assert.equal(dbUser, "postgres");
assert.equal(users.length, 4);
assert.equal(new Set(users.map((user) => user.email)).size, 4);

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedSha);

const sourceFiles = [
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
  "src/lib/game/movieBuffVipPhasePolicy.ts",
  "src/lib/game/movieBuffVipService.ts",
  "scripts/movie-buff-core-v8-vip-adversarial-v2.mjs",
];
const sha256 = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function serializeError(error) {
  if (error instanceof Error) {
    return { kind: "Error", name: error.name, message: error.message, stack: error.stack ?? null };
  }
  if (error && typeof error === "object") {
    const safe = {};
    for (const key of ["name", "message", "code", "details", "hint", "status"]) {
      const value = error[key];
      if (["string", "number", "boolean"].includes(typeof value) || value === null) safe[key] = value;
    }
    return { kind: "object", constructor: error.constructor?.name ?? null, keys: Object.keys(error).sort(), safe };
  }
  return { kind: typeof error, value: String(error) };
}
function uuid(value, label = "uuid") {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, label);
  return value;
}
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlUuid = (value) => `${sqlText(uuid(value))}::uuid`;
function ownerSql(sql) {
  return execFileSync(
    "psql",
    ["-h", dbHost, "-p", dbPort, "-U", dbUser, "-d", dbName, "-v", "ON_ERROR_STOP=1", "-X", "-At"],
    { input: sql, encoding: "utf8", env: { ...process.env, PGPASSWORD: dbPassword }, maxBuffer: 4 * 1024 * 1024 },
  ).trim();
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];
const createdDefinitions = new Set();
let roomId = null;
const evidence = {
  schemaVersion: 3,
  lane: "MOV-16",
  classification: "UNKNOWN",
  exitCode: null,
  command: process.env.MOVIE_BUFF_EVIDENCE_COMMAND,
  gitSha,
  expectedGitSha: expectedSha,
  target: {
    kind: "disposable-localhost",
    supabase: localSupabase,
    application: localApp,
    fixtureAuthority: "local-database-owner",
    behaviorRoles: ["authenticated", "service_role"],
  },
  sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha256(file)])),
  startedAt: new Date().toISOString(),
  checks: [],
  cleanup: [],
};
function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });
}
const randomKey = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const roomCode = () => crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();

async function routeCall(index, pathname, body) {
  const token = sessions[index]?.access_token;
  assert.ok(token);
  const response = await fetch(`${localApp}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}
async function routeOk(index, pathname, body) {
  const result = await routeCall(index, pathname, body);
  assert.equal(result.status, 200, `${pathname} returned ${result.status}: ${JSON.stringify(result.payload)}`);
  return result.payload;
}
async function routeFails(index, pathname, body, pattern) {
  const result = await routeCall(index, pathname, body);
  assert.ok(result.status >= 400, `${pathname} unexpectedly succeeded`);
  assert.match(String(result.payload?.error ?? ""), pattern);
  return result;
}

function createBaseContext() {
  roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const now = new Date().toISOString();
  const player0 = sessions[0].user.id;
  const player1 = sessions[1].user.id;
  ownerSql(`
    begin;
    insert into public.game_rooms (
      id, room_code, host_id, room_type, status, category_id, difficulty,
      total_rounds, max_players, current_round, is_ranked, started_at
    ) values (
      ${sqlUuid(roomId)}, ${sqlText(roomCode())}, ${sqlUuid(player0)}, 'private',
      'active', null, 'medium', 10, 4, 1, false, ${sqlText(now)}::timestamptz
    );
    insert into public.room_players (
      room_id, player_id, is_ready, is_host, joined_at, last_seen_at
    ) values
      (${sqlUuid(roomId)}, ${sqlUuid(player0)}, true, true, ${sqlText(now)}::timestamptz, ${sqlText(now)}::timestamptz),
      (${sqlUuid(roomId)}, ${sqlUuid(player1)}, true, false, ${sqlText(now)}::timestamptz, ${sqlText(now)}::timestamptz);
    insert into public.matches (
      id, room_id, category_id, difficulty, total_rounds, status, started_at
    ) values (
      ${sqlUuid(matchId)}, ${sqlUuid(roomId)}, null, 'medium', 10, 'active', ${sqlText(now)}::timestamptz
    );
    insert into public.match_players (match_id, player_id) values
      (${sqlUuid(matchId)}, ${sqlUuid(player0)}),
      (${sqlUuid(matchId)}, ${sqlUuid(player1)});
    commit;
  `);
  return { roomId, matchId };
}
function createRound(base, roundNumber) {
  const roundId = crypto.randomUUID();
  ownerSql(`
    insert into public.match_rounds (
      id, match_id, round_number, time_limit_seconds, started_at
    ) values (
      ${sqlUuid(roundId)}, ${sqlUuid(base.matchId)}, ${Number(roundNumber)}, 30, now()
    );
  `);
  return { ...base, roundId, roundNumber };
}
function createDefinition(name, activationWindow = "answer") {
  const id = crypto.randomUUID();
  ownerSql(`
    insert into public.movie_buff_vip_definitions (
      id, code, name, description, effect_scope, activation_window,
      is_stackable, max_per_round, cooldown_seconds, is_active,
      eligibility_configured, allowed_room_types, allowed_difficulties,
      allow_any_category, allowed_category_ids, minimum_round_number,
      maximum_round_number, allow_ranked, allow_unranked
    ) values (
      ${sqlUuid(id)}, ${sqlText(`mov16_${crypto.randomUUID().replaceAll("-", "")}`)}, ${sqlText(name)},
      'Disposable local MOV-16 proof VIP.', 'personal', ${sqlText(activationWindow)},
      false, 1, 0, true, true, array['private']::text[], array['medium']::text[],
      true, array[]::uuid[], 1, 10, false, true
    );
  `);
  createdDefinitions.add(id);
  return id;
}
function grantInventory(playerIndex, vipId, quantity = 2) {
  const id = crypto.randomUUID();
  ownerSql(`
    insert into public.movie_buff_vip_inventory (id, player_id, vip_id, quantity_remaining)
    values (${sqlUuid(id)}, ${sqlUuid(sessions[playerIndex].user.id)}, ${sqlUuid(vipId)}, ${Number(quantity)});
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
async function releaseRequired(context, playerIndex, reason) {
  return admin.rpc("release_movie_buff_vip_required_player", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_player_id: sessions[playerIndex].user.id,
    p_release_reason: reason,
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
async function finalize(context, deadline) {
  return admin.rpc("finalize_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
  });
}

function cleanup() {
  if (roomId) {
    try {
      ownerSql(`delete from public.game_rooms where id=${sqlUuid(roomId)};`);
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "PASS" });
      roomId = null;
    } catch (error) {
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "FAIL", error: serializeError(error) });
    }
  }
  for (const vipId of [...createdDefinitions]) {
    try {
      ownerSql(`
        delete from public.movie_buff_vip_inventory where vip_id=${sqlUuid(vipId)};
        delete from public.movie_buff_vip_definitions where id=${sqlUuid(vipId)};
      `);
      createdDefinitions.delete(vipId);
      evidence.cleanup.push({ kind: "vip", id: vipId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({ kind: "vip", id: vipId, classification: "FAIL", error: serializeError(error) });
    }
  }
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );
  assert.equal(new Set(sessions.map((session) => session.user.id)).size, 4);
  const { data: existing, error: existingError } = await admin
    .from("room_players")
    .select("room_id")
    .in("player_id", sessions.map((session) => session.user.id))
    .is("left_at", null);
  if (existingError) throw existingError;
  assert.equal(existing?.length ?? 0, 0);
  pass("clean authenticated four-persona preflight");

  const base = createBaseContext();
  const round1 = createRound(base, 1);
  const noWindowRelease = await releaseRequired(round1, 0, "reconnect_grace_expired");
  assert.equal(noWindowRelease.error, null);
  assert.equal(noWindowRelease.data.status, "unavailable");
  assert.equal(noWindowRelease.data.released, false);
  pass("release before window is an idempotent no-op");

  const deadline1 = new Date(Date.now() + 60_000);
  const [openA, openB] = await Promise.all([
    openWindow(round1, [0, 1], deadline1),
    openWindow(round1, [0, 1], deadline1),
  ]);
  assert.equal(openA.error, null);
  assert.equal(openB.error, null);
  assert.deepEqual(openA.data, openB.data);
  const conflict = await openWindow(round1, [0], deadline1);
  assert.ok(conflict.error);
  assert.match(conflict.error.message, /contradictory/i);
  const { data: requiredRows, error: requiredError } = await admin
    .from("movie_buff_vip_round_required_players")
    .select("player_id")
    .eq("round_id", round1.roundId)
    .order("player_id");
  if (requiredError) throw requiredError;
  assert.deepEqual(requiredRows.map((row) => row.player_id), [sessions[0].user.id, sessions[1].user.id].sort());
  pass("concurrent window open preserves one immutable snapshot");

  const invalidRound = createRound(base, 2);
  const invalidOpen = await openWindow(invalidRound, [0, 2], new Date(Date.now() + 60_000));
  assert.ok(invalidOpen.error);
  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);
  pass("nonparticipant snapshot fails closed");

  const vipA = createDefinition("MOV-16 Race VIP A", "answer");
  const vipB = createDefinition("MOV-16 Race VIP B", "answer");
  grantInventory(0, vipA, 4);
  grantInventory(0, vipB, 2);
  const key = randomKey("identical-lock");
  const [lockA, lockB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: round1.roomId, roundId: round1.roundId, vipId: vipA,
      idempotencyKey: key, playerId: sessions[1].user.id, quantityRemaining: 999,
    }),
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: round1.roomId, roundId: round1.roundId, vipId: vipA, idempotencyKey: key,
    }),
  ]);
  assert.equal(lockA.status, 200);
  assert.equal(lockB.status, 200);
  assert.equal(lockA.payload.lock.lockId, lockB.payload.lock.lockId);

  const raceRound = createRound(base, 3);
  const raceDeadline = new Date(Date.now() + 60_000);
  const raceOpen = await openWindow(raceRound, [0], raceDeadline);
  assert.equal(raceOpen.error, null);
  const contradictory = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: raceRound.roomId, roundId: raceRound.roundId, vipId: vipA, idempotencyKey: randomKey("choice-a"),
    }),
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: raceRound.roomId, roundId: raceRound.roundId, vipId: vipB, idempotencyKey: randomKey("choice-b"),
    }),
  ]);
  assert.equal(contradictory.filter((result) => result.status === 200).length, 1);
  assert.equal(contradictory.filter((result) => result.status >= 400).length, 1);
  assert.match(String(contradictory.find((result) => result.status >= 400)?.payload?.error ?? ""), /different choice/i);
  pass("identical replay and contradictory lock race converge safely");

  const release1 = await releaseRequired(round1, 0, "reconnect_grace_expired");
  assert.equal(release1.error, null);
  assert.equal(release1.data.released, true);
  const release2 = await releaseRequired(round1, 0, "reconnect_grace_expired");
  assert.equal(release2.error, null);
  assert.equal(release2.data.idempotent, true);
  const badRelease = await releaseRequired(round1, 0, "manual_abandonment");
  assert.ok(badRelease.error);
  assert.match(badRelease.error.message, /different reason/i);
  await routeFails(0, "/api/movie-buff/vip/view", { roomId: round1.roomId, roundId: round1.roundId }, /not required/i);
  const remaining = await routeOk(1, "/api/movie-buff/vip/view", { roomId: round1.roomId, roundId: round1.roundId });
  assert.equal(remaining.view.requiredPlayerCount, 1);
  assert.equal(remaining.view.lockedCount, 0);
  await routeOk(1, "/api/movie-buff/vip/lock", {
    roomId: round1.roomId, roundId: round1.roundId, vipId: null, idempotencyKey: randomKey("pass"),
  });
  const closed = await routeOk(1, "/api/movie-buff/vip/view", { roomId: round1.roomId, roundId: round1.roundId });
  assert.equal(closed.view.status, "closed");
  assert.equal(closed.view.advanceReady, true);
  pass("release removes player and prior lock from readiness");

  const activationRound = createRound(base, 4);
  const activationOpen = await openWindow(activationRound, [0], new Date(Date.now() + 60_000));
  assert.equal(activationOpen.error, null);
  const activationVip = createDefinition("MOV-16 Activation VIP", "answer");
  const inventoryId = grantInventory(0, activationVip, 2);
  await routeOk(0, "/api/movie-buff/vip/lock", {
    roomId: activationRound.roomId, roundId: activationRound.roundId,
    vipId: activationVip, idempotencyKey: randomKey("activation-lock"),
  });
  await setActivationPhase(activationRound, "playback");
  await routeFails(0, "/api/movie-buff/vip/activate", {
    roomId: activationRound.roomId, roundId: activationRound.roundId, activationKey: randomKey("wrong-phase"),
  }, /current server phase/i);
  await setActivationPhase(activationRound, "answer");
  const activationKey = randomKey("activation");
  const [activationA, activationB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationRound.roomId, roundId: activationRound.roundId, activationKey,
    }),
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationRound.roomId, roundId: activationRound.roundId, activationKey,
    }),
  ]);
  assert.equal(activationA.status, 200);
  assert.equal(activationB.status, 200);
  assert.equal(activationA.payload.activation.lockId, activationB.payload.activation.lockId);
  assert.equal(Number(ownerSql(`select quantity_remaining from public.movie_buff_vip_inventory where id=${sqlUuid(inventoryId)};`)), 1);
  const activationLockId = ownerSql(`
    select id::text from public.movie_buff_vip_round_locks
    where round_id=${sqlUuid(activationRound.roundId)} and player_id=${sqlUuid(sessions[0].user.id)};
  `);
  uuid(activationLockId, "activation lock id");
  assert.equal(Number(ownerSql(`select count(*) from public.movie_buff_vip_consumptions where lock_id=${sqlUuid(activationLockId)};`)), 1);
  pass("wrong phase fails and concurrent activation consumes exactly once");

  const finalRound = createRound(base, 5);
  const finalDeadline = new Date(Date.now() + 1800);
  const finalOpen = await openWindow(finalRound, [0, 1], finalDeadline);
  assert.equal(finalOpen.error, null);
  const early = await finalize(finalRound, finalDeadline);
  assert.equal(early.error, null);
  assert.equal(early.data.advanceReady, false);
  assert.equal(early.data.status, "open");
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, finalDeadline.getTime() - Date.now() + 200)));
  const [finalA, finalB] = await Promise.all([finalize(finalRound, finalDeadline), finalize(finalRound, finalDeadline)]);
  assert.equal(finalA.error, null);
  assert.equal(finalB.error, null);
  assert.deepEqual(finalA.data, finalB.data);
  assert.equal(finalA.data.advanceReady, true);
  assert.equal(finalA.data.status, "closed");
  const replay = await finalize(finalRound, finalDeadline);
  assert.equal(replay.error, null);
  assert.deepEqual(replay.data, finalA.data);
  const badDeadline = await finalize(finalRound, new Date(finalDeadline.getTime() + 1000));
  assert.ok(badDeadline.error);
  assert.match(badDeadline.error.message, /contradictory/i);
  assert.equal(Number(ownerSql(`
    select count(*) from public.movie_buff_vip_round_locks
    where round_id=${sqlUuid(finalRound.roundId)}
      and player_id in (${sqlUuid(sessions[0].user.id)},${sqlUuid(sessions[1].user.id)})
      and vip_id is null and inventory_id is null;
  `)), 2);
  pass("deadline finalizer creates stable explicit no-VIP passes");

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error = serializeError(error);
} finally {
  cleanup();
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify({ outputPath, classification: evidence.classification, exitCode: evidence.exitCode, checks: evidence.checks.length }));
if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
