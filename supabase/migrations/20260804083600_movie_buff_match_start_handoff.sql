-- MOV-17: authoritative admission-to-round-intro handoff.
--
-- Admission callers may request a start, but only this contract may create the
-- match roster, inert first-round shell, and canonical round_intro phase state.
-- Clip/tile selection, playback, VIP, answer, results, and later phase timing
-- remain owned by their existing authoritative phase transitions.

create or replace function public.begin_movie_buff_match_from_admission(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_room public.game_rooms%rowtype;
  v_match public.matches%rowtype;
  v_round public.match_rounds%rowtype;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_active_players integer := 0;
  v_ready_players integer := 0;
  v_active_matches integer := 0;
  v_round_count integer := 0;
  v_state_existed boolean := false;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  if v_room.status not in ('waiting', 'starting', 'active') then
    raise exception 'This room cannot enter the authoritative match timeline from its current state.';
  end if;

  if v_role <> 'service_role' then
    if v_actor is null then
      raise exception 'You must be signed in.';
    end if;

    if v_room.room_type = 'public' then
      if not exists (
        select 1
        from public.room_players as rp
        where rp.room_id = p_room_id
          and rp.player_id = v_actor
          and rp.left_at is null
      ) then
        raise exception 'Only active room members can start this public match.';
      end if;
    elsif v_room.host_id is distinct from v_actor then
      raise exception 'Only the host can start this match.';
    end if;
  end if;

  select
    (count(*) filter (where rp.left_at is null))::integer,
    (count(*) filter (
      where rp.left_at is null
        and rp.is_ready = true
    ))::integer
  into v_active_players, v_ready_players
  from public.room_players as rp
  where rp.room_id = p_room_id;

  if v_room.status <> 'active' then
    if v_room.room_type = 'public' then
      if v_room.max_players <> 3 then
        raise exception 'Public match capacity must be exactly 3 players.';
      end if;

      if v_active_players <> 3 then
        raise exception 'Public matches require exactly 3 active players before starting.';
      end if;

      if v_ready_players <> 3 then
        raise exception 'All 3 public players must be ready before starting.';
      end if;
    else
      if v_active_players = 0 then
        raise exception 'The room has no active players.';
      end if;

      if v_ready_players <> v_active_players then
        raise exception 'Every player must be ready before starting.';
      end if;
    end if;
  end if;

  select count(*)::integer
  into v_active_matches
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active';

  if v_active_matches > 1 then
    raise exception 'Room has multiple active matches; authoritative start is blocked.';
  end if;

  select m.*
  into v_match
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc, m.id
  limit 1
  for update;

  if not found then
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
    returning * into v_match;
  else
    if v_match.total_rounds is distinct from v_room.total_rounds
       or v_match.category_id is distinct from v_room.category_id
       or v_match.difficulty is distinct from v_room.difficulty then
      raise exception 'Existing active match contradicts the room admission contract.';
    end if;
  end if;

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
    v_match.id,
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

  if exists (
    select 1
    from public.match_players as mp
    where mp.match_id = v_match.id
      and not exists (
        select 1
        from public.room_players as rp
        where rp.room_id = p_room_id
          and rp.player_id = mp.player_id
          and rp.left_at is null
      )
  ) then
    raise exception 'Existing match roster contradicts the active admission roster.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = v_match.id
  for update;
  v_state_existed := found;

  select count(*)::integer
  into v_round_count
  from public.match_rounds as mr
  where mr.match_id = v_match.id;

  select mr.*
  into v_round
  from public.match_rounds as mr
  where mr.match_id = v_match.id
  order by mr.round_number asc, mr.id
  limit 1
  for update;

  if not found then
    if v_state_existed then
      raise exception 'Authoritative phase state exists without a match round.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at,
      ended_at,
      playback_started_at,
      hint_used_at,
      hint_penalty_seconds
    )
    values (
      v_match.id,
      null,
      1,
      30,
      null,
      null,
      null,
      null,
      0
    )
    returning * into v_round;
  elsif not v_state_existed then
    if v_round_count <> 1
       or v_round.round_number <> 1
       or v_round.clip_id is not null
       or v_round.started_at is not null
       or v_round.ended_at is not null
       or v_round.playback_started_at is not null
       or v_round.hint_used_at is not null
       or coalesce(v_round.hint_penalty_seconds, 0) <> 0 then
      raise exception 'Pre-phase round state is not an inert authoritative shell.';
    end if;
  end if;

  update public.game_rooms as gr
  set
    status = 'starting',
    current_round = v_round.round_number
  where gr.id = p_room_id
    and gr.status <> 'active';

  if not v_state_existed then
    v_state := public.ensure_movie_buff_match_phase_state(p_room_id);

    if v_state.match_id <> v_match.id
       or v_state.round_id <> v_round.id
       or v_state.phase <> 'round_intro'
       or v_state.phase_version <> 1
       or v_state.selected_tile_id is not null
       or v_state.selected_clip_id is not null
       or v_state.playback_starts_at is not null
       or v_state.answer_deadline_at is not null
       or v_state.results_end_at is not null then
      raise exception 'Authoritative round-intro bootstrap returned contradictory state.';
    end if;
  else
    if v_state.room_id <> p_room_id
       or v_state.round_id <> v_round.id then
      raise exception 'Existing authoritative phase state contradicts the active match.';
    end if;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = v_state.round_number,
    started_at = v_state.phase_started_at
  where gr.id = p_room_id;

  return query
  select v_match.id, v_round.id;
end;
$$;

create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language sql
security definer
set search_path = pg_catalog
as $$
  select *
  from public.begin_movie_buff_match_from_admission(p_room_id);
$$;

alter function public.begin_movie_buff_match_from_admission(uuid) owner to postgres;
alter function public.start_movie_buff_match(uuid) owner to postgres;

revoke all on function public.begin_movie_buff_match_from_admission(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.start_movie_buff_match(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.begin_movie_buff_match_from_admission(uuid)
  to service_role;
grant execute on function public.start_movie_buff_match(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
