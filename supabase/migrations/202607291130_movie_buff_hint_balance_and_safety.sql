create or replace function public.sanitize_movie_buff_hint_text(
  p_hint_text text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_sanitized text;
begin
  v_sanitized := coalesce(p_hint_text, '');

  v_sanitized := regexp_replace(
    v_sanitized,
    'https?://\S+',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\b(internet archive|archive\.org|library of congress|loc\.gov|public[ -]?domain|registry|roundup|source|direct mp4 link|direct archive clip link|item marked|rights history note|pd mark)\b',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\bIA\b',
    '',
    'g'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\b(linked from|highlighted in|with clear\s+[^.]+?mark)\b',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\s+',
    ' ',
    'g'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\s+([,.;:])',
    '\1',
    'g'
  );

  v_sanitized := trim(
    both ' .,-:;'
    from v_sanitized
  );

  if v_sanitized = '' then
    return null;
  end if;

  if right(v_sanitized, 1) in ('.', '!', '?') then
    return v_sanitized;
  end if;

  return v_sanitized || '.';
end;
$$;

create or replace function public.build_movie_buff_hint_text(
  p_description text,
  p_prompt text,
  p_release_year integer,
  p_director text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_hint text;
  v_prompt_hint text;
begin
  v_hint := public.sanitize_movie_buff_hint_text(
    p_description
  );

  if v_hint is not null then
    return v_hint;
  end if;

  if
    nullif(trim(coalesce(p_prompt, '')), '') is not null
    and trim(p_prompt) !~* '^Name the movie from this 30-second montage'
  then
    v_prompt_hint := regexp_replace(
      trim(p_prompt),
      '\s+Name the movie\.?$',
      '',
      'i'
    );

    v_hint := public.sanitize_movie_buff_hint_text(
      v_prompt_hint
    );

    if v_hint is not null then
      return v_hint;
    end if;
  end if;

  if
    p_release_year is not null
    and nullif(trim(coalesce(p_director, '')), '') is not null
  then
    return format(
      'Released in %s. Directed by %s.',
      p_release_year,
      trim(p_director)
    );
  end if;

  if p_release_year is not null then
    return format(
      'Released in %s.',
      p_release_year
    );
  end if;

  if nullif(trim(coalesce(p_director, '')), '') is not null then
    return format(
      'Directed by %s.',
      trim(p_director)
    );
  end if;

  return null;
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
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
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
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director
    ),
    mr.hint_used_at is not null,
    coalesce(mr.hint_penalty_seconds, 0)
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
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

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
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
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
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
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
    mr.playback_started_at,
    mr.hint_used_at
  into
    v_round_id,
    v_playback_started_at,
    v_hint_used_at
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

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  if v_hint_used_at is not null then
    raise exception 'The hint has already been used for this round.';
  end if;

  update public.match_rounds
  set
    hint_used_at = now(),
    hint_penalty_seconds = v_penalty_seconds
  where id = v_round_id;

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
  v_hint_solve_bonus integer := 100;
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
    mr.playback_started_at,
    mr.hint_used_at,
    coalesce(mr.hint_penalty_seconds, 0),
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

  if v_elapsed_seconds > v_effective_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

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
      v_speed_bonus :=
        v_speed_bonus +
        v_hint_solve_bonus;
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
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on function public.sanitize_movie_buff_hint_text(text) from public;
revoke all on function public.build_movie_buff_hint_text(text, text, integer, text) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
