import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql",
  "utf8",
);
const proof = fs.readFileSync(
  "scripts/movie-buff-three-client-phase-proof.mjs",
  "utf8",
);

test("grace expiry stages a system controller before Buster", () => {
  assert.match(migration, /movie_buff_stage_abandoned_controller/);
  assert.match(migration, /new\.controller_type := 'system'/);
  assert.match(migration, /make_interval\(secs => 2\)/);
  assert.match(migration, /original_player_id/);
});

test("Buster activates only at declared safe phase boundaries", () => {
  for (const phase of ["round_intro", "vip_lock", "board_select", "results"]) {
    assert.match(migration, new RegExp(`'${phase}'`));
  }
  assert.doesNotMatch(
    migration.split(/movie_buff_activate_ready_busters/)[1],
    /'playback'|'answer'|'transition'/,
  );
  assert.match(migration, /replacement_ready_at <= v_now/);
  assert.match(migration, /buster_activated_at_safe_boundary/);
});

test("canonical view applies ready safe-boundary replacements", () => {
  assert.match(migration, /advance_movie_buff_match_phase\(p_room_id, null\)/);
  assert.match(migration, /movie_buff_activate_ready_busters\(p_room_id\)/);
  assert.match(migration, /selectorControllerType/);
});

test("three-client proof covers abandoned selector timeout", () => {
  assert.match(proof, /reconnect_deadline_at/);
  assert.match(proof, /Room access denied|abandoned/);
  assert.match(proof, /selectorControllerType, "buster"/);
  assert.match(proof, /selectionSource, "buster_timeout"/);
  assert.match(proof, /selectedTileId, context\.tileIds\[1\]/);
});
