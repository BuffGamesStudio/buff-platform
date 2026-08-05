import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const functions=fs.readFileSync("supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql","utf8");
const rls=fs.readFileSync("supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql","utf8");
const autoRls=fs.readFileSync("supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql","utf8");
const rollbacks=[
  fs.readFileSync("supabase/rollbacks/20260805155000_movie_buff_function_security_finalizer.rollback.sql","utf8"),
  fs.readFileSync("supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql","utf8"),
  fs.readFileSync("supabase/rollbacks/20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql","utf8"),
].join("\n");
const forwardTest=fs.readFileSync("supabase/tests/movie_buff_current_security_finalizer_test.sql","utf8");

const identities=[...functions.matchAll(/\('public\.[^']+'\)/g)].map(m=>m[0]);

test("full candidate uses an exact 24-RPC authenticated allowlist",()=>{
  assert.equal(identities.length,24);
  assert.match(functions,/get_movie_buff_active_leave_quote\(uuid\)/);
  assert.match(functions,/confirm_movie_buff_active_leave\(uuid,text\)/);
  assert.doesNotMatch(functions,/confirm_movie_buff_active_leave\(uuid,text,text\)/);
  assert.match(functions,/grant execute on function %s to authenticated/);
  assert.doesNotMatch(functions,/grant execute on function[^;]+to anon/i);
});

test("function baseline closes PUBLIC and anon and preserves service continuity",()=>{
  assert.match(functions,/revoke all on function %s from public, anon, authenticated, service_role/);
  assert.match(functions,/grant execute on function %s to service_role/);
  assert.match(functions,/aclexplode/);
  assert.match(functions,/VIP finalizer must remain service-only/);
});

test("six exact exposed tables are FORCE-RLS with five policies",()=>{
  for(const table of ["match_round_player_hints","match_round_player_playback","movie_buff_boards","movie_buff_board_categories","movie_buff_board_tiles","movie_buff_board_events"]){
    assert.match(rls,new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(rls,new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.equal((rls.match(/create policy /g)??[]).length,5);
  assert.doesNotMatch(rls,/grant select on table public\.movie_buff_board_events to authenticated/i);
});

test("RLS event callback remains enabled and non-callable",()=>{
  assert.match(autoRls,/evtname = 'ensure_rls'/);
  assert.match(autoRls,/revoke all on function public\.rls_auto_enable\(\)/);
  assert.doesNotMatch(autoRls,/drop event trigger|disable|grant execute/i);
});

test("rollbacks preserve fail-closed containment",()=>{
  assert.doesNotMatch(rollbacks,/grant execute[^;]+authenticated|grant select[^;]+authenticated/i);
  assert.doesNotMatch(rollbacks,/drop table|truncate|delete from/i);
  assert.match(rollbacks,/force row level security/);
  assert.match(rollbacks,/event trigger remains enabled|ensure_rls event trigger must remain enabled/);
});

test("PUBLIC ACL checks use catalog expansion, never a fake role",()=>{
  for(const source of [functions,autoRls,forwardTest]){
    assert.doesNotMatch(source,/has_function_privilege\('public'/i);
    assert.match(source,/aclexplode/);
  }
});
