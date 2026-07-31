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
  v_legacy_clip_id uuid;
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
    c.id
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
    v_legacy_clip_id
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
    streak_bonus,
    submitted_at
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    greatest(
      0,
      case
        when v_playback_started_at is null then
          0
        else
          v_elapsed_seconds * 1000
      end
    ),
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
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
    'answer_submitted',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_legacy_clip_id,
    jsonb_build_object(
      'answerLength', length(trim(p_submitted_answer)),
      'answerTimeSeconds', v_elapsed_seconds,
      'answeredBeforePlayback', v_playback_started_at is null,
      'usedHint', v_hint_used_at is not null
    )
  );

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
    case
      when v_is_correct then 'answer_correct'
      else 'answer_wrong'
    end,
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_legacy_clip_id,
    jsonb_build_object(
      'answerTimeSeconds', v_elapsed_seconds,
      'answeredBeforePlayback', v_playback_started_at is null,
      'usedHint', v_hint_used_at is not null
    )
  );

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

revoke all on function public.submit_movie_buff_answer(uuid, text) from public;
grant execute on function public.submit_movie_buff_answer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
