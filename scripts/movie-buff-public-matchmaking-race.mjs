import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-public-matchmaking-race-evidence.json",
);

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !usersJson) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, and MOVIE_BUFF_TEST_USERS are required.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(
    `Refusing non-local Supabase target ${target.origin}. This harness may delete only disposable local test rooms.`,
  );
}

const users = JSON.parse(usersJson);
assert.equal(users.length, 3, "exactly three test-user credentials are required");
assert.equal(new Set(users.map((user) => user.email)).size, 3, "test users must be distinct");

const categoryId = process.env.MOVIE_BUFF_CATEGORY_ID || null;
const difficulty = (process.env.MOVIE_BUFF_DIFFICULTY ?? "medium").trim().toLowerCase();
const totalRounds = Number(process.env.MOVIE_BUFF_TOTAL_ROUNDS ?? 10);
const raceRuns = Number(process.env.MOVIE_BUFF_RACE_RUNS ?? 10);

if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 50) {
  throw new Error("MOVIE_BUFF_TOTAL_ROUNDS must be an integer from 1 through 50.");
}
if (!Number.isInteger(raceRuns) || raceRuns < 1 || raceRuns > 100) {
  throw new Error("MOVIE_BUFF_RACE_RUNS must be an integer from 1 through 100.");
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

function roomFromRpc(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Matchmaking RPC returned no room ID.");
  return row;
}

async function findRoom(client, overrides = {}) {
  const { data, error } = await client.rpc("find_or_create_movie_buff_public_room", {
    p_category_id: categoryId,
    p_difficulty: difficulty,
    p_total_rounds: totalRounds,
    // Intentionally contradictory. The server must still own strict-three size.
    p_max_players: overrides.maxPlayers ?? 99,
  });
  if (error) throw new Error(`matchmaking RPC failed: ${error.message}`);
  return roomFromRpc(data);
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
  if (roomError) throw new Error(`room evidence query failed: ${roomError.message}`);

  const { data: members, error: memberError } = await admin
    .from("room_players")
    .select("player_id,is_ready,is_host,left_at,joined_at,last_seen_at")
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  if (memberError) throw new Error(`membership evidence query failed: ${memberError.message}`);

  const { data: compatibleRooms, error: compatibleError } = await admin
    .from("game_rooms")
    .select("id,status,public_matchmaking_key")
    .eq("room_type", "public")
    .eq("status", "waiting")
    .eq("public_matchmaking_key", room.public_matchmaking_key);
  if (compatibleError) {
    throw new Error(`compatibility uniqueness query failed: ${compatibleError.message}`);
  }

  return { room, members, compatibleRooms };
}

async function waitForStatus(roomId, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await roomSnapshot(roomId);
    if (snapshot.room.status === expected) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const finalSnapshot = await roomSnapshot(roomId);
  throw new Error(
    `Room ${roomId} did not reach ${expected}; final status ${finalSnapshot.room.status}.`,
  );
}

async function deleteRoom(roomId) {
  const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
  if (error) throw new Error(`local test cleanup failed: ${error.message}`);
}

const evidence = {
  schemaVersion: 1,
  target: { kind: "local", identity: target.origin },
  settings: { categoryId, difficulty, totalRounds, raceRuns, callerMaxPlayers: 99 },
  startedAt: new Date().toISOString(),
  users: [],
  lateThird: null,
  races: [],
};

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      evidence.users.push({ index: index + 1, userId: data.user.id });
    }),
  );

  // Remove open disposable rooms previously owned by these local-only test users.
  const testUserIds = evidence.users.map((user) => user.userId);
  const { data: oldMemberships, error: oldMembershipError } = await admin
    .from("room_players")
    .select("room_id")
    .in("player_id", testUserIds)
    .is("left_at", null);
  if (oldMembershipError) throw oldMembershipError;
  for (const roomId of new Set((oldMemberships ?? []).map((row) => row.room_id))) {
    await deleteRoom(roomId);
  }

  // Late-third proof: the first two may both be ready, but the room must stay
  // waiting until the third member joins and all three are ready.
  const firstPair = await Promise.all([findRoom(clients[0]), findRoom(clients[1])]);
  assert.equal(firstPair[0].id, firstPair[1].id, "first two players split across rooms");
  const lateThirdRoomId = firstPair[0].id;
  assert.equal(firstPair[0].max_players, 3, "caller-controlled maxPlayers was not ignored");

  await Promise.all([
    setReady(clients[0], lateThirdRoomId),
    setReady(clients[1], lateThirdRoomId),
  ]);
  const beforeThird = await roomSnapshot(lateThirdRoomId);
  assert.equal(beforeThird.room.status, "waiting", "public match started with only two ready players");
  assert.equal(beforeThird.members.length, 2, "late-third precondition did not have two members");
  assert.equal(beforeThird.members.filter((member) => member.is_ready).length, 2);
  assert.equal(beforeThird.compatibleRooms.length, 1, "duplicate compatible waiting room exists");

  const thirdRoom = await findRoom(clients[2]);
  assert.equal(thirdRoom.id, lateThirdRoomId, "late third player did not converge on the same room");

  const duplicateThirdRoom = await findRoom(clients[2]);
  assert.equal(duplicateThirdRoom.id, lateThirdRoomId, "duplicate request was not idempotent");

  await setReady(clients[2], lateThirdRoomId);
  const afterThird = await waitForStatus(lateThirdRoomId, "active");
  assert.equal(afterThird.members.length, 3, "active public match lacks exactly three members");
  assert.equal(afterThird.members.filter((member) => member.is_ready).length, 3);
  assert.equal(afterThird.room.max_players, 3);

  evidence.lateThird = {
    roomId: lateThirdRoomId,
    beforeThird,
    afterThird,
    finishedAt: new Date().toISOString(),
  };
  await deleteRoom(lateThirdRoomId);

  // Repeated simultaneous convergence proof.
  for (let run = 1; run <= raceRuns; run += 1) {
    const startedAt = new Date().toISOString();
    const rooms = await Promise.all(clients.map((client) => findRoom(client)));
    const roomIds = rooms.map((room) => room.id);
    assert.equal(new Set(roomIds).size, 1, `race run ${run}: players split across rooms`);
    assert.ok(rooms.every((room) => room.max_players === 3));

    const roomId = roomIds[0];
    const waitingSnapshot = await roomSnapshot(roomId);
    assert.equal(waitingSnapshot.members.length, 3, `race run ${run}: wrong active member count`);
    assert.equal(waitingSnapshot.compatibleRooms.length, 1, `race run ${run}: duplicate waiting key`);

    await Promise.all(clients.map((client) => setReady(client, roomId)));
    const activeSnapshot = await waitForStatus(roomId, "active");
    assert.equal(activeSnapshot.members.length, 3);
    assert.equal(activeSnapshot.members.filter((member) => member.is_ready).length, 3);

    evidence.races.push({
      run,
      startedAt,
      finishedAt: new Date().toISOString(),
      roomIds,
      waitingSnapshot,
      activeSnapshot,
    });
    await deleteRoom(roomId);
  }

  evidence.classification = "PASS";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, classification: "PASS", raceRuns }, null, 2));
} catch (error) {
  evidence.classification = "FAIL";
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  await Promise.all(clients.map((client) => client.auth.signOut()));
}
