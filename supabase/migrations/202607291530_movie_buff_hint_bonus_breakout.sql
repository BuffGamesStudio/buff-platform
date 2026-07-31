drop function if exists public.submit_movie_buff_answer(
  uuid,
  text
);

create function public.submit_movie_buff_answer(
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
    mr.playback_started_at,
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
  from normalized;
end;
$$;

grant execute on function
  public.submit_movie_buff_answer(
    uuid,
    text
  )
to authenticated;

grant execute on function
  public.get_movie_buff_round_results(
    uuid,
    uuid
  )
to authenticated;

notify pgrst, 'reload schema';
