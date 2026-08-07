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
const raceRepair = fs.readFileSync(
  "supabase/migrations/20260804083710_movie_buff_phase_race_contract_repair.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql",
  "utf8",
);
const raceRepairRollback = fs.readFileSync(
  "supabase/rollbacks/20260804083710_movie_buff_phase_race_contract_repair.rollback.sql",
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

test("final race repair excludes intro and VIP from delayed Buster activation", () => {
  const worker = raceRepair.split(
    /create or replace function public\.movie_buff_activate_ready_busters/,
  )[1].split(
    /create or replace function public\.movie_buff_activate_busters_on_phase_boundary/,
  )[0];
  const boundary = raceRepair.split(
    /create or replace function public\.movie_buff_activate_busters_on_phase_boundary/,
  )[1];

  assert.match(worker, /phase not in \('board_select', 'results'\)/);
  assert.doesNotMatch(worker, /'round_intro'|'vip_lock'/);
  assert.match(boundary, /old\.phase in \('round_intro', 'vip_lock'\)/);
  assert.match(boundary, /new\.phase = 'board_select'/);
  assert.match(boundary, /new\.phase not in \('board_select', 'results'\)/);
  assert.doesNotMatch(
    boundary.match(/new\.phase not in \([^\n]+\)/)?.[0] ?? "",
    /round_intro|vip_lock/,
  );
});

test("answer RPC rejects non-answer phases before legacy round resolution", () => {
  assert.match(
    raceRepair,
    /alter function public\.submit_movie_buff_answer\(uuid,text\)[\s\S]*rename to submit_movie_buff_answer_legacy_unchecked/,
  );
  assert.match(raceRepair, /v_state\.phase <> 'answer'/);
  assert.match(raceRepair, /Movie Buff answer window is not open/);
  assert.match(
    raceRepair,
    /submit_movie_buff_answer_legacy_unchecked\([\s\S]*p_room_id,[\s\S]*p_submitted_answer/,
  );
  assert.match(raceRepair, /set search_path = pg_catalog/);
  assert.match(
    raceRepair,
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
    raceRepairRollback,
    /allow_phase_race_contract_rollback=on/,
  );
  assert.match(
    raceRepairRollback,
    /rename to submit_movie_buff_answer/,
  );
  assert.match(
    raceRepairRollback,
    /'board_select', 'results', 'round_intro'/,
  );
  assert.doesNotMatch(
    raceRepairRollback,
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
    /20260804083710_movie_buff_phase_race_contract_repair\.sql/,
  );
});
