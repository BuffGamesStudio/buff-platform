grant usage on schema public
to service_role;

grant select, insert, update, delete
on table
  public.movies,
  public.movie_categories,
  public.clips
to service_role;

drop function if exists public.pick_movie_buff_clip(uuid, uuid, text);

create function public.pick_movie_buff_clip(
  p_match_id uuid,
  p_category_id uuid,
  p_difficulty text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip_id uuid;
begin
  select c.id
  into v_clip_id
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      p_category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = p_category_id
      )
    )
    and not exists (
      select 1
      from public.match_rounds as used_round
      where used_round.match_id = p_match_id
        and used_round.clip_id = c.id
    )
    and (
      p_difficulty = 'mixed'
      or c.difficulty = p_difficulty
    )
  order by random()
  limit 1;

  if v_clip_id is not null then
    return v_clip_id;
  end if;

  select c.id
  into v_clip_id
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      p_category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = p_category_id
      )
    )
    and not exists (
      select 1
      from public.match_rounds as used_round
      where used_round.match_id = p_match_id
        and used_round.clip_id = c.id
    )
  order by random()
  limit 1;

  return v_clip_id;
end;
$$;

drop function if exists public.start_movie_buff_match(uuid);

create function public.start_movie_buff_match(
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

  if v_room.host_id <> auth.uid() then
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
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to anon;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;

create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
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
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null
    where id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.advance_movie_buff_round(uuid) from public;
grant execute on function public.advance_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
