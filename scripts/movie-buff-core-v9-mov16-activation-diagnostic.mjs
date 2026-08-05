import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
const allowLocalPostgres = process.env.MOVIE_BUFF_ALLOW_LOCAL_POSTGRES_FIXTURE;
const dbHost = process.env.MOVIE_BUFF_LOCAL_DB_HOST;
const dbPort = process.env.MOVIE_BUFF_LOCAL_DB_PORT;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-core-v9-mov16-activation-evidence.json",
);

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  MOVIE_BUFF_APP_URL: appUrl,
  MOVIE_BUFF_VIP_TEST_USERS: usersJson,
  MOVIE_BUFF_EXPECTED_GIT_SHA: expectedGitSha,
  MOVIE_BUFF_EVIDENCE_COMMAND: commandLabel,
})) {
  if (!value) throw new Error(`${name} is required`);
}

if (allowLocalDeletions !== "YES") {
  throw new Error("MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES is required");
}
if (allowLocalPostgres !== "YES") {
  throw new Error("MOVIE_BUFF_ALLOW_LOCAL_POSTGRES_FIXTURE=YES is required");
}
if (!["127.0.0.1", "localhost", "::1"].includes(dbHost ?? "")) {
  throw new Error("A localhost PostgreSQL fixture host is required");
}
if (dbPort !== "55322") {
  throw new Error("The disposable local PostgreSQL port must be 55322");
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}`);
  }
  return parsed.origin;
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
    for (const key of [
      "name",
      "message",
      "code",
      "details",
      "hint",
      "status",
      "statusCode",
    ]) {
      const value = error[key];
      if (
        ["string", "number", "boolean"].includes(typeof value) ||
        value === null
      ) {
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

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function roomCode() {
  return randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function randomKey(prefix) {
  return `${prefix}-${randomUUID()}`;
}

const localSupabaseOrigin = requireLocal(supabaseUrl, "Supabase");
const localAppOrigin = requireLocal(appUrl, "application");
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedGitSha, "checkout HEAD does not match expected SHA");

const users = JSON.parse(usersJson);
assert.equal(users.length, 4, "exactly four local test credentials are required");

const sourceFiles = [
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "src/app/api/movie-buff/vip/lock/route.ts",
  "src/app/api/movie-buff/vip/activate/route.ts",
  "src/lib/game/movieBuffVipService.ts",
  "scripts/movie-buff-core-v9-mov16-activation-diagnostic.mjs",
];

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browser = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runStartedAt = Date.now();
const created = { roomId: null, definitionId: null };
let session = null;

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  exitCode: null,
  gitSha,
  expectedGitSha,
  command: commandLabel,
  nodeVersion: process.version,
  target: {
    kind: "ephemeral-localhost",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
    postgres: `${dbHost}:${dbPort}`,
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

async function stage(name, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      `MOV-16 activation stage "${name}" failed: ${JSON.stringify(
        serializeError(error),
      )}`,
    );
  }
}

function throwResultError(stageName, result) {
  if (result?.error) {
    throw new Error(
      `MOV-16 activation stage "${stageName}" returned an error: ${JSON.stringify(
        serializeError(result.error),
      )}`,
    );
  }
}

async function routeCall(pathname, body) {
  assert.ok(session?.access_token, "missing bearer token");
  const response = await fetch(`${localAppOrigin}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function insertMatchPlayerDirect(matchId, playerId) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(matchId, uuidPattern, "fixture match ID must be a UUID");
  assert.match(playerId, uuidPattern, "fixture player ID must be a UUID");
  const sql =
    "insert into public.match_players (match_id, player_id) values " +
    `('${matchId}'::uuid, '${playerId}'::uuid);`;
  execFileSync(
    "psql",
    [
      "-h",
      dbHost,
      "-p",
      dbPort,
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function cleanup() {
  if (created.roomId) {
    const { data: room, error: roomLookupError } = await admin
      .from("game_rooms")
      .select("id,created_at")
      .eq("id", created.roomId)
      .maybeSingle();
    if (roomLookupError) {
      evidence.cleanup.push({
        kind: "room",
        id: created.roomId,
        deleted: false,
        error: serializeError(roomLookupError),
      });
    } else if (!room) {
      evidence.cleanup.push({
        kind: "room",
        id: created.roomId,
        deleted: true,
        alreadyAbsent: true,
      });
    } else if (Date.parse(room.created_at) < runStartedAt - 5000) {
      evidence.cleanup.push({
        kind: "room",
        id: created.roomId,
        deleted: false,
        error: "refused pre-run room deletion",
      });
    } else {
      const { error } = await admin
        .from("game_rooms")
        .delete()
        .eq("id", created.roomId);
      evidence.cleanup.push({
        kind: "room",
        id: created.roomId,
        deleted: !error,
        error: error ? serializeError(error) : null,
      });
    }
  }

  if (created.definitionId) {
    await admin
      .from("movie_buff_vip_inventory")
      .delete()
      .eq("vip_id", created.definitionId);
    const { error } = await admin
      .from("movie_buff_vip_definitions")
      .delete()
      .eq("id", created.definitionId);
    evidence.cleanup.push({
      kind: "vip-definition",
      id: created.definitionId,
      deleted: !error,
      error: error ? serializeError(error) : null,
    });
  }
}

try {
  session = await stage("authenticate-local-persona", async () => {
    const { data, error } = await browser.auth.signInWithPassword(users[0]);
    if (error || !data.session || !data.user || data.user.is_anonymous) {
      throw error ?? new Error("local test user did not receive a valid session");
    }
    return { ...data.session, user: data.user };
  });
  record("activation checkpoint: authenticated local persona");

  await stage("clean-active-room-preflight", async () => {
    const { data, error } = await admin
      .from("room_players")
      .select("room_id")
      .eq("player_id", session.user.id)
      .is("left_at", null);
    if (error) throw error;
    assert.equal(data?.length ?? 0, 0, "test persona already has an active room");
  });
  record("activation checkpoint: clean active-room preflight");

  const context = await stage("create-disposable-context", async () => {
    const roomId = randomUUID();
    const matchId = randomUUID();
    const roundId = randomUUID();
    const now = new Date().toISOString();

    const { error: roomError } = await admin.from("game_rooms").insert({
      id: roomId,
      room_code: roomCode(),
      host_id: session.user.id,
      room_type: "private",
      status: "active",
      category_id: null,
      difficulty: "medium",
      total_rounds: 10,
      max_players: 4,
      current_round: 5,
      is_ranked: false,
      started_at: now,
    });
    if (roomError) throw roomError;
    created.roomId = roomId;

    const { error: memberError } = await admin.from("room_players").insert({
      room_id: roomId,
      player_id: session.user.id,
      is_ready: true,
      is_host: true,
      left_at: null,
      joined_at: now,
      last_seen_at: now,
    });
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

    insertMatchPlayerDirect(matchId, session.user.id);

    const { error: roundError } = await admin.from("match_rounds").insert({
      id: roundId,
      match_id: matchId,
      round_number: 5,
      time_limit_seconds: 30,
      started_at: now,
    });
    if (roundError) throw roundError;

    return { roomId, matchId, roundId };
  });
  record("activation checkpoint: disposable context created");

  await stage("open-vip-window", async () => {
    const result = await admin.rpc("open_movie_buff_vip_round_window", {
      p_room_id: context.roomId,
      p_match_id: context.matchId,
      p_round_id: context.roundId,
      p_deadline_at: new Date(Date.now() + 60_000).toISOString(),
      p_required_player_ids: [session.user.id],
    });
    throwResultError("open-vip-window", result);
    assert.ok(result.data);
  });
  record("activation checkpoint: VIP window opened");

  const activationVip = await stage("create-activation-vip", async () => {
    const id = randomUUID();
    const { error } = await admin.from("movie_buff_vip_definitions").insert({
      id,
      code: `mov16_activation_${randomUUID().replaceAll("-", "")}`,
      name: "MOV-16 Activation Diagnostic VIP",
      description: "Disposable local activation diagnostic VIP.",
      effect_scope: "personal",
      activation_window: "answer",
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
    created.definitionId = id;
    return id;
  });
  record("activation checkpoint: VIP definition created");

  const activationInventory = await stage("grant-activation-inventory", async () => {
    const id = randomUUID();
    const { error } = await admin.from("movie_buff_vip_inventory").insert({
      id,
      player_id: session.user.id,
      vip_id: activationVip,
      quantity_remaining: 2,
    });
    if (error) throw error;
    return id;
  });
  record("activation checkpoint: inventory granted");

  const lockPayload = await stage("lock-activation-vip", async () => {
    const result = await routeCall("/api/movie-buff/vip/lock", {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: activationVip,
      idempotencyKey: randomKey("activation-lock"),
    });
    assert.equal(
      result.status,
      200,
      `VIP lock returned ${result.status}: ${JSON.stringify(result.payload)}`,
    );
    assert.ok(result.payload?.lock?.lockId);
    return result.payload;
  });
  record("activation checkpoint: VIP locked", {
    lockIdPresent: Boolean(lockPayload.lock.lockId),
  });

  await stage("set-playback-phase", async () => {
    const result = await admin.rpc("set_movie_buff_vip_activation_phase", {
      p_room_id: context.roomId,
      p_round_id: context.roundId,
      p_activation_phase: "playback",
    });
    throwResultError("set-playback-phase", result);
  });
  record("activation checkpoint: playback phase set");

  await stage("reject-wrong-phase-activation", async () => {
    const result = await routeCall("/api/movie-buff/vip/activate", {
      roomId: context.roomId,
      roundId: context.roundId,
      activationKey: randomKey("wrong-phase"),
    });
    assert.ok(result.status >= 400, "wrong-phase activation unexpectedly succeeded");
    assert.match(String(result.payload?.error ?? ""), /current server phase/i);
  });
  record("activation checkpoint: wrong phase rejected");

  await stage("set-answer-phase", async () => {
    const result = await admin.rpc("set_movie_buff_vip_activation_phase", {
      p_room_id: context.roomId,
      p_round_id: context.roundId,
      p_activation_phase: "answer",
    });
    throwResultError("set-answer-phase", result);
  });
  record("activation checkpoint: answer phase set");

  const activationKey = randomKey("activation");
  const [activationA, activationB] = await stage(
    "concurrent-identical-activation",
    () =>
      Promise.all([
        routeCall("/api/movie-buff/vip/activate", {
          roomId: context.roomId,
          roundId: context.roundId,
          activationKey,
        }),
        routeCall("/api/movie-buff/vip/activate", {
          roomId: context.roomId,
          roundId: context.roundId,
          activationKey,
        }),
      ]),
  );
  assert.equal(
    activationA.status,
    200,
    `activation A returned ${activationA.status}: ${JSON.stringify(
      activationA.payload,
    )}`,
  );
  assert.equal(
    activationB.status,
    200,
    `activation B returned ${activationB.status}: ${JSON.stringify(
      activationB.payload,
    )}`,
  );
  assert.equal(
    activationA.payload?.activation?.lockId,
    activationB.payload?.activation?.lockId,
  );
  record("activation checkpoint: concurrent identical activation converged");

  await stage("verify-inventory-decrement", async () => {
    const { data, error } = await admin
      .from("movie_buff_vip_inventory")
      .select("quantity_remaining")
      .eq("id", activationInventory)
      .single();
    if (error) throw error;
    assert.equal(data.quantity_remaining, 1);
  });
  record("activation checkpoint: inventory decremented exactly once");

  await stage("verify-single-consumption", async () => {
    const { data: lock, error: lockError } = await admin
      .from("movie_buff_vip_round_locks")
      .select("id")
      .eq("round_id", context.roundId)
      .eq("player_id", session.user.id)
      .single();
    if (lockError) throw lockError;

    const { count, error } = await admin
      .from("movie_buff_vip_consumptions")
      .select("id", { count: "exact", head: true })
      .eq("lock_id", lock.id);
    if (error) throw error;
    assert.equal(count, 1);
  });
  record("activation checkpoint: exactly one consumption persisted");

  evidence.classification = "PASS";
  evidence.exitCode = 0;
  evidence.finishedAt = new Date().toISOString();
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = serializeError(error);
} finally {
  await cleanup();
  await browser.auth.signOut().catch(() => null);
  if (evidence.cleanup.some((entry) => entry.deleted !== true)) {
    evidence.classification = "FAIL";
    evidence.exitCode = 1;
    evidence.finishedAt = new Date().toISOString();
    evidence.cleanupFailure = true;
  }
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

if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
