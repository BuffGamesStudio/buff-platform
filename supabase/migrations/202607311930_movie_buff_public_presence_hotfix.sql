alter table if exists public.room_players
  add column if not exists last_seen_at timestamptz;

alter table if exists public.room_players
  alter column last_seen_at
  set default timezone('utc', now());

update public.room_players
set last_seen_at = coalesce(
  last_seen_at,
  joined_at,
  timezone('utc', now())
)
where last_seen_at is null;

alter table if exists public.room_players
  alter column last_seen_at
  set not null;

create index if not exists room_players_room_last_seen_idx
  on public.room_players (room_id, last_seen_at);

create or replace function public.movie_buff_room_presence_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

create or replace function public.cleanup_movie_buff_waiting_room(
  p_room_id uuid,
  p_excluded_player_id uuid default null
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.room_type <> 'public'
     or v_room.status <> 'waiting' then
    return v_room;
  end if;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and left_at is null
    and (
      p_excluded_player_id is null
      or player_id <> p_excluded_player_id
    )
    and last_seen_at <
      timezone('utc', now()) -
      make_interval(
        secs => public.movie_buff_room_presence_timeout_seconds()
      );

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    update public.game_rooms
    set status = 'cancelled'
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
      and rp.is_host = true
  ) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    update public.room_players
    set is_host = (
      player_id = v_next_host_id
      and left_at is null
    )
    where room_id = p_room_id;

    update public.game_rooms
    set host_id = v_next_host_id
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
$$;

create or replace function public.touch_movie_buff_room_presence(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set last_seen_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select *
  into v_room
  from public.cleanup_movie_buff_waiting_room(
    p_room_id,
    auth.uid()
  );

  return v_room;
end;
$$;

revoke all on function public.movie_buff_room_presence_timeout_seconds() from public;
revoke all on function public.cleanup_movie_buff_waiting_room(uuid, uuid) from public;
revoke all on function public.touch_movie_buff_room_presence(uuid) from public;

grant execute on function public.touch_movie_buff_room_presence(uuid)
to authenticated;

notify pgrst, 'reload schema';
