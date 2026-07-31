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
    count(
      distinct case
        when event_type in (
          'clip_started',
          'answer_submitted',
          'timeout',
          'clip_failed_to_load'
        ) then
          concat_ws(
            ':',
            coalesce(round_id::text, id::text),
            coalesce(player_id::text, 'anonymous')
          )
        else null
      end
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
        'answer_submitted',
        'answer_correct',
        'answer_wrong',
        'timeout',
        'clip_failed_to_load'
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

do $$
declare
  v_media_id uuid;
begin
  for v_media_id in
    select id
    from public.content_media
  loop
    perform public.movie_buff_refresh_clip_analytics(
      v_media_id
    );
  end loop;
end;
$$;
