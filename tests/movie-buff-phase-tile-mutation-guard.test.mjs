import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083300_movie_buff_phase_tile_mutation_guard.sql",
  "utf8",
);
const phaseRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/select/route.ts",
  "utf8",
);

test("direct board tile use is rejected without phase authorization", () => {
  assert.match(migration, /movie_buff_guard_phase_tile_mutation/);
  assert.match(migration, /old\.is_used = false/);
  assert.match(migration, /new\.is_used = true/);
  assert.match(migration, /phase_tile_mutation/);
  assert.match(migration, /must use the authoritative Movie Buff phase route/i);
});

test("canonical helper sets a transaction-local authorization marker", () => {
  assert.match(migration, /set_config\(/);
  assert.match(migration, /'authorized'/);
  assert.match(migration, /true\s*\)/);
  assert.match(migration, /movie_buff_apply_phase_tile_selection/);
});

test("phase helper still enforces rights media and repeat gates", () => {
  assert.match(migration, /licensing_status/);
  assert.match(migration, /licensed', 'public_domain', 'promotional', 'user_connected/);
  assert.match(migration, /clip_type not in \('video', 'audio'\)/);
  assert.match(migration, /violates match repeat protection/i);
  assert.match(migration, /previous_clip\.movie_id = v_movie_id/);
});

test("browser selection path carries phase version and idempotency", () => {
  assert.match(phaseRoute, /expectedVersion/);
  assert.match(phaseRoute, /idempotencyKey/);
  assert.match(phaseRoute, /select_movie_buff_match_tile/);
  assert.doesNotMatch(phaseRoute, /supabaseAdmin\.from\(/);
});
