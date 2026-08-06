-- Exact six-table Movie Buff RLS reconciliation.
-- Browser policies use dedicated policy helpers outside the exposed public API schema.

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

create schema if not exists movie_buff_security;
alter schema movie_buff_security owner to postgres;
revoke all on schema movie_buff_security from public, anon, authenticated, service_role;
grant usage on schema movie_buff_security to authenticated, service_role;

create or replace function movie_buff_security.active_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  );
$function$;
alter function movie_buff_security.active_room_member(uuid) owner to postgres;
revoke all on function movie_buff_security.active_room_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function movie_buff_security.active_room_member(uuid)
  to authenticated, service_role;

create or replace function movie_buff_security.active_board_member(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.movie_buff_boards board
    join public.room_players rp on rp.room_id = board.room_id
    where board.id = p_board_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  );
$function$;
alter function movie_buff_security.active_board_member(uuid) owner to postgres;
revoke all on function movie_buff_security.active_board_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function movie_buff_security.active_board_member(uuid)
  to authenticated, service_role;

create or replace function movie_buff_security.active_round_member(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.match_rounds round_row
    join public.matches match_row on match_row.id = round_row.match_id
    join public.room_players rp on rp.room_id = match_row.room_id
    where round_row.id = p_round_id
      and rp.player_id = (select auth.uid())
      and rp.left_at is null
  );
$function$;
alter function movie_buff_security.active_round_member(uuid) owner to postgres;
revoke all on function movie_buff_security.active_round_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function movie_buff_security.active_round_member(uuid)
  to authenticated, service_role;

create policy movie_buff_boards_select_active_member
on public.movie_buff_boards for select to authenticated
using (
  movie_buff_security.active_room_member(room_id)
);

create policy movie_buff_board_categories_select_active_member
on public.movie_buff_board_categories for select to authenticated
using (
  movie_buff_security.active_board_member(board_id)
);

create policy movie_buff_board_tiles_select_active_member
on public.movie_buff_board_tiles for select to authenticated
using (
  movie_buff_security.active_board_member(board_id)
);

create policy match_round_player_hints_select_self
on public.match_round_player_hints for select to authenticated
using (
  player_id = (select auth.uid())
  and movie_buff_security.active_round_member(round_id)
);

create policy match_round_player_playback_select_self
on public.match_round_player_playback for select to authenticated
using (
  player_id = (select auth.uid())
  and movie_buff_security.active_round_member(round_id)
);

notify pgrst, 'reload schema';
commit;
