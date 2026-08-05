create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  match_id uuid,
  round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status = 'finished'
     or v_room.status = 'cancelled' then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = p_room_id
    and left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and left_at is null
    and is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select id
  into v_match_id
  from public.matches
  where room_id = p_room_id
    and status = 'active'
  order by started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict (match_id, player_id) do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    select c.id
    into v_clip_id
    from public.clips c
    join public.movies m
      on m.id = c.movie_id
    where c.is_active = true
      and m.is_active = true
      and (
        v_room.difficulty = 'mixed'
        or c.difficulty = v_room.difficulty
      )
    order by random()
    limit 1;

    if v_clip_id is null then
      select c.id
      into v_clip_id
      from public.clips c
      join public.movies m
        on m.id = c.movie_id
      where c.is_active = true
        and m.is_active = true
      order by random()
      limit 1;
    end if;

    if v_clip_id is null then
      raise exception 'No active movie clips are available.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  end if;

  update public.game_rooms
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(started_at, now())
  where id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;
