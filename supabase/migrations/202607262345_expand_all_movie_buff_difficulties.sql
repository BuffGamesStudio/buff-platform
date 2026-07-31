with difficulty_levels(difficulty) as (
  values
    ('easy'::text),
    ('medium'::text),
    ('hard'::text)
)
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
  is_active
)
select
  gen_random_uuid(),
  m.id,
  'trivia',
  null,
  case
    when nullif(trim(m.description), '') is not null then
      trim(m.description) || ' Name the movie.'
    else
      'Identify this movie from its story, characters, and setting.'
  end,
  null,
  null,
  null,
  dl.difficulty,
  'pending',
  'Buff Games Original Trivia',
  null,
  'Original trivia challenge created for Buff Games.',
  true
from public.movies m
cross join difficulty_levels dl
where m.is_active = true
  and not exists (
    select 1
    from public.clips existing_clip
    where existing_clip.movie_id = m.id
      and existing_clip.difficulty = dl.difficulty
      and existing_clip.is_active = true
  );

notify pgrst, 'reload schema';