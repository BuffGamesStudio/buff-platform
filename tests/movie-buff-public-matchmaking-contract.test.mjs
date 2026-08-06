import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "utf8",
);
const waitingRoom = fs.readFileSync(
  "src/app/games/movie-buff/waiting-room/page.tsx",
  "utf8",
);
const race = fs.readFileSync(
  "scripts/movie-buff-public-matchmaking-race.mjs",
  "utf8",
);
const evidenceRunner = fs.readFileSync(
  "scripts/movie-buff-public-matchmaking-evidence-runner.mjs",
  "utf8",
);
const helper = fs.readFileSync(
  "scripts/movie-buff-public-matchmaking-race-helper.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804081500_movie_buff_atomic_three_player_matchmaking.rollback.sql",
  "utf8",
);
const pgtap = fs.readFileSync(
  "supabase/tests/movie_buff_public_matchmaking_test.sql",
  "utf8",
);

test("public capacity is server-owned and fixed at three", () => {
  assert.match(migration, /movie_buff_public_match_size\(\)/);
  assert.match(migration, /select\s+3\s*;/i);
  assert.match(migration, /exactly 3 active players/i);
  assert.match(migration, /perform\s+p_max_players\s*;/i);
});

test("matchmaking derives identity from auth uid", () => {
  assert.match(migration, /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /p_player_id/i);
});

test("compatibility selection is serialized and durable", () => {
  assert.match(migration, /movie-buff-public-player\|/);
  assert.match(migration, /movie-buff-public-compatibility\|/);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /public_matchmaking_key/);
  assert.match(migration, /game_rooms_one_public_waiting_compatibility_key_idx/);
  assert.doesNotMatch(migration, /for\s+update\s+skip\s+locked/i);
});

test("full rooms remain recoverable and reject a fourth player", () => {
  assert.match(migration, /compatible public room is already full/i);
  assert.doesNotMatch(
    migration,
    /v_active_members\s*=\s*v_public_size[\s\S]{0,200}status\s*=\s*'starting'/i,
  );
});

test("security definer functions use fixed paths and minimum grants", () => {
  const definerCount = (migration.match(/security definer/gi) ?? []).length;
  const fixedPathCount = (migration.match(/set search_path = pg_catalog/gi) ?? []).length;
  assert.ok(definerCount >= 4);
  assert.ok(fixedPathCount >= definerCount);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
  assert.match(migration, /to authenticated, service_role/i);
});

test("browser no longer owns public start eligibility", () => {
  assert.doesNotMatch(waitingRoom, /players\.length\s*>=\s*2/);
  assert.doesNotMatch(waitingRoom, /autoStartTimer/);
  assert.doesNotMatch(waitingRoom, /},\s*350\s*\)/);
  assert.doesNotMatch(waitingRoom, /at least 2 players are ready/i);
  assert.match(
    waitingRoom,
    /There is no host start button or browser auto-start timer/i,
  );
  assert.match(waitingRoom, /const stableCategoryId = categoryId/);
  assert.match(waitingRoom, /\[stableCategoryId\]/);
});

test("race evidence is exact-SHA bound and local-only", () => {
  assert.match(race, /git["'], \["rev-parse", "HEAD"\]/);
  assert.match(race, /MOVIE_BUFF_EXPECTED_GIT_SHA/);
  assert.match(race, /MOVIE_BUFF_EVIDENCE_COMMAND/);
  assert.match(race, /createHash\("sha256"\)/);
  assert.match(race, /localhost/);
  assert.match(race, /127\.0\.0\.1/);
  assert.match(race, /classification: "UNKNOWN"/);
  assert.match(race, /exitCode/);
});

test("evidence wrapper binds its manifest and child to the same checkout SHA", () => {
  assert.match(evidenceRunner, /execFileSync\("git", \["rev-parse", "HEAD"\]/);
  assert.match(evidenceRunner, /checkoutSha !== exactSha/);
  assert.match(evidenceRunner, /MOVIE_BUFF_EXPECTED_GIT_SHA: exactSha/);
  assert.match(evidenceRunner, /MOVIE_BUFF_EVIDENCE_COMMAND: commandLabel/);
  assert.match(evidenceRunner, /exactSha,\s*checkoutSha,/);
});

test("race cleanup requires explicit consent and is targeted", () => {
  assert.match(race, /MOVIE_BUFF_ALLOW_LOCAL_DELETIONS/);
  assert.match(race, /refusing cleanup of an untracked room/i);
  assert.match(race, /created before this proof run/i);
  assert.match(race, /containing a non-test player/i);
  assert.match(race, /test users already have open memberships/i);
  assert.doesNotMatch(race, /deleteRooms\(\(oldMemberships/);
});

test("race harness covers required convergence families", () => {
  assert.match(race, /duplicate same-player requests are idempotent/i);
  assert.match(race, /open membership blocks incompatible rematch/i);
  assert.match(race, /full cohort rejects fourth caller/i);
  assert.match(race, /stale empty room is cancelled/i);
  assert.match(race, /fresh simultaneous race/);
});

test("external compatibility-lock contention is real and bounded", () => {
  assert.match(helper, /movie-buff-public-compatibility\|/i);
  assert.match(helper, /pg_advisory_xact_lock/i);
  assert.match(helper, /hashtextextended/i);
  assert.match(helper, /pg_sleep/i);
  assert.match(helper, /LOCAL_MATCHMAKING_LOCK_TEST/);
  assert.match(helper, /to service_role/i);
  assert.doesNotMatch(helper, /to authenticated/i);
  assert.match(race, /movie_buff_test_hold_waiting_room_lock/);
  assert.match(race, /contentionElapsedMs/);
});

test("rollback packet is guarded, fail-closed, and non-destructive", () => {
  assert.match(
    rollback,
    /current_setting\('movie_buff\.allow_matchmaking_containment',\s*true\)/i,
  );
  assert.match(rollback, /allow_matchmaking_containment\s*=\s*'on'/i);
  assert.match(rollback, /<>\s*'on'/i);
  assert.match(rollback, /containment blocked/i);
  assert.match(rollback, /preserving schema/i);
  assert.match(
    rollback,
    /revoke execute on function public\.find_or_create_movie_buff_public_room[\s\S]*from authenticated/i,
  );
  assert.match(
    rollback,
    /revoke execute on function public\.set_movie_buff_player_ready[\s\S]*from authenticated/i,
  );
  assert.match(
    rollback,
    /revoke execute on function public\.start_movie_buff_match[\s\S]*from authenticated/i,
  );
  assert.match(
    rollback,
    /grant execute on function public\.find_or_create_movie_buff_public_room[\s\S]*to service_role/i,
  );
  assert.match(
    rollback,
    /grant execute on function public\.set_movie_buff_player_ready[\s\S]*to service_role/i,
  );
  assert.match(
    rollback,
    /grant execute on function public\.start_movie_buff_match[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(rollback, /drop\s+table|truncate|delete\s+from/i);
});

test("pgTAP covers ACL, ownership, fixed paths, and no SKIP LOCKED", () => {
  assert.match(pgtap, /has_function_privilege/);
  assert.match(pgtap, /join pg_catalog\.pg_roles as r on r\.oid = p\.proowner/);
  assert.match(pgtap, /r\.rolname = 'postgres'/);
  assert.match(pgtap, /search_path=pg_catalog/);
  assert.match(pgtap, /skip\[\[:space:\]\]\+locked/i);
});
