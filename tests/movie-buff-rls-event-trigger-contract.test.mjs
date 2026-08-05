import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260805160500_public_rls_auto_enable_event_trigger_contract.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260805160500_public_rls_auto_enable_event_trigger_contract.rollback.sql",
  "utf8",
);

test("event-trigger prerequisite is reproducible from a clean database", () => {
  assert.match(migration, /create or replace function public\.rls_auto_enable\(\)/i);
  assert.match(migration, /returns event_trigger/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(migration, /create event trigger ensure_rls/i);
  assert.match(migration, /on ddl_command_end/i);
  assert.match(
    migration,
    /'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO'/,
  );
  assert.match(migration, /alter table if exists %s enable row level security/i);
});

test("existing contradictory event trigger fails closed", () => {
  assert.match(
    migration,
    /Existing ensure_rls event trigger has a contradictory contract/,
  );
  assert.doesNotMatch(migration, /drop event trigger/i);
});

test("forward and containment keep direct callback execution closed", () => {
  for (const source of [migration, rollback]) {
    assert.match(source, /revoke all on function public\.rls_auto_enable\(\)/i);
    assert.match(source, /from public, anon, authenticated, service_role/i);
    assert.doesNotMatch(source, /grant execute/i);
    assert.doesNotMatch(source, /disable|drop event trigger/i);
  }
});

test("containment preserves automatic RLS enforcement", () => {
  assert.match(rollback, /alter event trigger ensure_rls enable/i);
  assert.match(rollback, /Containment must preserve enabled ensure_rls automation/);
  assert.match(
    rollback,
    /Containment must keep direct rls_auto_enable\(\) execution closed/,
  );
});
