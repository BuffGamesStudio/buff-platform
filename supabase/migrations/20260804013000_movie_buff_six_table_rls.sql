begin;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_playback enable row level security;
alter table public.movie_buff_boards enable row level security;
alter table public.movie_buff_board_categories enable row level security;
alter table public.movie_buff_board_tiles enable row level security;
alter table public.movie_buff_board_events enable row level security;

revoke all on table public.match_round_player_hints from public, anon, authenticated;
revoke all on table public.match_round_player_playback from public, anon, authenticated;
revoke all on table public.movie_buff_boards from public, anon, authenticated;
revoke all on table public.movie_buff_board_categories from public, anon, authenticated;
revoke all on table public.movie_buff_board_tiles from public, anon, authenticated;
revoke all on table public.movie_buff_board_events from public, anon, authenticated;

grant select on table public.match_round_player_hints to authenticated;
grant select on table public.match_round_player_playback to authenticated;
grant select on table public.movie_buff_boards to authenticated;
grant select on table public.movie_buff_board_categories to authenticated;
grant select on table public.movie_buff_board_tiles to authenticated;

-- Board events remain server-only because payload is unfiltered JSON.

create policy movie_buff_boards_select_active_member
on public.movie_buff_boards
for select
to authenticated
using (
  exists (
    select 1
    from public.room_players rp
    where rp.room_id = movie_buff_boards.room_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy movie_buff_board_categories_select_active_member
on public.movie_buff_board_categories
for select
to authenticated
using (
  exists (
    select 1
    from public.movie_buff_boards b
    join public.room_players rp on rp.room_id = b.room_id
    where b.id = movie_buff_board_categories.board_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy movie_buff_board_tiles_select_active_member
on public.movie_buff_board_tiles
for select
to authenticated
using (
  exists (
    select 1
    from public.movie_buff_boards b
    join public.room_players rp on rp.room_id = b.room_id
    where b.id = movie_buff_board_tiles.board_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy match_round_player_hints_select_self
on public.match_round_player_hints
for select
to authenticated
using (
  player_id = (select auth.uid())
  and exists (
    select 1
    from public.match_rounds mr
    join public.matches m on m.id = mr.match_id
    join public.room_players rp on rp.room_id = m.room_id
    where mr.id = match_round_player_hints.round_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

create policy match_round_player_playback_select_self
on public.match_round_player_playback
for select
to authenticated
using (
  player_id = (select auth.uid())
  and exists (
    select 1
    from public.match_rounds mr
    join public.matches m on m.id = mr.match_id
    join public.room_players rp on rp.room_id = m.room_id
    where mr.id = match_round_player_playback.round_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  )
);

commit;
