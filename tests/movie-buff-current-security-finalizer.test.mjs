import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const functions = fs.readFileSync(
  "supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql",
  "utf8",
);
const rls = fs.readFileSync(
  "supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql",
  "utf8",
);
const autoRls = fs.readFileSync(
  "supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql",
  "utf8",
);
const functionRollback = fs.readFileSync(
  "supabase/rollbacks/20260805155000_movie_buff_function_security_finalizer.rollback.sql",
  "utf8",
);
const rlsRollback = fs.readFileSync(
  "supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql",
  "utf8",
);
const autoRlsRollback = fs.readFileSync(
  "supabase/rollbacks/20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql",
  "utf8",
);
const forwardTest = fs.readFileSync(
  "supabase/tests/movie_buff_current_security_finalizer_test.sql",
  "utf8",
);

const expectedAuthenticatedRpcs = [
  "public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)",
  "public.join_movie_buff_room(text)",
  "public.leave_movie_buff_room(uuid)",
  "public.set_movie_buff_player_ready(uuid,boolean)",
  "public.touch_movie_buff_room_presence(uuid)",
  "public.get_movie_buff_round(uuid)",
  "public.mark_movie_buff_round_media_ready(uuid)",
  "public.use_movie_buff_round_hint(uuid,integer)",
  "public.submit_movie_buff_answer(uuid,text)",
  "public.get_movie_buff_round_results(uuid)",
  "public.get_movie_buff_round_results(uuid,uuid)",
  "public.get_movie_buff_final_results(uuid)",
  "public.get_movie_buff_round_completion(uuid,uuid,timestamp with time zone,integer)",
  "public.get_movie_buff_round_player_time_left(uuid,uuid,timestamp with time zone,integer)",
  "public.is_movie_buff_round_player_finished(uuid,uuid,timestamp with time zone,integer)",
  "public.get_movie_buff_match_phase_view(uuid)",
  "public.advance_movie_buff_match_phase(uuid,bigint)",
  "public.select_movie_buff_match_tile(uuid,uuid,bigint,text)",
  "public.touch_movie_buff_match_participant(uuid)",
  "public.get_movie_buff_vip_round_view(uuid,uuid)",
  "public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)",
  "public.activate_movie_buff_round_vip(uuid,uuid,text)",
  "public.get_movie_buff_active_leave_quote(uuid)",
  "public.confirm_movie_buff_active_leave(uuid,text,text)",
];

test("authenticated function contract is an exact 24-RPC allowlist", () => {
  for (const identity of expectedAuthenticatedRpcs) {
    assert.match(functions, new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const inserts = [...functions.matchAll(/\('public\.[^']+'\)/g)].map((match) => match[0]);
  assert.equal(inserts.length, 24);
  assert.match(functions, /grant execute on function %s to authenticated/);
  assert.doesNotMatch(functions, /grant execute on function[^;]+to anon/i);
});

test("function hardening closes PUBLIC and anon before reopening exact callers", () => {
  assert.match(functions, /revoke all on function %s from public, anon, authenticated, service_role/);
  assert.match(functions, /grant execute on function %s to service_role/);
  assert.match(functions, /acl\.grantee = 0/);
  assert.match(functions, /has_function_privilege\('anon'/);
  assert.match(functions, /VIP finalizer must remain service-only/);
});

test("active-leave authority remains available after current hardening", () => {
  assert.match(functions, /get_movie_buff_active_leave_quote\(uuid\)/);
  assert.match(functions, /confirm_movie_buff_active_leave\(uuid,text,text\)/);
  assert.match(forwardTest, /authenticated RPC allowlist has 24 exact identities/);
  assert.match(forwardTest, /active-leave quote remains caller callable/);
  assert.match(forwardTest, /active-leave confirmation remains caller callable/);
});

test("six exact exposed tables use FORCE RLS and only five browser policies", () => {
  for (const table of [
    "match_round_player_hints",
    "match_round_player_playback",
    "movie_buff_boards",
    "movie_buff_board_categories",
    "movie_buff_board_tiles",
    "movie_buff_board_events",
  ]) {
    assert.match(rls, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(rls, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.equal((rls.match(/create policy /g) ?? []).length, 5);
  assert.doesNotMatch(rls, /grant select on table public\.movie_buff_board_events to authenticated/i);
});

test("RLS event callback remains enabled but cannot be invoked as an RPC", () => {
  assert.match(autoRls, /evtname = 'ensure_rls'/);
  assert.match(autoRls, /event_row\.evtenabled <> 'D'/);
  assert.match(autoRls, /revoke all on function public\.rls_auto_enable\(\)/);
  assert.match(autoRls, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(autoRls, /drop event trigger|alter event trigger[^;]+disable/i);
  assert.doesNotMatch(autoRls, /grant execute/i);
});

test("rollbacks are containment-only and never restore browser access", () => {
  assert.match(functionRollback, /Never restore PUBLIC, anon, or authenticated execution/);
  assert.match(functionRollback, /grant execute on function %s to service_role/);
  assert.doesNotMatch(functionRollback, /grant execute[^;]+authenticated/i);
  assert.match(rlsRollback, /force row level security/g);
  assert.doesNotMatch(rlsRollback, /grant select[^;]+authenticated/i);
  assert.match(autoRlsRollback, /direct execution remains closed/);
  assert.doesNotMatch(
    `${functionRollback}\n${rlsRollback}\n${autoRlsRollback}`,
    /drop table|truncate|delete from/i,
  );
});

test("PUBLIC ACL validation uses catalog ACL expansion instead of a fake role", () => {
  for (const source of [functions, autoRls, forwardTest]) {
    assert.doesNotMatch(source, /has_function_privilege\('public'/i);
  }
  assert.match(functions, /aclexplode/);
  assert.match(autoRls, /aclexplode/);
  assert.match(forwardTest, /aclexplode/);
});
