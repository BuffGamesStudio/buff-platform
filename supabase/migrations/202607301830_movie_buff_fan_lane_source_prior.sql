alter table public.movie_buff_clip_analytics
  drop constraint if exists movie_buff_clip_analytics_system_difficulty_label_check;

alter table public.movie_buff_clip_analytics
  add constraint movie_buff_clip_analytics_system_difficulty_label_check
  check (
    system_difficulty_label in (
      'Fan',
      'Buff',
      'Buffster'
    )
  );

create or replace function public.movie_buff_clip_difficulty_label(
  p_difficulty_score numeric
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_difficulty_score, 50) < 35 then 'Fan'
    when coalesce(p_difficulty_score, 50) < 60 then 'Buff'
    else 'Buffster'
  end;
$$;

create or replace function public.movie_buff_requested_difficulty_label(
  p_difficulty text
)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_difficulty, 'mixed'))
    when 'easy' then 'Fan'
    when 'medium' then 'Buff'
    when 'hard' then 'Buffster'
    when 'expert' then 'Buffster'
    when 'fan' then 'Fan'
    when 'buffster' then 'Buffster'
    else 'Buff'
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
  v_source_difficulty text;
  v_total_plays integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_total_hints integer := 0;
  v_total_timeouts integer := 0;
  v_total_load_success integer := 0;
  v_total_load_failures integer := 0;
  v_avg_answer_time_seconds numeric := 0;
  v_quality_flags jsonb := '[]'::jsonb;
  v_status text := 'active';
  v_admin_boost integer := 0;
  v_last_played_at timestamptz;
  v_last_loaded_at timestamptz;
  v_difficulty_score numeric := 50;
  v_quality_score numeric := 100;
  v_rotation_score numeric := 50;
  v_system_difficulty_label text := 'Buff';
begin
  if p_content_media_id is null then
    return;
  end if;

  select
    cm.content_id,
    cm.legacy_clip_id,
    cm.difficulty,
    coalesce(ca.quality_flags, '[]'::jsonb),
    coalesce(ca.status, 'active'),
    coalesce(ca.admin_boost, 0)
  into
    v_content_id,
    v_legacy_clip_id,
    v_source_difficulty,
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

  if coalesce(v_total_plays, 0) < 5 then
    v_system_difficulty_label :=
      public.movie_buff_requested_difficulty_label(
        v_source_difficulty
      );

    v_difficulty_score := case v_system_difficulty_label
      when 'Fan' then 25
      when 'Buffster' then 75
      else 50
    end;
  else
    v_system_difficulty_label :=
      public.movie_buff_clip_difficulty_label(
        v_difficulty_score
      );
  end if;

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
      v_admin_boost::smallint,
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
    v_system_difficulty_label,
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
  with recent_movie_usage as (
    select
      used_clip.movie_id,
      count(*) filter (
        where used_round.started_at >=
          now() - interval '24 hours'
      ) as picks_24h,
      count(*) filter (
        where used_round.started_at >=
          now() - interval '2 hours'
      ) as picks_2h,
      max(used_round.started_at) as last_started_at
    from public.match_rounds as used_round
    join public.clips as used_clip
      on used_clip.id = used_round.clip_id
    where used_round.started_at is not null
      and used_round.started_at >=
        now() - interval '24 hours'
    group by used_clip.movie_id
  ),
  candidate_clips as (
    select
      c.id,
      c.movie_id,
      coalesce(ca.rotation_weight, 50::numeric) as base_weight,
      coalesce(
        ca.system_difficulty_label,
        case
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) = 'easy' then 'Fan'
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) in ('hard', 'expert') then 'Buffster'
          else 'Buff'
        end
      ) as effective_label,
      coalesce(rmu.picks_24h, 0) as recent_picks_24h,
      coalesce(rmu.picks_2h, 0) as recent_picks_2h,
      rmu.last_started_at
    from public.clips as c
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.content_media as cm
      on cm.legacy_clip_id = c.id
    left join public.movie_buff_clip_analytics as ca
      on ca.content_media_id = cm.id
    left join recent_movie_usage as rmu
      on rmu.movie_id = c.movie_id
    where c.is_active = true
      and mo.is_active = true
      and c.clip_type = 'video'
      and nullif(btrim(coalesce(c.media_url, '')), '') is not null
      and c.media_url not like '/api/movie-buff/generated/%'
      and c.media_url not like '/api/movie-buff/generated/pending%'
      and coalesce(cm.is_active, true) = true
      and coalesce(cm.is_hidden, false) = false
      and (
        cm.id is null
        or (
          nullif(btrim(coalesce(cm.media_url, '')), '') is not null
          and cm.media_url not like '/api/movie-buff/generated/%'
          and cm.media_url not like '/api/movie-buff/generated/pending%'
        )
      )
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
      and not exists (
        select 1
        from (
          select
            recent_clip.movie_id
          from public.match_rounds as recent_round
          join public.clips as recent_clip
            on recent_clip.id = recent_round.clip_id
          where recent_round.started_at is not null
          order by recent_round.started_at desc
          limit 3
        ) as globally_recent_movies
        where globally_recent_movies.movie_id = c.movie_id
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
        end *
        (
          1::numeric /
          (
            1::numeric +
            (recent_picks_24h * 0.18::numeric) +
            (recent_picks_2h * 0.45::numeric)
          )
        ) *
        case
          when last_started_at is null then 1::numeric
          when last_started_at >= now() - interval '30 minutes' then 0.18::numeric
          when last_started_at >= now() - interval '2 hours' then 0.45::numeric
          when last_started_at >= now() - interval '6 hours' then 0.72::numeric
          else 1::numeric
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
  left join public.content_media as cm
    on cm.legacy_clip_id = c.id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and c.media_url not like '/api/movie-buff/generated/%'
    and c.media_url not like '/api/movie-buff/generated/pending%'
    and coalesce(cm.is_active, true) = true
    and coalesce(cm.is_hidden, false) = false
    and (
      cm.id is null
      or (
        nullif(btrim(coalesce(cm.media_url, '')), '') is not null
        and cm.media_url not like '/api/movie-buff/generated/%'
        and cm.media_url not like '/api/movie-buff/generated/pending%'
      )
    )
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

revoke all on function public.pick_movie_buff_clip(uuid, uuid, text) from public;
grant execute on function public.pick_movie_buff_clip(uuid, uuid, text)
to authenticated;
grant execute on function public.pick_movie_buff_clip(uuid, uuid, text)
to anon;

do $$
declare
  v_media_id uuid;
begin
  for v_media_id in
    select id
    from public.content_media
    where media_type in ('video', 'audio')
  loop
    perform public.movie_buff_refresh_clip_analytics(v_media_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
