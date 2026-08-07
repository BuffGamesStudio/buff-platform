import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql",
  "utf8",
);
const repair = fs.readFileSync(
  "supabase/migrations/20260804083500_movie_buff_reconnect_buster_boundary_repair.sql",
  "utf8",
);
const boardBoundary = fs.readFileSync(
  "supabase/migrations/20260804083710_movie_buff_buster_board_boundary_only.sql",
  "utf8",
);
const answerPreflight = fs.readFileSync(
  "supabase/migrations/20260804083720_movie_buff_answer_phase_preflight.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql",
  "utf8",
);
const answerPreflightRollback = fs.readFileSync(
  "supabase/rollbacks/20260804083720_movie_buff_answer_phase_preflight.rollback.sql",
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
const reconnectProof = fs.readFileSync(
  "scripts/movie-buff-reconnect-race-proof.mjs",
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

test("expired or contradictory reconnect grace cannot reactivate itself", () => {
  assert.match(repair, /participant_state = 'reconnect_grace'/);
  assert.match(repair, /reconnect_deadline_at is null/);
  assert.match(repair, /reconnect_deadline_at <= v_now/);
  assert.match(repair, /'resumeAllowed', false/);
  assert.match(repair, /'reconnect_grace_expired'/);
  assert.match(repair, /reconnect_deadline_at > v_now/);
  assert.match(repair, /'resumeAllowed', true/);
  assert.match(repair, /for update/);
});

test("Buster activates only at the authoritative board-select boundary", () => {
  const activation = repair.split(
    /create or replace function public\.movie_buff_activate_ready_busters/,
  )[1];
  assert.match(activation, /v_state\.phase <> 'board_select'/);
  assert.doesNotMatch(
    activation,
    /'round_intro'|'vip_lock'|'results'|'playback'|'answer'|'transition'/,
  );
  assert.match(activation, /participant_state = 'abandoned'/);
  assert.match(activation, /controller_type = 'human'/);
  assert.match(activation, /controller_player_id = original_player_id/);
  assert.match(activation, /replacement_ready_at <= v_now/);
  assert.match(activation, /controller_type = 'buster'/);
  assert.match(activation, /buster_activated_at_board_select/);
});

test("final boundary migration blocks Buster outside board_select", () => {
  assert.match(boardBoundary, /movie_buff_enforce_buster_board_boundary/);
  assert.match(boardBoundary, /v_phase is distinct from 'board_select'/);
  assert.match(boardBoundary, /new\.controller_type := 'human'/);
  assert.match(boardBoundary, /new\.controller_player_id := old\.controller_player_id/);
  assert.match(boardBoundary, /v_state\.phase <> 'board_select'/);
  assert.match(boardBoundary, /new\.phase <> 'board_select'/);
  assert.doesNotMatch(
    boardBoundary,
    /phase not in \('board_select', 'results', 'round_intro'\)/,
  );
});

test("answer RPC rejects non-answer phases before legacy round resolution", () => {
  assert.match(
    answerPreflight,
    /alter function public\.submit_movie_buff_answer\(uuid,text\)[\s\S]*rename to submit_movie_buff_answer_legacy_unchecked/,
  );
  assert.match(answerPreflight, /v_state\.phase <> 'answer'/);
  assert.match(answerPreflight, /Movie Buff answer window is not open/);
  assert.match(
    answerPreflight,
    /submit_movie_buff_answer_legacy_unchecked\([\s\S]*p_room_id,[\s\S]*p_submitted_answer/,
  );
  assert.match(answerPreflight, /set search_path = pg_catalog/);
  assert.match(
    answerPreflight,
    /revoke all on function public\.submit_movie_buff_answer_legacy_unchecked\(uuid,text\)[\s\S]*authenticated/,
  );
});

test("repair rollback restores only the immediately preceding function contracts", () => {
  assert.match(rollback, /create or replace function public\.touch_movie_buff_match_participant/);
  assert.match(rollback, /create or replace function public\.movie_buff_activate_ready_busters/);
  assert.match(
    rollback,
    /'round_intro', 'vip_lock', 'board_select', 'results'/,
  );
  assert.doesNotMatch(rollback, /drop table|truncate|delete from/i);

  assert.match(
    answerPreflightRollback,
    /allow_answer_phase_preflight_rollback=on/,
  );
  assert.match(
    answerPreflightRollback,
    /rename to submit_movie_buff_answer/,
  );
  assert.doesNotMatch(
    answerPreflightRollback,
    /drop table|truncate|delete from/i,
  );
});

test("canonical view applies ready replacements after authoritative advancement", () => {
  assert.match(migration, /advance_movie_buff_match_phase\(p_room_id, null\)/);
  assert.match(migration, /movie_buff_activate_ready_busters\(p_room_id\)/);
  assert.match(migration, /selectorControllerType/);
});

test("local reconnect proof races expiry and proves pre-deadline resume", () => {
  assert.match(reconnectProof, /preDeadlineReconnect/);
  assert.match(reconnectProof, /expiredReconnectRace/);
  assert.match(reconnectProof, /Promise\.allSettled/);
  assert.match(reconnectProof, /reconnect_deadline_at/);
  assert.match(reconnectProof, /resumeAllowed/);
  assert.match(reconnectProof, /selectorControllerType, "buster"/);
});

test("three-client proof covers abandoned selector timeout", () => {
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
  assert.match(
    evidenceRunner,
    /20260804083720_movie_buff_answer_phase_preflight\.sql/,
  );
});
