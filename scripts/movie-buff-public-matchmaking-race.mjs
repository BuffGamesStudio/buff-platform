import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const overflowUserJson = process.env.MOVIE_BUFF_OVERFLOW_TEST_USER;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const commandLabel = process.env.MOVIE_BUFF_EVIDENCE_COMMAND?.trim();
const allowLocalDeletions = process.env.MOVIE_BUFF_ALLOW_LOCAL_DELETIONS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-public-matchmaking-race-evidence.json",
);

if (
  !supabaseUrl ||
  !publishableKey ||
  !serviceRoleKey ||
  !usersJson ||
  !overflowUserJson ||
  !expectedGitSha ||
  !commandLabel
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_TEST_USERS, MOVIE_BUFF_OVERFLOW_TEST_USER, MOVIE_BUFF_EXPECTED_GIT_SHA, and MOVIE_BUFF_EVIDENCE_COMMAND are required.",
  );
}

if (allowLocalDeletions !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES to authorize deletion of only the disposable rooms created by this local proof run.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local Supabase target ${target.origin}.`);
}

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(
  gitSha,
  expectedGitSha,
  "checkout HEAD does not match MOVIE_BUFF_EXPECTED_GIT_SHA",
);

const users = JSON.parse(usersJson);
const overflowUser = JSON.parse(overflowUserJson);
assert.equal(users.length, 3, "exactly three core test-user credentials are required");
assert.equal(
  new Set([...users.map((user) => user.email), overflowUser.email]).size,
  4,
  "all four test credentials must be distinct",
);

const categoryId = process.env.MOVIE_BUFF_CATEGORY_ID || null;
const difficulty = (process.env.MOVIE_BUFF_DIFFICULTY ?? "medium")
  .trim()
  .toLowerCase();
const incompatibleDifficulty = difficulty === "hard" ? "easy" : "hard";
const totalRounds = Number(process.env.MOVIE_BUFF_TOTAL_ROUNDS ?? 10);
const raceRuns = Number(process.env.MOVIE_BUFF_RACE_RUNS ?? 10);
const lockHoldMs = Number(process.env.MOVIE_BUFF_LOCK_HOLD_MS ?? 1200);

assert.ok(Number.isInteger(totalRounds) && totalRounds >= 1 && totalRounds <= 50);
assert.ok(Number.isInteger(raceRuns) && raceRuns >= 1 && raceRuns <= 100);
assert.ok(Number.isInteger(lockHoldMs) && lockHoldMs >= 500 && lockHoldMs <= 5000);

const evidenceFiles = [
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "src/app/games/movie-buff/waiting-room/page.tsx",
  "scripts/movie-buff-public-matchmaking-race.mjs",
  "scripts/movie-buff-public-matchmaking-race-helper.sql",
  "tests/movie-buff-public-matchmaking-contract.test.mjs",
];

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
const overflowClient = browserClient();
const sessions = [];
const ownedRoomIds = new Set();
const runStartedAtMs = Date.now();
let testUserIds = [];

const evidence = {
  schemaVersion: 2,
  classification: "UNKNOWN",
  exitCode: null,
  command: commandLabel,
  gitSha,
  expectedGitSha,
  nodeVersion: process.version,
  target: { kind: "local", identity: target.origin },
  settings: {
    categoryId,
    difficulty,
    incompatibleDifficulty,
    totalRounds,
    raceRuns,
    callerMaxPlayers: 99,
    lockHoldMs,
  },
  sourceHashes: Object.fromEntries(evidenceFiles.map((file) => [file, sha256(file)])),
  startedAt: new Date(runStartedAtMs).toISOString(),
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

function roomFromRpc(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Matchmaking RPC returned no room ID.");
  return row;
}

async function findRoom(client, options = {}) {
  const { data, error } = await client.rpc(
    "find_or_create_movie_buff_public_room",
    {
      p_category_id: options.categoryId ?? categoryId,
      p_difficulty: options.difficulty ?? difficulty,
      p_total_rounds: options.totalRounds ?? totalRounds,
      p_max_players: options.maxPlayers ?? 99,
    },
  );
  if (error) throw new Error(`matchmaking RPC failed: ${error.message}`);
  const room = roomFromRpc(data);
  ownedRoomIds.add(room.id);
  return room;
}

async function expectFindRoomError(client, options, expectedPattern) {
  const { error } = await client.rpc(
    "find_or_create_movie_buff_public_room",
    {
      p_category_id: options.categoryId ?? categoryId,
      p_difficulty: options.difficulty ?? difficulty,
      p_total_rounds: options.totalRounds ?? totalRounds,
      p_max_players: options.maxPlayers ?? 99,
    },
  );
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

async function roomSnapshot(roomId) {
  const { data: room, error: roomError } = await admin
    .from("game_rooms")
    .select(
      "id,room_type,status,category_id,difficulty,total_rounds,max_players,public_matchmaking_key,created_at,started_at",
    )
    .eq("id", roomId)
    .single();
  if (roomError) throw new Error(`room query failed: ${roomError.message}`);

  const { data: members, error: memberError } = await admin
    .from("room_players")
    .select("player_id,is_ready,is_host,left_at,joined_at,last_seen_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (memberError) throw new Error(`membership query failed: ${memberError.message}`);

  const { data: compatibleWaitingRooms, error: compatibleError } = await admin
    .from("game_rooms")
    .select("id,status,public_matchmaking_key")
    .eq("room_type", "public")
    .eq("status", "waiting")
    .eq("public_matchmaking_key", room.public_matchmaking_key);
  if (compatibleError) throw compatibleError;

  return {
    room,
    members,
    activeMembers: members.filter((member) => member.left_at === null),
    compatibleWaitingRooms,
  };
}

async function waitForStatus(roomId, expected, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await roomSnapshot(roomId);
    if (snapshot.room.status === expected) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const snapshot = await roomSnapshot(roomId);
  throw new Error(
    `Room ${roomId} did not reach ${expected}; final status ${snapshot.room.status}.`,
  );
}

async function assertNoPreexistingState() {
  const { data: memberships, error: membershipError } = await admin
    .from("room_players")
    .select("room_id,player_id")
    .in("player_id", testUserIds)
    .is("left_at", null);
  if (membershipError) throw membershipError;
  assert.equal(
    memberships?.length ?? 0,
    0,
    "test users already have open memberships; clean them manually before this proof",
  );

  let query = admin
    .from("game_rooms")
    .select("id")
    .eq("room_type", "public")
    .eq("status", "waiting")
    .eq("difficulty", difficulty)
    .eq("total_rounds", totalRounds)
    .eq("max_players", 3);
  query = categoryId ? query.eq("category_id", categoryId) : query.is("category_id", null);
  const { data: rooms, error: roomsError } = await query;
  if (roomsError) throw roomsError;
  assert.equal(
    rooms?.length ?? 0,
    0,
    "a compatible waiting room already exists; use a clean disposable local database",
  );
}

async function deleteOwnedRoom(roomId) {
  assert.ok(ownedRoomIds.has(roomId), "refusing cleanup of an untracked room");
  const snapshot = await roomSnapshot(roomId);
  assert.equal(snapshot.room.room_type, "public");
  assert.ok(
    Date.parse(snapshot.room.created_at) >= runStartedAtMs - 5000,
    "refusing cleanup of a room created before this proof run",
  );
  assert.ok(
    snapshot.members.every((member) => testUserIds.includes(member.player_id)),
    "refusing cleanup of a room containing a non-test player",
  );

  const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
  if (error) throw new Error(`targeted local cleanup failed: ${error.message}`);
  ownedRoomIds.delete(roomId);
  evidence.cleanup.push({ roomId, deletedAt: new Date().toISOString() });
}

async function cleanupOwnedRooms() {
  for (const roomId of [...ownedRoomIds]) {
    try {
      await deleteOwnedRoom(roomId);
    } catch (error) {
      evidence.cleanup.push({
        roomId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

try {
  await Promise.all(
    [...clients, overflowClient].map(async (client, index) => {
      const credentials = index < 3 ? users[index] : overflowUser;
      const { data, error } = await client.auth.signInWithPassword(credentials);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      sessions[index] = data.session;
    }),
  );
  testUserIds = sessions.map((session) => session.user.id);
  assert.equal(new Set(testUserIds).size, 4);
  await assertNoPreexistingState();
  record("clean local preflight", { testUserIds });

  const duplicateRooms = await Promise.all([
    findRoom(clients[0]),
    findRoom(clients[0]),
  ]);
  assert.equal(duplicateRooms[0].id, duplicateRooms[1].id);
  record("duplicate same-player requests are idempotent", {
    roomId: duplicateRooms[0].id,
  });

  const incompatibleError = await expectFindRoomError(
    clients[0],
    { difficulty: incompatibleDifficulty },
    /leave your current open movie buff room/i,
  );
  record("open membership blocks incompatible rematch", { incompatibleError });
  await deleteOwnedRoom(duplicateRooms[0].id);

  const lockRoom = await findRoom(clients[0]);
  const holdPromise = admin
    .rpc("movie_buff_test_hold_waiting_room_lock", {
      p_room_id: lockRoom.id,
      p_hold_milliseconds: lockHoldMs,
      p_confirmation: "LOCAL_MATCHMAKING_LOCK_TEST",
    })
    .then((result) => result);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const contentionStartedAt = Date.now();
  const contendedJoin = await findRoom(clients[1]);
  const contentionElapsedMs = Date.now() - contentionStartedAt;
  const holdResult = await holdPromise;
  if (holdResult.error) {
    throw new Error(
      `local compatibility-lock helper failed; apply scripts/movie-buff-public-matchmaking-race-helper.sql first: ${holdResult.error.message}`,
    );
  }
  assert.equal(contendedJoin.id, lockRoom.id);
  assert.ok(
    contentionElapsedMs >= lockHoldMs - 400,
    `contended join returned too early (${contentionElapsedMs}ms)`,
  );
  record("external compatibility lock waits and converges", {
    roomId: lockRoom.id,
    lockHoldMs,
    contentionElapsedMs,
  });
  await deleteOwnedRoom(lockRoom.id);

  const firstPair = await Promise.all([findRoom(clients[0]), findRoom(clients[1])]);
  assert.equal(firstPair[0].id, firstPair[1].id);
  const roomId = firstPair[0].id;
  assert.equal(firstPair[0].max_players, 3);
  await Promise.all([setReady(clients[0], roomId), setReady(clients[1], roomId)]);
  const twoReady = await roomSnapshot(roomId);
  assert.equal(twoReady.room.status, "waiting");
  assert.equal(twoReady.activeMembers.length, 2);

  const thirdRoom = await findRoom(clients[2]);
  assert.equal(thirdRoom.id, roomId);
  const duplicateThirdRoom = await findRoom(clients[2]);
  assert.equal(duplicateThirdRoom.id, roomId);

  const overflowError = await expectFindRoomError(
    overflowClient,
    {},
    /compatible public room is already full/i,
  );
  const fullWaiting = await roomSnapshot(roomId);
  assert.equal(fullWaiting.activeMembers.length, 3);
  assert.equal(fullWaiting.room.status, "waiting");
  assert.equal(fullWaiting.compatibleWaitingRooms.length, 1);
  record("full cohort rejects fourth caller without starting early", {
    roomId,
    overflowError,
  });

  await setReady(clients[2], roomId);
  const active = await waitForStatus(roomId, "active");
  assert.equal(active.activeMembers.length, 3);
  assert.equal(active.activeMembers.filter((member) => member.is_ready).length, 3);
  record("late third produces exactly one strict-three active match", { roomId });
  await deleteOwnedRoom(roomId);

  const staleRoom = await findRoom(overflowClient);
  const staleTimestamp = new Date(Date.now() - 120_000).toISOString();
  const { error: staleUpdateError } = await admin
    .from("room_players")
    .update({ last_seen_at: staleTimestamp })
    .eq("room_id", staleRoom.id)
    .eq("player_id", testUserIds[3]);
  if (staleUpdateError) throw staleUpdateError;
  const replacementRoom = await findRoom(clients[0]);
  assert.notEqual(replacementRoom.id, staleRoom.id);
  const staleSnapshot = await roomSnapshot(staleRoom.id);
  assert.equal(staleSnapshot.room.status, "cancelled");
  record("stale empty room is cancelled before replacement", {
    staleRoomId: staleRoom.id,
    replacementRoomId: replacementRoom.id,
  });
  await deleteOwnedRoom(staleRoom.id);
  await deleteOwnedRoom(replacementRoom.id);

  for (let run = 1; run <= raceRuns; run += 1) {
    const rooms = await Promise.all(clients.map((client) => findRoom(client)));
    const roomIds = rooms.map((room) => room.id);
    assert.equal(new Set(roomIds).size, 1, `race ${run}: split rooms`);
    const raceRoomId = roomIds[0];
    const waiting = await roomSnapshot(raceRoomId);
    assert.equal(waiting.room.status, "waiting");
    assert.equal(waiting.activeMembers.length, 3);
    assert.equal(waiting.compatibleWaitingRooms.length, 1);
    await Promise.all(clients.map((client) => setReady(client, raceRoomId)));
    const activeSnapshot = await waitForStatus(raceRoomId, "active");
    assert.equal(activeSnapshot.activeMembers.length, 3);
    record(`fresh simultaneous race ${run}`, {
      roomId: raceRoomId,
      memberIds: activeSnapshot.activeMembers.map((member) => member.player_id),
    });
    await deleteOwnedRoom(raceRoomId);
  }

  evidence.classification = "PASS";
  evidence.exitCode = 0;
  evidence.finishedAt = new Date().toISOString();
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  await cleanupOwnedRooms();
  await Promise.allSettled(
    [...clients, overflowClient].map((client) => client.auth.signOut()),
  );
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
