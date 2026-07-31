with movie_source as (
  select
    ci.title,
    ci.normalized_title,
    ci.release_year,
    ci.poster_url,
    ci.difficulty,
    case
      when ci.publication_status = 'published'
        then true
      else false
    end as is_active,
    ci.created_at,
    ci.updated_at
  from public.content_items as ci
  join public.content_types as ct
    on ct.id = ci.content_type_id
   and ct.slug = 'movie'
  where ci.legacy_movie_id is null
)
insert into public.movies (
  title,
  normalized_title,
  release_year,
  poster_url,
  difficulty,
  is_active,
  created_at,
  updated_at
)
select
  ms.title,
  ms.normalized_title,
  ms.release_year,
  ms.poster_url,
  ms.difficulty,
  ms.is_active,
  ms.created_at,
  ms.updated_at
from movie_source as ms
on conflict (
  normalized_title,
  release_year
)
do update set
  title = excluded.title,
  poster_url = excluded.poster_url,
  difficulty = excluded.difficulty,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

update public.content_items as ci
set legacy_movie_id = m.id
from public.movies as m,
  public.content_types as ct
where ct.id = ci.content_type_id
  and ct.slug = 'movie'
  and ci.legacy_movie_id is null
  and m.normalized_title = ci.normalized_title
  and m.release_year is not distinct from ci.release_year;

update public.movies as m
set
  title = ci.title,
  normalized_title = ci.normalized_title,
  release_year = ci.release_year,
  poster_url = ci.poster_url,
  difficulty = ci.difficulty,
  is_active = (
    ci.publication_status = 'published'
  ),
  updated_at = ci.updated_at
from public.content_items as ci
join public.content_types as ct
  on ct.id = ci.content_type_id
 and ct.slug = 'movie'
where ci.legacy_movie_id = m.id;

delete from public.movie_categories as mc
where mc.movie_id in (
  select ci.legacy_movie_id
  from public.content_items as ci
  join public.content_types as ct
    on ct.id = ci.content_type_id
   and ct.slug = 'movie'
  where ci.legacy_movie_id is not null
);

insert into public.movie_categories (
  movie_id,
  category_id
)
select
  ci.legacy_movie_id,
  cc.category_id
from public.content_categories as cc
join public.content_items as ci
  on ci.id = cc.content_id
join public.content_types as ct
  on ct.id = ci.content_type_id
 and ct.slug = 'movie'
where ci.legacy_movie_id is not null
on conflict (
  movie_id,
  category_id
)
do nothing;

create temporary table movie_buff_missing_clip_source
on commit drop
as
select
  gen_random_uuid() as new_clip_id,
  cm.id as content_media_id,
  ci.legacy_movie_id as legacy_movie_id,
  case
    when cm.media_type in (
      'video',
      'audio',
      'image',
      'poster',
      'quote',
      'trivia',
      'year'
    )
      then cm.media_type
    else 'trivia'
  end as legacy_clip_type,
  cm.media_url,
  cm.prompt,
  cm.quote_text,
  cm.start_seconds,
  cm.end_seconds,
  cm.difficulty,
  cm.licensing_status,
  cm.source_name,
  cm.source_url,
  cm.attribution,
  (
    ci.publication_status = 'published'
    and cm.is_active = true
    and cm.is_hidden = false
  ) as is_active,
  cm.created_at
from public.content_media as cm
join public.content_items as ci
  on ci.id = cm.content_id
join public.content_types as ct
  on ct.id = ci.content_type_id
 and ct.slug = 'movie'
where cm.legacy_clip_id is null
  and ci.legacy_movie_id is not null;

insert into public.clips (
  id,
  movie_id,
  clip_type,
  media_url,
  prompt,
  quote_text,
  start_seconds,
  end_seconds,
  difficulty,
  licensing_status,
  source_name,
  source_url,
  attribution,
  is_active,
  created_at
)
select
  mcs.new_clip_id,
  mcs.legacy_movie_id,
  mcs.legacy_clip_type,
  mcs.media_url,
  mcs.prompt,
  mcs.quote_text,
  mcs.start_seconds,
  mcs.end_seconds,
  mcs.difficulty,
  mcs.licensing_status,
  mcs.source_name,
  mcs.source_url,
  mcs.attribution,
  mcs.is_active,
  mcs.created_at
from movie_buff_missing_clip_source as mcs;

update public.content_media as cm
set legacy_clip_id = mcs.new_clip_id
from movie_buff_missing_clip_source as mcs
where cm.id = mcs.content_media_id;

update public.clips as c
set
  movie_id = ci.legacy_movie_id,
  clip_type = case
    when cm.media_type in (
      'video',
      'audio',
      'image',
      'poster',
      'quote',
      'trivia',
      'year'
    )
      then cm.media_type
    else 'trivia'
  end,
  media_url = cm.media_url,
  prompt = cm.prompt,
  quote_text = cm.quote_text,
  start_seconds = cm.start_seconds,
  end_seconds = cm.end_seconds,
  difficulty = cm.difficulty,
  licensing_status = cm.licensing_status,
  source_name = cm.source_name,
  source_url = cm.source_url,
  attribution = cm.attribution,
  is_active = (
    ci.publication_status = 'published'
    and cm.is_active = true
    and cm.is_hidden = false
  )
from public.content_media as cm
join public.content_items as ci
  on ci.id = cm.content_id
join public.content_types as ct
  on ct.id = ci.content_type_id
 and ct.slug = 'movie'
where cm.legacy_clip_id = c.id
  and ci.legacy_movie_id is not null;

notify pgrst, 'reload schema';
