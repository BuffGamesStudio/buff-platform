import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql",
  "utf8",
);
const alignment = fs.readFileSync(
  "supabase/migrations/20260804083400_movie_buff_phase_contract_alignment.sql",
  "utf8",
);
const proof = fs.readFileSync(
  "scripts/movie-buff-three-client-phase-proof.mjs",
  "utf8",
);
const evidenceRunner = fs.readFileSync(
  "scripts/movie-buff-three-client-phase-evidence-runner.mjs",
  "utf8",
);

test("grace expiry preserves an abandoned human seat until Buster is safe", () => {
  assert.match(migration, /movie_buff_stage_abandoned_controller/);
  assert.match(migration, /new\.controller_type := 'human'/);
  assert.match(migration, /new\.controller_player_id := new\.original_player_id/);
  assert.match(migration, /participant_state,[\s\S]*excludes this seat/i);
  assert.match(migration, /make_interval\(secs => 2\)/);
  assert.doesNotMatch(migration, /new\.controller_type := 'system'/);
});

test("system remains a non-seat actor under the final controller constraint", () => {
  assert.match(alignment, /controller_type in \('human', 'buster'\)/);
  assert.doesNotMatch(migration, /controller_type = 'system'/);
  assert.doesNotMatch(migration, /controller_type := 'system'/);
});

test("Buster activates only at declared safe phase boundaries", () => {
  for (const phase of ["round_intro", "vip_lock", "board_select", "results"]) {
    assert.match(migration, new RegExp(`'${phase}'`));
  }
  assert.doesNotMatch(
    migration.split(/movie_buff_activate_ready_busters/)[1],
    /'playback'|'answer'|'transition'/,
  );
  assert.match(migration, /participant_state = 'abandoned'/);
  assert.match(migration, /controller_type = 'human'/);
  assert.match(migration, /controller_player_id = original_player_id/);
  assert.match(migration, /replacement_ready_at <= v_now/);
  assert.match(migration, /controller_type = 'buster'/);
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

test("only the evidence wrapper can make an exact-SHA proof claim", () => {
  assert.match(evidenceRunner, /MOVIE_BUFF_EXPECTED_GIT_SHA/);
  assert.match(evidenceRunner, /MOVIE_BUFF_EVIDENCE_COMMAND/);
  assert.match(evidenceRunner, /MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION/);
  assert.match(
    evidenceRunner,
    /execFileSync\("git", \["rev-parse", "HEAD"\]/,
  );
  assert.match(evidenceRunner, /checkoutSha !== exactSha/);
  assert.match(evidenceRunner, /sourceHashes/);
  assert.match(evidenceRunner, /stdoutSha256/);
  assert.match(evidenceRunner, /stderrSha256/);
  assert.match(evidenceRunner, /profilesRestored/);
  assert.match(evidenceRunner, /classification:/);
});
