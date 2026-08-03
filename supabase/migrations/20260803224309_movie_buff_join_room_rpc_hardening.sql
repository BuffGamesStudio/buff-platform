begin;

do $preflight$
begin
  if to_regclass('public.game_rooms') is null then
    raise exception 'Required table public.game_rooms is missing.';
  end if;

  if to_regclass('public.room_players') is null then
    raise exception 'Required table public.room_players is missing.';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'Required function auth.uid() is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'authenticated'
  ) then
    raise exception 'Required role authenticated is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'anon'
  ) then
    raise exception 'Required role anon is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) then
    raise exception 'Required role service_role is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name = 'room_code'
  ) then
    raise exception 'Required column public.game_rooms.room_code is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name = 'room_type'
  ) then
    raise exception 'Required column public.game_rooms.room_type is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name = 'status'
  ) then
    raise exception 'Required column public.game_rooms.status is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name = 'max_players'
  ) then
    raise exception 'Required column public.game_rooms.max_players is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_players'
      and column_name = 'left_at'
  ) then
    raise exception 'Required column public.room_players.left_at is missing.';
  end if;
end;
$preflight$;

create or replace function public.join_movie_buff_room(
  p_room_code text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_room public.game_rooms%rowtype;
  v_existing_player public.room_players%rowtype;
  v_user_id uuid := auth.uid();
  v_active_players integer := 0;
  v_normalized_code text :=
    upper(btrim(coalesce(p_room_code, '')));
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required.';
  end if;

  if v_normalized_code = '' then
    raise exception using
      errcode = '22023',
      message = 'Room code is required.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.room_code = v_normalized_code
    and gr.room_type = 'private'
    and gr.status = 'waiting'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message =
        'Room not found or is no longer accepting players.';
  end if;

  select rp.*
  into v_existing_player
  from public.room_players as rp
  where rp.room_id = v_room.id
    and rp.player_id = v_user_id
  order by rp.joined_at desc nulls last
  limit 1;

  if found and v_existing_player.left_at is null then
    return v_room;
  end if;

  if exists (
    select 1
    from public.room_players as existing_membership
    join public.game_rooms as existing_room
      on existing_room.id = existing_membership.room_id
    where existing_membership.player_id = v_user_id
      and existing_membership.left_at is null
      and existing_membership.room_id <> v_room.id
      and existing_room.status in (
        'waiting',
        'starting',
        'active'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message =
        'You already have a Movie Buff room open.';
  end if;

  if v_room.max_players is null or v_room.max_players < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'This room has an invalid player limit.';
  end if;

  select count(*)::integer
  into v_active_players
  from public.room_players as rp
  where rp.room_id = v_room.id
    and rp.left_at is null;

  if v_active_players >= v_room.max_players then
    raise exception using
      errcode = 'P0001',
      message = 'This room is full.';
  end if;

  if v_existing_player.room_id is not null then
    update public.room_players
    set is_ready = false,
        is_host = false,
        left_at = null,
        joined_at = clock_timestamp()
    where room_id = v_room.id
      and player_id = v_user_id;
  else
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at
    )
    values (
      v_room.id,
      v_user_id,
      false,
      false,
      null
    );
  end if;

  return v_room;
end;
$function$;

alter function public.join_movie_buff_room(text)
  owner to postgres;

revoke all
on function public.join_movie_buff_room(text)
from public;

revoke all
on function public.join_movie_buff_room(text)
from anon;

revoke all
on function public.join_movie_buff_room(text)
from authenticated;

revoke all
on function public.join_movie_buff_room(text)
from service_role;

grant execute
on function public.join_movie_buff_room(text)
to authenticated;

grant execute
on function public.join_movie_buff_room(text)
to service_role;

comment on function public.join_movie_buff_room(text) is
  'Atomically joins the authenticated user to a waiting private Movie Buff room while preventing cross-room active membership.';

notify pgrst, 'reload schema';

commit;