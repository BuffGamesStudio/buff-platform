alter table if exists public.room_players
  add column if not exists last_seen_at timestamptz
  not null
  default timezone('utc', now());

update public.room_players
set last_seen_at = coalesce(
  last_seen_at,
  joined_at,
  timezone('utc', now())
)
where last_seen_at is null;

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

create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  update public.game_rooms as gr
  set status = 'cancelled'
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and not exists (
      select 1
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    );

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return v_compatible_room;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and exists (
      select 1
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    )
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    select *
    into v_candidate_room
    from public.cleanup_movie_buff_waiting_room(
      v_candidate_room.id
    );

    if v_candidate_room.status = 'waiting' then
      insert into public.room_players (
        room_id,
        player_id,
        is_ready,
        is_host,
        left_at,
        joined_at,
        last_seen_at
      )
      values (
        v_candidate_room.id,
        v_user_id,
        false,
        false,
        null,
        now(),
        timezone('utc', now())
      )
      on conflict (room_id, player_id)
      do update
        set is_ready = false,
            is_host = false,
            left_at = null,
            joined_at = now(),
            last_seen_at = timezone('utc', now());

      return v_candidate_room;
    end if;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host,
    last_seen_at
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true,
    timezone('utc', now())
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now(),
        last_seen_at = timezone('utc', now());

  return v_candidate_room;
end;
$$;

revoke all on function public.movie_buff_room_presence_timeout_seconds() from public;
revoke all on function public.cleanup_movie_buff_waiting_room(uuid, uuid) from public;
revoke all on function public.touch_movie_buff_room_presence(uuid) from public;

grant execute on function public.touch_movie_buff_room_presence(uuid)
to authenticated;

notify pgrst, 'reload schema';
