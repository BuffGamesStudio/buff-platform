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
  v_has_playback_row boolean := false;
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
  v_player_playback_started_at timestamptz;
  v_shared_playback_started_at timestamptz;
  v_authoritative_playback_started_at timestamptz;
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
    coalesce(player_playback.round_id is not null, false),
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    mr.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_has_playback_row,
    v_preplay_started_at,
    v_play_requested_at,
    v_player_playback_started_at,
    v_shared_playback_started_at,
    v_hint_penalty_seconds
  from public.match_rounds as mr
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = p_player_id
  where mr.id = p_round_id;

  if not found then
    return greatest(0, coalesce(p_time_limit_seconds, 0));
  end if;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_authoritative_playback_started_at := coalesce(
    v_shared_playback_started_at,
    v_player_playback_started_at
  );

  if v_authoritative_playback_started_at is not null then
    return greatest(
      0,
      v_effective_time_limit -
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_authoritative_playback_started_at
            )
          )
        )::integer
      )
    );
  end if;

  if v_play_requested_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_play_requested_at
          )
        )
      )::integer >=
        public.movie_buff_playback_launch_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

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

  if v_has_playback_row then
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
  v_player_playback_started_at timestamptz;
  v_shared_playback_started_at timestamptz;
  v_effective_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_time_left_seconds integer;
  v_release_year integer;
  v_director text;
  v_effective_difficulty text;
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
    mr.playback_started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mo.release_year,
    mo.director,
    lower(coalesce(nullif(trim(c.difficulty), ''), nullif(trim(mo.difficulty), ''), 'medium'))
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_round_started_at,
    v_shared_playback_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_release_year,
    v_director,
    v_effective_difficulty
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

  select
    player_playback.started_at,
    player_playback.playback_started_at,
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_player_playback_started_at,
    v_hint_used,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = v_round_id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = v_round_id
   and player_hint.player_id = auth.uid();

  v_effective_playback_started_at := coalesce(
    v_shared_playback_started_at,
    v_player_playback_started_at
  );

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    );

  v_hint_text := trim(
    concat_ws(
      ' ',
      case
        when v_release_year is not null then
          format('Released in %s.', v_release_year)
        else null
      end,
      case
        when nullif(trim(coalesce(v_director, '')), '') is not null then
          format('Directed by %s.', trim(v_director))
        else null
      end,
      case
        when v_effective_difficulty = 'easy' then
          'This is from the Fan lane.'
        when v_effective_difficulty in ('hard', 'expert') then
          'This is from the Buffster lane.'
        else
          'This is from the Buff lane.'
      end
    )
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
    v_effective_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        nullif(v_hint_text, '')
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
  v_shared_playback_started_at timestamptz;
  v_now timestamptz := now();
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
    mr.time_limit_seconds,
    mr.playback_started_at
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds,
    v_shared_playback_started_at
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

  if v_shared_playback_started_at is null then
    update public.match_rounds as mr
    set playback_started_at = v_now
    where mr.id = v_round_id
      and mr.playback_started_at is null
    returning mr.playback_started_at
    into v_shared_playback_started_at;

    if v_shared_playback_started_at is null then
      select mr.playback_started_at
      into v_shared_playback_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    v_now,
    v_now,
    v_now
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    play_requested_at = coalesce(
      public.match_round_player_playback.play_requested_at,
      excluded.play_requested_at
    ),
    playback_started_at = coalesce(
      public.match_round_player_playback.playback_started_at,
      excluded.playback_started_at
    );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
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
  v_player_playback_started_at timestamptz;
  v_shared_playback_started_at timestamptz;
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
    mr.time_limit_seconds,
    mr.playback_started_at
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds,
    v_shared_playback_started_at
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
  into v_player_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if coalesce(
    v_shared_playback_started_at,
    v_player_playback_started_at
  ) is not null then
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
  from public.get_movie_buff_round(p_room_id);
end;
$$;

grant execute on function public.get_movie_buff_round(uuid) to authenticated;
grant execute on function public.start_movie_buff_round_playback(uuid) to authenticated;
grant execute on function public.use_movie_buff_round_hint(uuid, integer) to authenticated;
grant execute on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
