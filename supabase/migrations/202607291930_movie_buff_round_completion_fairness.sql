create or replace function public.movie_buff_preplay_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is null then
    if
      p_round_started_at is not null
      and floor(
        extract(
          epoch from (
            now() - p_round_started_at
          )
        )
      )::integer >=
        public.movie_buff_preplay_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  return greatest(
    0,
    v_effective_time_limit -
    greatest(
      0,
      floor(
        extract(
          epoch from (
            now() - v_playback_started_at
          )
        )
      )::integer
    )
  );
end;
$$;

create or replace function public.is_movie_buff_round_player_finished(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return
    public.get_movie_buff_round_player_time_left(
      p_round_id,
      p_player_id,
      p_round_started_at,
      p_time_limit_seconds
    ) <= 0;
end;
$$;

create or replace function public.get_movie_buff_round_completion(
  p_room_id uuid,
  p_round_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns table (
  result_players_total integer,
  result_players_finished integer,
  result_round_complete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::integer as result_players_total,
    coalesce(
      sum(
        case when progress.finished then 1 else 0 end
      ),
      0
    )::integer as result_players_finished,
    coalesce(
      bool_and(progress.finished),
      false
    ) as result_round_complete
  from (
    select
      public.is_movie_buff_round_player_finished(
        p_round_id,
        rp.player_id,
        p_round_started_at,
        p_time_limit_seconds
      ) as finished
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
  ) as progress;
$$;

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
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
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
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_time_left_seconds integer;
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
    c.media_url,
    player_playback.started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
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
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_time_left_seconds,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
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

create or replace function public.start_movie_buff_round_playback(
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
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit_seconds integer;
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
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  update public.match_rounds
  set started_at = coalesce(started_at, now())
  where id = v_round_id
  returning started_at into v_started_at;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now()
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
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
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit_seconds integer;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
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

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  select player_playback.started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
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
  result_hint_bonus integer,
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
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_time_left_seconds integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
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
    player_playback.started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
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
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
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

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit
    );

  if v_time_left_seconds <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

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
    greatest(
      v_speed_bonus - v_applied_hint_bonus,
      0
    ),
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

drop function if exists public.get_movie_buff_round_results(
  uuid,
  uuid
);

create function public.get_movie_buff_round_results(
  p_room_id uuid,
  p_round_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_round_complete boolean,
  result_players_finished integer,
  result_players_total integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception
      'You are not an active player in this room.';
  end if;

  select mr.match_id
  into v_match_id
  from public.match_rounds as mr
  join public.matches as m
    on m.id = mr.match_id
  where mr.id = p_round_id
    and m.room_id = p_room_id
  limit 1;

  if v_match_id is null then
    raise exception
      'The requested round does not belong to this room.';
  end if;

  return query
  with current_round as (
    select
      v_room.status as room_status,
      v_room.host_id = auth.uid() as is_host,
      mr.id as round_id,
      mr.round_number,
      v_room.total_rounds,
      mr.started_at,
      mo.title as movie_title,
      mo.release_year,
      mo.director,
      mr.time_limit_seconds,
      my_answer.submitted_answer,
      coalesce(
        my_answer.is_correct,
        false
      ) as is_correct,
      coalesce(
        my_answer.base_points,
        0
      ) as base_points,
      coalesce(
        my_answer.speed_bonus,
        0
      ) as raw_speed_bonus,
      coalesce(
        my_answer.streak_bonus,
        0
      ) as streak_bonus,
      coalesce(
        my_answer.total_points,
        0
      ) as total_points,
      coalesce(
        my_answer.response_time_ms,
        0
      ) as response_time_ms,
      my_hint.used_at as hint_used_at,
      coalesce(
        my_hint.penalty_seconds,
        0
      ) as hint_penalty_seconds
    from public.match_rounds as mr
    join public.clips as c
      on c.id = mr.clip_id
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.answers as my_answer
      on my_answer.round_id = mr.id
     and my_answer.player_id =
       auth.uid()
    left join public.match_round_player_hints as my_hint
      on my_hint.round_id = mr.id
     and my_hint.player_id = auth.uid()
    where mr.id = p_round_id
      and mr.match_id = v_match_id
  ),
  normalized as (
    select
      *,
      case
        when
          is_correct
          and hint_used_at is not null
          and response_time_ms = 0
        then
          greatest(
            raw_speed_bonus -
            greatest(
              0,
              least(
                300,
                greatest(
                  0,
                  time_limit_seconds -
                  hint_penalty_seconds
                ) * 10
              )
            ),
            0
          )
        else 0
      end as hint_bonus
    from current_round
  )
  select
    normalized.room_status,
    normalized.is_host,
    normalized.round_id,
    normalized.round_number,
    normalized.total_rounds,
    normalized.movie_title,
    normalized.release_year,
    normalized.director,
    normalized.submitted_answer,
    normalized.is_correct,
    normalized.base_points,
    greatest(
      normalized.raw_speed_bonus -
      normalized.hint_bonus,
      0
    ),
    normalized.hint_bonus,
    normalized.streak_bonus,
    normalized.total_points,
    progress.result_round_complete,
    progress.result_players_finished,
    progress.result_players_total,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'round_points',
            standing.round_points,
            'is_correct',
            standing.is_correct
          )
          order by
            standing.score desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(
                p.display_name,
                ''
              ),
              nullif(
                p.username,
                ''
              ),
              'Player ' ||
                left(
                  rp.player_id::text,
                  6
                )
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(
              a.total_points,
              0
            ) as round_points,
            coalesce(
              a.is_correct,
              false
            ) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = p_round_id
           and a.player_id =
             rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from normalized
  cross join lateral public.get_movie_buff_round_completion(
    p_room_id,
    p_round_id,
    normalized.started_at,
    normalized.time_limit_seconds
  ) as progress;
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
  v_current_round_id uuid;
  v_current_round_started_at timestamptz;
  v_current_round_time_limit integer;
  v_players_total integer;
  v_players_finished integer;
  v_round_complete boolean;
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

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_room.current_round
  limit 1
  for update;

  if v_current_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  select
    progress.result_players_total,
    progress.result_players_finished,
    progress.result_round_complete
  into
    v_players_total,
    v_players_finished,
    v_round_complete
  from public.get_movie_buff_round_completion(
    p_room_id,
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  ) as progress;

  if not coalesce(v_round_complete, false) then
    raise exception
      'This round is still in progress. % of % players have finished.',
      coalesce(v_players_finished, 0),
      coalesce(v_players_total, 0);
  end if;

  update public.match_rounds
  set ended_at = coalesce(ended_at, now())
  where id = v_current_round_id;

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
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    delete from public.match_round_player_playback
    where round_id = v_round_id;

    delete from public.match_round_player_hints
    where round_id = v_round_id;

    delete from public.answers
    where round_id = v_round_id;
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

revoke all on function public.movie_buff_preplay_timeout_seconds() from public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.is_movie_buff_round_player_finished(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round_completion(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_match(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;
revoke all on function public.get_movie_buff_round_results(uuid, uuid) from public;
revoke all on function public.advance_movie_buff_round(uuid) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_match(uuid)
to anon;

grant execute on function public.start_movie_buff_match(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

grant execute on function public.get_movie_buff_round_results(uuid, uuid)
to authenticated;

grant execute on function public.advance_movie_buff_round(uuid)
to authenticated;

notify pgrst, 'reload schema';
