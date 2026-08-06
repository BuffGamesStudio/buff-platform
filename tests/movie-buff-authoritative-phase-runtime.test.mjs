import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
  "utf8",
);
const hardening = fs.readFileSync(
  "supabase/migrations/20260804083100_movie_buff_server_phase_machine_hardening.sql",
  "utf8",
);
const alignment = fs.readFileSync(
  "supabase/migrations/20260804083400_movie_buff_phase_contract_alignment.sql",
  "utf8",
);
const viewRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/view/route.ts",
  "utf8",
);
const advanceRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/advance/route.ts",
  "utf8",
);
const selectRoute = fs.readFileSync(
  "src/app/api/movie-buff/match/select/route.ts",
  "utf8",
);
const authorization = fs.readFileSync(
  "src/lib/server/movieBuffPhaseRouteAuthorization.ts",
  "utf8",
);
const client = fs.readFileSync(
  "src/lib/game/movieBuffAuthoritativePhaseClient.ts",
  "utf8",
);
const matchStatusPage = fs.readFileSync(
  "src/app/games/movie-buff/match-status/page.tsx",
  "utf8",
);
const resultsPage = fs.readFileSync(
  "src/app/games/movie-buff/round-results/page.tsx",
  "utf8",
);

test("canonical phases and server timestamps are durable", () => {
  for (const phase of [
    "round_intro",
    "vip_lock",
    "board_select",
    "transition",
    "playback",
    "answer",
    "results",
    "finished",
    "abandoned",
    "blocked",
  ]) {
    assert.match(migration, new RegExp(`'${phase}'`));
  }
  for (const column of [
    "phase_version",
    "phase_ends_at",
    "selector_deadline_at",
    "playback_starts_at",
    "answer_deadline_at",
    "results_end_at",
  ]) {
    assert.match(migration, new RegExp(column));
  }
});

test("stable seats preserve human identity while system remains a non-seat actor", () => {
  assert.match(migration, /movie_buff_match_participant_seats/);
  assert.match(migration, /original_player_id/);
  assert.match(migration, /controller_type/);
  assert.match(alignment, /controller_type in \('human', 'buster'\)/);
  assert.doesNotMatch(client, /controllerType: "human" \| "buster" \| "system"/);
  assert.match(migration, /reconnect_deadline_at/);
  assert.match(migration, /reconnect_grace_expired/);
  assert.doesNotMatch(migration, /insert into public\.match_players[\s\S]*buster/i);
});

test("MOV-16 handshake uses exact identities and service-only finalization", () => {
  assert.match(
    migration,
    /open_movie_buff_vip_round_window\(uuid,uuid,uuid,timestamptz,uuid\[\]\)/,
  );
  assert.match(migration, /array_agg\(seat\.original_player_id/);
  assert.match(migration, /release_movie_buff_vip_required_player/);
  assert.match(migration, /set_movie_buff_vip_activation_phase/);
  assert.doesNotMatch(
    migration,
    /open_movie_buff_vip_round_window\(uuid,uuid,uuid,timestamptz\)'/,
  );
  assert.match(
    alignment,
    /finalize_movie_buff_vip_round_window\(uuid,uuid,timestamptz\)/,
  );
  assert.match(alignment, /movie_buff_phase_requires_vip_finalize/);
  assert.match(alignment, /advanceReady/);
  assert.match(alignment, /VIP finalize contract is unavailable/);
});

test("terminal phases have one canonical containment route", () => {
  assert.match(
    alignment,
    /when 'abandoned' then '\/games\/movie-buff\/match-status'/,
  );
  assert.match(
    alignment,
    /when 'blocked' then '\/games\/movie-buff\/match-status'/,
  );
  assert.match(matchStatusPage, /Authoritative match status/);
  assert.match(matchStatusPage, /cannot resume or advance gameplay/);
});

test("selector timeout is deterministic and never relaxes rights or repeats", () => {
  assert.match(migration, /order by category\.display_order, tile\.tile_order, tile\.id/);
  assert.match(migration, /licensed', 'public_domain', 'promotional', 'user_connected/);
  assert.match(migration, /clip\.clip_type in \('video', 'audio'\)/);
  assert.match(migration, /previous_round\.clip_id = clip\.id/);
  assert.match(migration, /previous_clip\.movie_id = clip\.movie_id/);
  assert.match(migration, /No eligible board tile remains without relaxing/);
});

test("human selection is versioned, selector-only, and idempotent", () => {
  assert.match(hardening, /positive expected phase version is required/i);
  assert.match(hardening, /current active human selector/i);
  assert.match(hardening, /Contradictory duplicate board selection request/i);
  assert.match(migration, /movie_buff_match_phase_actions/);
  assert.match(migration, /request_hash/);
});

test("playback and answer use shared server timestamps", () => {
  assert.match(migration, /playback_starts_at/);
  assert.match(migration, /insert into public\.match_round_player_playback/);
  assert.match(migration, /do update set started_at = excluded\.started_at/);
  assert.match(migration, /answer_deadline_at/);
  assert.match(hardening, /Movie Buff answer window is not open/i);
  assert.match(hardening, /movie_buff_answers_require_authoritative_phase/);
});

test("legacy manual round advance is removed from authenticated callers", () => {
  assert.match(
    hardening,
    /revoke all on function public\.advance_movie_buff_round\(uuid\)[\s\S]*authenticated/i,
  );
  assert.match(
    hardening,
    /grant execute on function public\.advance_movie_buff_round\(uuid\)[\s\S]*service_role/i,
  );
});

test("results route consumes authoritative room state without manual advance", () => {
  assert.match(resultsPage, /MovieBuffAuthoritativeResultsClient/);
  assert.match(resultsPage, /searchParams/);
  assert.match(resultsPage, /resolved\?\.roomId/);
  assert.match(resultsPage, /redirect\("\/games\/movie-buff\/lobby"\)/);
  assert.doesNotMatch(resultsPage, /roundId/);
  assert.doesNotMatch(resultsPage, /advanceMovieBuffRound|handleNextRound|Next Round/);
});

test("caller routes verify bearer membership and use caller-scoped RPCs", () => {
  assert.match(authorization, /supabaseAdmin\.auth\.getUser\(accessToken\)/);
  assert.match(authorization, /room_players/);
  assert.match(authorization, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(viewRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(advanceRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(selectRoute, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(viewRoute, /ensureMovieBuffBoard/);
  assert.match(viewRoute, /get_movie_buff_match_phase_view/);
  assert.match(advanceRoute, /advance_movie_buff_match_phase/);
  assert.match(selectRoute, /select_movie_buff_match_tile/);
});

test("browser client follows only server-reported canonical phases", () => {
  assert.match(client, /MovieBuffCanonicalPhase/);
  assert.match(client, /phaseRoute: string/);
  assert.match(client, /phaseVersion/);
  assert.match(client, /serverNow/);
  assert.match(client, /expectedVersion/);
  assert.doesNotMatch(client, /setTimeout\([\s\S]*router/i);
});

test("internal phase tables and helpers are not browser-readable", () => {
  for (const table of [
    "movie_buff_match_phase_state",
    "movie_buff_match_participant_seats",
    "movie_buff_match_phase_actions",
    "movie_buff_match_phase_events",
  ]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${table}`));
  }
  assert.match(migration, /set search_path = pg_catalog/g);
  assert.match(migration, /owner to postgres/g);
  assert.match(alignment, /revoke all on function public\.movie_buff_phase_route/);
  assert.match(alignment, /owner to postgres/);
});
