-- Local-only Movie Buff smoke fixtures.
--
-- The migrations create the canonical Movie Buff rows, but hosted content
-- imports are intentionally not part of a clean local database reset. Keep
-- this file data-only so local `supabase db reset` has enough published,
-- board-eligible media for the browser and analytics smoke suites.

begin;

with ranked_content as (
  select
    ci.id,
    row_number() over (order by ci.title, ci.id)::integer - 1 as content_index
  from public.content_items as ci
  join public.content_types as ct
    on ct.id = ci.content_type_id
   and ct.slug = 'movie'
),
category_slots (slot, slug) as (
  values
    (0, 'classics'),
    (1, 'comedy'),
    (2, 'drama'),
    (3, 'family'),
    (4, 'horror'),
    (5, 'science-fiction')
)
insert into public.content_categories (
  content_id,
  category_id,
  is_primary
)
select
  ranked.id,
  categories.id,
  true
from ranked_content as ranked
join category_slots
  on category_slots.slot = ranked.content_index / 2
join public.categories
  on categories.slug = category_slots.slug
on conflict (content_id, category_id)
do update set is_primary = excluded.is_primary;

update public.content_items as ci
set
  era_bucket = 'classic',
  primary_genre = case
    when ranked.content_index / 2 in (1, 3) then 'comedy'
    when ranked.content_index / 2 in (2, 4) then 'drama'
    else 'classics'
  end,
  publication_status = 'published',
  licensing_status = 'public_domain',
  is_active = true,
  updated_at = now()
from (
  select
    content_items.id,
    row_number() over (order by content_items.title, content_items.id)::integer - 1 as content_index
  from public.content_items
  join public.content_types
    on public.content_types.id = content_items.content_type_id
   and public.content_types.slug = 'movie'
) as ranked
where ci.id = ranked.id;

update public.clips as c
set
  clip_type = 'video',
  media_url = '/media/movie-buff/public-domain/west-of-hot-dog/west-of-hot-dog-montage-30s.mp4',
  licensing_status = 'public_domain',
  is_active = true;

with ranked_content as (
  select
    ci.id,
    row_number() over (order by ci.title, ci.id)::integer - 1 as content_index
  from public.content_items as ci
  join public.content_types as ct
    on ct.id = ci.content_type_id
   and ct.slug = 'movie'
),
ranked_media as (
  select
    cm.id,
    ranked_content.content_index,
    row_number() over (
      partition by cm.content_id
      order by cm.id
    )::integer - 1 as media_index
  from public.content_media as cm
  join ranked_content
    on ranked_content.id = cm.content_id
)
update public.content_media as cm
set
  media_type = 'video',
  media_url = '/media/movie-buff/public-domain/west-of-hot-dog/west-of-hot-dog-montage-30s.mp4',
  thumbnail_url = '/media/movie-buff/public-domain/west-of-hot-dog/west-of-hot-dog-thumb.jpg',
  start_seconds = 0,
  end_seconds = 30,
  duration_seconds = 30,
  licensing_status = 'public_domain',
  source_name = 'Local Movie Buff smoke fixture',
  source_url = 'https://example.invalid/movie-buff-local-smoke-fixture',
  attribution = 'Local-only fixture backed by a checked-in public-domain clip.',
  quality_score = 90,
  recognizability_score = 90,
  board_band = (
    array[
      'fan_200',
      'fan_400',
      'fanatic_600',
      'fanatic_800',
      'buff_1000',
      'buff_1200'
    ]
  )[(((ranked_media.media_index * 2) + (ranked_media.content_index % 2)) % 6) + 1],
  is_buff_tile_eligible = true,
  is_hidden = false,
  is_active = true,
  updated_at = now()
from ranked_media
where cm.id = ranked_media.id;

commit;
