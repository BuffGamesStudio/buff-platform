create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if v_started_at is null then
    update public.match_rounds
    set started_at = now()
    where id = v_round_id
      and started_at is null
    returning started_at into v_started_at;

    if v_started_at is null then
      select mr.started_at
      into v_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_time_limit_seconds -
      floor(
        extract(
          epoch from (
            now() - coalesce(v_started_at, now())
          )
        )
      )::integer
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url;
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit integer;
  v_movie_title text;
  v_normalized_title text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_time_limit,
    v_movie_title,
    v_normalized_title
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  if v_started_at is null then
    update public.match_rounds
    set started_at = now()
    where id = v_round_id
      and started_at is null
    returning started_at into v_started_at;

    if v_started_at is null then
      select mr.started_at
      into v_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  v_elapsed_seconds := greatest(
    0,
    floor(
      extract(
        epoch from (
          now() - coalesce(v_started_at, now())
        )
      )
    )::integer
  );

  if v_elapsed_seconds > v_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_is_correct :=
    public.normalize_movie_answer(p_submitted_answer) =
    public.normalize_movie_answer(
      coalesce(v_normalized_title, v_movie_title)
    );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_time_limit - v_elapsed_seconds) * 10
      )
    );

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

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
      null
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
      null
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = null,
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

revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;
revoke all on function public.start_movie_buff_match(uuid) from public;
revoke all on function public.advance_movie_buff_round(uuid) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

grant execute on function public.start_movie_buff_match(uuid)
to anon;

grant execute on function public.start_movie_buff_match(uuid)
to authenticated;

grant execute on function public.advance_movie_buff_round(uuid)
to authenticated;

notify pgrst, 'reload schema';
