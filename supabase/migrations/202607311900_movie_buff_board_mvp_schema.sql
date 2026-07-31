-- =========================================================
-- Movie Buff board-first MVP schema
--
-- Additive only:
-- - does not remove the current launch-safe linear flow
-- - introduces board-ready content fields and board tables
-- - allows a narrow proof build before broader rollout
-- =========================================================

alter table public.content_items
add column if not exists era_bucket text,
add column if not exists primary_genre text,
add column if not exists special_tag text;

alter table public.content_media
add column if not exists recognizability_score numeric(5,2)
  check (
    recognizability_score is null
    or (
      recognizability_score >= 0
      and recognizability_score <= 100
    )
  ),
add column if not exists quality_score numeric(5,2)
  check (
    quality_score is null
    or (
      quality_score >= 0
      and quality_score <= 100
    )
  ),
add column if not exists board_band text
  check (
    board_band is null
    or board_band in (
      'fan_200',
      'fan_400',
      'fanatic_600',
      'fanatic_800',
      'buff_1000',
      'buff_1200'
    )
  ),
add column if not exists is_buff_tile_eligible boolean not null default false,
add column if not exists last_played_at timestamptz,
add column if not exists cooldown_until timestamptz;

create index if not exists content_items_era_bucket_idx
on public.content_items(era_bucket);

create index if not exists content_items_primary_genre_idx
on public.content_items(primary_genre);

create index if not exists content_media_board_band_idx
on public.content_media(board_band);

create index if not exists content_media_buff_tile_eligible_idx
on public.content_media(is_buff_tile_eligible);

create table if not exists public.movie_buff_boards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.game_rooms(id)
    on delete cascade,
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'ready',
        'active',
        'completed',
        'cancelled'
      )
    ),
  selector_player_id uuid
    references public.profiles(id)
    on delete set null,
  current_tile_id uuid,
  tiles_used_count integer not null default 0
    check (tiles_used_count >= 0),
  total_tiles_count integer not null default 36
    check (total_tiles_count > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id)
);

create table if not exists public.movie_buff_board_categories (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null
    references public.movie_buff_boards(id)
    on delete cascade,
  display_order integer not null
    check (display_order >= 0),
  label text not null,
  era_bucket text,
  primary_genre text,
  created_at timestamptz not null default now(),
  unique (board_id, display_order)
);

create table if not exists public.movie_buff_board_tiles (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null
    references public.movie_buff_boards(id)
    on delete cascade,
  board_category_id uuid not null
    references public.movie_buff_board_categories(id)
    on delete cascade,
  tile_order integer not null
    check (tile_order >= 0),
  band text not null
    check (
      band in (
        'fan_200',
        'fan_400',
        'fanatic_600',
        'fanatic_800',
        'buff_1000',
        'buff_1200',
        'buff_category_2000'
      )
    ),
  point_value integer not null
    check (point_value > 0),
  clip_id uuid
    references public.clips(id)
    on delete set null,
  content_media_id uuid
    references public.content_media(id)
    on delete set null,
  round_id uuid
    references public.match_rounds(id)
    on delete set null,
  is_used boolean not null default false,
  selected_by_player_id uuid
    references public.profiles(id)
    on delete set null,
  resolved_by_player_id uuid
    references public.profiles(id)
    on delete set null,
  locked_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_category_id, tile_order)
);

alter table public.movie_buff_boards
drop constraint if exists movie_buff_boards_current_tile_id_fkey;

alter table public.movie_buff_boards
add constraint movie_buff_boards_current_tile_id_fkey
foreign key (current_tile_id)
references public.movie_buff_board_tiles(id)
on delete set null;

create table if not exists public.movie_buff_board_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null
    references public.movie_buff_boards(id)
    on delete cascade,
  room_id uuid
    references public.game_rooms(id)
    on delete set null,
  tile_id uuid
    references public.movie_buff_board_tiles(id)
    on delete set null,
  player_id uuid
    references public.profiles(id)
    on delete set null,
  event_type text not null
    check (
      event_type in (
        'board_created',
        'board_activated',
        'selector_changed',
        'tile_selected',
        'tile_locked',
        'countdown_started',
        'personal_hint_requested',
        'clip_started',
        'answer_submitted',
        'tile_resolved',
        'tile_timeout',
        'returned_to_board',
        'board_completed',
        'board_cancelled'
      )
    ),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists movie_buff_boards_status_idx
on public.movie_buff_boards(status);

create index if not exists movie_buff_boards_selector_idx
on public.movie_buff_boards(selector_player_id);

create index if not exists movie_buff_board_categories_board_idx
on public.movie_buff_board_categories(board_id, display_order);

create index if not exists movie_buff_board_tiles_board_idx
on public.movie_buff_board_tiles(board_id);

create index if not exists movie_buff_board_tiles_category_idx
on public.movie_buff_board_tiles(board_category_id, tile_order);

create index if not exists movie_buff_board_tiles_used_idx
on public.movie_buff_board_tiles(board_id, is_used);

create index if not exists movie_buff_board_events_board_idx
on public.movie_buff_board_events(board_id, occurred_at desc);

create index if not exists movie_buff_board_events_room_idx
on public.movie_buff_board_events(room_id, occurred_at desc);

drop trigger if exists movie_buff_boards_set_updated_at
on public.movie_buff_boards;

create trigger movie_buff_boards_set_updated_at
before update on public.movie_buff_boards
for each row execute function public.set_updated_at();

drop trigger if exists movie_buff_board_tiles_set_updated_at
on public.movie_buff_board_tiles;

create trigger movie_buff_board_tiles_set_updated_at
before update on public.movie_buff_board_tiles
for each row execute function public.set_updated_at();

alter table public.movie_buff_boards enable row level security;
alter table public.movie_buff_board_categories enable row level security;
alter table public.movie_buff_board_tiles enable row level security;
alter table public.movie_buff_board_events enable row level security;

drop policy if exists "movie_buff_boards service only"
on public.movie_buff_boards;
create policy "movie_buff_boards service only"
on public.movie_buff_boards
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "movie_buff_board_categories service only"
on public.movie_buff_board_categories;
create policy "movie_buff_board_categories service only"
on public.movie_buff_board_categories
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "movie_buff_board_tiles service only"
on public.movie_buff_board_tiles;
create policy "movie_buff_board_tiles service only"
on public.movie_buff_board_tiles
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());

drop policy if exists "movie_buff_board_events service only"
on public.movie_buff_board_events;
create policy "movie_buff_board_events service only"
on public.movie_buff_board_events
for all
to authenticated
using (public.is_buff_content_manager())
with check (public.is_buff_content_manager());
