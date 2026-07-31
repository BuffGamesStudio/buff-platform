with target_media as (
  select
    cm.id as content_media_id,
    ci.id as content_id,
    ci.legacy_movie_id,
    cm.legacy_clip_id
  from public.content_media as cm
  join public.content_items as ci
    on ci.id = cm.content_id
  join public.content_types as ct
    on ct.id = ci.content_type_id
   and ct.slug = 'movie'
  where cm.media_type = 'video'
    and cm.media_url like '/media/movie-buff/public-domain/%'
    and nullif(btrim(coalesce(cm.media_url, '')), '') is not null
    and nullif(btrim(coalesce(cm.thumbnail_url, '')), '') is not null
    and cm.is_hidden = false
    and ci.is_active = true
    and ci.publication_status = 'review'
    and ci.legacy_movie_id is not null
    and cm.legacy_clip_id is not null
),
published_content as (
  update public.content_items as ci
  set
    publication_status = 'published',
    updated_at = now()
  where ci.id in (
    select distinct tm.content_id
    from target_media as tm
  )
  returning ci.id
),
activated_media as (
  update public.content_media as cm
  set
    is_active = true,
    updated_at = now()
  where cm.id in (
    select tm.content_media_id
    from target_media as tm
  )
  returning cm.id
),
activated_movies as (
  update public.movies as m
  set
    is_active = true,
    updated_at = now()
  where m.id in (
    select distinct tm.legacy_movie_id
    from target_media as tm
  )
  returning m.id
),
activated_clips as (
  update public.clips as c
  set
    is_active = true
  where c.id in (
    select tm.legacy_clip_id
    from target_media as tm
  )
  returning c.id
)
select
  (select count(*) from published_content) as published_content_items,
  (select count(*) from activated_media) as activated_content_media,
  (select count(*) from activated_movies) as activated_movies,
  (select count(*) from activated_clips) as activated_clips;

select public.movie_buff_refresh_clip_analytics(tm.content_media_id)
from (
  select cm.id as content_media_id
  from public.content_media as cm
  where cm.media_type = 'video'
    and cm.media_url like '/media/movie-buff/public-domain/%'
    and cm.is_active = true
    and cm.is_hidden = false
) as tm;

select public.movie_buff_refresh_movie_analytics(ci.id)
from public.content_items as ci
join public.content_types as ct
  on ct.id = ci.content_type_id
 and ct.slug = 'movie'
where ci.publication_status = 'published'
  and exists (
    select 1
    from public.content_media as cm
    where cm.content_id = ci.id
      and cm.media_type = 'video'
      and cm.media_url like '/media/movie-buff/public-domain/%'
      and cm.is_active = true
      and cm.is_hidden = false
  );
