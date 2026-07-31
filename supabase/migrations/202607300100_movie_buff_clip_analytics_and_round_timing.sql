alter table if exists public.match_round_player_playback
  alter column started_at drop not null;

alter table if exists public.match_round_player_playback
  add column if not exists play_requested_at timestamptz;

create table if not exists public.movie_buff_round_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (
      event_type in (
        'room_created',
        'player_joined',
        'player_ready',
        'round_started',
        'media_ready',
        'clip_loaded',
        'clip_start_requested',
        'clip_started',
        'hint_requested',
        'answer_submitted',
        'answer_correct',
        'answer_wrong',
        'timeout',
        'player_left',
        'match_completed',
        'match_abandoned',
        'clip_failed_to_load'
      )
    ),
  room_id uuid
    references public.game_rooms(id)
    on delete set null,
  match_id uuid
    references public.matches(id)
    on delete set null,
  round_id uuid
    references public.match_rounds(id)
    on delete set null,
  player_id uuid
    references auth.users(id)
    on delete set null,
  content_id uuid
    references public.content_items(id)
    on delete set null,
  content_media_id uuid
    references public.content_media(id)
    on delete set null,
  legacy_clip_id uuid
    references public.clips(id)
    on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists movie_buff_round_events_event_type_idx
  on public.movie_buff_round_events(event_type);

create index if not exists movie_buff_round_events_room_idx
  on public.movie_buff_round_events(room_id, occurred_at desc);

create index if not exists movie_buff_round_events_match_idx
  on public.movie_buff_round_events(match_id, occurred_at desc);

create index if not exists movie_buff_round_events_round_idx
  on public.movie_buff_round_events(round_id, occurred_at desc);

create index if not exists movie_buff_round_events_player_idx
  on public.movie_buff_round_events(player_id, occurred_at desc);

create index if not exists movie_buff_round_events_clip_idx
  on public.movie_buff_round_events(content_media_id, occurred_at desc);

create index if not exists movie_buff_round_events_movie_idx
  on public.movie_buff_round_events(content_id, occurred_at desc);

create table if not exists public.movie_buff_clip_analytics (
  content_media_id uuid primary key
    references public.content_media(id)
    on delete cascade,
  content_id uuid not null
    references public.content_items(id)
    on delete cascade,
  legacy_clip_id uuid unique
    references public.clips(id)
    on delete set null,
  total_plays integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  total_hints_used integer not null default 0,
  total_timeouts integer not null default 0,
  total_load_success integer not null default 0,
  total_load_failures integer not null default 0,
  avg_answer_time_seconds numeric(10,2) not null default 0,
  last_played_at timestamptz,
  last_loaded_at timestamptz,
  sample_size integer not null default 0,
  difficulty_score numeric(6,2) not null default 50,
  system_difficulty_label text not null default 'Buff'
    check (
      system_difficulty_label in (
        'Rookie',
        'Buff',
        'Buffster'
      )
    ),
  quality_score numeric(6,2) not null default 100,
  rotation_score numeric(6,2) not null default 50,
  rotation_weight numeric(10,2) not null default 50,
  admin_boost smallint not null default 0
    check (
      admin_boost between -3 and 3
    ),
  status text not null default 'active'
    check (
      status in (
        'active',
        'featured',
        'cooling_down',
        'retired',
        'test_only'
      )
    ),
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists movie_buff_clip_analytics_content_idx
  on public.movie_buff_clip_analytics(content_id);

create index if not exists movie_buff_clip_analytics_status_idx
  on public.movie_buff_clip_analytics(status);

create index if not exists movie_buff_clip_analytics_rotation_idx
  on public.movie_buff_clip_analytics(rotation_weight desc);

create table if not exists public.movie_buff_movie_analytics (
  content_id uuid primary key
    references public.content_items(id)
    on delete cascade,
  total_clip_count integer not null default 0,
  playable_clip_count integer not null default 0,
  total_plays integer not null default 0,
  total_hints_used integer not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.movie_buff_playback_launch_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 20;
$$;

create or replace function public.movie_buff_clip_confidence_factor(
  p_total_plays integer
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select least(
    1::numeric,
    greatest(
      0::numeric,
      coalesce(p_total_plays, 0)::numeric / 8::numeric
    )
  );
$$;

create or replace function public.movie_buff_clip_difficulty_score(
  p_total_plays integer,
  p_total_correct integer,
  p_total_hints integer,
  p_avg_answer_time_seconds numeric,
  p_time_limit_seconds integer default 30
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_safe_plays numeric := greatest(
    1::numeric,
    coalesce(p_total_plays, 0)::numeric
  );
  v_correct_rate numeric;
  v_hint_rate numeric;
  v_solve_ratio numeric;
  v_confidence numeric;
  v_raw numeric;
begin
  v_correct_rate := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_total_correct, 0)::numeric / v_safe_plays
    )
  );

  v_hint_rate := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_total_hints, 0)::numeric / v_safe_plays
    )
  );

  v_solve_ratio := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_avg_answer_time_seconds, 0)::numeric /
        greatest(
          1::numeric,
          coalesce(p_time_limit_seconds, 30)::numeric
        )
    )
  );

  v_confidence := public.movie_buff_clip_confidence_factor(
    p_total_plays
  );

  v_raw := (
    ((1::numeric - v_correct_rate) * 0.62::numeric) +
    (v_hint_rate * 0.20::numeric) +
    (v_solve_ratio * 0.18::numeric)
  ) * 100::numeric;

  return round(
    (
      50::numeric +
      ((v_raw - 50::numeric) * v_confidence)
    )::numeric,
    2
  );
end;
$$;

create or replace function public.movie_buff_clip_difficulty_label(
  p_difficulty_score numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_difficulty_score, 50) < 35 then 'Rookie'
    when coalesce(p_difficulty_score, 50) < 60 then 'Buff'
    else 'Buffster'
  end;
$$;

create or replace function public.movie_buff_clip_quality_score(
  p_quality_flags jsonb,
  p_total_load_success integer,
  p_total_load_failures integer,
  p_total_timeouts integer,
  p_total_plays integer
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_score numeric := 100;
  v_flag text;
  v_total_load_attempts numeric := greatest(
    1::numeric,
    coalesce(p_total_load_success, 0)::numeric +
      coalesce(p_total_load_failures, 0)::numeric
  );
  v_safe_plays numeric := greatest(
    1::numeric,
    coalesce(p_total_plays, 0)::numeric
  );
begin
  for v_flag in
    select jsonb_array_elements_text(
      coalesce(p_quality_flags, '[]'::jsonb)
    )
  loop
    v_score := v_score - case v_flag
      when 'title_card' then 22
      when 'credits' then 18
      when 'giveaway_text' then 20
      when 'bad_audio' then 14
      when 'dead_air' then 10
      when 'obvious_character' then 12
      when 'broken_playback' then 60
      else 0
    end;
  end loop;

  v_score := v_score -
    (
      (
        coalesce(p_total_load_failures, 0)::numeric /
        v_total_load_attempts
      ) * 45::numeric
    ) -
    (
      (
        coalesce(p_total_timeouts, 0)::numeric /
        v_safe_plays
      ) * 20::numeric
    );

  return round(
    greatest(0::numeric, v_score),
    2
  );
end;
$$;

create or replace function public.movie_buff_clip_rotation_score(
  p_quality_score numeric,
  p_total_plays integer,
  p_last_played_at timestamptz,
  p_admin_boost smallint,
  p_status text
)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status, 'active'));
  v_hours_since_last_play numeric;
  v_freshness_factor numeric;
  v_sample_factor numeric;
  v_admin_factor numeric;
  v_feature_bonus numeric := 0;
  v_score numeric;
begin
  if v_status in ('retired', 'test_only', 'cooling_down') then
    return 0;
  end if;

  if coalesce(p_quality_score, 0) < 45 then
    return 0;
  end if;

  if p_last_played_at is null then
    v_hours_since_last_play := 168;
  else
    v_hours_since_last_play := greatest(
      0::numeric,
      extract(
        epoch from (
          now() - p_last_played_at
        )
      ) / 3600::numeric
    );
  end if;

  v_freshness_factor := least(
    1.4::numeric,
    0.65::numeric +
      least(v_hours_since_last_play, 168::numeric) /
      224::numeric
  );

  v_sample_factor := least(
    1::numeric,
    greatest(
      0.35::numeric,
      coalesce(p_total_plays, 0)::numeric /
        10::numeric
    )
  );

  if v_status = 'featured' then
    v_feature_bonus := 0.15::numeric;
  end if;

  v_admin_factor := greatest(
    0.2::numeric,
    1::numeric +
      (coalesce(p_admin_boost, 0)::numeric * 0.12::numeric) +
      v_feature_bonus
  );

  v_score := coalesce(p_quality_score, 0) *
    v_freshness_factor *
    v_sample_factor *
    v_admin_factor / 1.4::numeric;

  return round(
    least(100::numeric, greatest(0::numeric, v_score)),
    2
  );
end;
$$;

create or replace function public.movie_buff_requested_difficulty_label(
  p_difficulty text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_difficulty, 'mixed'))
    when 'easy' then 'Rookie'
    when 'medium' then 'Buff'
    when 'hard' then 'Buffster'
    when 'expert' then 'Buffster'
    else null
  end;
$$;

create or replace function public.movie_buff_refresh_movie_analytics(
  p_content_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_clip_count integer := 0;
  v_playable_clip_count integer := 0;
  v_total_plays integer := 0;
  v_total_hints_used integer := 0;
  v_last_played_at timestamptz;
begin
  if p_content_id is null then
    return;
  end if;

  select
    count(*),
    count(*) filter (
      where cm.media_type in ('video', 'audio')
        and cm.is_active = true
        and cm.is_hidden = false
        and cm.legacy_clip_id is not null
        and coalesce(ca.status, 'active') not in ('retired', 'test_only', 'cooling_down')
        and coalesce(ca.quality_score, 100) >= 45
        and coalesce(ca.rotation_weight, 50) > 0
    ),
    coalesce(sum(coalesce(ca.total_plays, 0)), 0),
    coalesce(sum(coalesce(ca.total_hints_used, 0)), 0),
    max(ca.last_played_at)
  into
    v_total_clip_count,
    v_playable_clip_count,
    v_total_plays,
    v_total_hints_used,
    v_last_played_at
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.content_id = p_content_id;

  insert into public.movie_buff_movie_analytics (
    content_id,
    total_clip_count,
    playable_clip_count,
    total_plays,
    total_hints_used,
    last_played_at,
    updated_at
  )
  values (
    p_content_id,
    coalesce(v_total_clip_count, 0),
    coalesce(v_playable_clip_count, 0),
    coalesce(v_total_plays, 0),
    coalesce(v_total_hints_used, 0),
    v_last_played_at,
    timezone('utc', now())
  )
  on conflict (content_id) do update
  set
    total_clip_count = excluded.total_clip_count,
    playable_clip_count = excluded.playable_clip_count,
    total_plays = excluded.total_plays,
    total_hints_used = excluded.total_hints_used,
    last_played_at = excluded.last_played_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.movie_buff_refresh_clip_analytics(
  p_content_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_id uuid;
  v_legacy_clip_id uuid;
  v_quality_flags jsonb := '[]'::jsonb;
  v_status text := 'active';
  v_admin_boost smallint := 0;
  v_total_plays integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_total_hints integer := 0;
  v_total_timeouts integer := 0;
  v_total_load_success integer := 0;
  v_total_load_failures integer := 0;
  v_avg_answer_time_seconds numeric := 0;
  v_last_played_at timestamptz;
  v_last_loaded_at timestamptz;
  v_difficulty_score numeric := 50;
  v_quality_score numeric := 100;
  v_rotation_score numeric := 50;
begin
  if p_content_media_id is null then
    return;
  end if;

  select
    cm.content_id,
    cm.legacy_clip_id,
    coalesce(ca.quality_flags, '[]'::jsonb),
    coalesce(ca.status, 'active'),
    coalesce(ca.admin_boost, 0)
  into
    v_content_id,
    v_legacy_clip_id,
    v_quality_flags,
    v_status,
    v_admin_boost
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.id = p_content_media_id;

  if v_content_id is null then
    return;
  end if;

  select
    count(*) filter (
      where event_type = 'clip_started'
    ),
    count(*) filter (
      where event_type = 'answer_correct'
    ),
    count(*) filter (
      where event_type = 'answer_wrong'
    ),
    count(*) filter (
      where event_type = 'hint_requested'
    ),
    count(*) filter (
      where event_type = 'timeout'
    ),
    count(*) filter (
      where event_type = 'clip_loaded'
    ),
    count(*) filter (
      where event_type = 'clip_failed_to_load'
    ),
    coalesce(
      avg(
        nullif(
          payload ->> 'answer_time_seconds',
          ''
        )::numeric
      ) filter (
        where event_type = 'answer_submitted'
          and payload ? 'answer_time_seconds'
      ),
      0
    ),
    max(occurred_at) filter (
      where event_type in (
        'clip_started',
        'answer_correct',
        'answer_wrong',
        'timeout'
      )
    ),
    max(occurred_at) filter (
      where event_type = 'clip_loaded'
    )
  into
    v_total_plays,
    v_total_correct,
    v_total_wrong,
    v_total_hints,
    v_total_timeouts,
    v_total_load_success,
    v_total_load_failures,
    v_avg_answer_time_seconds,
    v_last_played_at,
    v_last_loaded_at
  from public.movie_buff_round_events
  where content_media_id = p_content_media_id;

  v_difficulty_score :=
    public.movie_buff_clip_difficulty_score(
      v_total_plays,
      v_total_correct,
      v_total_hints,
      v_avg_answer_time_seconds,
      30
    );

  v_quality_score :=
    public.movie_buff_clip_quality_score(
      v_quality_flags,
      v_total_load_success,
      v_total_load_failures,
      v_total_timeouts,
      v_total_plays
    );

  v_rotation_score :=
    public.movie_buff_clip_rotation_score(
      v_quality_score,
      v_total_plays,
      v_last_played_at,
      v_admin_boost,
      v_status
    );

  insert into public.movie_buff_clip_analytics (
    content_media_id,
    content_id,
    legacy_clip_id,
    total_plays,
    total_correct,
    total_wrong,
    total_hints_used,
    total_timeouts,
    total_load_success,
    total_load_failures,
    avg_answer_time_seconds,
    last_played_at,
    last_loaded_at,
    sample_size,
    difficulty_score,
    system_difficulty_label,
    quality_score,
    rotation_score,
    rotation_weight,
    admin_boost,
    status,
    quality_flags,
    updated_at
  )
  values (
    p_content_media_id,
    v_content_id,
    v_legacy_clip_id,
    coalesce(v_total_plays, 0),
    coalesce(v_total_correct, 0),
    coalesce(v_total_wrong, 0),
    coalesce(v_total_hints, 0),
    coalesce(v_total_timeouts, 0),
    coalesce(v_total_load_success, 0),
    coalesce(v_total_load_failures, 0),
    round(coalesce(v_avg_answer_time_seconds, 0), 2),
    v_last_played_at,
    v_last_loaded_at,
    coalesce(v_total_plays, 0),
    v_difficulty_score,
    public.movie_buff_clip_difficulty_label(
      v_difficulty_score
    ),
    v_quality_score,
    v_rotation_score,
    v_rotation_score,
    v_admin_boost,
    v_status,
    v_quality_flags,
    timezone('utc', now())
  )
  on conflict (content_media_id) do update
  set
    content_id = excluded.content_id,
    legacy_clip_id = excluded.legacy_clip_id,
    total_plays = excluded.total_plays,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong,
    total_hints_used = excluded.total_hints_used,
    total_timeouts = excluded.total_timeouts,
    total_load_success = excluded.total_load_success,
    total_load_failures = excluded.total_load_failures,
    avg_answer_time_seconds = excluded.avg_answer_time_seconds,
    last_played_at = excluded.last_played_at,
    last_loaded_at = excluded.last_loaded_at,
    sample_size = excluded.sample_size,
    difficulty_score = excluded.difficulty_score,
    system_difficulty_label = excluded.system_difficulty_label,
    quality_score = excluded.quality_score,
    rotation_score = excluded.rotation_score,
    rotation_weight = excluded.rotation_weight,
    updated_at = excluded.updated_at;

  perform public.movie_buff_refresh_movie_analytics(
    v_content_id
  );
end;
$$;

create or replace function public.record_movie_buff_event(
  p_event_type text,
  p_room_id uuid default null,
  p_match_id uuid default null,
  p_round_id uuid default null,
  p_player_id uuid default null,
  p_content_id uuid default null,
  p_content_media_id uuid default null,
  p_legacy_clip_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_player_id uuid := coalesce(
    p_player_id,
    auth.uid()
  );
  v_room_id uuid := p_room_id;
  v_match_id uuid := p_match_id;
  v_round_id uuid := p_round_id;
  v_content_id uuid := p_content_id;
  v_content_media_id uuid := p_content_media_id;
  v_legacy_clip_id uuid := p_legacy_clip_id;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if lower(coalesce(p_event_type, '')) not in (
    'room_created',
    'player_joined',
    'player_ready',
    'round_started',
    'media_ready',
    'clip_loaded',
    'clip_start_requested',
    'clip_started',
    'hint_requested',
    'answer_submitted',
    'answer_correct',
    'answer_wrong',
    'timeout',
    'player_left',
    'match_completed',
    'match_abandoned',
    'clip_failed_to_load'
  ) then
    raise exception 'Unsupported Movie Buff event type.';
  end if;

  if v_player_id is distinct from auth.uid() then
    raise exception 'You can only record your own Movie Buff events.';
  end if;

  if v_round_id is not null then
    select
      coalesce(v_match_id, mr.match_id),
      coalesce(v_room_id, m.room_id),
      coalesce(v_legacy_clip_id, mr.clip_id)
    into
      v_match_id,
      v_room_id,
      v_legacy_clip_id
    from public.match_rounds as mr
    join public.matches as m
      on m.id = mr.match_id
    where mr.id = v_round_id
    limit 1;
  end if;

  if v_legacy_clip_id is not null and v_content_media_id is null then
    select
      cm.id,
      cm.content_id
    into
      v_content_media_id,
      v_content_id
    from public.content_media as cm
    where cm.legacy_clip_id = v_legacy_clip_id
    limit 1;
  end if;

  if v_content_media_id is not null then
    select
      coalesce(v_content_id, cm.content_id),
      coalesce(v_legacy_clip_id, cm.legacy_clip_id)
    into
      v_content_id,
      v_legacy_clip_id
    from public.content_media as cm
    where cm.id = v_content_media_id
    limit 1;
  end if;

  if v_match_id is not null and v_room_id is null then
    select
      room_id
    into v_room_id
    from public.matches
    where id = v_match_id
    limit 1;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    content_id,
    content_media_id,
    legacy_clip_id,
    payload
  )
  values (
    lower(p_event_type),
    v_room_id,
    v_match_id,
    v_round_id,
    v_player_id,
    v_content_id,
    v_content_media_id,
    v_legacy_clip_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  if v_content_media_id is not null then
    perform public.movie_buff_refresh_clip_analytics(
      v_content_media_id
    );
  elsif v_content_id is not null then
    perform public.movie_buff_refresh_movie_analytics(
      v_content_id
    );
  end if;

  return v_event_id;
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
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
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

  select
    mr.id
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

  select
    mr.id
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

drop function if exists public.pick_movie_buff_clip(uuid, uuid, text);

create function public.pick_movie_buff_clip(
  p_match_id uuid,
  p_category_id uuid,
  p_difficulty text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip_id uuid;
  v_requested_label text :=
    public.movie_buff_requested_difficulty_label(
      p_difficulty
    );
begin
  with candidate_clips as (
    select
      c.id,
      c.movie_id,
      coalesce(ca.rotation_weight, 50::numeric) as base_weight,
      coalesce(
        ca.system_difficulty_label,
        case
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) = 'easy' then 'Rookie'
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) in ('hard', 'expert') then 'Buffster'
          else 'Buff'
        end
      ) as effective_label
    from public.clips as c
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.content_media as cm
      on cm.legacy_clip_id = c.id
    left join public.movie_buff_clip_analytics as ca
      on ca.content_media_id = cm.id
    where c.is_active = true
      and mo.is_active = true
      and c.clip_type = 'video'
      and nullif(btrim(coalesce(c.media_url, '')), '') is not null
      and coalesce(cm.is_active, true) = true
      and coalesce(cm.is_hidden, false) = false
      and (
        p_category_id is null
        or exists (
          select 1
          from public.movie_categories as mc
          where mc.movie_id = mo.id
            and mc.category_id = p_category_id
        )
      )
      and not exists (
        select 1
        from public.match_rounds as used_round
        where used_round.match_id = p_match_id
          and used_round.clip_id = c.id
      )
      and not exists (
        select 1
        from public.match_rounds as used_round
        join public.clips as used_clip
          on used_clip.id = used_round.clip_id
        where used_round.match_id = p_match_id
          and used_clip.movie_id = c.movie_id
      )
      and coalesce(ca.status, 'active') not in ('retired', 'test_only', 'cooling_down')
      and coalesce(ca.quality_score, 100) >= 45
      and coalesce(ca.rotation_weight, 50) > 0
  ),
  weighted_candidates as (
    select
      id,
      greatest(
        0.01::numeric,
        base_weight *
        case
          when v_requested_label is null then 1::numeric
          when effective_label = v_requested_label then 1::numeric
          when effective_label = 'Buff' then 0.75::numeric
          when v_requested_label = 'Buff' then 0.75::numeric
          else 0.45::numeric
        end
      ) as effective_weight
    from candidate_clips
  )
  select wc.id
  into v_clip_id
  from weighted_candidates as wc
  order by
    (
      -ln(
        greatest(
          random(),
          0.000001
        )
      ) / wc.effective_weight
    ) asc
  limit 1;

  if v_clip_id is not null then
    return v_clip_id;
  end if;

  select c.id
  into v_clip_id
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      p_category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = p_category_id
      )
    )
    and not exists (
      select 1
      from public.match_rounds as used_round
      where used_round.match_id = p_match_id
        and used_round.clip_id = c.id
    )
  order by random()
  limit 1;

  return v_clip_id;
end;
$$;

revoke all on table public.movie_buff_round_events from public;
revoke all on table public.movie_buff_clip_analytics from public;
revoke all on table public.movie_buff_movie_analytics from public;

revoke all on function public.movie_buff_playback_launch_timeout_seconds() from public;
revoke all on function public.movie_buff_clip_confidence_factor(integer) from public;
revoke all on function public.movie_buff_clip_difficulty_score(integer, integer, integer, numeric, integer) from public;
revoke all on function public.movie_buff_clip_difficulty_label(numeric) from public;
revoke all on function public.movie_buff_clip_quality_score(jsonb, integer, integer, integer, integer) from public;
revoke all on function public.movie_buff_clip_rotation_score(numeric, integer, timestamptz, smallint, text) from public;
revoke all on function public.movie_buff_requested_difficulty_label(text) from public;
revoke all on function public.movie_buff_refresh_movie_analytics(uuid) from public;
revoke all on function public.movie_buff_refresh_clip_analytics(uuid) from public;
revoke all on function public.record_movie_buff_event(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid) from public;
revoke all on function public.prepare_movie_buff_round_playback(uuid) from public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.enter_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.pick_movie_buff_clip(uuid, uuid, text) from public;

grant execute on function public.record_movie_buff_event(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
to authenticated;

grant execute on function public.mark_movie_buff_round_media_ready(uuid)
to authenticated;

grant execute on function public.prepare_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.enter_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

