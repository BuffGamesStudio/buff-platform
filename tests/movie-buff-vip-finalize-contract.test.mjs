import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804073300_movie_buff_vip_deadline_finalize.rollback.sql",
  "utf8",
);
const pgtap = fs.readFileSync(
  "supabase/tests/movie_buff_vip_deadline_finalize_test.sql",
  "utf8",
);
const adversarial = fs.readFileSync(
  "scripts/movie-buff-vip-finalize-adversarial.mjs",
  "utf8",
);

test("MOV-17 finalize signature is present and exact", () => {
  assert.match(
    migration,
    /finalize_movie_buff_vip_round_window\(\s*p_room_id uuid,\s*p_round_id uuid,\s*p_deadline_at timestamptz\s*\)/i,
  );
  assert.match(migration, /returns jsonb/i);
});

test("finalization serializes and binds the canonical deadline", () => {
  assert.match(migration, /movie-buff-vip-window\|/);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /deadline_at is distinct from p_deadline_at/i);
  assert.match(migration, /contradictory vip finalization deadline/i);
});

test("pre-deadline incomplete state cannot advance", () => {
  assert.match(migration, /v_now < v_window\.deadline_at/i);
  assert.match(migration, /'advanceReady', false/);
  assert.match(migration, /closed before all required humans completed/i);
});

test("deadline creates explicit no-VIP passes only for unreleased missing humans", () => {
  assert.match(migration, /required\.released_at is null/i);
  assert.match(migration, /locked\.vip_id is null/i);
  assert.match(migration, /locked\.inventory_id is null/i);
  assert.match(migration, /'deadline-pass:'/i);
  assert.match(migration, /not exists[\s\S]*movie_buff_vip_round_locks/i);
  assert.match(migration, /on conflict \(match_id, round_id, player_id\) do nothing/i);
});

test("identical finalization returns stable authoritative state", () => {
  assert.match(migration, /'advanceReady', true/);
  assert.match(migration, /'passCount', v_pass_count/);
  assert.doesNotMatch(migration, /'serverNow'/);
  assert.doesNotMatch(migration, /generatedPassCount/);
});

test("finalizer has minimum direct execution grants", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog/i);
  assert.match(migration, /owner to postgres/i);
  assert.match(
    migration,
    /revoke all on function[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant execute on function[\s\S]*to service_role/i);
});

test("rollback removes only the callable boundary and preserves data", () => {
  assert.match(rollback, /drop function if exists/i);
  assert.doesNotMatch(rollback, /drop table/i);
  assert.doesNotMatch(rollback, /delete from/i);
  assert.doesNotMatch(rollback, /truncate/i);
});

test("pgTAP checks ownership ACL path and implementation guards", () => {
  assert.match(pgtap, /select plan\(12\)/i);
  assert.match(pgtap, /service role can finalize vip windows/i);
  assert.match(pgtap, /authenticated callers cannot directly finalize/i);
  assert.match(pgtap, /search_path=pg_catalog/i);
  assert.match(pgtap, /explicit null-vip locks/i);
});

test("adversarial harness is exact-SHA local-only and exercises concurrency", () => {
  assert.match(adversarial, /git["'], \["rev-parse", "HEAD"\]/);
  assert.match(adversarial, /MOVIE_BUFF_EXPECTED_GIT_SHA/);
  assert.match(adversarial, /localhost/);
  assert.match(adversarial, /127\.0\.0\.1/);
  assert.match(adversarial, /MOVIE_BUFF_ALLOW_LOCAL_VIP_FINALIZE/);
  assert.match(adversarial, /Promise\.all\(\[finalize\(\), finalize\(\)\]\)/);
  assert.match(adversarial, /assert\.deepEqual\(first\.data, second\.data\)/);
  assert.match(adversarial, /contradictory deadline fails closed/i);
});
