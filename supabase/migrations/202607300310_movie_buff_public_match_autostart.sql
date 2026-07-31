create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
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
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.room_type = 'public' then
    if not exists (
      select 1
      from public.room_players as rp
      where rp.room_id = p_room_id
        and rp.player_id = auth.uid()
        and rp.left_at is null
    ) then
      raise exception 'Only active room members can start this public match.';
    end if;
  elsif v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_room.room_type = 'public' and v_player_count < 2 then
    raise exception 'Public matches need at least 2 ready players before they can start.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
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
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
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
  else
    update public.match_rounds
    set
      started_at = coalesce(started_at, now()),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    select mr.clip_id
    into v_clip_id
    from public.match_rounds as mr
    where mr.id = v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    legacy_clip_id,
    payload
  )
  values (
    'round_started',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_clip_id,
    jsonb_build_object(
      'trigger', case when v_room.room_type = 'public' then 'public_match_start' else 'start_match' end,
      'roundNumber', 1,
      'totalRounds', v_room.total_rounds,
      'roomType', v_room.room_type
    )
  );

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to anon;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;

notify pgrst, 'reload schema';
