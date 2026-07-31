create extension if not exists pgcrypto;

-- PROFILES

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  country text,
  bio text,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  coins integer not null default 0 check (coins >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url
  )
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- MOVIE LIBRARY

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  normalized_title text not null,
  release_year integer check (release_year between 1880 and 2200),
  description text,
  director text,
  poster_url text,
  backdrop_url text,
  runtime_minutes integer check (runtime_minutes > 0),
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_title, release_year)
);

create table public.movie_categories (
  movie_id uuid not null references public.movies(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (movie_id, category_id)
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  clip_type text not null default 'video'
    check (clip_type in (
      'video',
      'audio',
      'image',
      'quote',
      'trivia',
      'year',
      'poster'
    )),
  media_url text,
  prompt text,
  quote_text text,
  start_seconds numeric(10,2),
  end_seconds numeric(10,2),
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard', 'expert')),
  licensing_status text not null default 'pending'
    check (licensing_status in (
      'pending',
      'licensed',
      'public_domain',
      'promotional',
      'user_connected',
      'restricted'
    )),
  source_name text,
  source_url text,
  attribution text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    end_seconds is null
    or start_seconds is null
    or end_seconds > start_seconds
  )
);

-- ROOMS AND MULTIPLAYER

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  room_type text not null default 'private'
    check (room_type in ('public', 'private', 'ai')),
  status text not null default 'waiting'
    check (status in ('waiting', 'starting', 'active', 'finished', 'cancelled')),
  category_id uuid references public.categories(id) on delete set null,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard', 'expert', 'mixed')),
  total_rounds integer not null default 10
    check (total_rounds between 1 and 50),
  max_players integer not null default 4
    check (max_players between 1 and 100),
  current_round integer not null default 0,
  is_ranked boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.room_players (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  is_ready boolean not null default false,
  is_host boolean not null default false,
  score integer not null default 0,
  lives integer not null default 3,
  current_streak integer not null default 0,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, player_id)
);

-- MATCH HISTORY

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.game_rooms(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  difficulty text not null default 'medium',
  total_rounds integer not null default 10,
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  final_score integer not null default 0,
  final_position integer,
  correct_answers integer not null default 0,
  incorrect_answers integer not null default 0,
  xp_earned integer not null default 0,
  coins_earned integer not null default 0,
  primary key (match_id, player_id)
);

create table public.match_rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  clip_id uuid references public.clips(id) on delete set null,
  round_number integer not null,
  time_limit_seconds integer not null default 30,
  started_at timestamptz,
  ended_at timestamptz,
  unique (match_id, round_number)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.match_rounds(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  submitted_answer text,
  is_correct boolean not null default false,
  response_time_ms integer check (response_time_ms >= 0),
  base_points integer not null default 0,
  speed_bonus integer not null default 0,
  streak_bonus integer not null default 0,
  total_points integer generated always as (
    base_points + speed_bonus + streak_bonus
  ) stored,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

-- ACHIEVEMENTS AND STATS

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null,
  icon text,
  xp_reward integer not null default 0,
  coin_reward integer not null default 0,
  requirement_type text not null,
  requirement_value integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.player_stats (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  matches_played integer not null default 0,
  matches_won integer not null default 0,
  total_score bigint not null default 0,
  correct_answers integer not null default 0,
  incorrect_answers integer not null default 0,
  fastest_answer_ms integer,
  highest_match_score integer not null default 0,
  ai_wins integer not null default 0,
  ai_losses integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- UPDATED-AT TRIGGER

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger movies_set_updated_at
before update on public.movies
for each row execute function public.set_updated_at();

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

create trigger player_stats_set_updated_at
before update on public.player_stats
for each row execute function public.set_updated_at();

-- INDEXES

create index movies_title_idx
  on public.movies using gin (to_tsvector('english', title));

create index clips_movie_id_idx on public.clips(movie_id);
create index game_rooms_status_idx on public.game_rooms(status);
create index game_rooms_room_code_idx on public.game_rooms(room_code);
create index room_players_player_id_idx on public.room_players(player_id);
create index match_players_player_id_idx on public.match_players(player_id);
create index answers_player_id_idx on public.answers(player_id);
create index answers_round_id_idx on public.answers(round_id);

-- ROW LEVEL SECURITY

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.movies enable row level security;
alter table public.movie_categories enable row level security;
alter table public.clips enable row level security;
alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_rounds enable row level security;
alter table public.answers enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.player_stats enable row level security;
alter table public.friendships enable row level security;

create policy "Profiles are publicly readable"
on public.profiles for select
to authenticated, anon
using (true);

create policy "Users update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Game content is publicly readable"
on public.categories for select
to authenticated, anon
using (true);

create policy "Movies are publicly readable"
on public.movies for select
to authenticated, anon
using (is_active = true);

create policy "Movie categories are publicly readable"
on public.movie_categories for select
to authenticated, anon
using (true);

create policy "Active clips are readable"
on public.clips for select
to authenticated
using (is_active = true);

create policy "Authenticated users create rooms"
on public.game_rooms for insert
to authenticated
with check ((select auth.uid()) = host_id);

create policy "Players can view rooms"
on public.game_rooms for select
to authenticated
using (
  room_type = 'public'
  or host_id = (select auth.uid())
  or exists (
    select 1
    from public.room_players rp
    where rp.room_id = id
      and rp.player_id = (select auth.uid())
  )
);

create policy "Hosts update their rooms"
on public.game_rooms for update
to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

create policy "Players view room members"
on public.room_players for select
to authenticated
using (
  player_id = (select auth.uid())
  or exists (
    select 1
    from public.room_players mine
    where mine.room_id = room_id
      and mine.player_id = (select auth.uid())
  )
);

create policy "Players join rooms"
on public.room_players for insert
to authenticated
with check (player_id = (select auth.uid()));

create policy "Players update their room status"
on public.room_players for update
to authenticated
using (player_id = (select auth.uid()))
with check (player_id = (select auth.uid()));

create policy "Players leave rooms"
on public.room_players for delete
to authenticated
using (player_id = (select auth.uid()));

create policy "Players view their matches"
on public.matches for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    where mp.match_id = id
      and mp.player_id = (select auth.uid())
  )
);

create policy "Players view match participants"
on public.match_players for select
to authenticated
using (
  player_id = (select auth.uid())
  or exists (
    select 1
    from public.match_players mine
    where mine.match_id = match_id
      and mine.player_id = (select auth.uid())
  )
);

create policy "Players view match rounds"
on public.match_rounds for select
to authenticated
using (
  exists (
    select 1
    from public.match_players mp
    where mp.match_id = match_id
      and mp.player_id = (select auth.uid())
  )
);

create policy "Players submit their own answers"
on public.answers for insert
to authenticated
with check (player_id = (select auth.uid()));

create policy "Players view answers from their matches"
on public.answers for select
to authenticated
using (
  player_id = (select auth.uid())
  or exists (
    select 1
    from public.match_rounds mr
    join public.match_players mp on mp.match_id = mr.match_id
    where mr.id = round_id
      and mp.player_id = (select auth.uid())
  )
);

create policy "Achievements are publicly readable"
on public.achievements for select
to authenticated, anon
using (is_active = true);

create policy "Users view earned achievements"
on public.user_achievements for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Player stats are publicly readable"
on public.player_stats for select
to authenticated, anon
using (true);

create policy "Users view their friendships"
on public.friendships for select
to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

create policy "Users send friend requests"
on public.friendships for insert
to authenticated
with check (requester_id = (select auth.uid()));

create policy "Users update relevant friendships"
on public.friendships for update
to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
)
with check (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

-- STARTER DATA

insert into public.categories (name, slug, description)
values
  ('Action', 'action', 'Explosions, heroes, chases, and high-stakes adventures.'),
  ('Comedy', 'comedy', 'Funny films from every generation.'),
  ('Drama', 'drama', 'Powerful stories and unforgettable performances.'),
  ('Horror', 'horror', 'Scary movies, thrillers, and supernatural stories.'),
  ('Science Fiction', 'science-fiction', 'Futuristic worlds, technology, and space.'),
  ('Classics', 'classics', 'Iconic films from cinema history.'),
  ('Blockbusters', 'blockbusters', 'Major theatrical hits and audience favorites.'),
  ('Family', 'family', 'Movies suitable for families and younger players.');

insert into public.achievements (
  name,
  slug,
  description,
  icon,
  xp_reward,
  coin_reward,
  requirement_type,
  requirement_value
)
values
  ('First Take', 'first-take', 'Complete your first Movie Buff match.', 'film', 100, 25, 'matches_played', 1),
  ('Hot Streak', 'hot-streak', 'Answer five questions correctly in a row.', 'flame', 250, 50, 'streak', 5),
  ('Perfect Picture', 'perfect-picture', 'Get every answer correct in a match.', 'trophy', 500, 100, 'perfect_match', 1),
  ('Speed Demon', 'speed-demon', 'Submit a correct answer in under three seconds.', 'clock', 300, 75, 'response_time_ms', 3000),
  ('Buffster Beater', 'buffster-beater', 'Defeat Buffster in Challenge AI mode.', 'bot', 500, 100, 'ai_wins', 1);

-- =========================================================
-- Non-recursive Movie Buff room policies
-- =========================================================

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('game_rooms', 'room_players')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;

create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (true);

create policy "game_rooms_insert"
on public.game_rooms
for insert
to authenticated
with check (auth.uid() = host_id);

create policy "game_rooms_update"
on public.game_rooms
for update
to authenticated
using (auth.uid() = host_id)
with check (auth.uid() = host_id);

create policy "game_rooms_delete"
on public.game_rooms
for delete
to authenticated
using (auth.uid() = host_id);

create policy "room_players_select"
on public.room_players
for select
to authenticated
using (left_at is null);

create policy "room_players_insert"
on public.room_players
for insert
to authenticated
with check (auth.uid() = player_id);

create policy "room_players_update"
on public.room_players
for update
to authenticated
using (auth.uid() = player_id)
with check (auth.uid() = player_id);

create policy "room_players_delete"
on public.room_players
for delete
to authenticated
using (auth.uid() = player_id);

notify pgrst, 'reload schema';