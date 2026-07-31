create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns table (
  id uuid,
  room_code text,
  host_id uuid,
  room_type text,
  status text,
  category_id uuid,
  difficulty text,
  total_rounds integer,
  max_players integer,
  current_round integer,
  is_ranked boolean,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_new boolean
)
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
  v_matchmaking_key text :=
    concat_ws(
      '|',
      coalesce(p_category_id::text, 'all'),
      coalesce(p_difficulty, 'medium'),
      p_total_rounds::text,
      p_max_players::text
    );
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
    return query
    select
      v_compatible_room.id,
      v_compatible_room.room_code,
      v_compatible_room.host_id,
      v_compatible_room.room_type,
      v_compatible_room.status,
      v_compatible_room.category_id,
      v_compatible_room.difficulty,
      v_compatible_room.total_rounds,
      v_compatible_room.max_players,
      v_compatible_room.current_round,
      v_compatible_room.is_ranked,
      v_compatible_room.created_at,
      v_compatible_room.started_at,
      v_compatible_room.finished_at,
      false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_matchmaking_key));

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return query
    select
      v_candidate_room.id,
      v_candidate_room.room_code,
      v_candidate_room.host_id,
      v_candidate_room.room_type,
      v_candidate_room.status,
      v_candidate_room.category_id,
      v_candidate_room.difficulty,
      v_candidate_room.total_rounds,
      v_candidate_room.max_players,
      v_candidate_room.current_round,
      v_candidate_room.is_ranked,
      v_candidate_room.created_at,
      v_candidate_room.started_at,
      v_candidate_room.finished_at,
      false;
    return;
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
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    player_id,
    payload
  )
  values (
    'room_created',
    v_candidate_room.id,
    v_user_id,
    jsonb_build_object(
      'roomType', v_candidate_room.room_type,
      'difficulty', v_candidate_room.difficulty,
      'totalRounds', v_candidate_room.total_rounds,
      'maxPlayers', v_candidate_room.max_players,
      'mode', 'public_matchmaking'
    )
  );

  return query
  select
    v_candidate_room.id,
    v_candidate_room.room_code,
    v_candidate_room.host_id,
    v_candidate_room.room_type,
    v_candidate_room.status,
    v_candidate_room.category_id,
    v_candidate_room.difficulty,
    v_candidate_room.total_rounds,
    v_candidate_room.max_players,
    v_candidate_room.current_round,
    v_candidate_room.is_ranked,
    v_candidate_room.created_at,
    v_candidate_room.started_at,
    v_candidate_room.finished_at,
    true;
end;
$$;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
