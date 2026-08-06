begin;

-- Fail-closed containment rollback: remove browser read policies while keeping
-- RLS enabled and service-role continuity intact. This never restores broad
-- anon/authenticated access.

drop policy if exists movie_buff_boards_select_active_member
  on public.movie_buff_boards;
drop policy if exists movie_buff_board_categories_select_active_member
  on public.movie_buff_board_categories;
drop policy if exists movie_buff_board_tiles_select_active_member
  on public.movie_buff_board_tiles;
drop policy if exists match_round_player_hints_select_self
  on public.match_round_player_hints;
drop policy if exists match_round_player_playback_select_self
  on public.match_round_player_playback;

revoke all on table public.match_round_player_hints from public, anon, authenticated;
revoke all on table public.match_round_player_playback from public, anon, authenticated;
revoke all on table public.movie_buff_boards from public, anon, authenticated;
revoke all on table public.movie_buff_board_categories from public, anon, authenticated;
revoke all on table public.movie_buff_board_tiles from public, anon, authenticated;
revoke all on table public.movie_buff_board_events from public, anon, authenticated;

grant all on table public.match_round_player_hints to service_role;
grant all on table public.match_round_player_playback to service_role;
grant all on table public.movie_buff_boards to service_role;
grant all on table public.movie_buff_board_categories to service_role;
grant all on table public.movie_buff_board_tiles to service_role;
grant all on table public.movie_buff_board_events to service_role;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_playback enable row level security;
alter table public.movie_buff_boards enable row level security;
alter table public.movie_buff_board_categories enable row level security;
alter table public.movie_buff_board_tiles enable row level security;
alter table public.movie_buff_board_events enable row level security;

commit;
