import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083700_movie_buff_active_leave_and_buster_boundary.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260804083700_movie_buff_active_leave_and_buster_boundary.rollback.sql",
  "utf8",
);
const quoteRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/leave/quote/route.ts",
  "utf8",
);
const confirmRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/leave/confirm/route.ts",
  "utf8",
);
const authorization = fs.readFileSync(
  "src/lib/server/movieBuffPhaseRouteAuthorization.ts",
  "utf8",
);

test("database migrations contain no UTF-8 byte-order marks", () => {
  const migrationDirectory = "supabase/migrations";
  const bomFiles = fs
    .readdirSync(migrationDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .filter((fileName) => {
      const bytes = fs.readFileSync(path.join(migrationDirectory, fileName));
      return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
    })
    .sort();

  assert.deepEqual(
    bomFiles,
    [],
    `UTF-8 BOM blocks Supabase migration parsing: ${bomFiles.join(", ")}`,
  );
});

test("VIP or intro abandonment becomes Buster atomically on board entry", () => {
  assert.match(migration, /movie_buff_activate_busters_on_phase_boundary/);
  assert.match(migration, /old\.phase in \('round_intro', 'vip_lock'\)/);
  assert.match(migration, /new\.phase = 'board_select'/);
  assert.match(migration, /v_immediate_board_handoff/);
  assert.match(migration, /after update of phase/);
  assert.match(migration, /controller_type = 'buster'/);
  assert.match(migration, /buster_activated_on_board_entry/);
  assert.match(migration, /atomicBoardEntry/);
});

test("delayed takeover remains constrained to declared safe boundaries", () => {
  const helper = migration.match(
    /create or replace function public\.movie_buff_activate_ready_busters[\s\S]*?\$\$;/,
  )?.[0] ?? "";
  assert.match(helper, /'board_select', 'results', 'round_intro'/);
  assert.doesNotMatch(helper, /'vip_lock'|'transition'|'playback'|'answer'/);
  assert.match(helper, /replacement_ready_at <= v_now/);
});

test("active leave is a two-step caller-bound server contract", () => {
  assert.match(migration, /get_movie_buff_active_leave_quote\(p_room_id uuid\)/);
  assert.match(migration, /confirm_movie_buff_active_leave\([\s\S]*p_quote_token text[\s\S]*p_idempotency_key text/);
  assert.match(migration, /movie_buff_phase_require_access\(p_room_id\)/);
  assert.match(migration, /phase_version <> v_quote\.phase_version/);
  assert.match(migration, /Active-leave quote expired/);
  assert.match(migration, /Active-leave policy changed/);
  assert.match(migration, /Active human participant seat required/);
});

test("leave confirmation converges and contradictory replay fails", () => {
  assert.match(migration, /action_type <> 'leave_confirm'/);
  assert.match(migration, /request_hash <> v_request_hash/);
  assert.match(migration, /Contradictory duplicate active-leave confirmation/);
  assert.match(migration, /Re-check after the quote lock/);
  assert.match(migration, /return v_existing\.result/);
});

test("penalty and abandonment records are immutable and exactly once", () => {
  assert.match(migration, /movie_buff_active_leave_penalty_ledger/);
  assert.match(migration, /quote_id uuid not null unique/);
  assert.match(migration, /action_id uuid not null unique/);
  assert.match(migration, /movie_buff_match_abandonment_events/);
  assert.match(migration, /movie_buff_reject_immutable_match_record_change/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /configured_penalty_points/);
  assert.match(migration, /room_score_before/);
  assert.match(migration, /match_score_after/);
});

test("production penalty remains explicit configuration and fails closed when absent", () => {
  assert.match(migration, /movie_buff_active_leave_policies/);
  assert.match(migration, /where policy\.active/);
  assert.match(migration, /Active Movie Buff leave policy is unavailable/);
  assert.doesNotMatch(
    migration,
    /insert into public\.movie_buff_active_leave_policies/i,
  );
});

test("browser routes preserve membership checks for quote and replay-safe auth for confirm", () => {
  assert.match(quoteRoute, /requireMovieBuffPhaseMember/);
  assert.match(quoteRoute, /get_movie_buff_active_leave_quote/);
  assert.match(confirmRoute, /requireMovieBuffPhaseCaller/);
  assert.doesNotMatch(confirmRoute, /requireMovieBuffPhaseMember/);
  assert.match(confirmRoute, /confirm_movie_buff_active_leave/);
  assert.match(authorization, /requireMovieBuffPhaseCaller/);
});

test("rollback contains browser mutation without deleting durable records", () => {
  assert.match(rollback, /revoke all on function public\.get_movie_buff_active_leave_quote/);
  assert.match(rollback, /revoke all on function public\.confirm_movie_buff_active_leave/);
  assert.match(rollback, /to service_role/);
  assert.match(rollback, /drop trigger if exists movie_buff_activate_busters_on_phase_boundary/);
  assert.match(rollback, /v_state\.phase <> 'board_select'/);
  assert.doesNotMatch(rollback, /drop table|truncate|delete from/i);
  assert.match(rollback, /force row level security/);
});