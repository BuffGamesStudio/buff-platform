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
  case
    when m.difficulty in ('easy', 'medium', 'hard', 'expert') then
      m.difficulty
    else
      'medium'
  end,
  'pending',
  'Buff Games Original Trivia',
  null,
  'Original trivia challenge created for Buff Games.',
  true
from public.movies as m
where m.is_active = true
  and not exists (
    select 1
    from public.clips as existing_clip
    where existing_clip.movie_id = m.id
      and existing_clip.is_active = true
  );

notify pgrst, 'reload schema';
