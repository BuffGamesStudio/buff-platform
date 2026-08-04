import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const overflowUserJson = process.env.MOVIE_BUFF_OVERFLOW_TEST_USER;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-public-matchmaking-race-evidence.json",
);

if (
  !supabaseUrl ||
  !publishableKey ||
  !serviceRoleKey ||
  !usersJson ||
  !overflowUserJson
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_TEST_USERS, and MOVIE_BUFF_OVERFLOW_TEST_USER are required.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(
    `Refusing non-local Supabase target ${target.origin}. This harness may delete only disposable local test rooms.`,
  );
}

const users = JSON.parse(usersJson);
const overflowUser = JSON.parse(overflowUserJson);
assert.equal(users.length, 3, "exactly three core test-user credentials are required");
assert.equal(new Set([...users.map((user) => user.email), overflowUser.email]).size, 4);

const categoryId = process.env.MOVIE_BUFF_CATEGORY_ID || null;
const difficulty = (process.env.MOVIE_BUFF_DIFFICULTY ?? "medium").trim().toLowerCase();
const incompatibleDifficulty = difficulty === "hard" ? "easy" : "hard";
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
const overflowClient = browserClient();
let overflowUserId = null;

function roomFromRpc(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Matchmaking RPC returned no room ID.");
  return row;
}

async function findRoom(client, options = {}) {
  const { data, error } = await client.rpc("find_or_create_movie_buff_public_room", {
    p_category_id: options.categoryId ?? categoryId,
    p_difficulty: options.difficulty ?? difficulty,
    p_total_rounds: options.totalRounds ?? totalRounds,
    p_max_players: options.maxPlayers ?? 99,
  });
  if (error) throw new Error(`matchmaking RPC failed: ${error.message}`);
  return roomFromRpc(data);
}

async function expectFindRoomError(client, options, expectedPattern) {
  const { error } = await client.rpc("find_or_create_movie_buff_public_room", {
    p_category_id: options.categoryId ?? categoryId,
    p_difficulty: options.difficulty ?? difficulty,
    p_total_rounds: options.totalRounds ?? totalRounds,
    p_max_players: options.maxPlayers ?? 99,
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

  const { data: compatibleWaitingRooms, error: compatibleError } = await admin
    .from("game_rooms")
    .select("id,status,public_matchmaking_key")
    .eq("room_type", "public")
    .eq("status", "waiting")
    .eq("public_matchmaking_key", room.public_matchmaking_key);
  if (compatibleError) {
    throw new Error(`compatibility uniqueness query failed: ${compatibleError.message}`);
  }

  return { room, members, compatibleWaitingRooms };
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

async function deleteRooms(roomIds) {
  for (const roomId of new Set(roomIds.filter(Boolean))) await deleteRoom(roomId);
}

const evidence = {
  schemaVersion: 1,
  target: { kind: "local", identity: target.origin },
  settings: { categoryId, difficulty, totalRounds, raceRuns, callerMaxPlayers: 99 },
  startedAt: new Date().toISOString(),
  users: [],
  duplicateRequest: null,
  incompatibleSettings: null,
  lateThird: null,
  fullRoom: null,
  staleRoom: null,
  races: [],
};

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate core test user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      evidence.users.push({ index: index + 1, userId: data.user.id });
    }),
  );

  const { data: overflowSession, error: overflowSignInError } =
    await overflowClient.auth.signInWithPassword(overflowUser);
  if (overflowSignInError || !overflowSession.user || overflowSession.user.is_anonymous) {
    throw new Error(`Unable to authenticate overflow test user: ${overflowSignInError?.message ?? "unknown"}`);
  }
  overflowUserId = overflowSession.user.id;
  evidence.users.push({ index: 4, userId: overflowUserId, role: "overflow" });

  const testUserIds = evidence.users.map((user) => user.userId);
  const { data: oldMemberships, error: oldMembershipError } = await admin
    .from("room_players")
    .select("room_id")
    .in("player_id", testUserIds)
    .is("left_at", null);
  if (oldMembershipError) throw oldMembershipError;
  await deleteRooms((oldMemberships ?? []).map((row) => row.room_id));

  const duplicateRooms = await Promise.all([
    findRoom(clients[0]),
    findRoom(clients[0]),
  ]);
  assert.equal(duplicateRooms[0].id, duplicateRooms[1].id);
  evidence.duplicateRequest = {
    roomIds: duplicateRooms.map((room) => room.id),
    observedAt: new Date().toISOString(),
  };

  const incompatibleError = await expectFindRoomError(
    clients[0],
    { difficulty: incompatibleDifficulty },
    /leave your current open movie buff room/i,
  );
  evidence.incompatibleSettings = {
    roomId: duplicateRooms[0].id,
    requestedDifficulty: incompatibleDifficulty,
    error: incompatibleError,
    observedAt: new Date().toISOString(),
  };
  await deleteRoom(duplicateRooms[0].id);

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
  assert.equal(beforeThird.members.length, 2);
  assert.equal(beforeThird.members.filter((member) => member.is_ready).length, 2);
  assert.equal(beforeThird.compatibleWaitingRooms.length, 1);

  const thirdRoom = await findRoom(clients[2]);
  assert.equal(thirdRoom.id, lateThirdRoomId, "late third player did not converge");
  assert.equal(thirdRoom.status, "waiting");

  const duplicateThirdRoom = await findRoom(clients[2]);
  assert.equal(duplicateThirdRoom.id, lateThirdRoomId, "duplicate third-player request was not idempotent");

  const fullRoomError = await expectFindRoomError(
    overflowClient,
    {},
    /compatible public room is already full/i,
  );
  const fullSnapshot = await roomSnapshot(lateThirdRoomId);
  assert.equal(fullSnapshot.members.length, 3);
  assert.equal(fullSnapshot.room.status, "waiting");
  assert.equal(fullSnapshot.compatibleWaitingRooms.length, 1);
  evidence.fullRoom = {
    roomId: lateThirdRoomId,
    overflowError: fullRoomError,
    snapshot: fullSnapshot,
    observedAt: new Date().toISOString(),
  };

  await setReady(clients[2], lateThirdRoomId);
  const afterThird = await waitForStatus(lateThirdRoomId, "active");
  assert.equal(afterThird.members.length, 3);
  assert.equal(afterThird.members.filter((member) => member.is_ready).length, 3);
  evidence.lateThird = {
    roomId: lateThirdRoomId,
    beforeThird,
    afterThird,
    finishedAt: new Date().toISOString(),
  };
  await deleteRoom(lateThirdRoomId);

  const staleRoom = await findRoom(overflowClient);
  const staleTimestamp = new Date(Date.now() - 120_000).toISOString();
  const { error: staleUpdateError } = await admin
    .from("room_players")
    .update({ last_seen_at: staleTimestamp })
    .eq("room_id", staleRoom.id)
    .eq("player_id", overflowUserId);
  if (staleUpdateError) throw staleUpdateError;

  const replacementRoom = await findRoom(clients[0]);
  assert.notEqual(replacementRoom.id, staleRoom.id, "stale room was reused");
  const { data: staleRoomRow, error: staleRoomError } = await admin
    .from("game_rooms")
    .select("id,status")
    .eq("id", staleRoom.id)
    .single();
  if (staleRoomError) throw staleRoomError;
  assert.equal(staleRoomRow.status, "cancelled");
  evidence.staleRoom = {
    staleRoomId: staleRoom.id,
    replacementRoomId: replacementRoom.id,
    staleTimestamp,
    staleRoomStatus: staleRoomRow.status,
    observedAt: new Date().toISOString(),
  };
  await deleteRooms([staleRoom.id, replacementRoom.id]);

  for (let run = 1; run <= raceRuns; run += 1) {
    const startedAt = new Date().toISOString();
    const rooms = await Promise.all(clients.map((client) => findRoom(client)));
    const roomIds = rooms.map((room) => room.id);
    assert.equal(new Set(roomIds).size, 1, `race run ${run}: players split across rooms`);
    assert.ok(rooms.every((room) => room.max_players === 3));

    const roomId = roomIds[0];
    const waitingSnapshot = await roomSnapshot(roomId);
    assert.equal(waitingSnapshot.room.status, "waiting");
    assert.equal(waitingSnapshot.members.length, 3);
    assert.equal(waitingSnapshot.compatibleWaitingRooms.length, 1);

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
  await overflowClient.auth.signOut();
}
