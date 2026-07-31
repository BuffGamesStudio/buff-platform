alter table if exists public.match_round_player_playback
  add column if not exists playback_started_at timestamptz;

update public.match_round_player_playback
set playback_started_at = coalesce(
  playback_started_at,
  started_at
)
where playback_started_at is null;

create or replace function public.movie_buff_round_entry_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 60;
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
  v_preplay_started_at timestamptz;
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
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
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
    if v_preplay_started_at is not null then
      if
        floor(
          extract(
            epoch from (
              now() - v_preplay_started_at
            )
          )
        )::integer >=
          public.movie_buff_preplay_timeout_seconds()
      then
        return 0;
      end if;

      return v_effective_time_limit;
    end if;

    if
      p_round_started_at is not null
      and floor(
        extract(
          epoch from (
            now() - p_round_started_at
          )
        )
      )::integer >=
        public.movie_buff_round_entry_timeout_seconds()
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
  v_round_started_at timestamptz;
  v_preplay_started_at timestamptz;
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
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    )
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_round_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_hint_text
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
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null
  )
  on conflict (round_id, player_id) do nothing;

  select
    player_playback.started_at,
    player_playback.playback_started_at,
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_playback_started_at,
    v_hint_used,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = v_round_id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = v_round_id
   and player_hint.player_id = auth.uid();

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_preplay_started_at,
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
  v_round_started_at timestamptz;
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
    v_round_started_at,
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
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    playback_started_at = coalesce(
      public.match_round_player_playback.playback_started_at,
      excluded.playback_started_at
    );

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
  v_round_started_at timestamptz;
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
    v_round_started_at,
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
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  select player_playback.playback_started_at
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
  v_match_id uuid;
  v_answer_id uuid;
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
    player_playback.playback_started_at,
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
    normalized_answer,
    is_correct,
    points_awarded,
    answered_at
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_submitted_normalized,
    v_is_correct,
    v_total_points,
    now()
  )
  returning id into v_answer_id;

  update public.room_players
  set
    score = v_new_score,
    current_streak = v_new_streak,
    lives = v_new_lives
  where room_id = p_room_id
    and player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus - v_applied_hint_bonus,
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    coalesce(v_movie_title, v_normalized_title);
end;
$$;

revoke all on function public.movie_buff_round_entry_timeout_seconds() from public;

notify pgrst, 'reload schema';
