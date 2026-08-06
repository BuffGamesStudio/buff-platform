-- Exact six-table Movie Buff RLS reconciliation.
-- Derived from PR #47, strengthened with FORCE RLS and exact policy cleanup.

begin;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_hints force row level security;
alter table public.match_round_player_playback enable row level security;
alter table public.match_round_player_playback force row level security;
alter table public.movie_buff_boards enable row level security;
alter table public.movie_buff_boards force row level security;
alter table public.movie_buff_board_categories enable row level security;
alter table public.movie_buff_board_categories force row level security;
alter table public.movie_buff_board_tiles enable row level security;
alter table public.movie_buff_board_tiles force row level security;
alter table public.movie_buff_board_events enable row level security;
alter table public.movie_buff_board_events force row level security;

do $drop_policies$
declare v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'match_round_player_hints',
        'match_round_player_playback',
        'movie_buff_boards',
        'movie_buff_board_categories',
        'movie_buff_board_tiles',
        'movie_buff_board_events'
      )
  loop
    execute pg_catalog.format(
      'drop policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename
    );
  end loop;
end;
$drop_policies$;

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

grant select on table public.match_round_player_hints to authenticated;
grant select on table public.match_round_player_playback to authenticated;
grant select on table public.movie_buff_boards to authenticated;
grant select on table public.movie_buff_board_categories to authenticated;
grant select on table public.movie_buff_board_tiles to authenticated;
-- movie_buff_board_events intentionally remains service-only.

create policy movie_buff_boards_select_active_member
on public.movie_buff_boards for select to authenticated
using (
  exists (
    select 1 from public.room_players rp
    where rp.room_id = movie_buff_boards.room_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy movie_buff_board_categories_select_active_member
on public.movie_buff_board_categories for select to authenticated
using (
  exists (
    select 1
    from public.movie_buff_boards board
    join public.room_players rp on rp.room_id = board.room_id
    where board.id = movie_buff_board_categories.board_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy movie_buff_board_tiles_select_active_member
on public.movie_buff_board_tiles for select to authenticated
using (
  exists (
    select 1
    from public.movie_buff_boards board
    join public.room_players rp on rp.room_id = board.room_id
    where board.id = movie_buff_board_tiles.board_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy match_round_player_hints_select_self
on public.match_round_player_hints for select to authenticated
using (
  player_id = (select auth.uid())
  and exists (
    select 1
    from public.match_rounds round_row
    join public.matches match_row on match_row.id = round_row.match_id
    join public.room_players rp on rp.room_id = match_row.room_id
    where round_row.id = match_round_player_hints.round_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy match_round_player_playback_select_self
on public.match_round_player_playback for select to authenticated
using (
  player_id = (select auth.uid())
  and exists (
    select 1
    from public.match_rounds round_row
    join public.matches match_row on match_row.id = round_row.match_id
    join public.room_players rp on rp.room_id = match_row.room_id
    where round_row.id = match_round_player_playback.round_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

notify pgrst, 'reload schema';
commit;
