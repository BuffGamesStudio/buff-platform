begin;

with playable_categories(slug) as (
  values
    ('action'),
    ('comedy'),
    ('classics'),
    ('horror'),
    ('science-fiction'),
    ('drama')
),
playable_movies as (
  select distinct m.id as movie_id
  from public.movies m
  join public.clips cl on cl.movie_id = m.id
  where m.is_active is true
    and cl.is_active is true
    and cl.clip_type = 'video'
    and nullif(trim(cl.media_url), '') is not null
)
insert into public.movie_categories (movie_id, category_id)
select pm.movie_id, c.id
from playable_movies pm
join public.categories c
  on c.slug in (select slug from playable_categories)
on conflict (movie_id, category_id) do nothing;

commit;
