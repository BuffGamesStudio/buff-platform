import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083610_movie_buff_phase_digest_schema_repair.sql",
  "utf8",
);
const original = fs.readFileSync(
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083610_movie_buff_phase_digest_schema_repair.rollback.sql",
  "utf8",
);

test("repair redefines the exact selector RPC with schema-qualified pgcrypto", () => {
  assert.match(
    migration,
    /create or replace function public\.select_movie_buff_match_tile\(\s*p_room_id uuid,\s*p_tile_id uuid,\s*p_expected_version bigint,\s*p_idempotency_key text\s*\)/s,
  );
  assert.match(migration, /extensions\.digest\(/);
  assert.match(migration, /pg_catalog\.convert_to\(/);
  assert.match(migration, /'UTF8'/);
  assert.match(migration, /'sha256'/);
  assert.doesNotMatch(migration, /public\.digest\(/);
});

test("repair preserves selector, phase-version, and idempotency authority", () => {
  assert.match(migration, /movie_buff_phase_require_access/);
  assert.match(migration, /Movie Buff phase version changed/i);
  assert.match(migration, /Only the current active human selector may choose a tile/i);
  assert.match(migration, /Contradictory duplicate board selection request/i);
  assert.match(migration, /movie_buff_apply_phase_tile_selection/);
  assert.match(migration, /set search_path = pg_catalog/);
});

test("original defect remains explicitly detectable for historical evidence", () => {
  assert.match(original, /public\.digest\(/);
  assert.match(migration, /Required extensions\.digest\(bytea,text\) is unavailable/);
});

test("ACL remains minimum and rollback is fail-closed containment", () => {
  assert.match(
    migration,
    /revoke all on function public\.select_movie_buff_match_tile[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.select_movie_buff_match_tile[\s\S]*to authenticated, service_role/i,
  );
  assert.match(rollback, /revoke execute[\s\S]*from authenticated/i);
  assert.match(rollback, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(rollback, /public\.digest|drop function|drop table|truncate|delete from/i);
});
