import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ?? "movie-buff-three-client-evidence.json",
);

if (!supabaseUrl || !publishableKey || !usersJson) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and MOVIE_BUFF_TEST_USERS are required.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(
    `Refusing non-local Supabase target ${target.origin}. This harness is local-only unless the operator supplies a separately authorized staging procedure.`,
  );
}

const users = JSON.parse(usersJson);
assert.equal(users.length, 3, "exactly three distinct test users are required");
assert.equal(new Set(users.map((user) => user.email)).size, 3, "test user emails must be distinct");

const categoryId = process.env.MOVIE_BUFF_CATEGORY_ID || null;
const difficulty = (process.env.MOVIE_BUFF_DIFFICULTY ?? "medium").trim().toLowerCase();
const totalRounds = Number(process.env.MOVIE_BUFF_TOTAL_ROUNDS ?? 10);
const runCount = Number(process.env.MOVIE_BUFF_RACE_RUNS ?? 10);

if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 50) {
  throw new Error("MOVIE_BUFF_TOTAL_ROUNDS must be an integer between 1 and 50.");
}
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 100) {
  throw new Error("MOVIE_BUFF_RACE_RUNS must be an integer between 1 and 100.");
}

function client() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const clients = users.map(() => client());
const evidence = {
  schemaVersion: 1,
  target: { kind: "local", identity: target.origin },
  startedAt: new Date().toISOString(),
  settings: { categoryId, difficulty, totalRounds, maxPlayers: 3, runCount },
  runs: [],
};

try {
  await Promise.all(
    clients.map(async (supabase, index) => {
      const { data, error } = await supabase.auth.signInWithPassword(users[index]);
      if (error || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown error"}`);
      }
    }),
  );

  for (let run = 1; run <= runCount; run += 1) {
    const startedAt = new Date().toISOString();
    const results = await Promise.all(
      clients.map((supabase) =>
        supabase.rpc("find_or_create_movie_buff_public_room", {
          p_category_id: categoryId,
          p_difficulty: difficulty,
          p_total_rounds: totalRounds,
          p_max_players: 3,
        }),
      ),
    );

    for (const result of results) {
      if (result.error) throw new Error(`matchmaking RPC failed: ${result.error.message}`);
    }

    const roomIds = results.map((result) => {
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      return row?.room_id ?? row?.result_room_id ?? row?.id ?? null;
    });
    assert.equal(new Set(roomIds).size, 1, `run ${run}: clients split across rooms`);
    assert.ok(roomIds[0], `run ${run}: authoritative room ID is missing`);

    const roomId = roomIds[0];
    const readyResults = await Promise.all(
      clients.map((supabase) =>
        supabase.rpc("set_movie_buff_player_ready", {
          p_room_id: roomId,
          p_is_ready: true,
        }),
      ),
    );
    for (const result of readyResults) {
      if (result.error) throw new Error(`ready RPC failed: ${result.error.message}`);
    }

    const { data: room, error: roomError } = await clients[0]
      .from("game_rooms")
      .select("id,status,room_type,max_players,current_round")
      .eq("id", roomId)
      .single();
    if (roomError) throw new Error(`room evidence query failed: ${roomError.message}`);

    const { data: members, error: memberError } = await clients[0]
      .from("room_players")
      .select("player_id,is_ready,left_at,joined_at")
      .eq("room_id", roomId)
      .is("left_at", null);
    if (memberError) throw new Error(`membership evidence query failed: ${memberError.message}`);

    assert.equal(room.max_players, 3, `run ${run}: public capacity is not server-owned strict three`);
    assert.equal(members.length, 3, `run ${run}: expected exactly three active memberships`);
    assert.equal(members.filter((member) => member.is_ready).length, 3, `run ${run}: expected all three ready`);

    evidence.runs.push({
      run,
      startedAt,
      finishedAt: new Date().toISOString(),
      roomIds,
      room,
      members,
    });
  }

  evidence.classification = "PASS";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, classification: evidence.classification }, null, 2));
} catch (error) {
  evidence.classification = "FAIL";
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  await Promise.all(clients.map((supabase) => supabase.auth.signOut()));
}
