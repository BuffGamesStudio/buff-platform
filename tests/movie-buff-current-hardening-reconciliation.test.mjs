import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  "src/app/api/movie-buff/board/resolve/route.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql",
  "utf8",
);

const tables = [
  "match_round_player_hints",
  "match_round_player_playback",
  "movie_buff_boards",
  "movie_buff_board_categories",
  "movie_buff_board_tiles",
  "movie_buff_board_events",
];

test("legacy board resolve verifies bearer membership before mutation", () => {
  const authIndex = route.indexOf("requireMovieBuffPhaseMember(request, roomId)");
  const mutationIndex = route.indexOf("resolveMovieBuffBoardAfterRound");
  assert.ok(authIndex > 0);
  assert.ok(mutationIndex > authIndex);
  assert.match(route, /movieBuffPhaseErrorResponse/);
  assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
});

test("six exposed tables enable RLS and revoke broad browser privileges", () => {
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant all on table public\\.${table} to service_role`, "i"),
    );
  }
});

test("browser reads are member/self scoped and board events remain server-only", () => {
  assert.match(migration, /movie_buff_boards_select_active_member/);
  assert.match(migration, /movie_buff_board_categories_select_active_member/);
  assert.match(migration, /movie_buff_board_tiles_select_active_member/);
  assert.match(migration, /match_round_player_hints_select_self/);
  assert.match(migration, /match_round_player_playback_select_self/);
  assert.match(migration, /player_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(
    migration,
    /grant select on table public\.movie_buff_board_events to authenticated/i,
  );
  assert.doesNotMatch(migration, /to anon|to public/i);
});

test("rollback is fail-closed containment and never disables RLS", () => {
  for (const table of tables) {
    assert.match(
      rollback,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      rollback,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"),
    );
  }
  assert.doesNotMatch(rollback, /disable row level security/i);
  assert.doesNotMatch(rollback, /grant .* to (public|anon|authenticated)/i);
  assert.doesNotMatch(rollback, /drop table|truncate|delete from/i);
});
