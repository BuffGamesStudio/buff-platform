create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 4
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
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

  select gr.*
  into v_existing_room
  from public.game_rooms as gr
  join public.room_players as rp
    on rp.room_id = gr.id
   and rp.player_id = v_user_id
   and rp.left_at is null
  where gr.room_type = 'public'
    and gr.status = 'waiting'
  order by gr.created_at asc
  limit 1;

  if found then
    return v_existing_room;
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
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

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

    return v_candidate_room;
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

  return v_candidate_room;
end;
$$;

revoke all on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer) from public;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;
