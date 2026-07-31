with new_movies (
  title,
  normalized_title,
  release_year,
  description,
  director,
  difficulty
) as (
  values
    (
      'Inception',
      'inception',
      2010,
      'A skilled thief enters people''s dreams to steal secrets and is offered a chance to erase his criminal history by planting an idea.',
      'Christopher Nolan',
      'medium'
    ),
    (
      'The Lion King',
      'the lion king',
      1994,
      'A young lion prince must overcome loss and reclaim his homeland from his treacherous uncle.',
      'Roger Allers and Rob Minkoff',
      'easy'
    ),
    (
      'Titanic',
      'titanic',
      1997,
      'Two passengers from different social classes fall in love aboard a luxury ocean liner during its disastrous first voyage.',
      'James Cameron',
      'easy'
    ),
    (
      'Forrest Gump',
      'forrest gump',
      1994,
      'A kindhearted man with a simple outlook unexpectedly witnesses and influences several major moments in American history.',
      'Robert Zemeckis',
      'medium'
    ),
    (
      'Ghostbusters',
      'ghostbusters',
      1984,
      'A team of scientists starts a business capturing supernatural beings after ghosts begin appearing throughout New York City.',
      'Ivan Reitman',
      'easy'
    ),
    (
      'Jaws',
      'jaws',
      1975,
      'A police chief, marine scientist, and shark hunter pursue a dangerous great white shark terrorizing a beach community.',
      'Steven Spielberg',
      'medium'
    ),
    (
      'Home Alone',
      'home alone',
      1990,
      'A young boy accidentally left behind during the holidays protects his house from two determined burglars.',
      'Chris Columbus',
      'easy'
    ),
    (
      'The Terminator',
      'the terminator',
      1984,
      'A cybernetic assassin travels from the future to eliminate the woman whose unborn son will lead humanity''s resistance.',
      'James Cameron',
      'medium'
    ),
    (
      'Rocky',
      'rocky',
      1976,
      'An unknown Philadelphia boxer receives an unexpected opportunity to fight the reigning heavyweight champion.',
      'John G. Avildsen',
      'easy'
    ),
    (
      'E.T. the Extra-Terrestrial',
      'et the extra terrestrial',
      1982,
      'A lonely child befriends a stranded alien and tries to help it return home while avoiding government agents.',
      'Steven Spielberg',
      'easy'
    ),
    (
      'Gladiator',
      'gladiator',
      2000,
      'A betrayed Roman general becomes an enslaved fighter and seeks revenge against the emperor who murdered his family.',
      'Ridley Scott',
      'medium'
    ),
    (
      'The Silence of the Lambs',
      'the silence of the lambs',
      1991,
      'A young FBI trainee seeks help from an imprisoned psychiatrist while hunting a dangerous serial killer.',
      'Jonathan Demme',
      'hard'
    )
),
inserted_movies as (
  insert into public.movies (
    id,
    title,
    normalized_title,
    release_year,
    description,
    director,
    difficulty,
    is_active
  )
  select
    gen_random_uuid(),
    nm.title,
    nm.normalized_title,
    nm.release_year,
    nm.description,
    nm.director,
    nm.difficulty,
    true
  from new_movies nm
  where not exists (
    select 1
    from public.movies existing_movie
    where existing_movie.normalized_title = nm.normalized_title
  )
  returning id
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
  m.description || ' Name the movie.',
  null,
  null,
  null,
  m.difficulty,
  'pending',
  'Buff Games Original Trivia',
  null,
  'Original trivia challenge created for Buff Games.',
  true
from public.movies m
where m.is_active = true
  and not exists (
    select 1
    from public.clips existing_clip
    where existing_clip.movie_id = m.id
      and existing_clip.is_active = true
  );

notify pgrst, 'reload schema';