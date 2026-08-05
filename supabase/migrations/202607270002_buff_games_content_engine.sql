-- =========================================================
-- Buff Games Universal Content Engine
--
-- This migration is additive:
-- - Existing movies, clips, rooms, matches, and RPC functions remain intact.
-- - Existing Movie Buff gameplay continues using movies/clips.
-- - Existing movie data is copied into the universal content tables.
-- =========================================================

-- ---------------------------------------------------------
-- PROFILE ROLES
-- ---------------------------------------------------------

alter table public.profiles
add column if not exists platform_role text not null default 'player'
check (
  platform_role in (
    'player',
    'creator',
    'moderator',
    'admin'
  )
);

create or replace function public.is_buff_content_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and platform_role in (
        'creator',
        'moderator',
        'admin'
      )
  );
$$;

revoke all on function public.is_buff_content_manager()
from public;

grant execute on function public.is_buff_content_manager()
to authenticated;

-- ---------------------------------------------------------
-- CONTENT TYPES
-- ---------------------------------------------------------

create table if not exists public.content_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.content_types (
  name,
  slug,
  description,
  icon
)
values
  (
    'Movie',
    'movie',
    'Feature films and motion pictures used by Movie Buff.',
    'film'
  ),
  (
    'Television',
    'television',
    'Television series and episodes used by Couch Potato.',
    'tv'
  ),
  (
    'Music',
    'music',
    'Songs, artists, albums, and music videos.',
    'music'
  ),
  (
    'Anime',
    'anime',
    'Anime series, films, characters, and episodes.',
    'sparkles'
  ),
  (
    'Video Game',
    'video-game',
    'Video games, characters, levels, and franchises.',
    'gamepad'
  ),
  (
    'Sports',
    'sports',
    'Teams, athletes, matches, and historic sports moments.',
    'trophy'
  ),
  (
    'Book',
    'book',
    'Books, authors, characters, and literary works.',
    'book-open'
  ),
  (
    'History',
    'history',
    'Historical people, events, places, and periods.',
    'landmark'
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------
-- UNIVERSAL CONTENT
-- ---------------------------------------------------------

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),

  content_type_id uuid not null
    references public.content_types(id)
    on delete restrict,

  title text not null,
  normalized_title text not null,

  subtitle text,
  description text,

  release_date date,
  release_year integer
    check (release_year between 1000 and 2200),

  creator_name text,
  director text,
  artist_name text,
  author_name text,

  runtime_minutes integer
    check (runtime_minutes is null or runtime_minutes > 0),

  poster_url text,
  backdrop_url text,
  thumbnail_url text,

  difficulty text not null default 'medium'
    check (
      difficulty in (
        'easy',
        'medium',
        'hard',
        'expert'
      )
    ),

  publication_status text not null default 'draft'
    check (
      publication_status in (
        'draft',
        'review',
        'published',
        'archived'
      )
    ),

  licensing_status text not null default 'pending'
    check (
      licensing_status in (
        'pending',
        'licensed',
        'public_domain',
        'promotional',
        'original',
        'user_connected',
        'restricted'
      )
    ),

  source_name text,
  source_url text,
  attribution text,

  metadata jsonb not null default '{}'::jsonb,

  legacy_movie_id uuid unique
    references public.movies(id)
    on delete set null,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    content_type_id,
    normalized_title,
    release_year
  )
);

-- ---------------------------------------------------------
-- UNIVERSAL CATEGORY LINKS
-- ---------------------------------------------------------

create table if not exists public.content_categories (
  content_id uuid not null
    references public.content_items(id)
    on delete cascade,

  category_id uuid not null
    references public.categories(id)
    on delete cascade,

  is_primary boolean not null default false,

  created_at timestamptz not null default now(),

  primary key (
    content_id,
    category_id
  )
);

-- ---------------------------------------------------------
-- TAGS
-- ---------------------------------------------------------

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.content_tags (
  content_id uuid not null
    references public.content_items(id)
    on delete cascade,

  tag_id uuid not null
    references public.tags(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  primary key (
    content_id,
    tag_id
  )
);

-- ---------------------------------------------------------
-- UNIVERSAL MEDIA AND GAMEPLAY CLUES
-- ---------------------------------------------------------

create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),

  content_id uuid not null
    references public.content_items(id)
    on delete cascade,

  media_type text not null
    check (
      media_type in (
        'video',
        'audio',
        'image',
        'poster',
        'quote',
        'trivia',
        'year',
        'text'
      )
    ),

  round_position text
    check (
      round_position is null
      or round_position in (
        'beginning',
        'middle',
        'ending',
        'any'
      )
    ),

  title text,
  prompt text,
  quote_text text,

  media_url text,
  storage_bucket text,
  storage_path text,
  thumbnail_url text,

  start_seconds numeric(10,2),
  end_seconds numeric(10,2),
  duration_seconds numeric(10,2),

  difficulty text not null default 'medium'
    check (
      difficulty in (
        'easy',
        'medium',
        'hard',
        'expert'
      )
    ),

  licensing_status text not null default 'pending'
    check (
      licensing_status in (
        'pending',
        'licensed',
        'public_domain',
        'promotional',
        'original',
        'user_connected',
        'restricted'
      )
    ),

  source_name text,
  source_url text,
  attribution text,

  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  is_active boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,

  legacy_clip_id uuid unique
    references public.clips(id)
    on delete set null,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    end_seconds is null
    or start_seconds is null
    or end_seconds > start_seconds
  )
);

-- ---------------------------------------------------------
-- ALTERNATE ACCEPTED ANSWERS
-- ---------------------------------------------------------

create table if not exists public.content_answers (
  id uuid primary key default gen_random_uuid(),

  content_id uuid not null
    references public.content_items(id)
    on delete cascade,

  answer_text text not null,
  normalized_answer text not null,

  answer_type text not null default 'alternate'
    check (
      answer_type in (
        'primary',
        'alternate',
        'abbreviation',
        'translation'
      )
    ),

  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  unique (
    content_id,
    normalized_answer
  )
);

-- ---------------------------------------------------------
-- CHALLENGE PACKS
-- ---------------------------------------------------------

create table if not exists public.challenge_sets (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  slug text not null unique,
  description text,
  cover_image_url text,

  difficulty text not null default 'mixed'
    check (
      difficulty in (
        'easy',
        'medium',
        'hard',
        'expert',
        'mixed'
      )
    ),

  publication_status text not null default 'draft'
    check (
      publication_status in (
        'draft',
        'review',
        'published',
        'archived'
      )
    ),

  total_rounds integer not null default 10
    check (total_rounds between 1 and 100),

  is_featured boolean not null default false,
  is_active boolean not null default true,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.challenge_set_items (
  challenge_set_id uuid not null
    references public.challenge_sets(id)
    on delete cascade,

  content_media_id uuid not null
    references public.content_media(id)
    on delete cascade,

  round_number integer not null
    check (round_number > 0),

  points_available integer not null default 1000
    check (points_available >= 0),

  time_limit_seconds integer not null default 30
    check (time_limit_seconds between 1 and 600),

  created_at timestamptz not null default now(),

  primary key (
    challenge_set_id,
    round_number
  ),

  unique (
    challenge_set_id,
    content_media_id
  )
);

-- ---------------------------------------------------------
-- UPDATED-AT TRIGGERS
-- ---------------------------------------------------------

drop trigger if exists content_items_set_updated_at
on public.content_items;

create trigger content_items_set_updated_at
before update on public.content_items
for each row
execute function public.set_updated_at();

drop trigger if exists content_media_set_updated_at
on public.content_media;

create trigger content_media_set_updated_at
before update on public.content_media
for each row
execute function public.set_updated_at();

drop trigger if exists challenge_sets_set_updated_at
on public.challenge_sets;

create trigger challenge_sets_set_updated_at
before update on public.challenge_sets
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------

create index if not exists content_items_type_idx
on public.content_items(content_type_id);

create index if not exists content_items_status_idx
on public.content_items(publication_status);

create index if not exists content_items_active_idx
on public.content_items(is_active);

create index if not exists content_items_release_year_idx
on public.content_items(release_year);

create index if not exists content_items_legacy_movie_idx
on public.content_items(legacy_movie_id);

create index if not exists content_items_title_search_idx
on public.content_items
using gin (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(description, '')
  )
);

create index if not exists content_media_content_idx
on public.content_media(content_id);

create index if not exists content_media_type_idx
on public.content_media(media_type);

create index if not exists content_media_position_idx
on public.content_media(round_position);

create index if not exists content_media_active_idx
on public.content_media(is_active);

create index if not exists content_media_legacy_clip_idx
on public.content_media(legacy_clip_id);

create index if not exists content_categories_category_idx
on public.content_categories(category_id);

create index if not exists content_tags_tag_idx
on public.content_tags(tag_id);

create index if not exists challenge_set_items_media_idx
on public.challenge_set_items(content_media_id);

-- ---------------------------------------------------------
-- BACKFILL EXISTING MOVIES
-- ---------------------------------------------------------

insert into public.content_items (
  content_type_id,
  title,
  normalized_title,
  description,
  release_year,
  creator_name,
  director,
  runtime_minutes,
  poster_url,
  backdrop_url,
  difficulty,
  publication_status,
  licensing_status,
  legacy_movie_id,
  is_active,
  created_at,
  updated_at
)
select
  ct.id,
  m.title,
  m.normalized_title,
  m.description,
  m.release_year,
  m.director,
  m.director,
  m.runtime_minutes,
  m.poster_url,
  m.backdrop_url,
  m.difficulty,
  case
    when m.is_active then 'published'
    else 'archived'
  end,
  'pending',
  m.id,
  m.is_active,
  m.created_at,
  m.updated_at
from public.movies as m
join public.content_types as ct
  on ct.slug = 'movie'
on conflict (legacy_movie_id)
do update set
  title = excluded.title,
  normalized_title = excluded.normalized_title,
  description = excluded.description,
  release_year = excluded.release_year,
  creator_name = excluded.creator_name,
  director = excluded.director,
  runtime_minutes = excluded.runtime_minutes,
  poster_url = excluded.poster_url,
  backdrop_url = excluded.backdrop_url,
  difficulty = excluded.difficulty,
  publication_status = excluded.publication_status,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

-- ---------------------------------------------------------
-- BACKFILL MOVIE CATEGORIES
-- ---------------------------------------------------------

insert into public.content_categories (
  content_id,
  category_id,
  is_primary
)
select
  ci.id,
  mc.category_id,
  false
from public.movie_categories as mc
join public.content_items as ci
  on ci.legacy_movie_id = mc.movie_id
on conflict (
  content_id,
  category_id
)
do nothing;

-- ---------------------------------------------------------
-- BACKFILL EXISTING CLIPS
-- ---------------------------------------------------------

insert into public.content_media (
  content_id,
  media_type,
  round_position,
  prompt,
  quote_text,
  media_url,
  start_seconds,
  end_seconds,
  duration_seconds,
  difficulty,
  licensing_status,
  source_name,
  source_url,
  attribution,
  is_active,
  legacy_clip_id,
  created_at,
  updated_at
)
select
  ci.id,
  case
    when c.clip_type in (
      'video',
      'audio',
      'image',
      'poster',
      'quote',
      'trivia',
      'year'
    )
      then c.clip_type
    else 'text'
  end,
  'any',
  c.prompt,
  c.quote_text,
  c.media_url,
  c.start_seconds,
  c.end_seconds,
  case
    when c.start_seconds is not null
      and c.end_seconds is not null
      then c.end_seconds - c.start_seconds
    else null
  end,
  c.difficulty,
  c.licensing_status,
  c.source_name,
  c.source_url,
  c.attribution,
  c.is_active,
  c.id,
  c.created_at,
  c.created_at
from public.clips as c
join public.content_items as ci
  on ci.legacy_movie_id = c.movie_id
on conflict (legacy_clip_id)
do update set
  content_id = excluded.content_id,
  media_type = excluded.media_type,
  prompt = excluded.prompt,
  quote_text = excluded.quote_text,
  media_url = excluded.media_url,
  start_seconds = excluded.start_seconds,
  end_seconds = excluded.end_seconds,
  duration_seconds = excluded.duration_seconds,
  difficulty = excluded.difficulty,
  licensing_status = excluded.licensing_status,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  attribution = excluded.attribution,
  is_active = excluded.is_active,
  updated_at = now();

-- ---------------------------------------------------------
-- PRIMARY ANSWERS FROM EXISTING MOVIES
-- ---------------------------------------------------------

insert into public.content_answers (
  content_id,
  answer_text,
  normalized_answer,
  answer_type
)
select
  ci.id,
  ci.title,
  public.normalize_movie_answer(ci.title),
  'primary'
from public.content_items as ci
join public.content_types as ct
  on ct.id = ci.content_type_id
where ct.slug = 'movie'
on conflict (
  content_id,
  normalized_answer
)
do update set
  answer_text = excluded.answer_text,
  answer_type = 'primary',
  is_active = true;

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------

alter table public.content_types enable row level security;
alter table public.content_items enable row level security;
alter table public.content_categories enable row level security;
alter table public.tags enable row level security;
alter table public.content_tags enable row level security;
alter table public.content_media enable row level security;
alter table public.content_answers enable row level security;
alter table public.challenge_sets enable row level security;
alter table public.challenge_set_items enable row level security;

drop policy if exists "Content types are publicly readable"
on public.content_types;

create policy "Content types are publicly readable"
on public.content_types
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Published content is publicly readable"
on public.content_items;

create policy "Published content is publicly readable"
on public.content_items
for select
to anon, authenticated
using (
  is_active = true
  and publication_status = 'published'
);

drop policy if exists "Managers view all content"
on public.content_items;

create policy "Managers view all content"
on public.content_items
for select
to authenticated
using (public.is_buff_content_manager());

drop policy if exists "Managers create content"
on public.content_items;

create policy "Managers create content"
on public.content_items
for insert
to authenticated
with check (
  public.is_buff_content_manager()
  and (
    created_by is null
    or created_by = auth.uid()
  )
);

drop policy if exists "Managers update content"
on public.content_items;

create policy "Managers update content"
on public.content_items
for update
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Admins delete content"
on public.content_items;

create policy "Admins delete content"
on public.content_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and platform_role = 'admin'
  )
);

drop policy if exists "Content categories are publicly readable"
on public.content_categories;

create policy "Content categories are publicly readable"
on public.content_categories
for select
to anon, authenticated
using (true);

drop policy if exists "Managers manage content categories"
on public.content_categories;

create policy "Managers manage content categories"
on public.content_categories
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Tags are publicly readable"
on public.tags;

create policy "Tags are publicly readable"
on public.tags
for select
to anon, authenticated
using (true);

drop policy if exists "Managers manage tags"
on public.tags;

create policy "Managers manage tags"
on public.tags
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Content tags are publicly readable"
on public.content_tags;

create policy "Content tags are publicly readable"
on public.content_tags
for select
to anon, authenticated
using (true);

drop policy if exists "Managers manage content tags"
on public.content_tags;

create policy "Managers manage content tags"
on public.content_tags
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Published media is publicly readable"
on public.content_media;

create policy "Published media is publicly readable"
on public.content_media
for select
to anon, authenticated
using (
  is_active = true
  and is_hidden = false
  and exists (
    select 1
    from public.content_items as ci
    where ci.id = content_id
      and ci.is_active = true
      and ci.publication_status = 'published'
  )
);

drop policy if exists "Managers view all media"
on public.content_media;

create policy "Managers view all media"
on public.content_media
for select
to authenticated
using (public.is_buff_content_manager());

drop policy if exists "Managers create media"
on public.content_media;

create policy "Managers create media"
on public.content_media
for insert
to authenticated
with check (
  public.is_buff_content_manager()
  and (
    created_by is null
    or created_by = auth.uid()
  )
);

drop policy if exists "Managers update media"
on public.content_media;

create policy "Managers update media"
on public.content_media
for update
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Admins delete media"
on public.content_media;

create policy "Admins delete media"
on public.content_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and platform_role = 'admin'
  )
);

drop policy if exists "Active content answers are readable"
on public.content_answers;

create policy "Active content answers are readable"
on public.content_answers
for select
to authenticated
using (is_active = true);

drop policy if exists "Managers manage content answers"
on public.content_answers;

create policy "Managers manage content answers"
on public.content_answers
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Published challenges are publicly readable"
on public.challenge_sets;

create policy "Published challenges are publicly readable"
on public.challenge_sets
for select
to anon, authenticated
using (
  is_active = true
  and publication_status = 'published'
);

drop policy if exists "Managers manage challenge sets"
on public.challenge_sets;

create policy "Managers manage challenge sets"
on public.challenge_sets
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "Published challenge items are publicly readable"
on public.challenge_set_items;

create policy "Published challenge items are publicly readable"
on public.challenge_set_items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.challenge_sets as cs
    where cs.id = challenge_set_id
      and cs.is_active = true
      and cs.publication_status = 'published'
  )
);

drop policy if exists "Managers manage challenge items"
on public.challenge_set_items;

create policy "Managers manage challenge items"
on public.challenge_set_items
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

-- ---------------------------------------------------------
-- TABLE PERMISSIONS
-- ---------------------------------------------------------

grant usage on schema public
to anon, authenticated;

grant select
on table
  public.content_types,
  public.content_items,
  public.content_categories,
  public.tags,
  public.content_tags,
  public.content_media,
  public.challenge_sets,
  public.challenge_set_items
to anon, authenticated;

grant select
on table public.content_answers
to authenticated;

grant insert, update, delete
on table
  public.content_items,
  public.content_categories,
  public.tags,
  public.content_tags,
  public.content_media,
  public.content_answers,
  public.challenge_sets,
  public.challenge_set_items
to authenticated;

notify pgrst, 'reload schema';
