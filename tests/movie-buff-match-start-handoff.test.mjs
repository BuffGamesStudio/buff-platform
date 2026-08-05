import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083600_movie_buff_match_start_handoff.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083600_movie_buff_match_start_handoff.rollback.sql",
  "utf8",
);

function functionDefinition(name) {
  const expression = new RegExp(
    `create or replace function public\\.${name}[\\s\\S]*?\\$\\$;\\s*`,
    "i",
  );
  const match = migration.match(expression);
  assert.ok(match, `${name} definition is required`);
  return match[0];
}

function privilegeStatement(action, name) {
  const expression = new RegExp(
    `${action} on function public\\.${name}\\(uuid\\)[^;]*;`,
    "i",
  );
  const match = migration.match(expression);
  assert.ok(match, `${action} statement for ${name} is required`);
  return match[0];
}

test("MOV-17 owns the final start wrapper and internal admission handoff", () => {
  const helper = functionDefinition("begin_movie_buff_match_from_admission");
  const wrapper = functionDefinition("start_movie_buff_match");

  assert.match(helper, /security definer/i);
  assert.match(helper, /set search_path = pg_catalog/i);
  assert.match(wrapper, /begin_movie_buff_match_from_admission\(p_room_id\)/i);
  assert.doesNotMatch(wrapper, /insert\s+into|update\s+public\./i);
});

test("authoritative start validates caller and exact admission readiness", () => {
  const helper = functionDefinition("begin_movie_buff_match_from_admission");
  assert.match(helper, /auth\.uid\(\)/);
  assert.match(helper, /Only active room members can start this public match/i);
  assert.match(helper, /Only the host can start this match/i);
  assert.match(helper, /Public matches require exactly 3 active players/i);
  assert.match(helper, /All 3 public players must be ready/i);
  assert.match(helper, /Every player must be ready before starting/i);
  assert.match(helper, /for update/i);
});

test("match bootstrap creates an inert first-round shell", () => {
  const helper = functionDefinition("begin_movie_buff_match_from_admission");
  assert.match(helper, /insert into public\.matches/i);
  assert.match(helper, /insert into public\.match_players/i);
  assert.match(helper, /insert into public\.match_rounds/i);
  assert.match(
    helper,
    /values\s*\(\s*v_match\.id,\s*null,\s*1,\s*30,\s*null,\s*null,\s*null,\s*null,\s*0\s*\)/i,
  );
  assert.match(helper, /Pre-phase round state is not an inert authoritative shell/i);
  assert.doesNotMatch(helper, /pick_movie_buff_clip/i);
  assert.doesNotMatch(helper, /order by random\(\)/i);
  assert.doesNotMatch(helper, /round_started/i);
});

test("canonical round intro owns the first shared timestamp", () => {
  const helper = functionDefinition("begin_movie_buff_match_from_admission");
  assert.match(helper, /ensure_movie_buff_match_phase_state\(p_room_id\)/i);
  assert.match(helper, /v_state\.phase <> 'round_intro'/i);
  assert.match(helper, /v_state\.phase_version <> 1/i);
  assert.match(helper, /selected_tile_id is not null/i);
  assert.match(helper, /selected_clip_id is not null/i);
  assert.match(helper, /started_at = v_state\.phase_started_at/i);
  assert.doesNotMatch(helper, /clock_timestamp\(\)|\bnow\(\)/i);
});

test("internal helper is not browser executable", () => {
  const helperRevoke = privilegeStatement(
    "revoke all",
    "begin_movie_buff_match_from_admission",
  );
  const helperGrant = privilegeStatement(
    "grant execute",
    "begin_movie_buff_match_from_admission",
  );
  const wrapperGrant = privilegeStatement("grant execute", "start_movie_buff_match");

  assert.match(helperRevoke, /from public, anon, authenticated, service_role/i);
  assert.match(helperGrant, /to service_role/i);
  assert.doesNotMatch(helperGrant, /\bauthenticated\b/i);
  assert.match(wrapperGrant, /to authenticated, service_role/i);
});

test("match-start rollback contains authority without deleting durable data", () => {
  assert.match(rollback, /allow_match_start_containment/);
  assert.match(rollback, /contained pending restoration/i);
  assert.match(
    rollback,
    /revoke all on function public\.begin_movie_buff_match_from_admission/i,
  );
  assert.doesNotMatch(rollback, /grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(rollback, /drop table|delete from|truncate/i);
  assert.doesNotMatch(rollback, /pick_movie_buff_clip|insert into public\.match_rounds/i);
});
