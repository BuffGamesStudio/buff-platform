import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql";
const waitingRoomPath = "src/app/games/movie-buff/waiting-room/page.tsx";
const racePath = "scripts/movie-buff-public-matchmaking-race.mjs";

const migration = fs.readFileSync(migrationPath, "utf8");
const waitingRoom = fs.readFileSync(waitingRoomPath, "utf8");
const race = fs.readFileSync(racePath, "utf8");

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
  assert.match(
    migration,
    /game_rooms_one_public_waiting_compatibility_key_idx/,
  );
  assert.doesNotMatch(migration, /skip\s+locked/i);
});

test("a full trio is sealed before another joinable room is created", () => {
  assert.match(
    migration,
    /if\s+v_active_members\s*=\s*v_public_size\s+then[\s\S]*status\s*=\s*'starting'/i,
  );
  assert.match(
    migration,
    /v_existing_room\.status\s+in\s*\('waiting',\s*'starting'\)/i,
  );
});

test("security definer functions use fixed search path and explicit grants", () => {
  const definerCount = (migration.match(/security definer/gi) ?? []).length;
  const fixedPathCount = (migration.match(/set search_path = pg_catalog/gi) ?? []).length;
  assert.ok(definerCount >= 4);
  assert.equal(fixedPathCount, definerCount);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
  assert.match(migration, /to authenticated, service_role/i);
});

test("browser no longer owns public start eligibility", () => {
  assert.doesNotMatch(waitingRoom, /players\.length\s*>=\s*2/);
  assert.doesNotMatch(waitingRoom, /autoStartTimer/);
  assert.doesNotMatch(waitingRoom, /},\s*350\s*\)/);
  assert.doesNotMatch(waitingRoom, /at least 2 players are ready/i);
  assert.match(waitingRoom, /There is no host start button or browser auto-start timer/i);
  assert.match(waitingRoom, /lobby\.room\.status === "active"/);
});

test("race harness is local-only and covers required edge families", () => {
  assert.match(race, /localhost/);
  assert.match(race, /127\.0\.0\.1/);
  assert.match(race, /exactly three core test-user credentials/i);
  assert.match(race, /MOVIE_BUFF_OVERFLOW_TEST_USER/);
  assert.match(race, /duplicateRequest/);
  assert.match(race, /incompatibleSettings/);
  assert.match(race, /fullRoomRollover/);
  assert.match(race, /staleRoom/);
  assert.match(race, /lateThird/);
});
