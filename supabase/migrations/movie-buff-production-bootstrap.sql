-- Movie Buff production bootstrap
-- generated 
2026-07-31T01:12:04.1876048-04:00

-- >>> BEGIN 20260724222329_init_movie_buff.sql
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
-- <<< END 20260724222329_init_movie_buff.sql

-- >>> BEGIN 20260724224251_grant_movie_buff_permissions.sql
grant usage on schema public to authenticated;

grant select, insert, update, delete
on table public.game_rooms
to authenticated;

grant select, insert, update, delete
on table public.room_players
to authenticated;

grant select, insert, update, delete
on table public.profiles
to authenticated;

grant select, insert, update, delete
on table public.answers
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 20260724224251_grant_movie_buff_permissions.sql

-- >>> BEGIN 202607250001_start_movie_buff_match.sql
create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  match_id uuid,
  round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status = 'finished'
     or v_room.status = 'cancelled' then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = p_room_id
    and left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players
  where room_id = p_room_id
    and left_at is null
    and is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select id
  into v_match_id
  from public.matches
  where room_id = p_room_id
    and status = 'active'
  order by started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict (match_id, player_id) do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    select c.id
    into v_clip_id
    from public.clips c
    join public.movies m
      on m.id = c.movie_id
    where c.is_active = true
      and m.is_active = true
      and (
        v_room.difficulty = 'mixed'
        or c.difficulty = v_room.difficulty
      )
    order by random()
    limit 1;

    if v_clip_id is null then
      select c.id
      into v_clip_id
      from public.clips c
      join public.movies m
        on m.id = c.movie_id
      where c.is_active = true
        and m.is_active = true
      order by random()
      limit 1;
    end if;

    if v_clip_id is null then
      raise exception 'No active movie clips are available.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  end if;

  update public.game_rooms
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(started_at, now())
  where id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;
-- <<< END 202607250001_start_movie_buff_match.sql

-- >>> BEGIN 202607250002_fix_start_match_ambiguity.sql
drop function if exists public.start_movie_buff_match(uuid);

create function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    select c.id
    into v_clip_id
    from public.clips as c
    join public.movies as m
      on m.id = c.movie_id
    where c.is_active = true
      and m.is_active = true
      and (
        v_room.difficulty = 'mixed'
        or c.difficulty = v_room.difficulty
      )
    order by random()
    limit 1;

    if v_clip_id is null then
      select c.id
      into v_clip_id
      from public.clips as c
      join public.movies as m
        on m.id = c.movie_id
      where c.is_active = true
        and m.is_active = true
      order by random()
      limit 1;
    end if;

    if v_clip_id is null then
      raise exception 'No active movie clips are available.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to anon;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607250002_fix_start_match_ambiguity.sql

-- >>> BEGIN 202607250003_movie_buff_answers.sql
create or replace function public.normalize_movie_answer(
  p_answer text
)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(coalesce(p_answer, '')),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  return query
  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    greatest(
      0,
      mr.time_limit_seconds -
      floor(
        extract(
          epoch from (
            now() - coalesce(mr.started_at, now())
          )
        )
      )::integer
    ),
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit integer;
  v_movie_title text;
  v_normalized_title text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_time_limit,
    v_movie_title,
    v_normalized_title
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_elapsed_seconds := greatest(
    0,
    floor(
      extract(
        epoch from (
          now() - coalesce(v_started_at, now())
        )
      )
    )::integer
  );

  if v_elapsed_seconds > v_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_is_correct :=
    public.normalize_movie_answer(p_submitted_answer) =
    public.normalize_movie_answer(
      coalesce(v_normalized_title, v_movie_title)
    );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_time_limit - v_elapsed_seconds) * 10
      )
    );

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on function public.normalize_movie_answer(text) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607250003_movie_buff_answers.sql

-- >>> BEGIN 202607250004_advance_movie_buff_round.sql
create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    select c.id
    into v_clip_id
    from public.clips as c
    join public.movies as mo
      on mo.id = c.movie_id
    where c.is_active = true
      and mo.is_active = true
      and not exists (
        select 1
        from public.match_rounds as used_round
        where used_round.match_id = v_match_id
          and used_round.clip_id = c.id
      )
      and (
        v_room.difficulty = 'mixed'
        or c.difficulty = v_room.difficulty
      )
    order by random()
    limit 1;

    if v_clip_id is null then
      select c.id
      into v_clip_id
      from public.clips as c
      join public.movies as mo
        on mo.id = c.movie_id
      where c.is_active = true
        and mo.is_active = true
        and not exists (
          select 1
          from public.match_rounds as used_round
          where used_round.match_id = v_match_id
            and used_round.clip_id = c.id
        )
      order by random()
      limit 1;
    end if;

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null
    where id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.advance_movie_buff_round(uuid) from public;
grant execute on function public.advance_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607250004_advance_movie_buff_round.sql

-- >>> BEGIN 202607250005_movie_buff_round_results.sql
create or replace function public.get_movie_buff_round_results(
  p_room_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'Match not found.';
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_room.current_round
  limit 1;

  if v_round_id is null then
    raise exception 'Round not found.';
  end if;

  return query
  select
    v_room.status,
    v_room.host_id = auth.uid(),
    mr.round_number,
    v_room.total_rounds,
    mo.title,
    mo.release_year,
    mo.director,
    my_answer.submitted_answer,
    coalesce(my_answer.is_correct, false),
    coalesce(my_answer.base_points, 0),
    coalesce(my_answer.speed_bonus, 0),
    coalesce(my_answer.streak_bonus, 0),
    coalesce(my_answer.total_points, 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id', standing.player_id,
            'display_name', standing.display_name,
            'score', standing.score,
            'round_points', standing.round_points,
            'is_correct', standing.is_correct
          )
          order by standing.score desc, standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(a.total_points, 0) as round_points,
            coalesce(a.is_correct, false) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = v_round_id
           and a.player_id = rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from public.match_rounds as mr
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.answers as my_answer
    on my_answer.round_id = mr.id
   and my_answer.player_id = auth.uid()
  where mr.id = v_round_id;
end;
$$;

revoke all on function public.get_movie_buff_round_results(uuid) from public;
grant execute on function public.get_movie_buff_round_results(uuid)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607250005_movie_buff_round_results.sql

-- >>> BEGIN 202607250006_exact_movie_buff_round_results.sql
create or replace function public.get_movie_buff_round_results(
  p_room_id uuid,
  p_round_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception
      'You are not an active player in this room.';
  end if;

  select mr.match_id
  into v_match_id
  from public.match_rounds as mr
  join public.matches as m
    on m.id = mr.match_id
  where mr.id = p_round_id
    and m.room_id = p_room_id
  limit 1;

  if v_match_id is null then
    raise exception
      'The requested round does not belong to this room.';
  end if;

  return query
  select
    v_room.status,
    v_room.host_id = auth.uid(),
    mr.id,
    mr.round_number,
    v_room.total_rounds,
    mo.title,
    mo.release_year,
    mo.director,
    my_answer.submitted_answer,
    coalesce(
      my_answer.is_correct,
      false
    ),
    coalesce(
      my_answer.base_points,
      0
    ),
    coalesce(
      my_answer.speed_bonus,
      0
    ),
    coalesce(
      my_answer.streak_bonus,
      0
    ),
    coalesce(
      my_answer.total_points,
      0
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'round_points',
            standing.round_points,
            'is_correct',
            standing.is_correct
          )
          order by
            standing.score desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(
                p.display_name,
                ''
              ),
              nullif(
                p.username,
                ''
              ),
              'Player ' ||
                left(
                  rp.player_id::text,
                  6
                )
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(
              a.total_points,
              0
            ) as round_points,
            coalesce(
              a.is_correct,
              false
            ) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = p_round_id
           and a.player_id =
             rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from public.match_rounds as mr
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.answers as my_answer
    on my_answer.round_id = mr.id
   and my_answer.player_id =
     auth.uid()
  where mr.id = p_round_id
    and mr.match_id = v_match_id;
end;
$$;

revoke all on function
  public.get_movie_buff_round_results(
    uuid,
    uuid
  )
from public;

grant execute on function
  public.get_movie_buff_round_results(
    uuid,
    uuid
  )
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607250006_exact_movie_buff_round_results.sql

-- >>> BEGIN 202607260001_movie_buff_final_results.sql
create or replace function public.get_movie_buff_final_results(
  p_room_id uuid
)
returns table (
  result_room_status text,
  result_player_id uuid,
  result_total_rounds integer,
  result_completed_rounds integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
  ) then
    raise exception 'You are not a player in this room.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'Match not found.';
  end if;

  return query
  select
    v_room.status,
    auth.uid(),
    v_room.total_rounds,
    (
      select count(*)::integer
      from public.match_rounds as completed_round
      where completed_round.match_id = v_match_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'correct_answers',
            standing.correct_answers,
            'answers_submitted',
            standing.answers_submitted,
            'accuracy',
            standing.accuracy,
            'current_streak',
            standing.current_streak,
            'lives',
            standing.lives
          )
          order by
            standing.score desc,
            standing.correct_answers desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            coalesce(rp.score, 0) as score,
            coalesce(rp.current_streak, 0) as current_streak,
            coalesce(rp.lives, 0) as lives,
            rp.joined_at,
            count(a.id) filter (
              where a.is_correct = true
            )::integer as correct_answers,
            count(a.id)::integer as answers_submitted,
            case
              when v_room.total_rounds > 0 then
                round(
                  (
                    count(a.id) filter (
                      where a.is_correct = true
                    )::numeric
                    / v_room.total_rounds::numeric
                  ) * 100
                )::integer
              else 0
            end as accuracy
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.match_rounds as mr
            on mr.match_id = v_match_id
          left join public.answers as a
            on a.round_id = mr.id
           and a.player_id = rp.player_id
          where rp.room_id = p_room_id
          group by
            rp.player_id,
            p.display_name,
            p.username,
            rp.score,
            rp.current_streak,
            rp.lives,
            rp.joined_at
        ) as standing
      ),
      '[]'::jsonb
    );
end;
$$;

revoke all on function
  public.get_movie_buff_final_results(uuid)
from public;

grant execute on function
  public.get_movie_buff_final_results(uuid)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607260001_movie_buff_final_results.sql

-- >>> BEGIN 202607262300_add_movie_buff_trivia_clips.sql
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
-- <<< END 202607262300_add_movie_buff_trivia_clips.sql

-- >>> BEGIN 202607262330_expand_movie_buff_content.sql
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
-- <<< END 202607262330_expand_movie_buff_content.sql

-- >>> BEGIN 202607262345_expand_all_movie_buff_difficulties.sql
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
-- <<< END 202607262345_expand_all_movie_buff_difficulties.sql

-- >>> BEGIN 202607270001_fix_movie_answer_normalization.sql
create or replace function public.normalize_movie_answer(
  p_answer text
)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    lower(coalesce(p_answer, '')),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

revoke all on function
  public.normalize_movie_answer(text)
from public;

grant execute on function
  public.normalize_movie_answer(text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607270001_fix_movie_answer_normalization.sql

-- >>> BEGIN 202607270002_buff_games_content_engine.sql
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
-- <<< END 202607270002_buff_games_content_engine.sql

-- >>> BEGIN 202607290001_grant_content_engine_service_role.sql
grant usage on schema public
to service_role;

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
to service_role;

grant select, insert, update, delete
on table
  public.content_items,
  public.content_categories,
  public.tags,
  public.content_tags,
  public.content_media,
  public.content_answers,
  public.challenge_sets,
  public.challenge_set_items
to service_role;

notify pgrst, 'reload schema';
-- <<< END 202607290001_grant_content_engine_service_role.sql

-- >>> BEGIN 202607290002_grant_categories_service_role.sql
grant usage on schema public
to service_role;

grant select
on table
  public.categories
to service_role;

notify pgrst, 'reload schema';
-- <<< END 202607290002_grant_categories_service_role.sql

-- >>> BEGIN 202607290003_movie_buff_clip_engine_bridge.sql
grant usage on schema public
to service_role;

grant select, insert, update, delete
on table
  public.movies,
  public.movie_categories,
  public.clips
to service_role;

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
begin
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
    and (
      p_difficulty = 'mixed'
      or c.difficulty = p_difficulty
    )
  order by random()
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

drop function if exists public.start_movie_buff_match(uuid);

create function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to anon;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;

create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null
    where id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.advance_movie_buff_round(uuid) from public;
grant execute on function public.advance_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607290003_movie_buff_clip_engine_bridge.sql

-- >>> BEGIN 202607290004_sync_movie_buff_content_to_legacy.sql
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
-- <<< END 202607290004_sync_movie_buff_content_to_legacy.sql

-- >>> BEGIN 202607290005_defer_movie_buff_round_timer_until_play.sql
create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if v_started_at is null then
    update public.match_rounds
    set started_at = now()
    where id = v_round_id
      and started_at is null
    returning started_at into v_started_at;

    if v_started_at is null then
      select mr.started_at
      into v_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_time_limit_seconds -
      floor(
        extract(
          epoch from (
            now() - coalesce(v_started_at, now())
          )
        )
      )::integer
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url;
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit integer;
  v_movie_title text;
  v_normalized_title text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_time_limit,
    v_movie_title,
    v_normalized_title
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  if v_started_at is null then
    update public.match_rounds
    set started_at = now()
    where id = v_round_id
      and started_at is null
    returning started_at into v_started_at;

    if v_started_at is null then
      select mr.started_at
      into v_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  v_elapsed_seconds := greatest(
    0,
    floor(
      extract(
        epoch from (
          now() - coalesce(v_started_at, now())
        )
      )
    )::integer
  );

  if v_elapsed_seconds > v_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_is_correct :=
    public.normalize_movie_answer(p_submitted_answer) =
    public.normalize_movie_answer(
      coalesce(v_normalized_title, v_movie_title)
    );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_time_limit - v_elapsed_seconds) * 10
      )
    );

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      null
    )
    returning id into v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      null
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = null,
      ended_at = null
    where id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;
revoke all on function public.start_movie_buff_match(uuid) from public;
revoke all on function public.advance_movie_buff_round(uuid) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

grant execute on function public.start_movie_buff_match(uuid)
to anon;

grant execute on function public.start_movie_buff_match(uuid)
to authenticated;

grant execute on function public.advance_movie_buff_round(uuid)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607290005_defer_movie_buff_round_timer_until_play.sql

-- >>> BEGIN 202607290006_movie_buff_answer_aliases.sql
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_movie_answer(
  p_answer text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(
    lower(
      extensions.unaccent(
        coalesce(p_answer, '')
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

revoke all on function
  public.normalize_movie_answer(text)
from public;

grant execute on function
  public.normalize_movie_answer(text)
to authenticated;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit integer;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  if v_started_at is null then
    update public.match_rounds
    set started_at = now()
    where id = v_round_id
      and started_at is null
    returning started_at into v_started_at;

    if v_started_at is null then
      select mr.started_at
      into v_started_at
      from public.match_rounds as mr
      where mr.id = v_round_id;
    end if;
  end if;

  v_elapsed_seconds := greatest(
    0,
    floor(
      extract(
        epoch from (
          now() - coalesce(v_started_at, now())
        )
      )
    )::integer
  );

  if v_elapsed_seconds > v_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_time_limit - v_elapsed_seconds) * 10
      )
    );

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607290006_movie_buff_answer_aliases.sql

-- >>> BEGIN 202607290007_movie_buff_playback_hint_controls.sql
alter table public.match_rounds
  add column if not exists playback_started_at timestamptz,
  add column if not exists hint_used_at timestamptz,
  add column if not exists hint_penalty_seconds integer not null default 0;

alter table public.match_rounds
  drop constraint if exists match_rounds_hint_penalty_seconds_check;

alter table public.match_rounds
  add constraint match_rounds_hint_penalty_seconds_check
  check (hint_penalty_seconds >= 0 and hint_penalty_seconds <= 10);

drop function if exists public.get_movie_buff_round(uuid);

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    case
      when nullif(trim(mo.description), '') is not null then
        trim(mo.description)
      when (
        c.clip_type in ('video', 'audio', 'image', 'poster')
        and nullif(trim(c.prompt), '') is not null
        and trim(c.prompt) !~* '^Name the movie from this 30-second montage'
      ) then
        regexp_replace(
          trim(c.prompt),
          '\s+Name the movie\.?$',
          '',
          'i'
        )
      else
        null
    end,
    mr.hint_used_at is not null,
    coalesce(mr.hint_penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_time_limit_seconds -
      floor(
        extract(
          epoch from (
            now() - coalesce(v_started_at, now())
          )
        )
      )::integer
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.start_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  update public.match_rounds
  set
    started_at = coalesce(started_at, now()),
    playback_started_at = coalesce(
      playback_started_at,
      now()
    )
  where id = v_round_id;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.playback_started_at,
    mr.hint_used_at
  into
    v_round_id,
    v_playback_started_at,
    v_hint_used_at
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  if v_hint_used_at is not null then
    raise exception 'The hint has already been used for this round.';
  end if;

  update public.match_rounds
  set
    hint_used_at = now(),
    hint_penalty_seconds =
      v_penalty_seconds,
    started_at =
      coalesce(started_at, now()) -
      make_interval(
        secs => v_penalty_seconds
      )
  where id = v_round_id;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607290007_movie_buff_playback_hint_controls.sql

-- >>> BEGIN 202607291130_movie_buff_hint_balance_and_safety.sql
create or replace function public.sanitize_movie_buff_hint_text(
  p_hint_text text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_sanitized text;
begin
  v_sanitized := coalesce(p_hint_text, '');

  v_sanitized := regexp_replace(
    v_sanitized,
    'https?://\S+',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\b(internet archive|archive\.org|library of congress|loc\.gov|public[ -]?domain|registry|roundup|source|direct mp4 link|direct archive clip link|item marked|rights history note|pd mark)\b',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\bIA\b',
    '',
    'g'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\b(linked from|highlighted in|with clear\s+[^.]+?mark)\b',
    '',
    'gi'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\s+',
    ' ',
    'g'
  );

  v_sanitized := regexp_replace(
    v_sanitized,
    '\s+([,.;:])',
    '\1',
    'g'
  );

  v_sanitized := trim(
    both ' .,-:;'
    from v_sanitized
  );

  if v_sanitized = '' then
    return null;
  end if;

  if right(v_sanitized, 1) in ('.', '!', '?') then
    return v_sanitized;
  end if;

  return v_sanitized || '.';
end;
$$;

create or replace function public.build_movie_buff_hint_text(
  p_description text,
  p_prompt text,
  p_release_year integer,
  p_director text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_hint text;
  v_prompt_hint text;
begin
  v_hint := public.sanitize_movie_buff_hint_text(
    p_description
  );

  if v_hint is not null then
    return v_hint;
  end if;

  if
    nullif(trim(coalesce(p_prompt, '')), '') is not null
    and trim(p_prompt) !~* '^Name the movie from this 30-second montage'
  then
    v_prompt_hint := regexp_replace(
      trim(p_prompt),
      '\s+Name the movie\.?$',
      '',
      'i'
    );

    v_hint := public.sanitize_movie_buff_hint_text(
      v_prompt_hint
    );

    if v_hint is not null then
      return v_hint;
    end if;
  end if;

  if
    p_release_year is not null
    and nullif(trim(coalesce(p_director, '')), '') is not null
  then
    return format(
      'Released in %s. Directed by %s.',
      p_release_year,
      trim(p_director)
    );
  end if;

  if p_release_year is not null then
    return format(
      'Released in %s.',
      p_release_year
    );
  end if;

  if nullif(trim(coalesce(p_director, '')), '') is not null then
    return format(
      'Directed by %s.',
      trim(p_director)
    );
  end if;

  return null;
end;
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director
    ),
    mr.hint_used_at is not null,
    coalesce(mr.hint_penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.playback_started_at,
    mr.hint_used_at
  into
    v_round_id,
    v_playback_started_at,
    v_hint_used_at
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  if v_hint_used_at is not null then
    raise exception 'The hint has already been used for this round.';
  end if;

  update public.match_rounds
  set
    hint_used_at = now(),
    hint_penalty_seconds = v_penalty_seconds
  where id = v_round_id;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_hint_solve_bonus integer := 100;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.playback_started_at,
    mr.hint_used_at,
    coalesce(mr.hint_penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  if v_elapsed_seconds > v_effective_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_speed_bonus :=
        v_speed_bonus +
        v_hint_solve_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on function public.sanitize_movie_buff_hint_text(text) from public;
revoke all on function public.build_movie_buff_hint_text(text, text, integer, text) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291130_movie_buff_hint_balance_and_safety.sql

-- >>> BEGIN 202607291200_movie_buff_player_hint_state.sql
create table if not exists public.match_round_player_hints (
  round_id uuid not null
    references public.match_rounds(id)
    on delete cascade,
  player_id uuid not null
    references auth.users(id)
    on delete cascade,
  used_at timestamptz not null default now(),
  penalty_seconds integer not null default 5,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (round_id, player_id),
  constraint match_round_player_hints_penalty_seconds_check
    check (penalty_seconds >= 0 and penalty_seconds <= 10)
);

create index if not exists match_round_player_hints_player_id_idx
  on public.match_round_player_hints (player_id);

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.playback_started_at
  into
    v_round_id,
    v_playback_started_at
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_hint_solve_bonus integer := 100;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.playback_started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  if v_elapsed_seconds > v_effective_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_speed_bonus :=
        v_speed_bonus +
        v_hint_solve_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on table public.match_round_player_hints from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291200_movie_buff_player_hint_state.sql

-- >>> BEGIN 202607291230_movie_buff_progressive_hints.sql
create or replace function public.get_movie_buff_hint_genre_clue(
  p_genres text[]
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_genres text[] := coalesce(p_genres, array[]::text[]);
begin
  if 'screwball' = any(v_genres) then
    return 'Expect fast banter and playful energy.';
  end if;

  if 'film noir' = any(v_genres) then
    return 'Think in terms of darker noir tension.';
  end if;

  if 'zombie' = any(v_genres) then
    return 'Expect undead horror.';
  end if;

  if 'psychological' = any(v_genres) then
    return 'Expect a more psychological mood.';
  end if;

  if 'expressionist' = any(v_genres) then
    return 'Look for a stylized expressionist feel.';
  end if;

  if 'silent' = any(v_genres) then
    return 'This one comes from the silent era.';
  end if;

  if 'western' = any(v_genres) then
    return 'Think frontier or cowboy territory.';
  end if;

  if 'adventure' = any(v_genres) then
    return 'Expect a bigger adventure feel.';
  end if;

  if 'horror' = any(v_genres) then
    return 'Expect eerie or unsettling horror tone.';
  end if;

  if 'thriller' = any(v_genres) then
    return 'Expect a tense, dangerous mood.';
  end if;

  if 'comedy' = any(v_genres) then
    return 'Expect a lighter comedic tone.';
  end if;

  return null;
end;
$$;

create or replace function public.build_movie_buff_hint_text(
  p_description text,
  p_prompt text,
  p_release_year integer,
  p_director text,
  p_difficulty text,
  p_metadata jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_difficulty text := lower(coalesce(p_difficulty, 'medium'));
  v_sanitized_description text :=
    public.sanitize_movie_buff_hint_text(
      p_description
    );
  v_prompt_hint text;
  v_country text;
  v_country_phrase text;
  v_genres_pretty text[] := array[]::text[];
  v_genres_lower text[] := array[]::text[];
  v_genre_limit integer := 2;
  v_genre_phrase text;
  v_tone_hint text;
  v_base_hint text;
  v_fallback_hint text;
  v_description_is_generic boolean := false;
begin
  if v_difficulty not in ('easy', 'medium', 'hard') then
    v_difficulty := 'medium';
  end if;

  if v_difficulty = 'easy' then
    v_genre_limit := 3;
  elsif v_difficulty = 'hard' then
    v_genre_limit := 1;
  end if;

  if
    p_metadata is not null
    and jsonb_typeof(
      p_metadata -> 'genres'
    ) = 'array'
  then
    select coalesce(
      array_agg(
        lower(trim(value))
      ),
      array[]::text[]
    )
    into v_genres_lower
    from (
      select distinct
        value
      from jsonb_array_elements_text(
        p_metadata -> 'genres'
      ) as genre(value)
      where trim(value) <> ''
    ) as genre_values;

    select coalesce(
      array_agg(
        initcap(
          replace(
            replace(
              trim(value),
              '-',
              ' '
            ),
            '_',
            ' '
          )
        )
      ),
      array[]::text[]
    )
    into v_genres_pretty
    from (
      select distinct
        value
      from jsonb_array_elements_text(
        p_metadata -> 'genres'
      ) as genre(value)
      where trim(value) <> ''
    ) as genre_values;
  end if;

  v_country := nullif(
    trim(
      coalesce(
        p_metadata ->> 'countryOrOrigin',
        ''
      )
    ),
    ''
  );

  v_country_phrase := case
    when v_country = 'United States' then
      'the United States'
    when v_country = 'United Kingdom' then
      'the United Kingdom'
    else
      v_country
  end;

  if array_length(v_genres_pretty, 1) > 0 then
    v_genre_phrase := array_to_string(
      v_genres_pretty[
        1:least(
          v_genre_limit,
          array_length(v_genres_pretty, 1)
        )
      ],
      ' / '
    );
  end if;

  v_tone_hint :=
    public.get_movie_buff_hint_genre_clue(
      v_genres_lower
    );

  v_description_is_generic :=
    coalesce(v_sanitized_description, '') ~* '^A .* movie from .* released in \d{4}\.( Directed by .+\.)?$';

  if
    v_difficulty = 'easy'
    and v_sanitized_description is not null
    and not v_description_is_generic
  then
    return v_sanitized_description;
  end if;

  if
    nullif(trim(coalesce(p_prompt, '')), '') is not null
    and trim(p_prompt) !~* '^Name the movie from this 30-second montage'
  then
    v_prompt_hint := regexp_replace(
      trim(p_prompt),
      '\s+Name the movie\.?$',
      '',
      'i'
    );

    v_fallback_hint := public.sanitize_movie_buff_hint_text(
      v_prompt_hint
    );
  end if;

  if
    v_genre_phrase is not null
    and v_country_phrase is not null
    and p_release_year is not null
  then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A %s movie from the %ss.',
        v_genre_phrase,
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A %s movie from %s released in %s.',
        v_genre_phrase,
        v_country_phrase,
        p_release_year
      );
    end if;
  elsif v_genre_phrase is not null and p_release_year is not null then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A %s movie from the %ss.',
        v_genre_phrase,
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A %s movie released in %s.',
        v_genre_phrase,
        p_release_year
      );
    end if;
  elsif v_genre_phrase is not null and v_country_phrase is not null then
    v_base_hint := format(
      'A %s movie from %s.',
      v_genre_phrase,
      v_country_phrase
    );
  elsif v_genre_phrase is not null then
    v_base_hint := format(
      'A %s movie.',
      v_genre_phrase
    );
  elsif p_release_year is not null then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A movie from the %ss.',
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A movie released in %s.',
        p_release_year
      );
    end if;
  end if;

  if v_base_hint is null then
    if v_sanitized_description is not null then
      return v_sanitized_description;
    end if;

    return v_fallback_hint;
  end if;

  if v_difficulty = 'easy' then
    if v_tone_hint is not null and nullif(trim(coalesce(p_director, '')), '') is not null then
      return format(
        '%s %s Directed by %s.',
        v_base_hint,
        v_tone_hint,
        trim(p_director)
      );
    end if;

    if v_tone_hint is not null then
      return format(
        '%s %s',
        v_base_hint,
        v_tone_hint
      );
    end if;

    if nullif(trim(coalesce(p_director, '')), '') is not null then
      return format(
        '%s Directed by %s.',
        v_base_hint,
        trim(p_director)
      );
    end if;

    return v_base_hint;
  end if;

  if v_difficulty = 'medium' then
    if v_tone_hint is not null then
      return format(
        '%s %s',
        v_base_hint,
        v_tone_hint
      );
    end if;

    return v_base_hint;
  end if;

  return v_base_hint;
end;
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

notify pgrst, 'reload schema';
-- <<< END 202607291230_movie_buff_progressive_hints.sql

-- >>> BEGIN 202607291330_movie_buff_public_matchmaking.sql
create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 4
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  select gr.*
  into v_existing_room
  from public.game_rooms as gr
  join public.room_players as rp
    on rp.room_id = gr.id
   and rp.player_id = v_user_id
   and rp.left_at is null
  where gr.room_type = 'public'
    and gr.status = 'waiting'
  order by gr.created_at asc
  limit 1;

  if found then
    return v_existing_room;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return v_candidate_room;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  return v_candidate_room;
end;
$$;

revoke all on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer) from public;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;
-- <<< END 202607291330_movie_buff_public_matchmaking.sql

-- >>> BEGIN 202607291430_movie_buff_leave_room_rpc.sql
create or replace function public.leave_movie_buff_room(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_departing_player public.room_players%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null
  returning *
  into v_departing_player;

  if not found then
    return v_room;
  end if;

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    update public.game_rooms
    set status =
          case
            when status in ('finished', 'cancelled') then status
            else 'cancelled'
          end,
        finished_at =
          case
            when status = 'active' and finished_at is null
              then timezone('utc', now())
            else finished_at
          end
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if v_room.host_id = auth.uid()
     or coalesce(v_departing_player.is_host, false) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    if v_next_host_id is not null then
      update public.room_players
      set is_host = (
        player_id = v_next_host_id
        and left_at is null
      )
      where room_id = p_room_id;

      update public.game_rooms
      set host_id = v_next_host_id
      where id = p_room_id
      returning *
      into v_room;

      return v_room;
    end if;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
$$;

grant execute on function public.leave_movie_buff_room(uuid) to authenticated;
-- <<< END 202607291430_movie_buff_leave_room_rpc.sql

-- >>> BEGIN 202607291530_movie_buff_hint_bonus_breakout.sql
drop function if exists public.submit_movie_buff_answer(
  uuid,
  text
);

create function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    mr.playback_started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  if v_elapsed_seconds > v_effective_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    greatest(
      v_speed_bonus - v_applied_hint_bonus,
      0
    ),
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

drop function if exists public.get_movie_buff_round_results(
  uuid,
  uuid
);

create function public.get_movie_buff_round_results(
  p_room_id uuid,
  p_round_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception
      'You are not an active player in this room.';
  end if;

  select mr.match_id
  into v_match_id
  from public.match_rounds as mr
  join public.matches as m
    on m.id = mr.match_id
  where mr.id = p_round_id
    and m.room_id = p_room_id
  limit 1;

  if v_match_id is null then
    raise exception
      'The requested round does not belong to this room.';
  end if;

  return query
  with current_round as (
    select
      v_room.status as room_status,
      v_room.host_id = auth.uid() as is_host,
      mr.id as round_id,
      mr.round_number,
      v_room.total_rounds,
      mo.title as movie_title,
      mo.release_year,
      mo.director,
      mr.time_limit_seconds,
      my_answer.submitted_answer,
      coalesce(
        my_answer.is_correct,
        false
      ) as is_correct,
      coalesce(
        my_answer.base_points,
        0
      ) as base_points,
      coalesce(
        my_answer.speed_bonus,
        0
      ) as raw_speed_bonus,
      coalesce(
        my_answer.streak_bonus,
        0
      ) as streak_bonus,
      coalesce(
        my_answer.total_points,
        0
      ) as total_points,
      coalesce(
        my_answer.response_time_ms,
        0
      ) as response_time_ms,
      my_hint.used_at as hint_used_at,
      coalesce(
        my_hint.penalty_seconds,
        0
      ) as hint_penalty_seconds
    from public.match_rounds as mr
    join public.clips as c
      on c.id = mr.clip_id
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.answers as my_answer
      on my_answer.round_id = mr.id
     and my_answer.player_id =
       auth.uid()
    left join public.match_round_player_hints as my_hint
      on my_hint.round_id = mr.id
     and my_hint.player_id = auth.uid()
    where mr.id = p_round_id
      and mr.match_id = v_match_id
  ),
  normalized as (
    select
      *,
      case
        when
          is_correct
          and hint_used_at is not null
          and response_time_ms = 0
        then
          greatest(
            raw_speed_bonus -
            greatest(
              0,
              least(
                300,
                greatest(
                  0,
                  time_limit_seconds -
                  hint_penalty_seconds
                ) * 10
              )
            ),
            0
          )
        else 0
      end as hint_bonus
    from current_round
  )
  select
    normalized.room_status,
    normalized.is_host,
    normalized.round_id,
    normalized.round_number,
    normalized.total_rounds,
    normalized.movie_title,
    normalized.release_year,
    normalized.director,
    normalized.submitted_answer,
    normalized.is_correct,
    normalized.base_points,
    greatest(
      normalized.raw_speed_bonus -
      normalized.hint_bonus,
      0
    ),
    normalized.hint_bonus,
    normalized.streak_bonus,
    normalized.total_points,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'round_points',
            standing.round_points,
            'is_correct',
            standing.is_correct
          )
          order by
            standing.score desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(
                p.display_name,
                ''
              ),
              nullif(
                p.username,
                ''
              ),
              'Player ' ||
                left(
                  rp.player_id::text,
                  6
                )
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(
              a.total_points,
              0
            ) as round_points,
            coalesce(
              a.is_correct,
              false
            ) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = p_round_id
           and a.player_id =
             rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from normalized;
end;
$$;

grant execute on function
  public.submit_movie_buff_answer(
    uuid,
    text
  )
to authenticated;

grant execute on function
  public.get_movie_buff_round_results(
    uuid,
    uuid
  )
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291530_movie_buff_hint_bonus_breakout.sql

-- >>> BEGIN 202607291600_movie_buff_public_matchmaking_room_reuse_fix.sql
create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return v_compatible_room;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return v_candidate_room;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  return v_candidate_room;
end;
$$;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291600_movie_buff_public_matchmaking_room_reuse_fix.sql

-- >>> BEGIN 202607291730_movie_buff_atomic_private_join.sql
create or replace function public.join_movie_buff_room(
  p_room_code text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_existing_player public.room_players%rowtype;
  v_active_players integer := 0;
  v_normalized_code text := upper(trim(coalesce(p_room_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_normalized_code = '' then
    raise exception 'Room code is required.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where room_code = v_normalized_code
    and status = 'waiting'
  for update;

  if not found then
    raise exception 'Room not found or is no longer accepting players.';
  end if;

  select *
  into v_existing_player
  from public.room_players
  where room_id = v_room.id
    and player_id = auth.uid()
  limit 1;

  if found and v_existing_player.left_at is null then
    return v_room;
  end if;

  select count(*)::integer
  into v_active_players
  from public.room_players as rp
  where rp.room_id = v_room.id
    and rp.left_at is null;

  if v_active_players >= v_room.max_players then
    raise exception 'This room is full.';
  end if;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host,
    left_at
  )
  values (
    v_room.id,
    auth.uid(),
    false,
    false,
    null
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = false,
        left_at = null;

  return v_room;
end;
$$;

grant execute on function public.join_movie_buff_room(text) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291730_movie_buff_atomic_private_join.sql

-- >>> BEGIN 202607291800_movie_buff_hide_hint_until_used.sql
create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

grant execute on function public.get_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291800_movie_buff_hide_hint_until_used.sql

-- >>> BEGIN 202607291900_movie_buff_per_player_playback.sql
create table if not exists public.match_round_player_playback (
  round_id uuid not null
    references public.match_rounds(id)
    on delete cascade,
  player_id uuid not null
    references auth.users(id)
    on delete cascade,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (round_id, player_id)
);

create index if not exists match_round_player_playback_player_id_idx
  on public.match_round_player_playback (player_id);

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    player_playback.started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.start_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update of mr;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  update public.match_rounds
  set started_at = coalesce(started_at, now())
  where id = v_round_id;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now()
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id
  into
    v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  select player_playback.started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    player_playback.started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  if v_elapsed_seconds > v_effective_time_limit then
    raise exception 'Time has expired for this round.';
  end if;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    greatest(
      v_speed_bonus - v_applied_hint_bonus,
      0
    ),
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

revoke all on table public.match_round_player_playback from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291900_movie_buff_per_player_playback.sql

-- >>> BEGIN 202607291910_movie_buff_hint_lock_fix.sql
create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id
  into
    v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  select player_playback.started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291910_movie_buff_hint_lock_fix.sql

-- >>> BEGIN 202607291930_movie_buff_round_completion_fairness.sql
create or replace function public.movie_buff_preplay_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is null then
    if
      p_round_started_at is not null
      and floor(
        extract(
          epoch from (
            now() - p_round_started_at
          )
        )
      )::integer >=
        public.movie_buff_preplay_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  return greatest(
    0,
    v_effective_time_limit -
    greatest(
      0,
      floor(
        extract(
          epoch from (
            now() - v_playback_started_at
          )
        )
      )::integer
    )
  );
end;
$$;

create or replace function public.is_movie_buff_round_player_finished(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return
    public.get_movie_buff_round_player_time_left(
      p_round_id,
      p_player_id,
      p_round_started_at,
      p_time_limit_seconds
    ) <= 0;
end;
$$;

create or replace function public.get_movie_buff_round_completion(
  p_room_id uuid,
  p_round_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns table (
  result_players_total integer,
  result_players_finished integer,
  result_round_complete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::integer as result_players_total,
    coalesce(
      sum(
        case when progress.finished then 1 else 0 end
      ),
      0
    )::integer as result_players_finished,
    coalesce(
      bool_and(progress.finished),
      false
    ) as result_round_complete
  from (
    select
      public.is_movie_buff_round_player_finished(
        p_round_id,
        rp.player_id,
        p_round_started_at,
        p_time_limit_seconds
      ) as finished
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
  ) as progress;
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_time_left_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    player_playback.started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_time_left_seconds,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = coalesce(started_at, now()),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  return query
  select v_match_id, v_round_id;
end;
$$;

create or replace function public.start_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  update public.match_rounds
  set started_at = coalesce(started_at, now())
  where id = v_round_id
  returning started_at into v_started_at;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now()
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_started_at timestamptz;
  v_time_limit_seconds integer;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  select player_playback.started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_time_left_seconds integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_answer_id uuid;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    player_playback.started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit
    );

  if v_time_left_seconds <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    v_elapsed_seconds * 1000,
    v_base_points,
    v_speed_bonus,
    v_streak_bonus
  )
  returning id into v_answer_id;

  update public.room_players as rp
  set
    score = v_new_score,
    lives = v_new_lives,
    current_streak = v_new_streak
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid();

  update public.match_players as mp
  set
    final_score = v_new_score,
    correct_answers =
      mp.correct_answers +
      case when v_is_correct then 1 else 0 end,
    incorrect_answers =
      mp.incorrect_answers +
      case when v_is_correct then 0 else 1 end
  where mp.match_id = v_match_id
    and mp.player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    greatest(
      v_speed_bonus - v_applied_hint_bonus,
      0
    ),
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    v_movie_title;
end;
$$;

drop function if exists public.get_movie_buff_round_results(
  uuid,
  uuid
);

create function public.get_movie_buff_round_results(
  p_room_id uuid,
  p_round_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_round_complete boolean,
  result_players_finished integer,
  result_players_total integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception
      'You are not an active player in this room.';
  end if;

  select mr.match_id
  into v_match_id
  from public.match_rounds as mr
  join public.matches as m
    on m.id = mr.match_id
  where mr.id = p_round_id
    and m.room_id = p_room_id
  limit 1;

  if v_match_id is null then
    raise exception
      'The requested round does not belong to this room.';
  end if;

  return query
  with current_round as (
    select
      v_room.status as room_status,
      v_room.host_id = auth.uid() as is_host,
      mr.id as round_id,
      mr.round_number,
      v_room.total_rounds,
      mr.started_at,
      mo.title as movie_title,
      mo.release_year,
      mo.director,
      mr.time_limit_seconds,
      my_answer.submitted_answer,
      coalesce(
        my_answer.is_correct,
        false
      ) as is_correct,
      coalesce(
        my_answer.base_points,
        0
      ) as base_points,
      coalesce(
        my_answer.speed_bonus,
        0
      ) as raw_speed_bonus,
      coalesce(
        my_answer.streak_bonus,
        0
      ) as streak_bonus,
      coalesce(
        my_answer.total_points,
        0
      ) as total_points,
      coalesce(
        my_answer.response_time_ms,
        0
      ) as response_time_ms,
      my_hint.used_at as hint_used_at,
      coalesce(
        my_hint.penalty_seconds,
        0
      ) as hint_penalty_seconds
    from public.match_rounds as mr
    join public.clips as c
      on c.id = mr.clip_id
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.answers as my_answer
      on my_answer.round_id = mr.id
     and my_answer.player_id =
       auth.uid()
    left join public.match_round_player_hints as my_hint
      on my_hint.round_id = mr.id
     and my_hint.player_id = auth.uid()
    where mr.id = p_round_id
      and mr.match_id = v_match_id
  ),
  normalized as (
    select
      *,
      case
        when
          is_correct
          and hint_used_at is not null
          and response_time_ms = 0
        then
          greatest(
            raw_speed_bonus -
            greatest(
              0,
              least(
                300,
                greatest(
                  0,
                  time_limit_seconds -
                  hint_penalty_seconds
                ) * 10
              )
            ),
            0
          )
        else 0
      end as hint_bonus
    from current_round
  )
  select
    normalized.room_status,
    normalized.is_host,
    normalized.round_id,
    normalized.round_number,
    normalized.total_rounds,
    normalized.movie_title,
    normalized.release_year,
    normalized.director,
    normalized.submitted_answer,
    normalized.is_correct,
    normalized.base_points,
    greatest(
      normalized.raw_speed_bonus -
      normalized.hint_bonus,
      0
    ),
    normalized.hint_bonus,
    normalized.streak_bonus,
    normalized.total_points,
    progress.result_round_complete,
    progress.result_players_finished,
    progress.result_players_total,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'round_points',
            standing.round_points,
            'is_correct',
            standing.is_correct
          )
          order by
            standing.score desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(
                p.display_name,
                ''
              ),
              nullif(
                p.username,
                ''
              ),
              'Player ' ||
                left(
                  rp.player_id::text,
                  6
                )
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(
              a.total_points,
              0
            ) as round_points,
            coalesce(
              a.is_correct,
              false
            ) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = p_round_id
           and a.player_id =
             rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from normalized
  cross join lateral public.get_movie_buff_round_completion(
    p_room_id,
    p_round_id,
    normalized.started_at,
    normalized.time_limit_seconds
  ) as progress;
end;
$$;

create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_current_round_id uuid;
  v_current_round_started_at timestamptz;
  v_current_round_time_limit integer;
  v_players_total integer;
  v_players_finished integer;
  v_round_complete boolean;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_room.current_round
  limit 1
  for update;

  if v_current_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  select
    progress.result_players_total,
    progress.result_players_finished,
    progress.result_round_complete
  into
    v_players_total,
    v_players_finished,
    v_round_complete
  from public.get_movie_buff_round_completion(
    p_room_id,
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  ) as progress;

  if not coalesce(v_round_complete, false) then
    raise exception
      'This round is still in progress. % of % players have finished.',
      coalesce(v_players_finished, 0),
      coalesce(v_players_total, 0);
  end if;

  update public.match_rounds
  set ended_at = coalesce(ended_at, now())
  where id = v_current_round_id;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    delete from public.match_round_player_playback
    where round_id = v_round_id;

    delete from public.match_round_player_hints
    where round_id = v_round_id;

    delete from public.answers
    where round_id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.movie_buff_preplay_timeout_seconds() from public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.is_movie_buff_round_player_finished(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round_completion(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_match(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;
revoke all on function public.submit_movie_buff_answer(uuid, text) from public;
revoke all on function public.get_movie_buff_round_results(uuid, uuid) from public;
revoke all on function public.advance_movie_buff_round(uuid) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_match(uuid)
to anon;

grant execute on function public.start_movie_buff_match(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;

grant execute on function public.get_movie_buff_round_results(uuid, uuid)
to authenticated;

grant execute on function public.advance_movie_buff_round(uuid)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607291930_movie_buff_round_completion_fairness.sql

-- >>> BEGIN 202607292000_movie_buff_play_entry_timeout_fix.sql
alter table if exists public.match_round_player_playback
  add column if not exists playback_started_at timestamptz;

update public.match_round_player_playback
set playback_started_at = coalesce(
  playback_started_at,
  started_at
)
where playback_started_at is null;

create or replace function public.movie_buff_round_entry_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 60;
$$;

create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_preplay_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.started_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is null then
    if v_preplay_started_at is not null then
      if
        floor(
          extract(
            epoch from (
              now() - v_preplay_started_at
            )
          )
        )::integer >=
          public.movie_buff_preplay_timeout_seconds()
      then
        return 0;
      end if;

      return v_effective_time_limit;
    end if;

    if
      p_round_started_at is not null
      and floor(
        extract(
          epoch from (
            now() - p_round_started_at
          )
        )
      )::integer >=
        public.movie_buff_round_entry_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  return greatest(
    0,
    v_effective_time_limit -
    greatest(
      0,
      floor(
        extract(
          epoch from (
            now() - v_playback_started_at
          )
        )
      )::integer
    )
  );
end;
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_round_started_at timestamptz;
  v_preplay_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_time_left_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    )
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_round_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_hint_text
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null
  )
  on conflict (round_id, player_id) do nothing;

  select
    player_playback.started_at,
    player_playback.playback_started_at,
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_playback_started_at,
    v_hint_used,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = v_round_id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = v_round_id
   and player_hint.player_id = auth.uid();

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_preplay_started_at,
    v_time_left_seconds,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.start_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now()
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    playback_started_at = coalesce(
      public.match_round_player_playback.playback_started_at,
      excluded.playback_started_at
    );

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  select player_playback.playback_started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_time_left_seconds integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_match_id uuid;
  v_answer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    player_playback.playback_started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit
    );

  if v_time_left_seconds <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    normalized_answer,
    is_correct,
    points_awarded,
    answered_at
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_submitted_normalized,
    v_is_correct,
    v_total_points,
    now()
  )
  returning id into v_answer_id;

  update public.room_players
  set
    score = v_new_score,
    current_streak = v_new_streak,
    lives = v_new_lives
  where room_id = p_room_id
    and player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus - v_applied_hint_bonus,
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    coalesce(v_movie_title, v_normalized_title);
end;
$$;

revoke all on function public.movie_buff_round_entry_timeout_seconds() from public;

notify pgrst, 'reload schema';
-- <<< END 202607292000_movie_buff_play_entry_timeout_fix.sql

-- >>> BEGIN 202607292030_movie_buff_public_room_presence_cleanup.sql
alter table if exists public.room_players
  add column if not exists last_seen_at timestamptz
  not null
  default timezone('utc', now());

update public.room_players
set last_seen_at = coalesce(
  last_seen_at,
  joined_at,
  timezone('utc', now())
)
where last_seen_at is null;

create index if not exists room_players_room_last_seen_idx
  on public.room_players (room_id, last_seen_at);

create or replace function public.movie_buff_room_presence_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 30;
$$;

create or replace function public.cleanup_movie_buff_waiting_room(
  p_room_id uuid,
  p_excluded_player_id uuid default null
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.room_type <> 'public'
     or v_room.status <> 'waiting' then
    return v_room;
  end if;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and left_at is null
    and (
      p_excluded_player_id is null
      or player_id <> p_excluded_player_id
    )
    and last_seen_at <
      timezone('utc', now()) -
      make_interval(
        secs => public.movie_buff_room_presence_timeout_seconds()
      );

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    update public.game_rooms
    set status = 'cancelled'
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
      and rp.is_host = true
  ) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    update public.room_players
    set is_host = (
      player_id = v_next_host_id
      and left_at is null
    )
    where room_id = p_room_id;

    update public.game_rooms
    set host_id = v_next_host_id
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
$$;

create or replace function public.touch_movie_buff_room_presence(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.room_players
  set last_seen_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select *
  into v_room
  from public.cleanup_movie_buff_waiting_room(
    p_room_id,
    auth.uid()
  );

  return v_room;
end;
$$;

create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  update public.game_rooms as gr
  set status = 'cancelled'
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and not exists (
      select 1
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    );

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return v_compatible_room;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and exists (
      select 1
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    )
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
        and rp.last_seen_at >=
          timezone('utc', now()) -
          make_interval(
            secs => public.movie_buff_room_presence_timeout_seconds()
          )
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    select *
    into v_candidate_room
    from public.cleanup_movie_buff_waiting_room(
      v_candidate_room.id
    );

    if v_candidate_room.status = 'waiting' then
      insert into public.room_players (
        room_id,
        player_id,
        is_ready,
        is_host,
        left_at,
        joined_at,
        last_seen_at
      )
      values (
        v_candidate_room.id,
        v_user_id,
        false,
        false,
        null,
        now(),
        timezone('utc', now())
      )
      on conflict (room_id, player_id)
      do update
        set is_ready = false,
            is_host = false,
            left_at = null,
            joined_at = now(),
            last_seen_at = timezone('utc', now());

      return v_candidate_room;
    end if;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host,
    last_seen_at
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true,
    timezone('utc', now())
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now(),
        last_seen_at = timezone('utc', now());

  return v_candidate_room;
end;
$$;

revoke all on function public.movie_buff_room_presence_timeout_seconds() from public;
revoke all on function public.cleanup_movie_buff_waiting_room(uuid, uuid) from public;
revoke all on function public.touch_movie_buff_room_presence(uuid) from public;

grant execute on function public.touch_movie_buff_room_presence(uuid)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607292030_movie_buff_public_room_presence_cleanup.sql

-- >>> BEGIN 202607292100_movie_buff_single_open_room_membership.sql
with ranked_open_memberships as (
  select
    rp.room_id,
    rp.player_id,
    row_number() over (
      partition by rp.player_id
      order by rp.joined_at desc, rp.room_id desc
    ) as membership_rank
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where rp.left_at is null
    and gr.status in ('waiting', 'starting', 'active')
)
update public.room_players as rp
set is_ready = false,
    is_host = false,
    left_at = timezone('utc', now())
from ranked_open_memberships as ranked
where rp.room_id = ranked.room_id
  and rp.player_id = ranked.player_id
  and ranked.membership_rank > 1;

update public.game_rooms as gr
set status =
      case
        when gr.status in ('finished', 'cancelled') then gr.status
        else 'cancelled'
      end,
    finished_at =
      case
        when gr.status = 'active' and gr.finished_at is null
          then timezone('utc', now())
        else gr.finished_at
      end
where gr.status in ('waiting', 'starting', 'active')
  and not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = gr.id
      and rp.left_at is null
  );

with next_hosts as (
  select distinct on (rp.room_id)
    rp.room_id,
    rp.player_id as next_host_id
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where gr.status in ('waiting', 'starting', 'active')
    and rp.left_at is null
    and not exists (
      select 1
      from public.room_players as active_host
      where active_host.room_id = rp.room_id
        and active_host.left_at is null
        and active_host.is_host = true
    )
  order by rp.room_id, rp.joined_at asc, rp.player_id asc
)
update public.room_players as rp
set is_host = (
  rp.player_id = next_hosts.next_host_id
  and rp.left_at is null
)
from next_hosts
where rp.room_id = next_hosts.room_id;

with next_hosts as (
  select distinct on (rp.room_id)
    rp.room_id,
    rp.player_id as next_host_id
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where gr.status in ('waiting', 'starting', 'active')
    and rp.left_at is null
    and rp.is_host = true
  order by rp.room_id, rp.joined_at asc, rp.player_id asc
)
update public.game_rooms as gr
set host_id = next_hosts.next_host_id
from next_hosts
where gr.id = next_hosts.room_id;

create or replace function public.enforce_movie_buff_single_open_room_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.left_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.room_players as rp
    join public.game_rooms as gr
      on gr.id = rp.room_id
    where rp.player_id = new.player_id
      and rp.left_at is null
      and rp.room_id <> new.room_id
      and gr.status in ('waiting', 'starting', 'active')
  ) then
    raise exception 'You are already in another Movie Buff room. Leave that room before joining a new one.';
  end if;

  return new;
end;
$$;

drop trigger if exists room_players_single_open_room_membership_trg
on public.room_players;

create trigger room_players_single_open_room_membership_trg
before insert or update of player_id, room_id, left_at
on public.room_players
for each row
execute function public.enforce_movie_buff_single_open_room_membership();

notify pgrst, 'reload schema';
-- <<< END 202607292100_movie_buff_single_open_room_membership.sql

-- >>> BEGIN 202607292230_movie_buff_launch_security_hardening.sql
create or replace function public.is_movie_buff_room_member(
  p_room_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.game_rooms as gr
    where gr.id = p_room_id
      and (
        gr.host_id = auth.uid()
        or exists (
          select 1
          from public.room_players as rp
          where rp.room_id = gr.id
            and rp.player_id = auth.uid()
            and rp.left_at is null
        )
      )
  );
$$;

create or replace function public.is_movie_buff_match_member(
  p_match_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.match_players as mp
    where mp.match_id = p_match_id
      and mp.player_id = auth.uid()
  );
$$;

create or replace function public.is_movie_buff_round_member(
  p_round_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.match_rounds as mr
    join public.match_players as mp
      on mp.match_id = mr.match_id
    where mr.id = p_round_id
      and mp.player_id = auth.uid()
  );
$$;

create or replace function public.set_movie_buff_player_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update ready status.';
  end if;

  if not exists (
    select 1
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
    where gr.id = p_room_id
      and gr.status = 'waiting'
      and rp.player_id = v_user_id
      and rp.left_at is null
  ) then
    raise exception 'You can only change ready status for your current waiting room.';
  end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id
    and player_id = v_user_id
    and left_at is null;

  if not found then
    raise exception 'Ready status could not be updated.';
  end if;
end;
$$;

revoke all on function public.is_movie_buff_room_member(uuid) from public;
revoke all on function public.is_movie_buff_match_member(uuid) from public;
revoke all on function public.is_movie_buff_round_member(uuid) from public;
revoke all on function public.set_movie_buff_player_ready(uuid, boolean) from public;

grant execute on function public.is_movie_buff_room_member(uuid) to authenticated;
grant execute on function public.is_movie_buff_match_member(uuid) to authenticated;
grant execute on function public.is_movie_buff_round_member(uuid) to authenticated;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean) to authenticated;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_playback enable row level security;

drop policy if exists "Players can view rooms" on public.game_rooms;
drop policy if exists "game_rooms_select" on public.game_rooms;
drop policy if exists "Hosts update their rooms" on public.game_rooms;
drop policy if exists "game_rooms_update" on public.game_rooms;
drop policy if exists "game_rooms_delete" on public.game_rooms;

create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (public.is_movie_buff_room_member(id));

create policy "game_rooms_delete"
on public.game_rooms
for delete
to authenticated
using (
  auth.uid() = host_id
  and status = 'waiting'
  and current_round = 0
  and not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = public.game_rooms.id
  )
);

drop policy if exists "Players view room members" on public.room_players;
drop policy if exists "room_players_select" on public.room_players;
drop policy if exists "Players join rooms" on public.room_players;
drop policy if exists "room_players_insert" on public.room_players;
drop policy if exists "Players update their room status" on public.room_players;
drop policy if exists "room_players_update" on public.room_players;
drop policy if exists "Players leave rooms" on public.room_players;
drop policy if exists "room_players_delete" on public.room_players;

create policy "room_players_select"
on public.room_players
for select
to authenticated
using (
  player_id = auth.uid()
  or (
    left_at is null
    and public.is_movie_buff_room_member(room_id)
  )
);

create policy "room_players_insert"
on public.room_players
for insert
to authenticated
with check (
  player_id = auth.uid()
  and exists (
    select 1
    from public.game_rooms as gr
    where gr.id = room_id
      and gr.host_id = auth.uid()
      and gr.status = 'waiting'
      and gr.current_round = 0
  )
);

drop policy if exists "Players view their matches" on public.matches;

create policy "Players view their matches"
on public.matches
for select
to authenticated
using (public.is_movie_buff_match_member(id));

drop policy if exists "Players view match participants" on public.match_players;

create policy "Players view match participants"
on public.match_players
for select
to authenticated
using (
  player_id = auth.uid()
  or public.is_movie_buff_match_member(match_id)
);

drop policy if exists "Players view match rounds" on public.match_rounds;

create policy "Players view match rounds"
on public.match_rounds
for select
to authenticated
using (public.is_movie_buff_match_member(match_id));

drop policy if exists "Players submit their own answers" on public.answers;
drop policy if exists "Players view answers from their matches" on public.answers;

create policy "Players view answers from their matches"
on public.answers
for select
to authenticated
using (
  player_id = auth.uid()
  or public.is_movie_buff_round_member(round_id)
);

create policy "Players view their own hint state"
on public.match_round_player_hints
for select
to authenticated
using (
  player_id = auth.uid()
  and public.is_movie_buff_round_member(round_id)
);

create policy "Players view their own playback state"
on public.match_round_player_playback
for select
to authenticated
using (
  player_id = auth.uid()
  and public.is_movie_buff_round_member(round_id)
);

notify pgrst, 'reload schema';
-- <<< END 202607292230_movie_buff_launch_security_hardening.sql

-- >>> BEGIN 202607292240_movie_buff_security_policy_regression_fix.sql
drop policy if exists "game_rooms_select" on public.game_rooms;

create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (
  host_id = auth.uid()
  or public.is_movie_buff_room_member(id)
);

notify pgrst, 'reload schema';
-- <<< END 202607292240_movie_buff_security_policy_regression_fix.sql

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_round_started_at timestamptz;
  v_preplay_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_time_left_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    )
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_round_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_hint_text
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  select
    player_playback.started_at,
    player_playback.playback_started_at,
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_playback_started_at,
    v_hint_used,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = v_round_id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = v_round_id
   and player_hint.player_id = auth.uid();

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_preplay_started_at,
    v_time_left_seconds,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.enter_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.enter_movie_buff_round(uuid) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.enter_movie_buff_round(uuid)
to authenticated;
-- <<< END 202607292300_movie_buff_enter_round_gate.sql

-- >>> BEGIN 202607292310_movie_buff_answer_insert_schema_fix.sql
create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_time_left_seconds integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_match_id uuid;
  v_answer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    player_playback.playback_started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit
    );

  if v_time_left_seconds <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus,
    submitted_at
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    greatest(
      0,
      case
        when v_playback_started_at is null then
          0
        else
          v_elapsed_seconds * 1000
      end
    ),
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    now()
  )
  returning id into v_answer_id;

  update public.room_players
  set
    score = v_new_score,
    current_streak = v_new_streak,
    lives = v_new_lives
  where room_id = p_room_id
    and player_id = auth.uid();

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus - v_applied_hint_bonus,
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    coalesce(v_movie_title, v_normalized_title);
end;
$$;

revoke all on function public.submit_movie_buff_answer(uuid, text) from public;

grant execute on function public.submit_movie_buff_answer(uuid, text)
to authenticated;
-- <<< END 202607292310_movie_buff_answer_insert_schema_fix.sql

-- >>> BEGIN 202607300001_movie_buff_runtime_clip_service_role.sql
grant select
on table
  public.match_rounds,
  public.clips,
  public.movies
to service_role;

notify pgrst, 'reload schema';
-- <<< END 202607300001_movie_buff_runtime_clip_service_role.sql

-- >>> BEGIN 202607300100_movie_buff_clip_analytics_and_round_timing.sql
alter table if exists public.match_round_player_playback
  alter column started_at drop not null;

alter table if exists public.match_round_player_playback
  add column if not exists play_requested_at timestamptz;

create table if not exists public.movie_buff_round_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (
      event_type in (
        'room_created',
        'player_joined',
        'player_ready',
        'round_started',
        'media_ready',
        'clip_loaded',
        'clip_start_requested',
        'clip_started',
        'hint_requested',
        'answer_submitted',
        'answer_correct',
        'answer_wrong',
        'timeout',
        'player_left',
        'match_completed',
        'match_abandoned',
        'clip_failed_to_load'
      )
    ),
  room_id uuid
    references public.game_rooms(id)
    on delete set null,
  match_id uuid
    references public.matches(id)
    on delete set null,
  round_id uuid
    references public.match_rounds(id)
    on delete set null,
  player_id uuid
    references auth.users(id)
    on delete set null,
  content_id uuid
    references public.content_items(id)
    on delete set null,
  content_media_id uuid
    references public.content_media(id)
    on delete set null,
  legacy_clip_id uuid
    references public.clips(id)
    on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists movie_buff_round_events_event_type_idx
  on public.movie_buff_round_events(event_type);

create index if not exists movie_buff_round_events_room_idx
  on public.movie_buff_round_events(room_id, occurred_at desc);

create index if not exists movie_buff_round_events_match_idx
  on public.movie_buff_round_events(match_id, occurred_at desc);

create index if not exists movie_buff_round_events_round_idx
  on public.movie_buff_round_events(round_id, occurred_at desc);

create index if not exists movie_buff_round_events_player_idx
  on public.movie_buff_round_events(player_id, occurred_at desc);

create index if not exists movie_buff_round_events_clip_idx
  on public.movie_buff_round_events(content_media_id, occurred_at desc);

create index if not exists movie_buff_round_events_movie_idx
  on public.movie_buff_round_events(content_id, occurred_at desc);

create table if not exists public.movie_buff_clip_analytics (
  content_media_id uuid primary key
    references public.content_media(id)
    on delete cascade,
  content_id uuid not null
    references public.content_items(id)
    on delete cascade,
  legacy_clip_id uuid unique
    references public.clips(id)
    on delete set null,
  total_plays integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  total_hints_used integer not null default 0,
  total_timeouts integer not null default 0,
  total_load_success integer not null default 0,
  total_load_failures integer not null default 0,
  avg_answer_time_seconds numeric(10,2) not null default 0,
  last_played_at timestamptz,
  last_loaded_at timestamptz,
  sample_size integer not null default 0,
  difficulty_score numeric(6,2) not null default 50,
  system_difficulty_label text not null default 'Buff'
    check (
      system_difficulty_label in (
        'Rookie',
        'Buff',
        'Buffster'
      )
    ),
  quality_score numeric(6,2) not null default 100,
  rotation_score numeric(6,2) not null default 50,
  rotation_weight numeric(10,2) not null default 50,
  admin_boost smallint not null default 0
    check (
      admin_boost between -3 and 3
    ),
  status text not null default 'active'
    check (
      status in (
        'active',
        'featured',
        'cooling_down',
        'retired',
        'test_only'
      )
    ),
  quality_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists movie_buff_clip_analytics_content_idx
  on public.movie_buff_clip_analytics(content_id);

create index if not exists movie_buff_clip_analytics_status_idx
  on public.movie_buff_clip_analytics(status);

create index if not exists movie_buff_clip_analytics_rotation_idx
  on public.movie_buff_clip_analytics(rotation_weight desc);

create table if not exists public.movie_buff_movie_analytics (
  content_id uuid primary key
    references public.content_items(id)
    on delete cascade,
  total_clip_count integer not null default 0,
  playable_clip_count integer not null default 0,
  total_plays integer not null default 0,
  total_hints_used integer not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.movie_buff_playback_launch_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 20;
$$;

create or replace function public.movie_buff_clip_confidence_factor(
  p_total_plays integer
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select least(
    1::numeric,
    greatest(
      0::numeric,
      coalesce(p_total_plays, 0)::numeric / 8::numeric
    )
  );
$$;

create or replace function public.movie_buff_clip_difficulty_score(
  p_total_plays integer,
  p_total_correct integer,
  p_total_hints integer,
  p_avg_answer_time_seconds numeric,
  p_time_limit_seconds integer default 30
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_safe_plays numeric := greatest(
    1::numeric,
    coalesce(p_total_plays, 0)::numeric
  );
  v_correct_rate numeric;
  v_hint_rate numeric;
  v_solve_ratio numeric;
  v_confidence numeric;
  v_raw numeric;
begin
  v_correct_rate := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_total_correct, 0)::numeric / v_safe_plays
    )
  );

  v_hint_rate := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_total_hints, 0)::numeric / v_safe_plays
    )
  );

  v_solve_ratio := greatest(
    0::numeric,
    least(
      1::numeric,
      coalesce(p_avg_answer_time_seconds, 0)::numeric /
        greatest(
          1::numeric,
          coalesce(p_time_limit_seconds, 30)::numeric
        )
    )
  );

  v_confidence := public.movie_buff_clip_confidence_factor(
    p_total_plays
  );

  v_raw := (
    ((1::numeric - v_correct_rate) * 0.62::numeric) +
    (v_hint_rate * 0.20::numeric) +
    (v_solve_ratio * 0.18::numeric)
  ) * 100::numeric;

  return round(
    (
      50::numeric +
      ((v_raw - 50::numeric) * v_confidence)
    )::numeric,
    2
  );
end;
$$;

create or replace function public.movie_buff_clip_difficulty_label(
  p_difficulty_score numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_difficulty_score, 50) < 35 then 'Rookie'
    when coalesce(p_difficulty_score, 50) < 60 then 'Buff'
    else 'Buffster'
  end;
$$;

create or replace function public.movie_buff_clip_quality_score(
  p_quality_flags jsonb,
  p_total_load_success integer,
  p_total_load_failures integer,
  p_total_timeouts integer,
  p_total_plays integer
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_score numeric := 100;
  v_flag text;
  v_total_load_attempts numeric := greatest(
    1::numeric,
    coalesce(p_total_load_success, 0)::numeric +
      coalesce(p_total_load_failures, 0)::numeric
  );
  v_safe_plays numeric := greatest(
    1::numeric,
    coalesce(p_total_plays, 0)::numeric
  );
begin
  for v_flag in
    select jsonb_array_elements_text(
      coalesce(p_quality_flags, '[]'::jsonb)
    )
  loop
    v_score := v_score - case v_flag
      when 'title_card' then 22
      when 'credits' then 18
      when 'giveaway_text' then 20
      when 'bad_audio' then 14
      when 'dead_air' then 10
      when 'obvious_character' then 12
      when 'broken_playback' then 60
      else 0
    end;
  end loop;

  v_score := v_score -
    (
      (
        coalesce(p_total_load_failures, 0)::numeric /
        v_total_load_attempts
      ) * 45::numeric
    ) -
    (
      (
        coalesce(p_total_timeouts, 0)::numeric /
        v_safe_plays
      ) * 20::numeric
    );

  return round(
    greatest(0::numeric, v_score),
    2
  );
end;
$$;

create or replace function public.movie_buff_clip_rotation_score(
  p_quality_score numeric,
  p_total_plays integer,
  p_last_played_at timestamptz,
  p_admin_boost smallint,
  p_status text
)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text := lower(coalesce(p_status, 'active'));
  v_hours_since_last_play numeric;
  v_freshness_factor numeric;
  v_sample_factor numeric;
  v_admin_factor numeric;
  v_feature_bonus numeric := 0;
  v_score numeric;
begin
  if v_status in ('retired', 'test_only', 'cooling_down') then
    return 0;
  end if;

  if coalesce(p_quality_score, 0) < 45 then
    return 0;
  end if;

  if p_last_played_at is null then
    v_hours_since_last_play := 168;
  else
    v_hours_since_last_play := greatest(
      0::numeric,
      extract(
        epoch from (
          now() - p_last_played_at
        )
      ) / 3600::numeric
    );
  end if;

  v_freshness_factor := least(
    1.4::numeric,
    0.65::numeric +
      least(v_hours_since_last_play, 168::numeric) /
      224::numeric
  );

  v_sample_factor := least(
    1::numeric,
    greatest(
      0.35::numeric,
      coalesce(p_total_plays, 0)::numeric /
        10::numeric
    )
  );

  if v_status = 'featured' then
    v_feature_bonus := 0.15::numeric;
  end if;

  v_admin_factor := greatest(
    0.2::numeric,
    1::numeric +
      (coalesce(p_admin_boost, 0)::numeric * 0.12::numeric) +
      v_feature_bonus
  );

  v_score := coalesce(p_quality_score, 0) *
    v_freshness_factor *
    v_sample_factor *
    v_admin_factor / 1.4::numeric;

  return round(
    least(100::numeric, greatest(0::numeric, v_score)),
    2
  );
end;
$$;

create or replace function public.movie_buff_requested_difficulty_label(
  p_difficulty text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_difficulty, 'mixed'))
    when 'easy' then 'Rookie'
    when 'medium' then 'Buff'
    when 'hard' then 'Buffster'
    when 'expert' then 'Buffster'
    else null
  end;
$$;

create or replace function public.movie_buff_refresh_movie_analytics(
  p_content_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_clip_count integer := 0;
  v_playable_clip_count integer := 0;
  v_total_plays integer := 0;
  v_total_hints_used integer := 0;
  v_last_played_at timestamptz;
begin
  if p_content_id is null then
    return;
  end if;

  select
    count(*),
    count(*) filter (
      where cm.media_type in ('video', 'audio')
        and cm.is_active = true
        and cm.is_hidden = false
        and cm.legacy_clip_id is not null
        and coalesce(ca.status, 'active') not in ('retired', 'test_only', 'cooling_down')
        and coalesce(ca.quality_score, 100) >= 45
        and coalesce(ca.rotation_weight, 50) > 0
    ),
    coalesce(sum(coalesce(ca.total_plays, 0)), 0),
    coalesce(sum(coalesce(ca.total_hints_used, 0)), 0),
    max(ca.last_played_at)
  into
    v_total_clip_count,
    v_playable_clip_count,
    v_total_plays,
    v_total_hints_used,
    v_last_played_at
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.content_id = p_content_id;

  insert into public.movie_buff_movie_analytics (
    content_id,
    total_clip_count,
    playable_clip_count,
    total_plays,
    total_hints_used,
    last_played_at,
    updated_at
  )
  values (
    p_content_id,
    coalesce(v_total_clip_count, 0),
    coalesce(v_playable_clip_count, 0),
    coalesce(v_total_plays, 0),
    coalesce(v_total_hints_used, 0),
    v_last_played_at,
    timezone('utc', now())
  )
  on conflict (content_id) do update
  set
    total_clip_count = excluded.total_clip_count,
    playable_clip_count = excluded.playable_clip_count,
    total_plays = excluded.total_plays,
    total_hints_used = excluded.total_hints_used,
    last_played_at = excluded.last_played_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.movie_buff_refresh_clip_analytics(
  p_content_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_id uuid;
  v_legacy_clip_id uuid;
  v_quality_flags jsonb := '[]'::jsonb;
  v_status text := 'active';
  v_admin_boost smallint := 0;
  v_total_plays integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_total_hints integer := 0;
  v_total_timeouts integer := 0;
  v_total_load_success integer := 0;
  v_total_load_failures integer := 0;
  v_avg_answer_time_seconds numeric := 0;
  v_last_played_at timestamptz;
  v_last_loaded_at timestamptz;
  v_difficulty_score numeric := 50;
  v_quality_score numeric := 100;
  v_rotation_score numeric := 50;
begin
  if p_content_media_id is null then
    return;
  end if;

  select
    cm.content_id,
    cm.legacy_clip_id,
    coalesce(ca.quality_flags, '[]'::jsonb),
    coalesce(ca.status, 'active'),
    coalesce(ca.admin_boost, 0)
  into
    v_content_id,
    v_legacy_clip_id,
    v_quality_flags,
    v_status,
    v_admin_boost
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.id = p_content_media_id;

  if v_content_id is null then
    return;
  end if;

  select
    count(*) filter (
      where event_type = 'clip_started'
    ),
    count(*) filter (
      where event_type = 'answer_correct'
    ),
    count(*) filter (
      where event_type = 'answer_wrong'
    ),
    count(*) filter (
      where event_type = 'hint_requested'
    ),
    count(*) filter (
      where event_type = 'timeout'
    ),
    count(*) filter (
      where event_type = 'clip_loaded'
    ),
    count(*) filter (
      where event_type = 'clip_failed_to_load'
    ),
    coalesce(
      avg(
        nullif(
          payload ->> 'answer_time_seconds',
          ''
        )::numeric
      ) filter (
        where event_type = 'answer_submitted'
          and payload ? 'answer_time_seconds'
      ),
      0
    ),
    max(occurred_at) filter (
      where event_type in (
        'clip_started',
        'answer_correct',
        'answer_wrong',
        'timeout'
      )
    ),
    max(occurred_at) filter (
      where event_type = 'clip_loaded'
    )
  into
    v_total_plays,
    v_total_correct,
    v_total_wrong,
    v_total_hints,
    v_total_timeouts,
    v_total_load_success,
    v_total_load_failures,
    v_avg_answer_time_seconds,
    v_last_played_at,
    v_last_loaded_at
  from public.movie_buff_round_events
  where content_media_id = p_content_media_id;

  v_difficulty_score :=
    public.movie_buff_clip_difficulty_score(
      v_total_plays,
      v_total_correct,
      v_total_hints,
      v_avg_answer_time_seconds,
      30
    );

  v_quality_score :=
    public.movie_buff_clip_quality_score(
      v_quality_flags,
      v_total_load_success,
      v_total_load_failures,
      v_total_timeouts,
      v_total_plays
    );

  v_rotation_score :=
    public.movie_buff_clip_rotation_score(
      v_quality_score,
      v_total_plays,
      v_last_played_at,
      v_admin_boost,
      v_status
    );

  insert into public.movie_buff_clip_analytics (
    content_media_id,
    content_id,
    legacy_clip_id,
    total_plays,
    total_correct,
    total_wrong,
    total_hints_used,
    total_timeouts,
    total_load_success,
    total_load_failures,
    avg_answer_time_seconds,
    last_played_at,
    last_loaded_at,
    sample_size,
    difficulty_score,
    system_difficulty_label,
    quality_score,
    rotation_score,
    rotation_weight,
    admin_boost,
    status,
    quality_flags,
    updated_at
  )
  values (
    p_content_media_id,
    v_content_id,
    v_legacy_clip_id,
    coalesce(v_total_plays, 0),
    coalesce(v_total_correct, 0),
    coalesce(v_total_wrong, 0),
    coalesce(v_total_hints, 0),
    coalesce(v_total_timeouts, 0),
    coalesce(v_total_load_success, 0),
    coalesce(v_total_load_failures, 0),
    round(coalesce(v_avg_answer_time_seconds, 0), 2),
    v_last_played_at,
    v_last_loaded_at,
    coalesce(v_total_plays, 0),
    v_difficulty_score,
    public.movie_buff_clip_difficulty_label(
      v_difficulty_score
    ),
    v_quality_score,
    v_rotation_score,
    v_rotation_score,
    v_admin_boost,
    v_status,
    v_quality_flags,
    timezone('utc', now())
  )
  on conflict (content_media_id) do update
  set
    content_id = excluded.content_id,
    legacy_clip_id = excluded.legacy_clip_id,
    total_plays = excluded.total_plays,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong,
    total_hints_used = excluded.total_hints_used,
    total_timeouts = excluded.total_timeouts,
    total_load_success = excluded.total_load_success,
    total_load_failures = excluded.total_load_failures,
    avg_answer_time_seconds = excluded.avg_answer_time_seconds,
    last_played_at = excluded.last_played_at,
    last_loaded_at = excluded.last_loaded_at,
    sample_size = excluded.sample_size,
    difficulty_score = excluded.difficulty_score,
    system_difficulty_label = excluded.system_difficulty_label,
    quality_score = excluded.quality_score,
    rotation_score = excluded.rotation_score,
    rotation_weight = excluded.rotation_weight,
    updated_at = excluded.updated_at;

  perform public.movie_buff_refresh_movie_analytics(
    v_content_id
  );
end;
$$;

create or replace function public.record_movie_buff_event(
  p_event_type text,
  p_room_id uuid default null,
  p_match_id uuid default null,
  p_round_id uuid default null,
  p_player_id uuid default null,
  p_content_id uuid default null,
  p_content_media_id uuid default null,
  p_legacy_clip_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_player_id uuid := coalesce(
    p_player_id,
    auth.uid()
  );
  v_room_id uuid := p_room_id;
  v_match_id uuid := p_match_id;
  v_round_id uuid := p_round_id;
  v_content_id uuid := p_content_id;
  v_content_media_id uuid := p_content_media_id;
  v_legacy_clip_id uuid := p_legacy_clip_id;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if lower(coalesce(p_event_type, '')) not in (
    'room_created',
    'player_joined',
    'player_ready',
    'round_started',
    'media_ready',
    'clip_loaded',
    'clip_start_requested',
    'clip_started',
    'hint_requested',
    'answer_submitted',
    'answer_correct',
    'answer_wrong',
    'timeout',
    'player_left',
    'match_completed',
    'match_abandoned',
    'clip_failed_to_load'
  ) then
    raise exception 'Unsupported Movie Buff event type.';
  end if;

  if v_player_id is distinct from auth.uid() then
    raise exception 'You can only record your own Movie Buff events.';
  end if;

  if v_round_id is not null then
    select
      coalesce(v_match_id, mr.match_id),
      coalesce(v_room_id, m.room_id),
      coalesce(v_legacy_clip_id, mr.clip_id)
    into
      v_match_id,
      v_room_id,
      v_legacy_clip_id
    from public.match_rounds as mr
    join public.matches as m
      on m.id = mr.match_id
    where mr.id = v_round_id
    limit 1;
  end if;

  if v_legacy_clip_id is not null and v_content_media_id is null then
    select
      cm.id,
      cm.content_id
    into
      v_content_media_id,
      v_content_id
    from public.content_media as cm
    where cm.legacy_clip_id = v_legacy_clip_id
    limit 1;
  end if;

  if v_content_media_id is not null then
    select
      coalesce(v_content_id, cm.content_id),
      coalesce(v_legacy_clip_id, cm.legacy_clip_id)
    into
      v_content_id,
      v_legacy_clip_id
    from public.content_media as cm
    where cm.id = v_content_media_id
    limit 1;
  end if;

  if v_match_id is not null and v_room_id is null then
    select
      room_id
    into v_room_id
    from public.matches
    where id = v_match_id
    limit 1;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    content_id,
    content_media_id,
    legacy_clip_id,
    payload
  )
  values (
    lower(p_event_type),
    v_room_id,
    v_match_id,
    v_round_id,
    v_player_id,
    v_content_id,
    v_content_media_id,
    v_legacy_clip_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  if v_content_media_id is not null then
    perform public.movie_buff_refresh_clip_analytics(
      v_content_media_id
    );
  elsif v_content_id is not null then
    perform public.movie_buff_refresh_movie_analytics(
      v_content_id
    );
  end if;

  return v_event_id;
end;
$$;

create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_preplay_started_at,
    v_play_requested_at,
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is not null then
    return greatest(
      0,
      v_effective_time_limit -
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
    );
  end if;

  if v_play_requested_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_play_requested_at
          )
        )
      )::integer >=
        public.movie_buff_playback_launch_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_preplay_started_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_preplay_started_at
          )
        )
      )::integer >=
        public.movie_buff_preplay_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if
    p_round_started_at is not null
    and floor(
      extract(
        epoch from (
          now() - p_round_started_at
        )
      )
    )::integer >=
      public.movie_buff_round_entry_timeout_seconds()
  then
    return 0;
  end if;

  return v_effective_time_limit;
end;
$$;

create or replace function public.enter_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    null,
    null,
    null
  )
  on conflict (round_id, player_id) do nothing;

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

create or replace function public.mark_movie_buff_round_media_ready(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select
    mr.id
  into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (round_id, player_id) do update
  set started_at = coalesce(
    public.match_round_player_playback.started_at,
    excluded.started_at
  );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

create or replace function public.prepare_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now(),
    null
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    play_requested_at = coalesce(
      public.match_round_player_playback.play_requested_at,
      excluded.play_requested_at
    );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

create or replace function public.start_movie_buff_round_playback(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_round_started_at,
      v_time_limit_seconds
    ) <= 0
  then
    raise exception 'Time has expired for this round.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    now(),
    now()
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    play_requested_at = coalesce(
      public.match_round_player_playback.play_requested_at,
      excluded.play_requested_at
    ),
    playback_started_at = coalesce(
      public.match_round_player_playback.playback_started_at,
      excluded.playback_started_at
    );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$$;

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
  with candidate_clips as (
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
      ) as effective_label
    from public.clips as c
    join public.movies as mo
      on mo.id = c.movie_id
    left join public.content_media as cm
      on cm.legacy_clip_id = c.id
    left join public.movie_buff_clip_analytics as ca
      on ca.content_media_id = cm.id
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

revoke all on table public.movie_buff_round_events from public;
revoke all on table public.movie_buff_clip_analytics from public;
revoke all on table public.movie_buff_movie_analytics from public;

revoke all on function public.movie_buff_playback_launch_timeout_seconds() from public;
revoke all on function public.movie_buff_clip_confidence_factor(integer) from public;
revoke all on function public.movie_buff_clip_difficulty_score(integer, integer, integer, numeric, integer) from public;
revoke all on function public.movie_buff_clip_difficulty_label(numeric) from public;
revoke all on function public.movie_buff_clip_quality_score(jsonb, integer, integer, integer, integer) from public;
revoke all on function public.movie_buff_clip_rotation_score(numeric, integer, timestamptz, smallint, text) from public;
revoke all on function public.movie_buff_requested_difficulty_label(text) from public;
revoke all on function public.movie_buff_refresh_movie_analytics(uuid) from public;
revoke all on function public.movie_buff_refresh_clip_analytics(uuid) from public;
revoke all on function public.record_movie_buff_event(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid) from public;
revoke all on function public.prepare_movie_buff_round_playback(uuid) from public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid, uuid, timestamptz, integer) from public;
revoke all on function public.enter_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.pick_movie_buff_clip(uuid, uuid, text) from public;

grant execute on function public.record_movie_buff_event(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb)
to authenticated;

grant execute on function public.mark_movie_buff_round_media_ready(uuid)
to authenticated;

grant execute on function public.prepare_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.enter_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

-- <<< END 202607300100_movie_buff_clip_analytics_and_round_timing.sql

-- >>> BEGIN 202607300200_movie_buff_attempt_count_fix.sql
create or replace function public.movie_buff_refresh_clip_analytics(
  p_content_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_id uuid;
  v_legacy_clip_id uuid;
  v_quality_flags jsonb := '[]'::jsonb;
  v_status text := 'active';
  v_admin_boost smallint := 0;
  v_total_plays integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_total_hints integer := 0;
  v_total_timeouts integer := 0;
  v_total_load_success integer := 0;
  v_total_load_failures integer := 0;
  v_avg_answer_time_seconds numeric := 0;
  v_last_played_at timestamptz;
  v_last_loaded_at timestamptz;
  v_difficulty_score numeric := 50;
  v_quality_score numeric := 100;
  v_rotation_score numeric := 50;
begin
  if p_content_media_id is null then
    return;
  end if;

  select
    cm.content_id,
    cm.legacy_clip_id,
    coalesce(ca.quality_flags, '[]'::jsonb),
    coalesce(ca.status, 'active'),
    coalesce(ca.admin_boost, 0)
  into
    v_content_id,
    v_legacy_clip_id,
    v_quality_flags,
    v_status,
    v_admin_boost
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.id = p_content_media_id;

  if v_content_id is null then
    return;
  end if;

  select
    count(
      distinct case
        when event_type in (
          'clip_started',
          'answer_submitted',
          'timeout',
          'clip_failed_to_load'
        ) then
          concat_ws(
            ':',
            coalesce(round_id::text, id::text),
            coalesce(player_id::text, 'anonymous')
          )
        else null
      end
    ),
    count(*) filter (
      where event_type = 'answer_correct'
    ),
    count(*) filter (
      where event_type = 'answer_wrong'
    ),
    count(*) filter (
      where event_type = 'hint_requested'
    ),
    count(*) filter (
      where event_type = 'timeout'
    ),
    count(*) filter (
      where event_type = 'clip_loaded'
    ),
    count(*) filter (
      where event_type = 'clip_failed_to_load'
    ),
    coalesce(
      avg(
        nullif(
          payload ->> 'answer_time_seconds',
          ''
        )::numeric
      ) filter (
        where event_type = 'answer_submitted'
          and payload ? 'answer_time_seconds'
      ),
      0
    ),
    max(occurred_at) filter (
      where event_type in (
        'clip_started',
        'answer_submitted',
        'answer_correct',
        'answer_wrong',
        'timeout',
        'clip_failed_to_load'
      )
    ),
    max(occurred_at) filter (
      where event_type = 'clip_loaded'
    )
  into
    v_total_plays,
    v_total_correct,
    v_total_wrong,
    v_total_hints,
    v_total_timeouts,
    v_total_load_success,
    v_total_load_failures,
    v_avg_answer_time_seconds,
    v_last_played_at,
    v_last_loaded_at
  from public.movie_buff_round_events
  where content_media_id = p_content_media_id;

  v_difficulty_score :=
    public.movie_buff_clip_difficulty_score(
      v_total_plays,
      v_total_correct,
      v_total_hints,
      v_avg_answer_time_seconds,
      30
    );

  v_quality_score :=
    public.movie_buff_clip_quality_score(
      v_quality_flags,
      v_total_load_success,
      v_total_load_failures,
      v_total_timeouts,
      v_total_plays
    );

  v_rotation_score :=
    public.movie_buff_clip_rotation_score(
      v_quality_score,
      v_total_plays,
      v_last_played_at,
      v_admin_boost,
      v_status
    );

  insert into public.movie_buff_clip_analytics (
    content_media_id,
    content_id,
    legacy_clip_id,
    total_plays,
    total_correct,
    total_wrong,
    total_hints_used,
    total_timeouts,
    total_load_success,
    total_load_failures,
    avg_answer_time_seconds,
    last_played_at,
    last_loaded_at,
    sample_size,
    difficulty_score,
    system_difficulty_label,
    quality_score,
    rotation_score,
    rotation_weight,
    admin_boost,
    status,
    quality_flags,
    updated_at
  )
  values (
    p_content_media_id,
    v_content_id,
    v_legacy_clip_id,
    coalesce(v_total_plays, 0),
    coalesce(v_total_correct, 0),
    coalesce(v_total_wrong, 0),
    coalesce(v_total_hints, 0),
    coalesce(v_total_timeouts, 0),
    coalesce(v_total_load_success, 0),
    coalesce(v_total_load_failures, 0),
    round(coalesce(v_avg_answer_time_seconds, 0), 2),
    v_last_played_at,
    v_last_loaded_at,
    coalesce(v_total_plays, 0),
    v_difficulty_score,
    public.movie_buff_clip_difficulty_label(
      v_difficulty_score
    ),
    v_quality_score,
    v_rotation_score,
    v_rotation_score,
    v_admin_boost,
    v_status,
    v_quality_flags,
    timezone('utc', now())
  )
  on conflict (content_media_id) do update
  set
    content_id = excluded.content_id,
    legacy_clip_id = excluded.legacy_clip_id,
    total_plays = excluded.total_plays,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong,
    total_hints_used = excluded.total_hints_used,
    total_timeouts = excluded.total_timeouts,
    total_load_success = excluded.total_load_success,
    total_load_failures = excluded.total_load_failures,
    avg_answer_time_seconds = excluded.avg_answer_time_seconds,
    last_played_at = excluded.last_played_at,
    last_loaded_at = excluded.last_loaded_at,
    sample_size = excluded.sample_size,
    difficulty_score = excluded.difficulty_score,
    system_difficulty_label = excluded.system_difficulty_label,
    quality_score = excluded.quality_score,
    rotation_score = excluded.rotation_score,
    rotation_weight = excluded.rotation_weight,
    updated_at = excluded.updated_at;

  perform public.movie_buff_refresh_movie_analytics(
    v_content_id
  );
end;
$$;

do $$
declare
  v_media_id uuid;
begin
  for v_media_id in
    select id
    from public.content_media
  loop
    perform public.movie_buff_refresh_clip_analytics(
      v_media_id
    );
  end loop;
end;
$$;
-- <<< END 202607300200_movie_buff_attempt_count_fix.sql

-- >>> BEGIN 202607300210_movie_buff_analytics_service_role_grants.sql
grant usage on schema public
to service_role;

grant select
on table
  public.movie_buff_round_events,
  public.movie_buff_clip_analytics,
  public.movie_buff_movie_analytics
to service_role;

grant insert, update, delete
on table
  public.movie_buff_clip_analytics,
  public.movie_buff_movie_analytics
to service_role;

grant execute
on function public.movie_buff_refresh_clip_analytics(uuid)
to service_role;

grant execute
on function public.movie_buff_refresh_movie_analytics(uuid)
to service_role;

notify pgrst, 'reload schema';
-- <<< END 202607300210_movie_buff_analytics_service_role_grants.sql

-- >>> BEGIN 202607300220_movie_buff_playback_launch_timeout_buffer.sql
create or replace function public.movie_buff_playback_launch_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 45;
$$;
-- <<< END 202607300220_movie_buff_playback_launch_timeout_buffer.sql

-- >>> BEGIN 202607300230_movie_buff_public_room_creation_analytics.sql
drop function if exists public.find_or_create_movie_buff_public_room(uuid, text, integer, integer);

create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns table (
  id uuid,
  room_code text,
  host_id uuid,
  room_type text,
  status text,
  category_id uuid,
  difficulty text,
  total_rounds integer,
  max_players integer,
  current_round integer,
  is_ranked boolean,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return query
    select
      v_compatible_room.id,
      v_compatible_room.room_code,
      v_compatible_room.host_id,
      v_compatible_room.room_type,
      v_compatible_room.status,
      v_compatible_room.category_id,
      v_compatible_room.difficulty,
      v_compatible_room.total_rounds,
      v_compatible_room.max_players,
      v_compatible_room.current_round,
      v_compatible_room.is_ranked,
      v_compatible_room.created_at,
      v_compatible_room.started_at,
      v_compatible_room.finished_at,
      false;
    return;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return query
    select
      v_candidate_room.id,
      v_candidate_room.room_code,
      v_candidate_room.host_id,
      v_candidate_room.room_type,
      v_candidate_room.status,
      v_candidate_room.category_id,
      v_candidate_room.difficulty,
      v_candidate_room.total_rounds,
      v_candidate_room.max_players,
      v_candidate_room.current_round,
      v_candidate_room.is_ranked,
      v_candidate_room.created_at,
      v_candidate_room.started_at,
      v_candidate_room.finished_at,
      false;
    return;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  return query
  select
    v_candidate_room.id,
    v_candidate_room.room_code,
    v_candidate_room.host_id,
    v_candidate_room.room_type,
    v_candidate_room.status,
    v_candidate_room.category_id,
    v_candidate_room.difficulty,
    v_candidate_room.total_rounds,
    v_candidate_room.max_players,
    v_candidate_room.current_round,
    v_candidate_room.is_ranked,
    v_candidate_room.created_at,
    v_candidate_room.started_at,
    v_candidate_room.finished_at,
    true;
end;
$$;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607300230_movie_buff_public_room_creation_analytics.sql

-- >>> BEGIN 202607300240_movie_buff_public_room_created_event_in_rpc.sql
create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns table (
  id uuid,
  room_code text,
  host_id uuid,
  room_type text,
  status text,
  category_id uuid,
  difficulty text,
  total_rounds integer,
  max_players integer,
  current_round integer,
  is_ranked boolean,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return query
    select
      v_compatible_room.id,
      v_compatible_room.room_code,
      v_compatible_room.host_id,
      v_compatible_room.room_type,
      v_compatible_room.status,
      v_compatible_room.category_id,
      v_compatible_room.difficulty,
      v_compatible_room.total_rounds,
      v_compatible_room.max_players,
      v_compatible_room.current_round,
      v_compatible_room.is_ranked,
      v_compatible_room.created_at,
      v_compatible_room.started_at,
      v_compatible_room.finished_at,
      false;
    return;
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update skip locked;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return query
    select
      v_candidate_room.id,
      v_candidate_room.room_code,
      v_candidate_room.host_id,
      v_candidate_room.room_type,
      v_candidate_room.status,
      v_candidate_room.category_id,
      v_candidate_room.difficulty,
      v_candidate_room.total_rounds,
      v_candidate_room.max_players,
      v_candidate_room.current_round,
      v_candidate_room.is_ranked,
      v_candidate_room.created_at,
      v_candidate_room.started_at,
      v_candidate_room.finished_at,
      false;
    return;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    player_id,
    payload
  )
  values (
    'room_created',
    v_candidate_room.id,
    v_user_id,
    jsonb_build_object(
      'roomType', v_candidate_room.room_type,
      'difficulty', v_candidate_room.difficulty,
      'totalRounds', v_candidate_room.total_rounds,
      'maxPlayers', v_candidate_room.max_players,
      'mode', 'public_matchmaking'
    )
  );

  return query
  select
    v_candidate_room.id,
    v_candidate_room.room_code,
    v_candidate_room.host_id,
    v_candidate_room.room_type,
    v_candidate_room.status,
    v_candidate_room.category_id,
    v_candidate_room.difficulty,
    v_candidate_room.total_rounds,
    v_candidate_room.max_players,
    v_candidate_room.current_round,
    v_candidate_room.is_ranked,
    v_candidate_room.created_at,
    v_candidate_room.started_at,
    v_candidate_room.finished_at,
    true;
end;
$$;
-- <<< END 202607300240_movie_buff_public_room_created_event_in_rpc.sql

-- >>> BEGIN 202607300250_movie_buff_leave_room_rpc_analytics.sql
create or replace function public.leave_movie_buff_room(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_departing_player public.room_players%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
  v_active_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  select m.id
  into v_active_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status not in ('finished', 'cancelled')
  order by m.started_at desc nulls last
  limit 1;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null
  returning *
  into v_departing_player;

  if not found then
    return v_room;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    player_id,
    payload
  )
  values (
    'player_left',
    p_room_id,
    v_active_match_id,
    auth.uid(),
    jsonb_build_object(
      'reason', 'leave_room',
      'roomStatus', v_room.status
    )
  );

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    if
      v_active_match_id is not null
      and v_room.status in ('starting', 'active')
    then
      insert into public.movie_buff_round_events (
        event_type,
        room_id,
        match_id,
        player_id,
        payload
      )
      values (
        'match_abandoned',
        p_room_id,
        v_active_match_id,
        auth.uid(),
        jsonb_build_object(
          'reason', 'all_players_left',
          'roomStatus', v_room.status
        )
      );
    end if;

    update public.game_rooms
    set status =
          case
            when status in ('finished', 'cancelled') then status
            else 'cancelled'
          end,
        finished_at =
          case
            when status = 'active' and finished_at is null
              then timezone('utc', now())
            else finished_at
          end
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if v_room.host_id = auth.uid()
     or coalesce(v_departing_player.is_host, false) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    if v_next_host_id is not null then
      update public.room_players
      set is_host = (
        player_id = v_next_host_id
        and left_at is null
      )
      where room_id = p_room_id;

      update public.game_rooms
      set host_id = v_next_host_id
      where id = p_room_id
      returning *
      into v_room;

      return v_room;
    end if;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
$$;
-- <<< END 202607300250_movie_buff_leave_room_rpc_analytics.sql

-- >>> BEGIN 202607300260_movie_buff_entered_round_stops_entry_timeout.sql
create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_playback_row boolean := false;
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.round_id is not null,
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_has_playback_row,
    v_preplay_started_at,
    v_play_requested_at,
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is not null then
    return greatest(
      0,
      v_effective_time_limit -
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
    );
  end if;

  if v_play_requested_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_play_requested_at
          )
        )
      )::integer >=
        public.movie_buff_playback_launch_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_preplay_started_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_preplay_started_at
          )
        )
      )::integer >=
        public.movie_buff_preplay_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_has_playback_row then
    return v_effective_time_limit;
  end if;

  if
    p_round_started_at is not null
    and floor(
      extract(
        epoch from (
          now() - p_round_started_at
        )
      )
    )::integer >=
      public.movie_buff_round_entry_timeout_seconds()
  then
    return 0;
  end if;

  return v_effective_time_limit;
end;
$$;
-- <<< END 202607300260_movie_buff_entered_round_stops_entry_timeout.sql

-- >>> BEGIN 202607300270_movie_buff_match_lifecycle_rpc_analytics.sql
create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = coalesce(started_at, now()),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    select mr.clip_id
    into v_clip_id
    from public.match_rounds as mr
    where mr.id = v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    legacy_clip_id,
    payload
  )
  values (
    'round_started',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_clip_id,
    jsonb_build_object(
      'trigger', 'start_match',
      'roundNumber', 1,
      'totalRounds', v_room.total_rounds
    )
  );

  return query
  select v_match_id, v_round_id;
end;
$$;

create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_current_round_id uuid;
  v_current_round_started_at timestamptz;
  v_current_round_time_limit integer;
  v_players_total integer;
  v_players_finished integer;
  v_round_complete boolean;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  select
    mr.id,
    mr.started_at,
    mr.time_limit_seconds
  into
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_room.current_round
  limit 1
  for update;

  if v_current_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  select
    progress.result_players_total,
    progress.result_players_finished,
    progress.result_round_complete
  into
    v_players_total,
    v_players_finished,
    v_round_complete
  from public.get_movie_buff_round_completion(
    p_room_id,
    v_current_round_id,
    v_current_round_started_at,
    v_current_round_time_limit
  ) as progress;

  if not coalesce(v_round_complete, false) then
    raise exception
      'This round is still in progress. % of % players have finished.',
      coalesce(v_players_finished, 0),
      coalesce(v_players_total, 0);
  end if;

  update public.match_rounds
  set ended_at = coalesce(ended_at, now())
  where id = v_current_round_id;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    insert into public.movie_buff_round_events (
      event_type,
      room_id,
      match_id,
      round_id,
      player_id,
      payload
    )
    values (
      'match_completed',
      p_room_id,
      v_match_id,
      v_current_round_id,
      auth.uid(),
      jsonb_build_object(
        'trigger', 'advance_round',
        'completedRounds', v_room.current_round,
        'totalRounds', v_room.total_rounds
      )
    );

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    delete from public.match_round_player_playback
    where round_id = v_round_id;

    delete from public.match_round_player_hints
    where round_id = v_round_id;

    delete from public.answers
    where round_id = v_round_id;

    select mr.clip_id
    into v_clip_id
    from public.match_rounds as mr
    where mr.id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    legacy_clip_id,
    payload
  )
  values (
    'round_started',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_clip_id,
    jsonb_build_object(
      'trigger', 'advance_round',
      'previousRoundId', v_current_round_id,
      'nextRoundNumber', v_next_round,
      'totalRounds', v_room.total_rounds
    )
  );

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;
-- <<< END 202607300270_movie_buff_match_lifecycle_rpc_analytics.sql

-- >>> BEGIN 202607300280_movie_buff_room_membership_trigger_analytics.sql
create or replace function public.log_movie_buff_room_player_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = coalesce(new.room_id, old.room_id);

  if not found then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.left_at is null then
      insert into public.movie_buff_round_events (
        event_type,
        room_id,
        player_id,
        payload
      )
      values (
        'player_joined',
        new.room_id,
        new.player_id,
        jsonb_build_object(
          'roomType', v_room.room_type,
          'isHost', coalesce(new.is_host, false)
        )
      );
    end if;

    return new;
  end if;

  if
    tg_op = 'UPDATE'
    and new.left_at is null
    and coalesce(new.is_ready, false) = true
    and coalesce(old.is_ready, false) = false
  then
    insert into public.movie_buff_round_events (
      event_type,
      room_id,
      player_id,
      payload
    )
    values (
      'player_ready',
      new.room_id,
      new.player_id,
      jsonb_build_object(
        'isReady', true
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists movie_buff_room_player_event_trg
on public.room_players;

create trigger movie_buff_room_player_event_trg
after insert or update on public.room_players
for each row
execute function public.log_movie_buff_room_player_event();

revoke all on function public.log_movie_buff_room_player_event()
from public;
-- <<< END 202607300280_movie_buff_room_membership_trigger_analytics.sql

-- >>> BEGIN 202607300290_movie_buff_private_room_creation_trigger.sql
create or replace function public.log_movie_buff_private_room_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.room_type, 'private') <> 'private' then
    return new;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    player_id,
    payload
  )
  values (
    'room_created',
    new.id,
    new.host_id,
    jsonb_build_object(
      'roomType', new.room_type,
      'difficulty', new.difficulty,
      'totalRounds', new.total_rounds,
      'maxPlayers', new.max_players
    )
  );

  return new;
end;
$$;

drop trigger if exists movie_buff_private_room_created_trg
on public.game_rooms;

create trigger movie_buff_private_room_created_trg
after insert on public.game_rooms
for each row
execute function public.log_movie_buff_private_room_created();

revoke all on function public.log_movie_buff_private_room_created()
from public;
-- <<< END 202607300290_movie_buff_private_room_creation_trigger.sql

-- >>> BEGIN 202607300300_movie_buff_answer_rpc_analytics.sql
create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.room_players%rowtype;
  v_round_id uuid;
  v_started_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_used_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_time_limit integer;
  v_effective_time_limit integer;
  v_time_left_seconds integer;
  v_hint_solve_bonus integer := 100;
  v_applied_hint_bonus integer := 0;
  v_movie_title text;
  v_normalized_title text;
  v_content_id uuid;
  v_legacy_clip_id uuid;
  v_content_media_id uuid;
  v_submitted_normalized text;
  v_elapsed_seconds integer;
  v_is_correct boolean;
  v_base_points integer := 0;
  v_speed_bonus integer := 0;
  v_streak_bonus integer := 0;
  v_total_points integer := 0;
  v_new_score integer;
  v_new_streak integer;
  v_new_lives integer;
  v_match_id uuid;
  v_answer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(p_submitted_answer), '') is null then
    raise exception 'Enter a movie title.';
  end if;

  select rp.*
  into v_player
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.player_id = auth.uid()
    and rp.left_at is null
  for update;

  if not found then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.started_at,
    player_playback.playback_started_at,
    player_hint.used_at,
    coalesce(player_hint.penalty_seconds, 0),
    mr.time_limit_seconds,
    mo.title,
    mo.normalized_title,
    ci.id,
    c.id
  into
    v_match_id,
    v_round_id,
    v_started_at,
    v_playback_started_at,
    v_hint_used_at,
    v_hint_penalty_seconds,
    v_time_limit,
    v_movie_title,
    v_normalized_title,
    v_content_id,
    v_legacy_clip_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = mr.id
   and player_playback.player_id = auth.uid()
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round could not be found.';
  end if;

  if exists (
    select 1
    from public.answers as a
    where a.round_id = v_round_id
      and a.player_id = auth.uid()
  ) then
    raise exception 'You already submitted an answer for this round.';
  end if;

  if v_legacy_clip_id is not null then
    select cm.id
    into v_content_media_id
    from public.content_media as cm
    where cm.legacy_clip_id = v_legacy_clip_id
    limit 1;
  end if;

  v_time_left_seconds :=
    public.get_movie_buff_round_player_time_left(
      v_round_id,
      auth.uid(),
      v_started_at,
      v_time_limit
    );

  if v_time_left_seconds <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit -
    coalesce(v_hint_penalty_seconds, 0)
  );

  v_elapsed_seconds := case
    when v_playback_started_at is null then
      0
    else
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
  end;

  v_submitted_normalized :=
    public.normalize_movie_answer(
      p_submitted_answer
    );

  v_is_correct :=
    (
      v_content_id is not null
      and exists (
        select 1
        from public.content_answers as ca
        where ca.content_id = v_content_id
          and ca.is_active = true
          and ca.normalized_answer =
            v_submitted_normalized
      )
    )
    or
    v_submitted_normalized =
      public.normalize_movie_answer(
        coalesce(
          nullif(v_movie_title, ''),
          v_normalized_title
        )
      );

  if v_is_correct then
    v_base_points := 500;

    v_speed_bonus := greatest(
      0,
      least(
        300,
        (v_effective_time_limit - v_elapsed_seconds) * 10
      )
    );

    if
      v_playback_started_at is null
      and v_hint_used_at is not null
    then
      v_applied_hint_bonus := v_hint_solve_bonus;
      v_speed_bonus :=
        v_speed_bonus +
        v_applied_hint_bonus;
    end if;

    v_streak_bonus := least(
      200,
      v_player.current_streak * 50
    );

    v_new_streak := v_player.current_streak + 1;
    v_new_lives := v_player.lives;
  else
    v_new_streak := 0;
    v_new_lives := greatest(0, v_player.lives - 1);
  end if;

  v_total_points :=
    v_base_points +
    v_speed_bonus +
    v_streak_bonus;

  v_new_score := v_player.score + v_total_points;

  insert into public.answers (
    round_id,
    player_id,
    submitted_answer,
    is_correct,
    response_time_ms,
    base_points,
    speed_bonus,
    streak_bonus,
    submitted_at
  )
  values (
    v_round_id,
    auth.uid(),
    trim(p_submitted_answer),
    v_is_correct,
    greatest(
      0,
      case
        when v_playback_started_at is null then
          0
        else
          v_elapsed_seconds * 1000
      end
    ),
    v_base_points,
    v_speed_bonus,
    v_streak_bonus,
    now()
  )
  returning id into v_answer_id;

  update public.room_players
  set
    score = v_new_score,
    current_streak = v_new_streak,
    lives = v_new_lives
  where room_id = p_room_id
    and player_id = auth.uid();

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    content_id,
    content_media_id,
    legacy_clip_id,
    payload
  )
  values (
    'answer_submitted',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_content_id,
    v_content_media_id,
    v_legacy_clip_id,
    jsonb_build_object(
      'answerLength', length(trim(p_submitted_answer)),
      'answerTimeSeconds', v_elapsed_seconds,
      'answeredBeforePlayback', v_playback_started_at is null,
      'usedHint', v_hint_used_at is not null
    )
  );

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    content_id,
    content_media_id,
    legacy_clip_id,
    payload
  )
  values (
    case
      when v_is_correct then 'answer_correct'
      else 'answer_wrong'
    end,
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_content_id,
    v_content_media_id,
    v_legacy_clip_id,
    jsonb_build_object(
      'answerTimeSeconds', v_elapsed_seconds,
      'answeredBeforePlayback', v_playback_started_at is null,
      'usedHint', v_hint_used_at is not null
    )
  );

  if v_content_media_id is not null then
    perform public.movie_buff_refresh_clip_analytics(
      v_content_media_id
    );
  elsif v_content_id is not null then
    perform public.movie_buff_refresh_movie_analytics(
      v_content_id
    );
  end if;

  return query
  select
    v_answer_id,
    v_is_correct,
    v_base_points,
    v_speed_bonus - v_applied_hint_bonus,
    v_applied_hint_bonus,
    v_streak_bonus,
    v_total_points,
    v_new_score,
    v_new_streak,
    v_new_lives,
    coalesce(v_movie_title, v_normalized_title);
end;
$$;
-- <<< END 202607300300_movie_buff_answer_rpc_analytics.sql

-- >>> BEGIN 202607300310_movie_buff_public_match_autostart.sql
create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
  v_clip_id uuid;
  v_player_count integer;
  v_ready_count integer;
  v_available_clip_count integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if v_room.room_type = 'public' then
    if not exists (
      select 1
      from public.room_players as rp
      where rp.room_id = p_room_id
        and rp.player_id = auth.uid()
        and rp.left_at is null
    ) then
      raise exception 'Only active room members can start this public match.';
    end if;
  elsif v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this match.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  select count(*)
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_room.room_type = 'public' and v_player_count < 2 then
    raise exception 'Public matches need at least 2 ready players before they can start.';
  end if;

  if v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and (
      v_room.category_id is null
      or exists (
        select 1
        from public.movie_categories as mc
        where mc.movie_id = mo.id
          and mc.category_id = v_room.category_id
      )
    );

  if v_available_clip_count = 0 then
    raise exception 'No playable movie clips are available for this category yet.';
  end if;

  if v_available_clip_count < v_room.total_rounds then
    raise exception
      'This room is set to % rounds, but only % playable movie clips are available. Add more clips or reduce the round count.',
      v_room.total_rounds,
      v_available_clip_count;
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    insert into public.matches (
      room_id,
      category_id,
      difficulty,
      total_rounds,
      status
    )
    values (
      p_room_id,
      v_room.category_id,
      v_room.difficulty,
      v_room.total_rounds,
      'active'
    )
    returning id into v_match_id;

    insert into public.match_players (
      match_id,
      player_id,
      final_score,
      correct_answers,
      incorrect_answers,
      xp_earned,
      coins_earned
    )
    select
      v_match_id,
      rp.player_id,
      rp.score,
      0,
      0,
      0,
      0
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    on conflict on constraint match_players_pkey do nothing;
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = 1
  limit 1;

  if v_round_id is null then
    v_clip_id := public.pick_movie_buff_clip(
      v_match_id,
      v_room.category_id,
      v_room.difficulty
    );

    if v_clip_id is null then
      raise exception 'No playable movie clips are available for this room.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      1,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = coalesce(started_at, now()),
      ended_at = null,
      playback_started_at = null,
      hint_used_at = null,
      hint_penalty_seconds = 0
    where id = v_round_id;

    select mr.clip_id
    into v_clip_id
    from public.match_rounds as mr
    where mr.id = v_round_id;
  end if;

  update public.game_rooms as gr
  set
    status = 'active',
    current_round = 1,
    started_at = coalesce(gr.started_at, now())
  where gr.id = p_room_id;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    round_id,
    player_id,
    legacy_clip_id,
    payload
  )
  values (
    'round_started',
    p_room_id,
    v_match_id,
    v_round_id,
    auth.uid(),
    v_clip_id,
    jsonb_build_object(
      'trigger', case when v_room.room_type = 'public' then 'public_match_start' else 'start_match' end,
      'roundNumber', 1,
      'totalRounds', v_room.total_rounds,
      'roomType', v_room.room_type
    )
  );

  return query
  select v_match_id, v_round_id;
end;
$$;

revoke all on function public.start_movie_buff_match(uuid) from public;
grant execute on function public.start_movie_buff_match(uuid) to anon;
grant execute on function public.start_movie_buff_match(uuid) to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607300310_movie_buff_public_match_autostart.sql

-- >>> BEGIN 202607300320_movie_buff_recent_movie_diversity_penalty.sql
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
-- <<< END 202607300320_movie_buff_recent_movie_diversity_penalty.sql

-- >>> BEGIN 202607300330_movie_buff_public_ready_autostart_rpc.sql
create or replace function public.set_movie_buff_player_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_active_players integer := 0;
  v_ready_players integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update ready status.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  join public.room_players as rp
    on rp.room_id = gr.id
  where gr.id = p_room_id
    and gr.status = 'waiting'
    and rp.player_id = v_user_id
    and rp.left_at is null
  limit 1
  for update;

  if not found then
    raise exception 'You can only change ready status for your current waiting room.';
  end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id
    and player_id = v_user_id
    and left_at is null;

  if not found then
    raise exception 'Ready status could not be updated.';
  end if;

  if v_room.room_type <> 'public' or p_is_ready is distinct from true then
    return;
  end if;

  select
    count(*) filter (where rp.left_at is null),
    count(*) filter (
      where rp.left_at is null
        and rp.is_ready = true
    )
  into
    v_active_players,
    v_ready_players
  from public.room_players as rp
  where rp.room_id = p_room_id;

  if v_active_players < 2 then
    return;
  end if;

  if v_ready_players <> v_active_players then
    return;
  end if;

  perform
    public.start_movie_buff_match(p_room_id);
end;
$$;

revoke all on function public.set_movie_buff_player_ready(uuid, boolean) from public;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607300330_movie_buff_public_ready_autostart_rpc.sql

-- >>> BEGIN 202607300340_movie_buff_analytics_rls_lockdown.sql
revoke all on table public.movie_buff_round_events from anon;
revoke all on table public.movie_buff_round_events from authenticated;

revoke all on table public.movie_buff_clip_analytics from anon;
revoke all on table public.movie_buff_clip_analytics from authenticated;

revoke all on table public.movie_buff_movie_analytics from anon;
revoke all on table public.movie_buff_movie_analytics from authenticated;

alter table public.movie_buff_round_events
  enable row level security;

alter table public.movie_buff_clip_analytics
  enable row level security;

alter table public.movie_buff_movie_analytics
  enable row level security;

drop policy if exists "service_role_full_access_movie_buff_round_events"
  on public.movie_buff_round_events;
drop policy if exists "service_role_full_access_movie_buff_clip_analytics"
  on public.movie_buff_clip_analytics;
drop policy if exists "service_role_full_access_movie_buff_movie_analytics"
  on public.movie_buff_movie_analytics;

create policy "service_role_full_access_movie_buff_round_events"
on public.movie_buff_round_events
as permissive
for all
to service_role
using (true)
with check (true);

create policy "service_role_full_access_movie_buff_clip_analytics"
on public.movie_buff_clip_analytics
as permissive
for all
to service_role
using (true)
with check (true);

create policy "service_role_full_access_movie_buff_movie_analytics"
on public.movie_buff_movie_analytics
as permissive
for all
to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
-- <<< END 202607300340_movie_buff_analytics_rls_lockdown.sql

-- >>> BEGIN 202607300350_movie_buff_stronger_rotation_spread.sql
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
          now() - interval '6 hours'
      ) as picks_6h,
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
      coalesce(rmu.picks_6h, 0) as recent_picks_6h,
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
          select recent_clip.movie_id
          from public.match_rounds as recent_round
          join public.clips as recent_clip
            on recent_clip.id = recent_round.clip_id
          where recent_round.started_at is not null
          order by recent_round.started_at desc
          limit 5
        ) as globally_recent_movies
        where globally_recent_movies.movie_id = c.movie_id
      )
      and coalesce(ca.status, 'active') not in ('retired', 'test_only', 'cooling_down')
      and coalesce(ca.quality_score, 100) >= 45
      and coalesce(ca.rotation_weight, 50) > 0
      and coalesce(rmu.picks_24h, 0) < 10
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
            (recent_picks_24h * 0.35::numeric) +
            (recent_picks_6h * 0.65::numeric) +
            (recent_picks_2h * 1.10::numeric)
          )
        ) *
        case
          when last_started_at is null then 1::numeric
          when last_started_at >= now() - interval '30 minutes' then 0.05::numeric
          when last_started_at >= now() - interval '2 hours' then 0.18::numeric
          when last_started_at >= now() - interval '6 hours' then 0.40::numeric
          when last_started_at >= now() - interval '12 hours' then 0.70::numeric
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
-- <<< END 202607300350_movie_buff_stronger_rotation_spread.sql

-- >>> BEGIN 202607300360_movie_buff_flatten_rotation_weights.sql
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
          now() - interval '6 hours'
      ) as picks_6h,
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
      sqrt(greatest(
        coalesce(ca.rotation_weight, 50::numeric),
        1::numeric
      )) as flattened_base_weight,
      coalesce(
        ca.system_difficulty_label,
        case
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) = 'easy' then 'Rookie'
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) in ('hard', 'expert') then 'Buffster'
          else 'Buff'
        end
      ) as effective_label,
      coalesce(rmu.picks_24h, 0) as recent_picks_24h,
      coalesce(rmu.picks_6h, 0) as recent_picks_6h,
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
          select recent_clip.movie_id
          from public.match_rounds as recent_round
          join public.clips as recent_clip
            on recent_clip.id = recent_round.clip_id
          where recent_round.started_at is not null
          order by recent_round.started_at desc
          limit 5
        ) as globally_recent_movies
        where globally_recent_movies.movie_id = c.movie_id
      )
      and coalesce(ca.status, 'active') not in ('retired', 'test_only', 'cooling_down')
      and coalesce(ca.quality_score, 100) >= 45
      and coalesce(ca.rotation_weight, 50) > 0
      and coalesce(rmu.picks_24h, 0) < 10
  ),
  weighted_candidates as (
    select
      id,
      greatest(
        0.01::numeric,
        flattened_base_weight *
        case
          when v_requested_label is null then 1::numeric
          when effective_label = v_requested_label then 1::numeric
          when effective_label = 'Buff' then 0.80::numeric
          when v_requested_label = 'Buff' then 0.80::numeric
          else 0.55::numeric
        end *
        (
          1::numeric /
          (
            1::numeric +
            (recent_picks_24h * 0.28::numeric) +
            (recent_picks_6h * 0.55::numeric) +
            (recent_picks_2h * 0.95::numeric)
          )
        ) *
        case
          when last_started_at is null then 1::numeric
          when last_started_at >= now() - interval '30 minutes' then 0.05::numeric
          when last_started_at >= now() - interval '2 hours' then 0.18::numeric
          when last_started_at >= now() - interval '6 hours' then 0.42::numeric
          when last_started_at >= now() - interval '12 hours' then 0.72::numeric
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
-- <<< END 202607300360_movie_buff_flatten_rotation_weights.sql

-- >>> BEGIN 202607300370_movie_buff_restore_balanced_rotation_spread.sql
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
-- <<< END 202607300370_movie_buff_restore_balanced_rotation_spread.sql

-- >>> BEGIN 202607301430_movie_buff_public_matchmaking_creation_lock.sql
create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 6
)
returns table (
  id uuid,
  room_code text,
  host_id uuid,
  room_type text,
  status text,
  category_id uuid,
  difficulty text,
  total_rounds integer,
  max_players integer,
  current_round integer,
  is_ranked boolean,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_room public.game_rooms%rowtype;
  v_compatible_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
  v_matchmaking_key text :=
    concat_ws(
      '|',
      coalesce(p_category_id::text, 'all'),
      coalesce(p_difficulty, 'medium'),
      p_total_rounds::text,
      p_max_players::text
    );
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  if p_max_players < 1 or p_max_players > 100 then
    raise exception 'Select a valid player count.';
  end if;

  for v_existing_room in
    select gr.*
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
     and rp.player_id = v_user_id
     and rp.left_at is null
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    order by gr.created_at asc
  loop
    if
      v_existing_room.category_id is not distinct from p_category_id
      and v_existing_room.difficulty = p_difficulty
      and v_existing_room.total_rounds = p_total_rounds
      and v_existing_room.max_players = p_max_players
      and v_compatible_room.id is null
    then
      v_compatible_room := v_existing_room;
    else
      perform public.leave_movie_buff_room(v_existing_room.id);
    end if;
  end loop;

  if v_compatible_room.id is not null then
    return query
    select
      v_compatible_room.id,
      v_compatible_room.room_code,
      v_compatible_room.host_id,
      v_compatible_room.room_type,
      v_compatible_room.status,
      v_compatible_room.category_id,
      v_compatible_room.difficulty,
      v_compatible_room.total_rounds,
      v_compatible_room.max_players,
      v_compatible_room.current_round,
      v_compatible_room.is_ranked,
      v_compatible_room.created_at,
      v_compatible_room.started_at,
      v_compatible_room.finished_at,
      false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_matchmaking_key));

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.category_id is not distinct from p_category_id
    and gr.difficulty = p_difficulty
    and gr.total_rounds = p_total_rounds
    and gr.max_players = p_max_players
    and (
      select count(*)
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    ) < gr.max_players
  order by gr.created_at asc
  limit 1
  for update;

  if found then
    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      left_at,
      joined_at
    )
    values (
      v_candidate_room.id,
      v_user_id,
      false,
      false,
      null,
      now()
    )
    on conflict (room_id, player_id)
    do update
      set is_ready = false,
          is_host = false,
          left_at = null,
          joined_at = now();

    return query
    select
      v_candidate_room.id,
      v_candidate_room.room_code,
      v_candidate_room.host_id,
      v_candidate_room.room_type,
      v_candidate_room.status,
      v_candidate_room.category_id,
      v_candidate_room.difficulty,
      v_candidate_room.total_rounds,
      v_candidate_room.max_players,
      v_candidate_room.current_round,
      v_candidate_room.is_ranked,
      v_candidate_room.created_at,
      v_candidate_room.started_at,
      v_candidate_room.finished_at,
      false;
    return;
  end if;

  loop
    v_room_code := upper(
      substr(
        replace(gen_random_uuid()::text, '-', ''),
        1,
        6
      )
    );

    begin
      insert into public.game_rooms (
        room_code,
        host_id,
        room_type,
        status,
        category_id,
        difficulty,
        total_rounds,
        max_players,
        current_round,
        is_ranked
      )
      values (
        v_room_code,
        v_user_id,
        'public',
        'waiting',
        p_category_id,
        p_difficulty,
        p_total_rounds,
        p_max_players,
        0,
        false
      )
      returning *
      into v_candidate_room;

      exit;
    exception
      when unique_violation then
        -- Retry with a fresh room code if a collision happens.
    end;
  end loop;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host
  )
  values (
    v_candidate_room.id,
    v_user_id,
    false,
    true
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = true,
        left_at = null,
        joined_at = now();

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    player_id,
    payload
  )
  values (
    'room_created',
    v_candidate_room.id,
    v_user_id,
    jsonb_build_object(
      'roomType', v_candidate_room.room_type,
      'difficulty', v_candidate_room.difficulty,
      'totalRounds', v_candidate_room.total_rounds,
      'maxPlayers', v_candidate_room.max_players,
      'mode', 'public_matchmaking'
    )
  );

  return query
  select
    v_candidate_room.id,
    v_candidate_room.room_code,
    v_candidate_room.host_id,
    v_candidate_room.room_type,
    v_candidate_room.status,
    v_candidate_room.category_id,
    v_candidate_room.difficulty,
    v_candidate_room.total_rounds,
    v_candidate_room.max_players,
    v_candidate_room.current_round,
    v_candidate_room.is_ranked,
    v_candidate_room.created_at,
    v_candidate_room.started_at,
    v_candidate_room.finished_at,
    true;
end;
$$;

grant execute
on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
to authenticated;

notify pgrst, 'reload schema';
-- <<< END 202607301430_movie_buff_public_matchmaking_creation_lock.sql

-- >>> BEGIN 202607301500_movie_buff_activate_built_public_domain_library.sql
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
-- <<< END 202607301500_movie_buff_activate_built_public_domain_library.sql

-- >>> BEGIN 202607301700_movie_buff_launch_gate_fast_media_only.sql
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
      and c.media_url not like '/api/movie-buff/generated/%'
      and c.media_url not like '/api/movie-buff/generated/pending%'
      and coalesce(cm.is_active, true) = true
      and coalesce(cm.is_hidden, false) = false
      and (
        cm.id is null
        or (
          nullif(btrim(coalesce(cm.media_url, '')), '') is not null
          and cm.media_url not like '/api/movie-buff/generated/%'
          and cm.media_url not like '/api/movie-buff/generated/pending%'
        )
      )
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
  left join public.content_media as cm
    on cm.legacy_clip_id = c.id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and c.media_url not like '/api/movie-buff/generated/%'
    and c.media_url not like '/api/movie-buff/generated/pending%'
    and coalesce(cm.is_active, true) = true
    and coalesce(cm.is_hidden, false) = false
    and (
      cm.id is null
      or (
        nullif(btrim(coalesce(cm.media_url, '')), '') is not null
        and cm.media_url not like '/api/movie-buff/generated/%'
        and cm.media_url not like '/api/movie-buff/generated/pending%'
      )
    )
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
-- <<< END 202607301700_movie_buff_launch_gate_fast_media_only.sql

-- >>> BEGIN 202607301830_movie_buff_fan_lane_source_prior.sql
alter table public.movie_buff_clip_analytics
  drop constraint if exists movie_buff_clip_analytics_system_difficulty_label_check;

alter table public.movie_buff_clip_analytics
  add constraint movie_buff_clip_analytics_system_difficulty_label_check
  check (
    system_difficulty_label in (
      'Fan',
      'Buff',
      'Buffster'
    )
  );

create or replace function public.movie_buff_clip_difficulty_label(
  p_difficulty_score numeric
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_difficulty_score, 50) < 35 then 'Fan'
    when coalesce(p_difficulty_score, 50) < 60 then 'Buff'
    else 'Buffster'
  end;
$$;

create or replace function public.movie_buff_requested_difficulty_label(
  p_difficulty text
)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_difficulty, 'mixed'))
    when 'easy' then 'Fan'
    when 'medium' then 'Buff'
    when 'hard' then 'Buffster'
    when 'expert' then 'Buffster'
    when 'fan' then 'Fan'
    when 'buffster' then 'Buffster'
    else 'Buff'
  end;
$$;

create or replace function public.movie_buff_refresh_clip_analytics(
  p_content_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_id uuid;
  v_legacy_clip_id uuid;
  v_source_difficulty text;
  v_total_plays integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_total_hints integer := 0;
  v_total_timeouts integer := 0;
  v_total_load_success integer := 0;
  v_total_load_failures integer := 0;
  v_avg_answer_time_seconds numeric := 0;
  v_quality_flags jsonb := '[]'::jsonb;
  v_status text := 'active';
  v_admin_boost integer := 0;
  v_last_played_at timestamptz;
  v_last_loaded_at timestamptz;
  v_difficulty_score numeric := 50;
  v_quality_score numeric := 100;
  v_rotation_score numeric := 50;
  v_system_difficulty_label text := 'Buff';
begin
  if p_content_media_id is null then
    return;
  end if;

  select
    cm.content_id,
    cm.legacy_clip_id,
    cm.difficulty,
    coalesce(ca.quality_flags, '[]'::jsonb),
    coalesce(ca.status, 'active'),
    coalesce(ca.admin_boost, 0)
  into
    v_content_id,
    v_legacy_clip_id,
    v_source_difficulty,
    v_quality_flags,
    v_status,
    v_admin_boost
  from public.content_media as cm
  left join public.movie_buff_clip_analytics as ca
    on ca.content_media_id = cm.id
  where cm.id = p_content_media_id;

  if v_content_id is null then
    return;
  end if;

  select
    count(*) filter (
      where event_type = 'clip_started'
    ),
    count(*) filter (
      where event_type = 'answer_correct'
    ),
    count(*) filter (
      where event_type = 'answer_wrong'
    ),
    count(*) filter (
      where event_type = 'hint_requested'
    ),
    count(*) filter (
      where event_type = 'timeout'
    ),
    count(*) filter (
      where event_type = 'clip_loaded'
    ),
    count(*) filter (
      where event_type = 'clip_failed_to_load'
    ),
    coalesce(
      avg(
        nullif(
          payload ->> 'answer_time_seconds',
          ''
        )::numeric
      ) filter (
        where event_type = 'answer_submitted'
          and payload ? 'answer_time_seconds'
      ),
      0
    ),
    max(occurred_at) filter (
      where event_type in (
        'clip_started',
        'answer_correct',
        'answer_wrong',
        'timeout'
      )
    ),
    max(occurred_at) filter (
      where event_type = 'clip_loaded'
    )
  into
    v_total_plays,
    v_total_correct,
    v_total_wrong,
    v_total_hints,
    v_total_timeouts,
    v_total_load_success,
    v_total_load_failures,
    v_avg_answer_time_seconds,
    v_last_played_at,
    v_last_loaded_at
  from public.movie_buff_round_events
  where content_media_id = p_content_media_id;

  v_difficulty_score :=
    public.movie_buff_clip_difficulty_score(
      v_total_plays,
      v_total_correct,
      v_total_hints,
      v_avg_answer_time_seconds,
      30
    );

  if coalesce(v_total_plays, 0) < 5 then
    v_system_difficulty_label :=
      public.movie_buff_requested_difficulty_label(
        v_source_difficulty
      );

    v_difficulty_score := case v_system_difficulty_label
      when 'Fan' then 25
      when 'Buffster' then 75
      else 50
    end;
  else
    v_system_difficulty_label :=
      public.movie_buff_clip_difficulty_label(
        v_difficulty_score
      );
  end if;

  v_quality_score :=
    public.movie_buff_clip_quality_score(
      v_quality_flags,
      v_total_load_success,
      v_total_load_failures,
      v_total_timeouts,
      v_total_plays
    );

  v_rotation_score :=
    public.movie_buff_clip_rotation_score(
      v_quality_score,
      v_total_plays,
      v_last_played_at,
      v_admin_boost::smallint,
      v_status
    );

  insert into public.movie_buff_clip_analytics (
    content_media_id,
    content_id,
    legacy_clip_id,
    total_plays,
    total_correct,
    total_wrong,
    total_hints_used,
    total_timeouts,
    total_load_success,
    total_load_failures,
    avg_answer_time_seconds,
    last_played_at,
    last_loaded_at,
    sample_size,
    difficulty_score,
    system_difficulty_label,
    quality_score,
    rotation_score,
    rotation_weight,
    admin_boost,
    status,
    quality_flags,
    updated_at
  )
  values (
    p_content_media_id,
    v_content_id,
    v_legacy_clip_id,
    coalesce(v_total_plays, 0),
    coalesce(v_total_correct, 0),
    coalesce(v_total_wrong, 0),
    coalesce(v_total_hints, 0),
    coalesce(v_total_timeouts, 0),
    coalesce(v_total_load_success, 0),
    coalesce(v_total_load_failures, 0),
    round(coalesce(v_avg_answer_time_seconds, 0), 2),
    v_last_played_at,
    v_last_loaded_at,
    coalesce(v_total_plays, 0),
    v_difficulty_score,
    v_system_difficulty_label,
    v_quality_score,
    v_rotation_score,
    v_rotation_score,
    v_admin_boost,
    v_status,
    v_quality_flags,
    timezone('utc', now())
  )
  on conflict (content_media_id) do update
  set
    content_id = excluded.content_id,
    legacy_clip_id = excluded.legacy_clip_id,
    total_plays = excluded.total_plays,
    total_correct = excluded.total_correct,
    total_wrong = excluded.total_wrong,
    total_hints_used = excluded.total_hints_used,
    total_timeouts = excluded.total_timeouts,
    total_load_success = excluded.total_load_success,
    total_load_failures = excluded.total_load_failures,
    avg_answer_time_seconds = excluded.avg_answer_time_seconds,
    last_played_at = excluded.last_played_at,
    last_loaded_at = excluded.last_loaded_at,
    sample_size = excluded.sample_size,
    difficulty_score = excluded.difficulty_score,
    system_difficulty_label = excluded.system_difficulty_label,
    quality_score = excluded.quality_score,
    rotation_score = excluded.rotation_score,
    rotation_weight = excluded.rotation_weight,
    updated_at = excluded.updated_at;

  perform public.movie_buff_refresh_movie_analytics(
    v_content_id
  );
end;
$$;

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
          when lower(coalesce(cm.difficulty, c.difficulty, 'medium')) = 'easy' then 'Fan'
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
      and c.media_url not like '/api/movie-buff/generated/%'
      and c.media_url not like '/api/movie-buff/generated/pending%'
      and coalesce(cm.is_active, true) = true
      and coalesce(cm.is_hidden, false) = false
      and (
        cm.id is null
        or (
          nullif(btrim(coalesce(cm.media_url, '')), '') is not null
          and cm.media_url not like '/api/movie-buff/generated/%'
          and cm.media_url not like '/api/movie-buff/generated/pending%'
        )
      )
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
  left join public.content_media as cm
    on cm.legacy_clip_id = c.id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
    and c.media_url not like '/api/movie-buff/generated/%'
    and c.media_url not like '/api/movie-buff/generated/pending%'
    and coalesce(cm.is_active, true) = true
    and coalesce(cm.is_hidden, false) = false
    and (
      cm.id is null
      or (
        nullif(btrim(coalesce(cm.media_url, '')), '') is not null
        and cm.media_url not like '/api/movie-buff/generated/%'
        and cm.media_url not like '/api/movie-buff/generated/pending%'
      )
    )
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

do $$
declare
  v_media_id uuid;
begin
  for v_media_id in
    select id
    from public.content_media
    where media_type in ('video', 'audio')
  loop
    perform public.movie_buff_refresh_clip_analytics(v_media_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
-- <<< END 202607301830_movie_buff_fan_lane_source_prior.sql

