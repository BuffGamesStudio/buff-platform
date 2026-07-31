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
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) = 'easy' then 'Rookie'
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

revoke all on function public.pick_movie_buff_clip(uuid, uuid, text) from public;
grant execute on function public.pick_movie_buff_clip(uuid, uuid, text)
to authenticated;
grant execute on function public.pick_movie_buff_clip(uuid, uuid, text)
to anon;

notify pgrst, 'reload schema';
