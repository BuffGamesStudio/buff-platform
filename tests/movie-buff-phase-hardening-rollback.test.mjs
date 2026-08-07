import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authorization = fs.readFileSync(
  "src/lib/server/movieBuffPhaseRouteAuthorization.ts",
  "utf8",
);
const viewRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/view/route.ts",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083100_movie_buff_server_phase_machine_hardening.rollback.sql",
  "utf8",
);

test("canonical source identity failure retains HTTP 503 semantics", () => {
  assert.match(
    viewRoute,
    /Immutable Movie Buff source identity is unavailable[\s\S]*503/,
  );
  assert.match(
    authorization,
    /readonly status: 400 \| 401 \| 403 \| 404 \| 409 \| 500 \| 503/,
  );
});

test("83100 has a migration-specific data-preserving rollback", () => {
  assert.match(
    rollback,
    /create or replace function public\.ensure_movie_buff_match_phase_state/,
  );
  assert.match(
    rollback,
    /create or replace function public\.movie_buff_phase_release_vip_participant/,
  );
  assert.match(
    rollback,
    /create or replace function public\.select_movie_buff_match_tile/,
  );
  assert.match(
    rollback,
    /drop trigger if exists movie_buff_answers_require_authoritative_phase/,
  );
  assert.match(
    rollback,
    /drop function if exists public\.movie_buff_guard_authoritative_answer_phase/,
  );
  assert.match(
    rollback,
    /grant execute on function public\.advance_movie_buff_round\(uuid\)[\s\S]*to authenticated, service_role/,
  );
  assert.doesNotMatch(rollback, /pg_advisory_xact_lock/);
  assert.doesNotMatch(rollback, /positive expected phase version is required/i);
  assert.doesNotMatch(rollback, /drop table|truncate table|delete from/i);
});

test("83100 rollback preserves fixed owners and least privilege", () => {
  for (const identity of [
    "ensure_movie_buff_match_phase_state\\(uuid\\)",
    "movie_buff_phase_release_vip_participant\\(uuid,uuid,uuid,text\\)",
    "select_movie_buff_match_tile\\(uuid,uuid,bigint,text\\)",
  ]) {
    assert.match(
      rollback,
      new RegExp(`alter function public\\.${identity}[\\s\\S]*owner to postgres`),
    );
  }

  assert.match(
    rollback,
    /revoke all on function public\.ensure_movie_buff_match_phase_state\(uuid\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    rollback,
    /revoke all on function public\.movie_buff_phase_release_vip_participant\(uuid,uuid,uuid,text\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    rollback,
    /revoke all on function public\.select_movie_buff_match_tile\(uuid,uuid,bigint,text\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    rollback,
    /grant execute on function public\.select_movie_buff_match_tile\(uuid,uuid,bigint,text\)[\s\S]*to authenticated, service_role/,
  );
});
