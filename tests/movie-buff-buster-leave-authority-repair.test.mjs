import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260805194500_movie_buff_buster_leave_authority_repair.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260805194500_movie_buff_buster_leave_authority_repair.rollback.sql",
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
const navigation = fs.readFileSync(
  "src/components/movie-buff/MovieBuffAuthoritativeNavigation.tsx",
  "utf8",
);

test("Buster activation is bound to authoritative safe-phase entry", () => {
  assert.match(migration, /movie_buff_activate_busters_on_safe_phase_entry/);
  assert.match(migration, /after update of phase/);
  assert.match(migration, /new\.phase in \('board_select', 'results'\)/);
  assert.match(
    migration,
    /abandoned_phase in \('round_intro', 'vip_lock'\)[\s\S]*or replacement_ready_at <= v_now/,
  );
  assert.match(
    migration,
    /v_state\.phase not in \('board_select', 'results'\)/,
  );
  assert.doesNotMatch(
    migration,
    /v_state\.phase not in \([\s\S]*'vip_lock'/,
  );
});

test("leave policy is explicit, versioned, and not silently seeded", () => {
  assert.match(migration, /movie_buff_leave_penalty_policies/);
  assert.match(migration, /policy_version text not null/);
  assert.match(migration, /penalty_points integer not null/);
  assert.match(migration, /effective_from timestamptz not null/);
  assert.match(migration, /No active Movie Buff voluntary-leave policy is configured/);
  assert.match(migration, /No active Movie Buff disconnect-abandonment policy is configured/);
  assert.doesNotMatch(
    migration,
    /insert into public\.movie_buff_leave_penalty_policies/i,
  );
});

test("quote and confirm bind caller, seat, phase, policy, expiry, and replay", () => {
  assert.match(migration, /get_movie_buff_active_leave_quote\(p_room_id uuid\)/);
  assert.match(migration, /confirm_movie_buff_active_leave\([\s\S]*p_quote_token uuid/);
  assert.match(migration, /quote\.player_id = v_player_id/);
  assert.match(migration, /v_state\.phase_version <> v_quote\.phase_version/);
  assert.match(migration, /v_quote\.expires_at <= v_now/);
  assert.match(migration, /v_quote\.idempotency_key <> pg_catalog\.btrim/);
  assert.match(migration, /Contradictory duplicate active-leave confirmation/);
  assert.match(migration, /grant execute on function public\.get_movie_buff_active_leave_quote\(uuid\)/);
  assert.match(migration, /grant execute on function public\.confirm_movie_buff_active_leave\(uuid, text\)/);
});

test("penalties use one immutable ledger row and one score mutation", () => {
  assert.match(migration, /movie_buff_leave_penalty_ledger/);
  assert.match(migration, /unique \(match_id, player_id, reason\)/);
  assert.match(migration, /unique \(player_id, idempotency_key\)/);
  assert.match(migration, /score_after = score_before - penalty_points/);
  assert.match(migration, /on conflict \(match_id, player_id, reason\) do nothing/);
  assert.match(migration, /Contradictory duplicate Movie Buff abandonment penalty/);
  assert.match(migration, /left_at = coalesce\(left_at, v_now\)/);
  assert.match(migration, /participant_abandoned/);
});

test("browser routes preserve authenticated replay after membership is left", () => {
  assert.match(authorization, /requireMovieBuffPhaseCaller/);
  assert.match(quoteRoute, /requireMovieBuffPhaseMember/);
  assert.match(confirmRoute, /requireMovieBuffPhaseCaller/);
  assert.doesNotMatch(confirmRoute, /requireMovieBuffPhaseMember/);
  assert.match(confirmRoute, /confirm_movie_buff_active_leave/);
  assert.match(confirmRoute, /p_quote_token/);
  assert.match(confirmRoute, /p_idempotency_key/);
});

test("leave UI displays only the server-returned policy and penalty", () => {
  assert.match(navigation, /getMovieBuffActiveLeaveQuote/);
  assert.match(navigation, /confirmMovieBuffActiveLeave/);
  assert.match(navigation, /leaveQuote\.penaltyPoints/);
  assert.match(navigation, /leaveQuote\.policyVersion/);
  assert.match(navigation, /Stay in match/);
  assert.match(navigation, /Confirm leave/);
  assert.doesNotMatch(navigation, /250/);
});

test("rollback retains audit data and fails closed", () => {
  assert.match(rollback, /Data-preserving containment rollback/);
  assert.match(rollback, /Movie Buff active-leave containment is active/);
  assert.match(rollback, /select 0/);
  assert.doesNotMatch(rollback, /drop table|truncate|delete from/i);
  assert.doesNotMatch(
    rollback,
    /grant execute[\s\S]*to authenticated/i,
  );
});
