import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const base = fs.readFileSync(
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "utf8",
);
const repair = fs.readFileSync(
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804073100_movie_buff_vip_null_category_fail_closed.rollback.sql",
  "utf8",
);

test("MOV-16 migration 73100 has an explicit data-preserving rollback disposition", () => {
  assert.match(
    repair,
    /v_match\.category_id is null[\s\S]*not \(v_match\.category_id = any\(v_definition\.allowed_category_ids\)\)/i,
  );
  assert.match(
    rollback,
    /create or replace function public\.movie_buff_vip_ineligibility_reason\([\s\S]*uuid, uuid, uuid, uuid, uuid, timestamptz/i,
  );
  assert.match(rollback, /security definer/i);
  assert.match(rollback, /set search_path = pg_catalog/i);
  assert.match(
    rollback,
    /and not \(v_match\.category_id = any\(v_definition\.allowed_category_ids\)\) then/i,
  );
  assert.doesNotMatch(rollback, /v_match\.category_id is null/i);
  assert.match(rollback, /owner to postgres/i);
  assert.match(
    rollback,
    /revoke all on function public\.movie_buff_vip_ineligibility_reason[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    rollback,
    /\b(drop table|truncate|delete from|drop function)\b/i,
  );
  assert.match(
    base,
    /and not \(v_match\.category_id = any\(v_definition\.allowed_category_ids\)\) then/i,
  );
});
