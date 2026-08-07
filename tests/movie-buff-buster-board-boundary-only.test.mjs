import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083710_movie_buff_buster_board_boundary_only.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083710_movie_buff_buster_board_boundary_only.rollback.sql",
  "utf8",
);

test("Buster conversion is centrally guarded by board_select", () => {
  assert.match(
    migration,
    /create or replace function public\.movie_buff_enforce_buster_board_boundary\(\)/,
  );
  assert.match(
    migration,
    /before update of controller_type[\s\S]*movie_buff_match_participant_seats/,
  );
  assert.match(
    migration,
    /v_phase is distinct from 'board_select'/,
  );
  assert.match(migration, /new\.controller_type := 'human'/);
  assert.match(migration, /new\.controller_player_id := old\.controller_player_id/);
});

test("all active Buster paths are board_select-only", () => {
  assert.match(
    migration,
    /if not found or v_state\.phase <> 'board_select' then[\s\S]*return 0/,
  );
  assert.match(
    migration,
    /old\.phase is not distinct from new\.phase[\s\S]*new\.phase <> 'board_select'/,
  );
  assert.doesNotMatch(
    migration,
    /new\.phase not in \('board_select', 'results', 'round_intro'\)/,
  );
  assert.doesNotMatch(
    migration,
    /v_state\.phase not in \('board_select', 'results', 'round_intro'\)/,
  );
});

test("migration preserves ownership, fixed paths, and browser denial", () => {
  for (const identity of [
    "movie_buff_enforce_buster_board_boundary\\(\\)",
    "movie_buff_activate_ready_busters\\(uuid\\)",
    "movie_buff_activate_busters_on_phase_boundary\\(\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${identity}[\\s\\S]*owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${identity}[\\s\\S]*from public, anon, authenticated, service_role`),
    );
  }
  assert.match(migration, /set search_path = pg_catalog/g);
});

test("rollback is migration-specific and data-preserving", () => {
  assert.match(
    rollback,
    /drop trigger if exists movie_buff_buster_requires_board_boundary/,
  );
  assert.match(
    rollback,
    /drop function if exists public\.movie_buff_enforce_buster_board_boundary\(\)/,
  );
  assert.match(
    rollback,
    /v_state\.phase not in \('board_select', 'results', 'round_intro'\)/,
  );
  assert.match(
    rollback,
    /new\.phase not in \('board_select', 'results', 'round_intro'\)/,
  );
  assert.doesNotMatch(rollback, /drop table|truncate table|delete from/i);
});
