import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-authority-diagnostic.json",
);
const runId = (process.env.MOVIE_BUFF_LOCAL_RUN_ID ?? "mov16-diagnostic")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 40);

if (!supabaseUrl || !serviceRoleKey || !expectedGitSha) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MOVIE_BUFF_EXPECTED_GIT_SHA are required.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local Supabase target ${target.origin}.`);
}

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedGitSha);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const createdUsers = [];
const createdRooms = [];

function serializeError(error) {
  if (error instanceof Error) {
    return {
      kind: "Error",
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      cause: error.cause ? serializeError(error.cause) : null,
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

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  exitCode: null,
  repository: "BuffGamesStudio/buff-platform",
  sourceBranch: process.env.GITHUB_REF_NAME ?? null,
  sourceSha: checkoutSha,
  target: { kind: "localhost", origin: target.origin },
  startedAt: new Date().toISOString(),
  steps: [],
  cleanup: [],
};

async function step(name, operation) {
  try {
    const value = await operation();
    evidence.steps.push({ name, classification: "PASS" });
    return value;
  } catch (error) {
    evidence.steps.push({
      name,
      classification: "FAIL",
      error: serializeError(error),
    });
    throw error;
  }
}

function roomCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

try {
  const password = `Local-${runId}-A9!`;
  const userIds = [];

  for (let index = 1; index <= 4; index += 1) {
    const email = `movie-buff-${runId}-p${index}@example.test`;
    const displayName = `MOV-16 Diagnostic Player ${index}`;
    const user = await step(`create-auth-user-${index}`, async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error || !data.user) throw error ?? new Error("createUser returned no user");
      return data.user;
    });
    createdUsers.push(user.id);
    userIds.push(user.id);

    await step(`ensure-profile-${index}`, async () => {
      const { data, error: readError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (readError) throw readError;
      if (data) return;
      const { error } = await admin.from("profiles").insert({
        id: user.id,
        display_name: displayName,
      });
      if (error) throw error;
    });
  }

  await step("clean-open-membership-preflight", async () => {
    const { data, error } = await admin
      .from("room_players")
      .select("room_id,player_id")
      .in("player_id", userIds)
      .is("left_at", null);
    if (error) throw error;
    assert.equal(data?.length ?? 0, 0);
  });

  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();

  await step("insert-game-room", async () => {
    const { error } = await admin.from("game_rooms").insert({
      id: roomId,
      room_code: roomCode(),
      host_id: userIds[0],
      room_type: "private",
      status: "active",
      category_id: null,
      difficulty: "medium",
      total_rounds: 10,
      max_players: 4,
      current_round: 1,
      is_ranked: false,
      started_at: now,
    });
    if (error) throw error;
    createdRooms.push(roomId);
  });

  await step("insert-room-players", async () => {
    const { error } = await admin.from("room_players").insert(
      userIds.slice(0, 2).map((playerId, position) => ({
        room_id: roomId,
        player_id: playerId,
        is_ready: true,
        is_host: position === 0,
        left_at: null,
        joined_at: now,
        last_seen_at: now,
      })),
    );
    if (error) throw error;
  });

  await step("insert-match", async () => {
    const { error } = await admin.from("matches").insert({
      id: matchId,
      room_id: roomId,
      category_id: null,
      difficulty: "medium",
      total_rounds: 10,
      status: "active",
      started_at: now,
    });
    if (error) throw error;
  });

  await step("insert-match-players", async () => {
    const { error } = await admin.from("match_players").insert(
      userIds.slice(0, 2).map((playerId) => ({
        match_id: matchId,
        player_id: playerId,
      })),
    );
    if (error) throw error;
  });

  await step("insert-match-round", async () => {
    const { error } = await admin.from("match_rounds").insert({
      id: roundId,
      match_id: matchId,
      round_number: 1,
      time_limit_seconds: 30,
      started_at: now,
    });
    if (error) throw error;
  });

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error = serializeError(error);
} finally {
  for (const roomId of createdRooms.reverse()) {
    const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
    evidence.cleanup.push({
      kind: "room",
      id: roomId,
      classification: error ? "FAIL" : "PASS",
      error: error ? serializeError(error) : null,
    });
  }

  for (const userId of createdUsers.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    evidence.cleanup.push({
      kind: "auth-user",
      id: userId,
      classification: error ? "FAIL" : "PASS",
      error: error ? serializeError(error) : null,
    });
  }

  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(
  JSON.stringify({
    outputPath,
    classification: evidence.classification,
    exitCode: evidence.exitCode,
    failedStep: evidence.steps.find((entry) => entry.classification === "FAIL")?.name ?? null,
  }),
);

if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
