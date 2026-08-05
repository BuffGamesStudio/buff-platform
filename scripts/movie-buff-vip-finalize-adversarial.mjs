import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const commandLabel = process.env.MOVIE_BUFF_EVIDENCE_COMMAND?.trim();
const fixtureJson = process.env.MOVIE_BUFF_VIP_FINALIZE_FIXTURE;
const allowFixtureMutation = process.env.MOVIE_BUFF_ALLOW_LOCAL_VIP_FINALIZE;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-finalize-evidence.json",
);

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  !expectedGitSha ||
  !commandLabel ||
  !fixtureJson
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_EXPECTED_GIT_SHA, MOVIE_BUFF_EVIDENCE_COMMAND, and MOVIE_BUFF_VIP_FINALIZE_FIXTURE are required.",
  );
}

if (allowFixtureMutation !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_VIP_FINALIZE=YES to mutate only the supplied disposable local VIP fixture.",
  );
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local Supabase target ${target.origin}.`);
}

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedGitSha, "checkout HEAD does not match expected SHA");

const fixture = JSON.parse(fixtureJson);
assert.match(fixture.roomId, /^[0-9a-f-]{36}$/i);
assert.match(fixture.roundId, /^[0-9a-f-]{36}$/i);
assert.ok(Array.isArray(fixture.expectedPassPlayerIds));
assert.ok(fixture.expectedPassPlayerIds.length > 0);
assert.equal(
  new Set(fixture.expectedPassPlayerIds).size,
  fixture.expectedPassPlayerIds.length,
  "expected pass identities must be unique",
);
const deadlineAt = new Date(fixture.deadlineAt);
assert.ok(Number.isFinite(deadlineAt.getTime()), "fixture deadlineAt is invalid");

const sourceFiles = [
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
  "supabase/rollbacks/20260804073300_movie_buff_vip_deadline_finalize.rollback.sql",
  "supabase/tests/movie_buff_vip_deadline_finalize_test.sql",
  "scripts/movie-buff-vip-finalize-adversarial.mjs",
  "tests/movie-buff-vip-finalize-contract.test.mjs",
];

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const evidence = {
  schemaVersion: 1,
  lane: "MOV-16",
  classification: "UNKNOWN",
  exitCode: null,
  gitSha,
  expectedGitSha,
  command: commandLabel,
  nodeVersion: process.version,
  target: { kind: "local", origin: target.origin },
  fixture: {
    roomId: fixture.roomId,
    roundId: fixture.roundId,
    deadlineAt: deadlineAt.toISOString(),
    expectedPassPlayerIds: fixture.expectedPassPlayerIds,
  },
  sourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha256(file)])),
  startedAt: new Date().toISOString(),
  checks: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    observedAt: new Date().toISOString(),
    details,
  });
}

async function finalize(deadline = deadlineAt.toISOString()) {
  return admin.rpc("finalize_movie_buff_vip_round_window", {
    p_room_id: fixture.roomId,
    p_round_id: fixture.roundId,
    p_deadline_at: deadline,
  });
}

try {
  const { data: window, error: windowError } = await admin
    .from("movie_buff_vip_round_windows")
    .select("room_id,round_id,deadline_at,status")
    .eq("room_id", fixture.roomId)
    .eq("round_id", fixture.roundId)
    .single();
  if (windowError) throw windowError;
  assert.equal(new Date(window.deadline_at).toISOString(), deadlineAt.toISOString());

  const { data: requiredRows, error: requiredError } = await admin
    .from("movie_buff_vip_round_required_players")
    .select("player_id,released_at")
    .eq("round_id", fixture.roundId)
    .is("released_at", null);
  if (requiredError) throw requiredError;
  const requiredIds = new Set(requiredRows.map((row) => row.player_id));
  for (const playerId of fixture.expectedPassPlayerIds) {
    assert.ok(requiredIds.has(playerId), `expected pass player ${playerId} is not required`);
  }

  const { data: existingLocks, error: existingLockError } = await admin
    .from("movie_buff_vip_round_locks")
    .select("player_id")
    .eq("round_id", fixture.roundId)
    .in("player_id", fixture.expectedPassPlayerIds);
  if (existingLockError) throw existingLockError;
  assert.equal(
    existingLocks.length,
    0,
    "expected pass identities already have locks; use a clean disposable fixture",
  );

  assert.ok(
    Date.now() < deadlineAt.getTime() - 250,
    "fixture deadline must still be in the future for pre-deadline proof",
  );
  const early = await finalize();
  assert.equal(early.error, null);
  assert.equal(early.data.advanceReady, false);
  assert.equal(early.data.status, "open");
  record("pre-deadline incomplete finalization remains open");

  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, deadlineAt.getTime() - Date.now() + 150)),
  );

  const [first, second] = await Promise.all([finalize(), finalize()]);
  assert.equal(first.error, null);
  assert.equal(second.error, null);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.data.advanceReady, true);
  assert.equal(first.data.status, "closed");
  record("concurrent deadline finalization returns one stable result", first.data);

  const { data: passRows, error: passError } = await admin
    .from("movie_buff_vip_round_locks")
    .select("player_id,vip_id,inventory_id,idempotency_key")
    .eq("round_id", fixture.roundId)
    .in("player_id", fixture.expectedPassPlayerIds)
    .order("player_id");
  if (passError) throw passError;
  assert.equal(passRows.length, fixture.expectedPassPlayerIds.length);
  for (const row of passRows) {
    assert.equal(row.vip_id, null);
    assert.equal(row.inventory_id, null);
    assert.equal(
      row.idempotency_key,
      `deadline-pass:${fixture.roundId}:${row.player_id}`,
    );
  }
  record("deadline creates one explicit no-VIP pass per missing required human");

  const replay = await finalize();
  assert.equal(replay.error, null);
  assert.deepEqual(replay.data, first.data);
  record("identical finalization replay is idempotent");

  const contradictoryDeadline = new Date(deadlineAt.getTime() + 1000).toISOString();
  const contradictory = await finalize(contradictoryDeadline);
  assert.ok(contradictory.error);
  assert.match(contradictory.error.message, /contradictory/i);
  record("contradictory deadline fails closed");

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  evidence.finishedAt = new Date().toISOString();
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
