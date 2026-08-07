import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804081600_movie_buff_admission_phase_handoff.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804081600_movie_buff_admission_phase_handoff.rollback.sql",
  "utf8",
);

function startFunctionBody(sql) {
  const match = sql.match(
    /create or replace function public\.start_movie_buff_match[\s\S]*?\$\$;\s*/i,
  );
  assert.ok(match, "start_movie_buff_match definition is required");
  return match[0];
}

test("MOV-15 delegates shared match start to the MOV-17 contract", () => {
  const body = startFunctionBody(migration);
  assert.match(body, /begin_movie_buff_match_from_admission\(uuid\)/);
  assert.match(body, /to_regprocedure/i);
  assert.match(
    body,
    /return query execute[\s\S]*begin_movie_buff_match_from_admission/i,
  );
  assert.match(body, /using p_room_id/);
  assert.match(body, /MOV-17 authoritative match-start handoff is unavailable/);
});

test("MOV-15 retains only caller, membership, and readiness admission checks", () => {
  const body = startFunctionBody(migration);
  assert.match(body, /auth\.uid\(\)/);
  assert.match(body, /room_type = 'public'/);
  assert.match(body, /active room members/i);
  assert.match(body, /Only the host can start this match/i);
  assert.match(body, /assert_movie_buff_strict_three_ready/);
  assert.match(body, /Every player must be ready before starting/i);
  assert.match(body, /for update/i);
});

test("MOV-15 no longer owns clips, rounds, timestamps, or shared phase mutation", () => {
  const body = startFunctionBody(migration);
  assert.doesNotMatch(body, /pick_movie_buff_clip/i);
  assert.doesNotMatch(body, /insert\s+into\s+public\.matches/i);
  assert.doesNotMatch(body, /insert\s+into\s+public\.match_players/i);
  assert.doesNotMatch(body, /insert\s+into\s+public\.match_rounds/i);
  assert.doesNotMatch(body, /update\s+public\.match_rounds/i);
  assert.doesNotMatch(body, /playback_started_at/i);
  assert.doesNotMatch(body, /hint_used_at|hint_penalty_seconds/i);
  assert.doesNotMatch(body, /round_started/i);
  assert.doesNotMatch(body, /movie_buff_match_phase_state/i);
  assert.doesNotMatch(body, /clock_timestamp\(\)|\bnow\(\)/i);
  assert.doesNotMatch(body, /status\s*=\s*'active'/i);
  assert.doesNotMatch(body, /current_round\s*=|started_at\s*=/i);
});

test("handoff ACL is fixed-path, postgres-owned, and browser-authenticated only", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(
    migration,
    /alter function public\.start_movie_buff_match\(uuid\) owner to postgres/i,
  );
  assert.match(
    migration,
    /revoke all[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute[\s\S]*to authenticated, service_role/i,
  );
});

test("rollback contains browser start instead of restoring MOV-15 phase authority", () => {
  assert.match(rollback, /allow_admission_handoff_containment/);
  assert.match(rollback, /until the MOV-17 authoritative handoff is restored/i);
  assert.match(rollback, /to service_role/i);
  assert.doesNotMatch(rollback, /to authenticated/i);
  assert.doesNotMatch(rollback, /pick_movie_buff_clip/i);
  assert.doesNotMatch(rollback, /insert\s+into|update\s+public\./i);
  assert.doesNotMatch(rollback, /drop table|delete from|truncate/i);
});
