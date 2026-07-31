create table if not exists public.match_round_player_hints (
  round_id uuid not null
    references public.match_rounds(id)
    on delete cascade,
  player_id uuid not null
    references auth.users(id)
    on delete cascade,
  used_at timestamptz not null default now(),
  penalty_seconds integer not null default 5,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (round_id, player_id),
  constraint match_round_player_hints_penalty_seconds_check
    check (penalty_seconds >= 0 and penalty_seconds <= 10)
);

create index if not exists match_round_player_hints_player_id_idx
  on public.match_round_player_hints (player_id);

create table if not exists public.match_round_player_playback (
  round_id uuid not null
    references public.match_rounds(id)
    on delete cascade,
  player_id uuid not null
    references auth.users(id)
    on delete cascade,
  started_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (round_id, player_id)
);

create index if not exists match_round_player_playback_player_id_idx
  on public.match_round_player_playback (player_id);

alter table if exists public.match_round_player_playback
  add column if not exists play_requested_at timestamptz;

alter table if exists public.match_round_player_playback
  add column if not exists playback_started_at timestamptz;

create or replace function public.movie_buff_preplay_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

create or replace function public.movie_buff_round_entry_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 60;
$$;

create or replace function public.movie_buff_playback_launch_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 45;
$$;

create or replace function public.leave_movie_buff_room(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_departing_player public.room_players%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
  v_active_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select m.id
  into v_active_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status not in ('finished', 'cancelled')
  order by m.started_at desc nulls last
  limit 1;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null
  returning *
  into v_departing_player;

  if not found then
    return v_room;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    player_id,
    payload
  )
  values (
    'player_left',
    p_room_id,
    v_active_match_id,
    auth.uid(),
    jsonb_build_object(
      'reason', 'leave_room',
      'roomStatus', v_room.status
    )
  );

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    if
      v_active_match_id is not null
      and v_room.status in ('starting', 'active')
    then
      insert into public.movie_buff_round_events (
        event_type,
        room_id,
        match_id,
        player_id,
        payload
      )
      values (
        'match_abandoned',
        p_room_id,
        v_active_match_id,
        auth.uid(),
        jsonb_build_object(
          'reason', 'all_players_left',
          'roomStatus', v_room.status
        )
      );
    end if;

    update public.game_rooms
    set status =
          case
            when status in ('finished', 'cancelled') then status
            else 'cancelled'
          end,
        finished_at =
          case
            when status = 'active' and finished_at is null
              then timezone('utc', now())
            else finished_at
          end
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if v_room.host_id = auth.uid()
     or coalesce(v_departing_player.is_host, false) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    if v_next_host_id is not null then
      update public.room_players
      set is_host = (
        player_id = v_next_host_id
        and left_at is null
      )
      where room_id = p_room_id;

      update public.game_rooms
      set host_id = v_next_host_id
      where id = p_room_id
      returning *
      into v_room;

      return v_room;
    end if;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
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
  v_has_playback_row boolean := false;
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
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
    player_playback.round_id is not null,
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_has_playback_row,
    v_preplay_started_at,
    v_play_requested_at,
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

  if v_playback_started_at is not null then
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

drop function if exists public.get_movie_buff_round(uuid);

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
    v_playback_started_at,
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

drop function if exists public.get_movie_buff_round_results(uuid, uuid);

create or replace function public.get_movie_buff_round_results(
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
      coalesce(my_answer.is_correct, false) as is_correct,
      coalesce(my_answer.base_points, 0) as base_points,
      coalesce(my_answer.speed_bonus, 0) as raw_speed_bonus,
      coalesce(my_answer.streak_bonus, 0) as streak_bonus,
      coalesce(my_answer.total_points, 0) as total_points,
      coalesce(my_answer.response_time_ms, 0) as response_time_ms,
      my_hint.used_at as hint_used_at,
      coalesce(my_hint.penalty_seconds, 0) as hint_penalty_seconds
    from public.match_rounds as mr
    join public.clips as c
      on c.id = mr.clip_id
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.answers as my_answer
      on my_answer.round_id = mr.id
     and my_answer.player_id = auth.uid()
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
            'player_id', standing.player_id,
            'display_name', standing.display_name,
            'score', standing.score,
            'round_points', standing.round_points,
            'is_correct', standing.is_correct
          )
          order by standing.score desc, standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(a.total_points, 0) as round_points,
            coalesce(a.is_correct, false) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = p_round_id
           and a.player_id = rp.player_id
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

drop function if exists public.enter_movie_buff_round(uuid);

create or replace function public.enter_movie_buff_round(
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

  select mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
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
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    null,
    null,
    null
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

drop function if exists public.mark_movie_buff_round_media_ready(uuid);

create or replace function public.mark_movie_buff_round_media_ready(
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
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
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (round_id, player_id) do update
  set started_at = coalesce(
    public.match_round_player_playback.started_at,
    excluded.started_at
  );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

drop function if exists public.prepare_movie_buff_round_playback(uuid);

create or replace function public.prepare_movie_buff_round_playback(
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
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now(),
    null
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
    );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

drop function if exists public.start_movie_buff_round_playback(uuid);

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
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now(),
    now()
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

drop function if exists public.use_movie_buff_round_hint(uuid, integer);

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
  from public.get_movie_buff_round(p_room_id);
end;
$$;

drop function if exists public.submit_movie_buff_answer(uuid, text);

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

revoke all on function public.movie_buff_preplay_timeout_seconds() from public;
revoke all on function public.movie_buff_round_entry_timeout_seconds() from public;
revoke all on function public.movie_buff_playback_launch_timeout_seconds() from public;
revoke all on function public.leave_movie_buff_room(uuid) from public;
drop function if exists public.find_or_create_movie_buff_public_room(uuid, text, integer, integer);
revoke all on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.is_movie_buff_round_player_finished(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round_completion(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.get_movie_buff_round_results(uuid, uuid) from public;
revoke all on function public.enter_movie_buff_round(uuid) from public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid) from public;
revoke all on function public.prepare_movie_buff_round_playback(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

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

grant execute on function public.get_movie_buff_round(uuid) to authenticated;
grant execute on function public.leave_movie_buff_room(uuid) to authenticated;
grant execute on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer) to authenticated;
grant execute on function public.get_movie_buff_round_results(uuid, uuid) to authenticated;
grant execute on function public.enter_movie_buff_round(uuid) to authenticated;
grant execute on function public.mark_movie_buff_round_media_ready(uuid) to authenticated;
grant execute on function public.prepare_movie_buff_round_playback(uuid) to authenticated;
grant execute on function public.start_movie_buff_round_playback(uuid) to authenticated;
grant execute on function public.use_movie_buff_round_hint(uuid, integer) to authenticated;
grant execute on function public.submit_movie_buff_answer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
