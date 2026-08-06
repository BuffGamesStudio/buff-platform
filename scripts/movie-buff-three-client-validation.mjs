import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const deletionConsent = process.env.MOVIE_BUFF_ALLOW_LOCAL_TEST_DATA_DELETE;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-three-client-evidence.json",
);

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !usersJson) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, and MOVIE_BUFF_TEST_USERS are required.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(
    `Refusing non-local Supabase target ${target.origin}. This harness is local-only.`,
  );
}
if (deletionConsent !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_TEST_DATA_DELETE=YES to confirm targeted deletion of rooms created or occupied by the three disposable local test users.",
  );
}

const users = JSON.parse(usersJson);
assert.equal(users.length, 3, "exactly three distinct test users are required");
assert.equal(
  new Set(users.map((user) => user.email)).size,
  3,
  "test user emails must be distinct",
);

const categoryId = process.env.MOVIE_BUFF_CATEGORY_ID || null;
const difficulty = (process.env.MOVIE_BUFF_DIFFICULTY ?? "medium")
  .trim()
  .toLowerCase();
const totalRounds = Number(process.env.MOVIE_BUFF_TOTAL_ROUNDS ?? 10);
const runCount = Number(process.env.MOVIE_BUFF_RACE_RUNS ?? 10);
const repository =
  process.env.MOVIE_BUFF_REPOSITORY ?? "BuffGamesStudio/buff-platform";
const phaseJourneyCommand = process.env.MOVIE_BUFF_PHASE_JOURNEY_COMMAND ?? null;

if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 50) {
  throw new Error("MOVIE_BUFF_TOTAL_ROUNDS must be an integer between 1 and 50.");
}
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 100) {
  throw new Error("MOVIE_BUFF_RACE_RUNS must be an integer between 1 and 100.");
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
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
const sha = process.env.MOVIE_BUFF_VALIDATION_SHA ?? git("rev-parse", "HEAD");
assert.match(sha, /^[0-9a-f]{40}$/i, "an exact validation SHA is required");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function rowFromRpc(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Matchmaking RPC returned no room ID.");
  return row;
}

async function findRoom(client, overrides = {}) {
  const { data, error } = await client.rpc(
    "find_or_create_movie_buff_public_room",
    {
      p_category_id: overrides.categoryId ?? categoryId,
      p_difficulty: overrides.difficulty ?? difficulty,
      p_total_rounds: overrides.totalRounds ?? totalRounds,
      p_max_players: overrides.maxPlayers ?? 99,
    },
  );
  if (error) throw new Error(`matchmaking RPC failed: ${error.message}`);
  return rowFromRpc(data);
}

async function expectFindRoomFailure(client, overrides, expectedPattern) {
  const { error } = await client.rpc("find_or_create_movie_buff_public_room", {
    p_category_id: overrides.categoryId ?? categoryId,
    p_difficulty: overrides.difficulty ?? difficulty,
    p_total_rounds: overrides.totalRounds ?? totalRounds,
    p_max_players: overrides.maxPlayers ?? 99,
  });
  assert.ok(error, "expected matchmaking request to fail");
  assert.match(error.message, expectedPattern);
  return error.message;
}

async function setReady(client, roomId, ready = true) {
  const { error } = await client.rpc("set_movie_buff_player_ready", {
    p_room_id: roomId,
    p_is_ready: ready,
  });
  if (error) throw new Error(`ready RPC failed: ${error.message}`);
}

async function snapshot(roomId) {
  const { data: room, error: roomError } = await admin
    .from("game_rooms")
    .select(
      "id,room_type,status,category_id,difficulty,total_rounds,max_players,public_matchmaking_key,current_round,created_at,started_at",
    )
    .eq("id", roomId)
    .single();
  if (roomError) throw new Error(`room evidence query failed: ${roomError.message}`);

  const { data: members, error: membersError } = await admin
    .from("room_players")
    .select("player_id,is_ready,is_host,left_at,joined_at,last_seen_at")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  if (membersError) {
    throw new Error(`membership evidence query failed: ${membersError.message}`);
  }

  const { data: compatibleOpenRooms, error: compatibleError } = await admin
    .from("game_rooms")
    .select("id,status,public_matchmaking_key,created_at")
    .eq("room_type", "public")
    .eq("public_matchmaking_key", room.public_matchmaking_key)
    .in("status", ["waiting", "starting", "active"]);
  if (compatibleError) {
    throw new Error(
      `compatibility evidence query failed: ${compatibleError.message}`,
    );
  }

  return { room, members, compatibleOpenRooms };
}

async function waitForStatus(roomId, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await snapshot(roomId);
    if (current.room.status === expected) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const current = await snapshot(roomId);
  throw new Error(
    `Room ${roomId} did not reach ${expected}; final status ${current.room.status}.`,
  );
}

async function deleteExactRoom(roomId) {
  const { data: room, error: roomError } = await admin
    .from("game_rooms")
    .select("id,room_type")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room) return;
  assert.equal(room.room_type, "public", "refusing to delete a non-public room");

  const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
  if (error) throw new Error(`targeted local cleanup failed: ${error.message}`);
}

async function cleanupTestUsers(testUserIds) {
  const { data: memberships, error } = await admin
    .from("room_players")
    .select("room_id")
    .in("player_id", testUserIds)
    .is("left_at", null);
  if (error) throw error;

  const roomIds = [...new Set((memberships ?? []).map((row) => row.room_id))];
  for (const roomId of roomIds) await deleteExactRoom(roomId);
  return roomIds;
}

function executedCheck(name, classification, artifacts, details) {
  const timestamp = new Date().toISOString();
  return {
    name,
    proofScope: "local-executable",
    claimType: "race-safety",
    executed: true,
    classification,
    command: "node scripts/movie-buff-three-client-validation.mjs",
    exitCode: classification === "PASS" ? 0 : 1,
    startedAt: timestamp,
    finishedAt: timestamp,
    sha,
    targetIdentity: target.origin,
    artifacts,
    details,
  };
}

const evidence = {
  schemaVersion: 2,
  repository,
  sha,
  target: {
    kind: "local-executable",
    identity: target.origin,
  },
  startedAt: new Date().toISOString(),
  settings: {
    categoryId,
    difficulty,
    totalRounds,
    maxPlayersCallerValue: 99,
    runCount,
  },
  testUsers: [],
  scenarios: {},
  checks: [],
};

const createdRoomIds = new Set();
let testUserIds = [];

try {
  await Promise.all(
    clients.map(async (supabase, index) => {
      const { data, error } = await supabase.auth.signInWithPassword(users[index]);
      if (error || !data.user || data.user.is_anonymous) {
        throw new Error(
          `Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown error"}`,
        );
      }
      evidence.testUsers[index] = {
        index: index + 1,
        userIdHash: hash(data.user.id),
      };
    }),
  );
  testUserIds = await Promise.all(
    clients.map(async (client) => {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw error ?? new Error("Missing test user");
      return data.user.id;
    }),
  );

  evidence.scenarios.preflightCleanup = {
    removedRoomIds: await cleanupTestUsers(testUserIds),
  };

  const pair = await Promise.all([findRoom(clients[0]), findRoom(clients[1])]);
  assert.equal(pair[0].id, pair[1].id, "first two compatible players split");
  const lateThirdRoomId = pair[0].id;
  createdRoomIds.add(lateThirdRoomId);
  assert.equal(pair[0].max_players, 3, "caller controlled public capacity");

  await Promise.all([
    setReady(clients[0], lateThirdRoomId),
    setReady(clients[1], lateThirdRoomId),
  ]);
  const beforeThird = await snapshot(lateThirdRoomId);
  assert.equal(beforeThird.room.status, "waiting", "room started before third joined");
  assert.equal(beforeThird.members.length, 2);
  assert.equal(beforeThird.members.filter((member) => member.is_ready).length, 2);

  const duplicate = await findRoom(clients[0]);
  assert.equal(duplicate.id, lateThirdRoomId, "duplicate request was not idempotent");

  const crossCompatibilityError = await expectFindRoomFailure(
    clients[0],
    { difficulty: difficulty === "easy" ? "hard" : "easy" },
    /leave your current open movie buff room/i,
  );

  const third = await findRoom(clients[2]);
  assert.equal(third.id, lateThirdRoomId, "late third did not join same room");
  await setReady(clients[2], lateThirdRoomId);
  const afterThird = await waitForStatus(lateThirdRoomId, "active");
  assert.equal(afterThird.members.length, 3);
  assert.equal(afterThird.members.filter((member) => member.is_ready).length, 3);
  assert.equal(afterThird.compatibleOpenRooms.length, 1);

  evidence.scenarios.lateThird = {
    roomId: lateThirdRoomId,
    beforeThird,
    afterThird,
    crossCompatibilityError,
  };
  evidence.checks.push(
    executedCheck(
      "late third and duplicate request",
      "PASS",
      ["scenarios.lateThird"],
      "Two ready players remained waiting; the late third converged; duplicate retry was idempotent.",
    ),
  );
  await deleteExactRoom(lateThirdRoomId);
  createdRoomIds.delete(lateThirdRoomId);

  evidence.scenarios.races = [];
  for (let run = 1; run <= runCount; run += 1) {
    await cleanupTestUsers(testUserIds);
    const startedAt = new Date().toISOString();
    const rooms = await Promise.all(clients.map((client) => findRoom(client)));
    const roomIds = rooms.map((room) => room.id);
    assert.equal(new Set(roomIds).size, 1, `run ${run}: clients split across rooms`);
    const roomId = roomIds[0];
    createdRoomIds.add(roomId);

    const sealed = await snapshot(roomId);
    assert.equal(sealed.room.max_players, 3, `run ${run}: capacity is not strict three`);
    assert.equal(sealed.members.length, 3, `run ${run}: expected three members`);
    assert.equal(
      sealed.compatibleOpenRooms.length,
      1,
      `run ${run}: duplicate compatible open room exists`,
    );

    await Promise.all(clients.map((client) => setReady(client, roomId)));
    const active = await waitForStatus(roomId, "active");
    assert.equal(active.members.length, 3);
    assert.equal(active.members.filter((member) => member.is_ready).length, 3);

    evidence.scenarios.races.push({
      run,
      startedAt,
      finishedAt: new Date().toISOString(),
      roomIds,
      sealed,
      active,
    });
    await deleteExactRoom(roomId);
    createdRoomIds.delete(roomId);
  }

  evidence.checks.push(
    executedCheck(
      "fresh repeated three-client matchmaking races",
      "PASS",
      ["scenarios.races"],
      `${runCount} fresh room races completed with one room and three active memberships.`,
    ),
  );

  evidence.checks.push({
    name: "three-client full phase synchronization journey",
    proofScope: "local-executable",
    claimType: "synchronization",
    executed: false,
    classification: "UNKNOWN",
    command: phaseJourneyCommand,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
    sha,
    targetIdentity: target.origin,
    artifacts: [],
    details: phaseJourneyCommand
      ? "A separate phase-journey command was supplied but is not executed by this matchmaking harness."
      : "No exact MOV-17 phase-journey command is available. Matchmaking convergence does not prove board/playback/results synchronization.",
  });

  evidence.classification = evidence.checks.some(
    (check) => check.classification === "UNKNOWN",
  )
    ? "UNKNOWN"
    : "PASS";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify(
      { outputPath, classification: evidence.classification, sha, runCount },
      null,
      2,
    ),
  );
} catch (error) {
  evidence.classification = "FAIL";
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  evidence.checks.push(
    executedCheck(
      "three-client validation run",
      "FAIL",
      [outputPath],
      evidence.error,
    ),
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  for (const roomId of createdRoomIds) {
    try {
      await deleteExactRoom(roomId);
    } catch (cleanupError) {
      console.error(`Cleanup warning for ${roomId}:`, cleanupError);
    }
  }
  await Promise.all(clients.map((supabase) => supabase.auth.signOut()));
}
