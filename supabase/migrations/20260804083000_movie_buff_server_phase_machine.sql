-- MOV-17: one server-owned Movie Buff match timeline.
-- Additive phase/seat/action state. Browser callers use only caller-scoped RPCs.

create table if not exists public.movie_buff_match_phase_state (
  match_id uuid primary key references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_id uuid not null references public.match_rounds(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  total_rounds integer not null check (total_rounds > 0),
  phase text not null check (phase in (
    'round_intro',
    'vip_lock',
    'board_select',
    'transition',
    'playback',
    'answer',
    'results',
    'finished',
    'abandoned',
    'blocked'
  )),
  phase_version bigint not null default 1 check (phase_version > 0),
  phase_started_at timestamptz not null,
  phase_ends_at timestamptz,
  selector_seat_index integer check (selector_seat_index is null or selector_seat_index > 0),
  selector_deadline_at timestamptz,
  selected_tile_id uuid references public.movie_buff_board_tiles(id) on delete set null,
  selected_clip_id uuid references public.clips(id) on delete set null,
  selection_source text check (
    selection_source is null or selection_source in (
      'human', 'timeout', 'buster_timeout', 'system'
    )
  ),
  playback_starts_at timestamptz,
  answer_deadline_at timestamptz,
  results_end_at timestamptz,
  blocked_reason text,
  updated_at timestamptz not null default now(),
  unique (room_id),
  check (phase_ends_at is null or phase_ends_at >= phase_started_at)
);

create table if not exists public.movie_buff_match_participant_seats (
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  seat_index integer not null check (seat_index > 0),
  original_player_id uuid not null references public.profiles(id) on delete cascade,
  controller_type text not null default 'human'
    check (controller_type in ('human', 'buster', 'system')),
  controller_player_id uuid references public.profiles(id) on delete set null,
  participant_state text not null default 'active'
    check (participant_state in (
      'active', 'reconnect_grace', 'abandoned', 'completed'
    )),
  last_seen_at timestamptz not null,
  reconnect_deadline_at timestamptz,
  abandoned_at timestamptz,
  replacement_ready_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (match_id, seat_index),
  unique (match_id, original_player_id),
  check (
    (controller_type = 'human' and controller_player_id is not null)
    or (controller_type in ('buster', 'system') and controller_player_id is null)
  ),
  check (
    (participant_state = 'reconnect_grace' and reconnect_deadline_at is not null)
    or participant_state <> 'reconnect_grace'
  )
);

create table if not exists public.movie_buff_match_phase_actions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_player_id uuid references public.profiles(id) on delete set null,
  action_type text not null check (action_type in (
    'tile_select', 'phase_advance', 'playback_complete', 'leave_confirm'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_player_id, idempotency_key)
);

create table if not exists public.movie_buff_match_phase_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_id uuid references public.match_rounds(id) on delete set null,
  phase_version bigint not null,
  from_phase text,
  to_phase text not null,
  source text not null,
  actor_player_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists movie_buff_phase_state_room_idx
  on public.movie_buff_match_phase_state(room_id, phase, phase_ends_at);
create index if not exists movie_buff_phase_seats_room_idx
  on public.movie_buff_match_participant_seats(room_id, participant_state, seat_index);
create index if not exists movie_buff_phase_events_match_idx
  on public.movie_buff_match_phase_events(match_id, occurred_at desc);

alter table public.movie_buff_match_phase_state enable row level security;
alter table public.movie_buff_match_participant_seats enable row level security;
alter table public.movie_buff_match_phase_actions enable row level security;
alter table public.movie_buff_match_phase_events enable row level security;

revoke all on public.movie_buff_match_phase_state from public, anon, authenticated;
revoke all on public.movie_buff_match_participant_seats from public, anon, authenticated;
revoke all on public.movie_buff_match_phase_actions from public, anon, authenticated;
revoke all on public.movie_buff_match_phase_events from public, anon, authenticated;
grant all on public.movie_buff_match_phase_state to service_role;
grant all on public.movie_buff_match_participant_seats to service_role;
grant all on public.movie_buff_match_phase_actions to service_role;
grant all on public.movie_buff_match_phase_events to service_role;

create or replace function public.movie_buff_phase_duration_seconds(p_phase text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_phase
    when 'round_intro' then 4
    when 'vip_lock' then 15
    when 'board_select' then 20
    when 'transition' then 3
    when 'results' then 8
    else 0
  end;
$$;

create or replace function public.movie_buff_phase_route(p_phase text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_phase
    when 'round_intro' then '/games/movie-buff/round-intro'
    when 'vip_lock' then '/games/movie-buff/round-intro'
    when 'board_select' then '/games/movie-buff/board-preview'
    when 'transition' then '/games/movie-buff/play'
    when 'playback' then '/games/movie-buff/play'
    when 'answer' then '/games/movie-buff/play'
    when 'results' then '/games/movie-buff/round-results'
    when 'finished' then '/games/movie-buff/final-results'
    else null
  end;
$$;

create or replace function public.movie_buff_clip_playback_seconds(p_clip_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select least(
    30,
    greatest(
      5,
      coalesce(
        ceil(c.end_seconds - c.start_seconds)::integer,
        12
      )
    )
  )
  from public.clips as c
  where c.id = p_clip_id;
$$;

create or replace function public.movie_buff_phase_require_access(p_room_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
begin
  if v_role = 'service_role' then
    return v_player_id;
  end if;

  if v_player_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = v_player_id
      and rp.left_at is null
  ) then
    raise exception 'Active Movie Buff room membership required.';
  end if;

  return v_player_id;
end;
$$;

create or replace function public.movie_buff_next_selector_seat(
  p_match_id uuid,
  p_current_seat_index integer
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with eligible as (
    select seat.seat_index
    from public.movie_buff_match_participant_seats as seat
    where seat.match_id = p_match_id
      and seat.participant_state <> 'completed'
  )
  select coalesce(
    (
      select seat_index
      from eligible
      where seat_index > coalesce(p_current_seat_index, 0)
      order by seat_index
      limit 1
    ),
    (
      select seat_index
      from eligible
      order by seat_index
      limit 1
    )
  );
$$;

create or replace function public.movie_buff_phase_event(
  p_match_id uuid,
  p_room_id uuid,
  p_round_id uuid,
  p_phase_version bigint,
  p_from_phase text,
  p_to_phase text,
  p_source text,
  p_actor_player_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into public.movie_buff_match_phase_events (
    match_id,
    room_id,
    round_id,
    phase_version,
    from_phase,
    to_phase,
    source,
    actor_player_id,
    payload
  )
  values (
    p_match_id,
    p_room_id,
    p_round_id,
    p_phase_version,
    p_from_phase,
    p_to_phase,
    p_source,
    p_actor_player_id,
    coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function public.ensure_movie_buff_match_phase_state(p_room_id uuid)
returns public.movie_buff_match_phase_state
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_match public.matches%rowtype;
  v_round public.match_rounds%rowtype;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_actor := public.movie_buff_phase_require_access(p_room_id);

  select m.*
  into v_match
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Active Movie Buff match not found.';
  end if;

  select mr.*
  into v_round
  from public.match_rounds as mr
  where mr.match_id = v_match.id
  order by mr.round_number desc
  limit 1
  for update;

  if not found then
    raise exception 'Active Movie Buff round not found.';
  end if;

  insert into public.movie_buff_match_participant_seats (
    match_id,
    room_id,
    seat_index,
    original_player_id,
    controller_type,
    controller_player_id,
    participant_state,
    last_seen_at
  )
  select
    v_match.id,
    p_room_id,
    ordered.seat_index,
    ordered.player_id,
    'human',
    ordered.player_id,
    'active',
    coalesce(ordered.last_seen_at, v_now)
  from (
    select
      mp.player_id,
      rp.last_seen_at,
      row_number() over (
        order by coalesce(rp.joined_at, v_match.started_at), mp.player_id
      )::integer as seat_index
    from public.match_players as mp
    left join public.room_players as rp
      on rp.room_id = p_room_id
     and rp.player_id = mp.player_id
    where mp.match_id = v_match.id
  ) as ordered
  on conflict (match_id, original_player_id) do nothing;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = v_match.id
  for update;

  if not found then
    insert into public.movie_buff_match_phase_state (
      match_id,
      room_id,
      round_id,
      round_number,
      total_rounds,
      phase,
      phase_version,
      phase_started_at,
      phase_ends_at,
      selector_seat_index
    )
    values (
      v_match.id,
      p_room_id,
      v_round.id,
      v_round.round_number,
      v_match.total_rounds,
      'round_intro',
      1,
      v_now,
      v_now + pg_catalog.make_interval(
        secs => public.movie_buff_phase_duration_seconds('round_intro')
      ),
      public.movie_buff_next_selector_seat(v_match.id, null)
    )
    returning * into v_state;

    perform public.movie_buff_phase_event(
      v_match.id,
      p_room_id,
      v_round.id,
      v_state.phase_version,
      null,
      'round_intro',
      'phase_bootstrap',
      v_actor,
      pg_catalog.jsonb_build_object('roundNumber', v_round.round_number)
    );
  end if;

  return v_state;
end;
$$;

create or replace function public.touch_movie_buff_match_participant(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_match_id uuid;
  v_seat public.movie_buff_match_participant_seats%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  if v_player_id is null then
    return pg_catalog.jsonb_build_object('service', true);
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  select seat.*
  into v_seat
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_match_id
    and seat.original_player_id = v_player_id
  for update;

  if not found then
    raise exception 'Stable Movie Buff participant seat not found.';
  end if;

  if v_seat.participant_state = 'abandoned' then
    raise exception 'This participant seat was abandoned and cannot be resumed.';
  end if;

  update public.movie_buff_match_participant_seats
  set
    participant_state = 'active',
    controller_type = 'human',
    controller_player_id = v_player_id,
    last_seen_at = v_now,
    reconnect_deadline_at = null,
    replacement_ready_at = null,
    updated_at = v_now
  where match_id = v_match_id
    and seat_index = v_seat.seat_index;

  return pg_catalog.jsonb_build_object(
    'matchId', v_match_id,
    'seatIndex', v_seat.seat_index,
    'participantState', 'active',
    'serverNow', v_now
  );
end;
$$;

create or replace function public.movie_buff_phase_set_vip_activation(
  p_room_id uuid,
  p_round_id uuid,
  p_activation_phase text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if to_regprocedure(
    'public.set_movie_buff_vip_activation_phase(uuid,uuid,text)'
  ) is null then
    raise exception 'MOV-16 VIP activation phase contract is unavailable.';
  end if;

  execute 'select public.set_movie_buff_vip_activation_phase($1,$2,$3)'
    using p_room_id, p_round_id, p_activation_phase;
end;
$$;

create or replace function public.movie_buff_phase_open_vip_window(
  p_room_id uuid,
  p_match_id uuid,
  p_round_id uuid,
  p_deadline_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_required_ids uuid[];
begin
  if to_regprocedure(
    'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])'
  ) is null then
    raise exception 'MOV-16 required-human VIP window contract is unavailable.';
  end if;

  select pg_catalog.array_agg(seat.original_player_id order by seat.seat_index)
  into v_required_ids
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = p_match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_required_ids is null or cardinality(v_required_ids) = 0 then
    raise exception 'No required human participants remain for VIP selection.';
  end if;

  execute 'select public.open_movie_buff_vip_round_window($1,$2,$3,$4,$5)'
    using p_room_id, p_match_id, p_round_id, p_deadline_at, v_required_ids;

  perform public.movie_buff_phase_set_vip_activation(
    p_room_id,
    p_round_id,
    'round_intro'
  );
end;
$$;

create or replace function public.movie_buff_phase_release_vip_participant(
  p_room_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if to_regprocedure(
    'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'
  ) is null then
    return;
  end if;

  begin
    execute 'select public.release_movie_buff_vip_required_player($1,$2,$3,$4)'
      using p_room_id, p_round_id, p_player_id, p_reason;
  exception
    when others then
      if sqlerrm not ilike '%snapshot entry not found%' then
        raise;
      end if;
  end;
end;
$$;

create or replace function public.movie_buff_phase_vip_ready(p_round_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_ready boolean := false;
begin
  if to_regclass('public.movie_buff_vip_round_windows') is null
     or to_regclass('public.movie_buff_vip_round_required_players') is null
     or to_regclass('public.movie_buff_vip_round_locks') is null then
    return false;
  end if;

  execute $sql$
    select
      w.status = 'closed'
      or pg_catalog.clock_timestamp() >= w.deadline_at
      or (
        select count(*)
        from public.movie_buff_vip_round_required_players as required
        where required.round_id = w.round_id
          and required.released_at is null
      ) <= (
        select count(*)
        from public.movie_buff_vip_round_locks as locked
        join public.movie_buff_vip_round_required_players as required
          on required.round_id = locked.round_id
         and required.player_id = locked.player_id
         and required.released_at is null
        where locked.round_id = w.round_id
      )
    from public.movie_buff_vip_round_windows as w
    where w.round_id = $1
  $sql$
  into v_ready
  using p_round_id;

  return coalesce(v_ready, false);
end;
$$;

create or replace function public.movie_buff_apply_phase_tile_selection(
  p_room_id uuid,
  p_match_id uuid,
  p_tile_id uuid,
  p_actor_player_id uuid,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_board_id uuid;
  v_clip_id uuid;
  v_movie_id uuid;
  v_clip_type text;
  v_media_url text;
  v_licensing_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_playback_at timestamptz;
begin
  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = p_match_id
    and state.room_id = p_room_id
  for update;

  if not found or v_state.phase <> 'board_select' then
    raise exception 'Movie Buff match is not accepting a board selection.';
  end if;

  select
    board.id,
    tile.clip_id,
    clip.movie_id,
    clip.clip_type,
    clip.media_url,
    clip.licensing_status
  into
    v_board_id,
    v_clip_id,
    v_movie_id,
    v_clip_type,
    v_media_url,
    v_licensing_status
  from public.movie_buff_boards as board
  join public.movie_buff_board_tiles as tile
    on tile.board_id = board.id
  join public.clips as clip
    on clip.id = tile.clip_id
  join public.movies as movie
    on movie.id = clip.movie_id
  where board.room_id = p_room_id
    and board.status in ('ready', 'active')
    and tile.id = p_tile_id
    and tile.is_used = false
    and clip.is_active = true
    and movie.is_active = true
  for update of board, tile;

  if not found then
    raise exception 'Board tile is unavailable or has no authoritative clip.';
  end if;

  if v_licensing_status is null
     or v_licensing_status not in (
       'licensed', 'public_domain', 'promotional', 'user_connected'
     ) then
    raise exception 'Board tile clip is not rights-eligible.';
  end if;

  if v_clip_type not in ('video', 'audio')
     or nullif(pg_catalog.btrim(coalesce(v_media_url, '')), '') is null then
    raise exception 'Board tile clip is not synchronized-media eligible.';
  end if;

  if exists (
    select 1
    from public.match_rounds as previous_round
    join public.clips as previous_clip
      on previous_clip.id = previous_round.clip_id
    where previous_round.match_id = p_match_id
      and previous_round.id <> v_state.round_id
      and (
        previous_round.clip_id = v_clip_id
        or previous_clip.movie_id = v_movie_id
      )
  ) then
    raise exception 'Board tile clip violates match repeat protection.';
  end if;

  update public.movie_buff_board_tiles
  set
    is_used = true,
    selected_by_player_id = p_actor_player_id,
    locked_at = coalesce(locked_at, v_now),
    updated_at = v_now
  where id = p_tile_id
    and board_id = v_board_id
    and is_used = false;

  if not found then
    raise exception 'Board tile was selected concurrently.';
  end if;

  update public.movie_buff_boards
  set
    status = 'active',
    current_tile_id = p_tile_id,
    tiles_used_count = (
      select count(*)::integer
      from public.movie_buff_board_tiles as used_tile
      where used_tile.board_id = v_board_id
        and used_tile.is_used = true
    ),
    updated_at = v_now
  where id = v_board_id;

  update public.match_rounds
  set
    clip_id = v_clip_id,
    started_at = coalesce(started_at, v_now),
    ended_at = null
  where id = v_state.round_id
    and match_id = p_match_id;

  v_playback_at := v_now + pg_catalog.make_interval(
    secs => public.movie_buff_phase_duration_seconds('transition')
  );

  update public.movie_buff_match_phase_state
  set
    phase = 'transition',
    phase_version = phase_version + 1,
    phase_started_at = v_now,
    phase_ends_at = v_playback_at,
    selected_tile_id = p_tile_id,
    selected_clip_id = v_clip_id,
    selection_source = p_source,
    playback_starts_at = v_playback_at,
    selector_deadline_at = null,
    answer_deadline_at = null,
    results_end_at = null,
    blocked_reason = null,
    updated_at = v_now
  where match_id = p_match_id
  returning * into v_state;

  insert into public.movie_buff_board_events (
    board_id,
    room_id,
    tile_id,
    player_id,
    event_type,
    payload
  )
  values (
    v_board_id,
    p_room_id,
    p_tile_id,
    p_actor_player_id,
    'tile_selected',
    pg_catalog.jsonb_build_object(
      'matchId', p_match_id,
      'roundId', v_state.round_id,
      'clipId', v_clip_id,
      'selectionSource', p_source,
      'phaseVersion', v_state.phase_version
    )
  );

  perform public.movie_buff_phase_event(
    p_match_id,
    p_room_id,
    v_state.round_id,
    v_state.phase_version,
    'board_select',
    'transition',
    p_source,
    p_actor_player_id,
    pg_catalog.jsonb_build_object(
      'tileId', p_tile_id,
      'clipId', v_clip_id,
      'playbackStartsAt', v_playback_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'matchId', p_match_id,
    'roundId', v_state.round_id,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'tileId', p_tile_id,
    'clipId', v_clip_id,
    'playbackStartsAt', v_playback_at,
    'selectionSource', p_source
  );
end;
$$;

create or replace function public.select_movie_buff_match_tile(
  p_room_id uuid,
  p_tile_id uuid,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_selector public.movie_buff_match_participant_seats%rowtype;
  v_existing public.movie_buff_match_phase_actions%rowtype;
  v_request_hash text;
  v_result jsonb;
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  if v_player_id is null then
    raise exception 'Authenticated human selector required.';
  end if;

  if char_length(pg_catalog.btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'Invalid idempotency key.';
  end if;

  perform public.touch_movie_buff_match_participant(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  v_request_hash := pg_catalog.encode(
    public.digest(
      pg_catalog.concat_ws(
        '|', p_room_id::text, p_tile_id::text, p_expected_version::text
      ),
      'sha256'
    ),
    'hex'
  );

  select action.*
  into v_existing
  from public.movie_buff_match_phase_actions as action
  where action.actor_player_id = v_player_id
    and action.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.action_type <> 'tile_select'
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Contradictory duplicate board selection request.';
    end if;
    return v_existing.result;
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for update;

  if v_state.phase <> 'board_select' then
    raise exception 'Movie Buff match is not in board selection.';
  end if;
  if v_state.phase_version <> p_expected_version then
    raise exception 'Movie Buff phase version changed.';
  end if;

  select seat.*
  into v_selector
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.seat_index = v_state.selector_seat_index;

  if not found
     or v_selector.controller_type <> 'human'
     or v_selector.participant_state <> 'active'
     or v_selector.controller_player_id <> v_player_id then
    raise exception 'Only the current active human selector may choose a tile.';
  end if;

  v_result := public.movie_buff_apply_phase_tile_selection(
    p_room_id,
    v_state.match_id,
    p_tile_id,
    v_player_id,
    'human'
  );

  insert into public.movie_buff_match_phase_actions (
    match_id,
    room_id,
    actor_player_id,
    action_type,
    idempotency_key,
    request_hash,
    result
  )
  values (
    v_state.match_id,
    p_room_id,
    v_player_id,
    'tile_select',
    pg_catalog.btrim(p_idempotency_key),
    v_request_hash,
    v_result
  );

  return v_result;
end;
$$;

create or replace function public.advance_movie_buff_match_phase(
  p_room_id uuid,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_from_phase text;
  v_human_count integer;
  v_required_answers integer;
  v_submitted_answers integer;
  v_next_round public.match_rounds%rowtype;
  v_next_selector integer;
  v_auto_tile_id uuid;
  v_playback_seconds integer;
  v_answer_seconds integer;
  v_result jsonb;
  v_abandoned record;
begin
  v_actor := public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  if v_actor is not null then
    perform public.touch_movie_buff_match_participant(p_room_id);
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for update;

  if p_expected_version is not null
     and v_state.phase_version <> p_expected_version then
    return pg_catalog.jsonb_build_object(
      'advanced', false,
      'reason', 'version_changed',
      'phase', v_state.phase,
      'phaseVersion', v_state.phase_version
    );
  end if;

  -- Server-observed presence. A stale human first enters reconnect grace. Only
  -- grace expiry creates an immutable abandonment and Buster controller.
  update public.movie_buff_match_participant_seats
  set
    participant_state = 'reconnect_grace',
    reconnect_deadline_at = last_seen_at + pg_catalog.make_interval(secs => 45),
    updated_at = v_now
  where match_id = v_state.match_id
    and controller_type = 'human'
    and participant_state = 'active'
    and last_seen_at <= v_now - pg_catalog.make_interval(secs => 10);

  for v_abandoned in
    update public.movie_buff_match_participant_seats
    set
      participant_state = 'abandoned',
      controller_type = 'buster',
      controller_player_id = null,
      abandoned_at = coalesce(abandoned_at, v_now),
      replacement_ready_at = coalesce(
        replacement_ready_at,
        v_now + pg_catalog.make_interval(secs => 2)
      ),
      updated_at = v_now
    where match_id = v_state.match_id
      and participant_state = 'reconnect_grace'
      and reconnect_deadline_at <= v_now
    returning original_player_id
  loop
    update public.room_players
    set
      is_ready = false,
      is_host = false,
      left_at = coalesce(left_at, v_now)
    where room_id = p_room_id
      and player_id = v_abandoned.original_player_id;

    perform public.movie_buff_phase_release_vip_participant(
      p_room_id,
      v_state.round_id,
      v_abandoned.original_player_id,
      'reconnect_grace_expired'
    );
  end loop;

  select count(*)::integer
  into v_human_count
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_human_count = 0 and v_state.phase not in ('finished', 'abandoned') then
    v_from_phase := v_state.phase;
    update public.movie_buff_match_phase_state
    set
      phase = 'abandoned',
      phase_version = phase_version + 1,
      phase_started_at = v_now,
      phase_ends_at = null,
      selector_deadline_at = null,
      answer_deadline_at = null,
      results_end_at = null,
      updated_at = v_now
    where match_id = v_state.match_id
    returning * into v_state;

    update public.matches
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = v_state.match_id;
    update public.game_rooms
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = p_room_id;

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_from_phase,
      'abandoned',
      'no_humans_remaining',
      v_actor,
      '{}'::jsonb
    );
  elsif v_state.phase = 'round_intro'
        and v_state.phase_ends_at <= v_now then
    v_from_phase := v_state.phase;
    begin
      perform public.movie_buff_phase_open_vip_window(
        p_room_id,
        v_state.match_id,
        v_state.round_id,
        v_now + pg_catalog.make_interval(
          secs => public.movie_buff_phase_duration_seconds('vip_lock')
        )
      );

      update public.movie_buff_match_phase_state
      set
        phase = 'vip_lock',
        phase_version = phase_version + 1,
        phase_started_at = v_now,
        phase_ends_at = v_now + pg_catalog.make_interval(
          secs => public.movie_buff_phase_duration_seconds('vip_lock')
        ),
        blocked_reason = null,
        updated_at = v_now
      where match_id = v_state.match_id
      returning * into v_state;

      perform public.movie_buff_phase_event(
        v_state.match_id,
        p_room_id,
        v_state.round_id,
        v_state.phase_version,
        v_from_phase,
        'vip_lock',
        'deadline',
        v_actor,
        pg_catalog.jsonb_build_object('deadlineAt', v_state.phase_ends_at)
      );
    exception
      when others then
        update public.movie_buff_match_phase_state
        set
          phase = 'blocked',
          phase_version = phase_version + 1,
          phase_started_at = v_now,
          phase_ends_at = null,
          blocked_reason = sqlerrm,
          updated_at = v_now
        where match_id = v_state.match_id
        returning * into v_state;
    end;
  elsif v_state.phase = 'vip_lock'
        and (
          v_state.phase_ends_at <= v_now
          or public.movie_buff_phase_vip_ready(v_state.round_id)
        ) then
    v_from_phase := v_state.phase;
    update public.movie_buff_match_phase_state
    set
      phase = 'board_select',
      phase_version = phase_version + 1,
      phase_started_at = v_now,
      phase_ends_at = v_now + pg_catalog.make_interval(
        secs => public.movie_buff_phase_duration_seconds('board_select')
      ),
      selector_deadline_at = v_now + pg_catalog.make_interval(
        secs => public.movie_buff_phase_duration_seconds('board_select')
      ),
      blocked_reason = null,
      updated_at = v_now
    where match_id = v_state.match_id
    returning * into v_state;

    perform public.movie_buff_phase_set_vip_activation(
      p_room_id,
      v_state.round_id,
      'board_select'
    );

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_from_phase,
      'board_select',
      'vip_complete_or_deadline',
      v_actor,
      pg_catalog.jsonb_build_object(
        'selectorSeatIndex', v_state.selector_seat_index,
        'selectorDeadlineAt', v_state.selector_deadline_at
      )
    );
  elsif v_state.phase = 'board_select'
        and v_state.selector_deadline_at <= v_now then
    select tile.id
    into v_auto_tile_id
    from public.movie_buff_boards as board
    join public.movie_buff_board_categories as category
      on category.board_id = board.id
    join public.movie_buff_board_tiles as tile
      on tile.board_id = board.id
     and tile.board_category_id = category.id
    join public.clips as clip
      on clip.id = tile.clip_id
    join public.movies as movie
      on movie.id = clip.movie_id
    where board.room_id = p_room_id
      and board.status in ('ready', 'active')
      and tile.is_used = false
      and clip.is_active = true
      and movie.is_active = true
      and clip.licensing_status in (
        'licensed', 'public_domain', 'promotional', 'user_connected'
      )
      and clip.clip_type in ('video', 'audio')
      and nullif(pg_catalog.btrim(coalesce(clip.media_url, '')), '') is not null
      and not exists (
        select 1
        from public.match_rounds as previous_round
        join public.clips as previous_clip
          on previous_clip.id = previous_round.clip_id
        where previous_round.match_id = v_state.match_id
          and previous_round.id <> v_state.round_id
          and (
            previous_round.clip_id = clip.id
            or previous_clip.movie_id = clip.movie_id
          )
      )
    order by category.display_order, tile.tile_order, tile.id
    limit 1;

    if v_auto_tile_id is null then
      update public.movie_buff_match_phase_state
      set
        phase = 'blocked',
        phase_version = phase_version + 1,
        phase_started_at = v_now,
        phase_ends_at = null,
        blocked_reason = 'No eligible board tile remains without relaxing rights/media/repeat gates.',
        updated_at = v_now
      where match_id = v_state.match_id
      returning * into v_state;
    else
      select case
        when seat.controller_type = 'buster' then 'buster_timeout'
        else 'timeout'
      end
      into v_from_phase
      from public.movie_buff_match_participant_seats as seat
      where seat.match_id = v_state.match_id
        and seat.seat_index = v_state.selector_seat_index;

      v_result := public.movie_buff_apply_phase_tile_selection(
        p_room_id,
        v_state.match_id,
        v_auto_tile_id,
        null,
        coalesce(v_from_phase, 'system')
      );

      select state.* into v_state
      from public.movie_buff_match_phase_state as state
      where state.match_id = v_state.match_id;
    end if;
  elsif v_state.phase = 'transition'
        and v_state.phase_ends_at <= v_now then
    v_from_phase := v_state.phase;
    v_playback_seconds := public.movie_buff_clip_playback_seconds(
      v_state.selected_clip_id
    );
    if v_playback_seconds is null then
      raise exception 'Selected clip playback duration could not be resolved.';
    end if;

    update public.movie_buff_match_phase_state
    set
      phase = 'playback',
      phase_version = phase_version + 1,
      phase_started_at = greatest(v_now, playback_starts_at),
      phase_ends_at = greatest(v_now, playback_starts_at)
        + pg_catalog.make_interval(secs => v_playback_seconds),
      updated_at = v_now
    where match_id = v_state.match_id
    returning * into v_state;

    perform public.movie_buff_phase_set_vip_activation(
      p_room_id,
      v_state.round_id,
      'playback'
    );

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_from_phase,
      'playback',
      'server_timestamp',
      v_actor,
      pg_catalog.jsonb_build_object(
        'playbackStartsAt', v_state.phase_started_at,
        'playbackEndsAt', v_state.phase_ends_at
      )
    );
  elsif v_state.phase = 'playback'
        and v_state.phase_ends_at <= v_now then
    v_from_phase := v_state.phase;
    select mr.time_limit_seconds
    into v_answer_seconds
    from public.match_rounds as mr
    where mr.id = v_state.round_id;
    v_answer_seconds := greatest(1, coalesce(v_answer_seconds, 30));

    insert into public.match_round_player_playback (
      round_id,
      player_id,
      started_at
    )
    select
      v_state.round_id,
      seat.original_player_id,
      v_now
    from public.movie_buff_match_participant_seats as seat
    where seat.match_id = v_state.match_id
      and seat.controller_type = 'human'
      and seat.participant_state in ('active', 'reconnect_grace')
    on conflict (round_id, player_id)
    do update set started_at = excluded.started_at;

    update public.match_rounds
    set playback_started_at = v_now
    where id = v_state.round_id;

    update public.movie_buff_match_phase_state
    set
      phase = 'answer',
      phase_version = phase_version + 1,
      phase_started_at = v_now,
      phase_ends_at = v_now + pg_catalog.make_interval(secs => v_answer_seconds),
      answer_deadline_at = v_now + pg_catalog.make_interval(secs => v_answer_seconds),
      updated_at = v_now
    where match_id = v_state.match_id
    returning * into v_state;

    perform public.movie_buff_phase_set_vip_activation(
      p_room_id,
      v_state.round_id,
      'answer'
    );

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_from_phase,
      'answer',
      'playback_complete',
      v_actor,
      pg_catalog.jsonb_build_object(
        'answerStartedAt', v_state.phase_started_at,
        'answerDeadlineAt', v_state.answer_deadline_at
      )
    );
  elsif v_state.phase = 'answer' then
    select count(*)::integer
    into v_required_answers
    from public.movie_buff_match_participant_seats as seat
    where seat.match_id = v_state.match_id
      and seat.controller_type = 'human'
      and seat.participant_state in ('active', 'reconnect_grace');

    select count(*)::integer
    into v_submitted_answers
    from public.answers as answer
    join public.movie_buff_match_participant_seats as seat
      on seat.match_id = v_state.match_id
     and seat.original_player_id = answer.player_id
     and seat.controller_type = 'human'
     and seat.participant_state in ('active', 'reconnect_grace')
    where answer.round_id = v_state.round_id;

    if v_state.answer_deadline_at <= v_now
       or (v_required_answers > 0 and v_submitted_answers >= v_required_answers) then
      v_from_phase := v_state.phase;
      update public.movie_buff_match_phase_state
      set
        phase = 'results',
        phase_version = phase_version + 1,
        phase_started_at = v_now,
        phase_ends_at = v_now + pg_catalog.make_interval(
          secs => public.movie_buff_phase_duration_seconds('results')
        ),
        results_end_at = v_now + pg_catalog.make_interval(
          secs => public.movie_buff_phase_duration_seconds('results')
        ),
        updated_at = v_now
      where match_id = v_state.match_id
      returning * into v_state;

      perform public.movie_buff_phase_set_vip_activation(
        p_room_id,
        v_state.round_id,
        'results'
      );

      perform public.movie_buff_phase_event(
        v_state.match_id,
        p_room_id,
        v_state.round_id,
        v_state.phase_version,
        v_from_phase,
        'results',
        case
          when v_state.answer_deadline_at <= v_now then 'answer_deadline'
          else 'all_humans_answered'
        end,
        v_actor,
        pg_catalog.jsonb_build_object(
          'requiredAnswers', v_required_answers,
          'submittedAnswers', v_submitted_answers,
          'resultsEndAt', v_state.results_end_at
        )
      );
    end if;
  elsif v_state.phase = 'results'
        and v_state.results_end_at <= v_now then
    v_from_phase := v_state.phase;
    update public.match_rounds
    set ended_at = coalesce(ended_at, v_now)
    where id = v_state.round_id;

    if v_state.round_number >= v_state.total_rounds
       or not exists (
         select 1
         from public.movie_buff_boards as board
         join public.movie_buff_board_tiles as tile
           on tile.board_id = board.id
         where board.room_id = p_room_id
           and tile.is_used = false
       ) then
      update public.movie_buff_match_phase_state
      set
        phase = 'finished',
        phase_version = phase_version + 1,
        phase_started_at = v_now,
        phase_ends_at = null,
        selector_deadline_at = null,
        answer_deadline_at = null,
        results_end_at = null,
        updated_at = v_now
      where match_id = v_state.match_id
      returning * into v_state;

      update public.matches
      set status = 'finished', finished_at = coalesce(finished_at, v_now)
      where id = v_state.match_id;
      update public.game_rooms
      set status = 'finished', finished_at = coalesce(finished_at, v_now)
      where id = p_room_id;
      update public.movie_buff_match_participant_seats
      set participant_state = 'completed', updated_at = v_now
      where match_id = v_state.match_id
        and participant_state <> 'abandoned';

      perform public.movie_buff_phase_event(
        v_state.match_id,
        p_room_id,
        v_state.round_id,
        v_state.phase_version,
        v_from_phase,
        'finished',
        'match_complete',
        v_actor,
        '{}'::jsonb
      );
    else
      select mr.*
      into v_next_round
      from public.match_rounds as mr
      where mr.match_id = v_state.match_id
        and mr.round_number = v_state.round_number + 1
      for update;

      if not found then
        insert into public.match_rounds (
          match_id,
          clip_id,
          round_number,
          time_limit_seconds,
          started_at,
          ended_at
        )
        values (
          v_state.match_id,
          null,
          v_state.round_number + 1,
          30,
          null,
          null
        )
        returning * into v_next_round;
      end if;

      v_next_selector := public.movie_buff_next_selector_seat(
        v_state.match_id,
        v_state.selector_seat_index
      );

      update public.game_rooms
      set current_round = v_next_round.round_number
      where id = p_room_id;

      update public.movie_buff_match_phase_state
      set
        round_id = v_next_round.id,
        round_number = v_next_round.round_number,
        phase = 'round_intro',
        phase_version = phase_version + 1,
        phase_started_at = v_now,
        phase_ends_at = v_now + pg_catalog.make_interval(
          secs => public.movie_buff_phase_duration_seconds('round_intro')
        ),
        selector_seat_index = v_next_selector,
        selector_deadline_at = null,
        selected_tile_id = null,
        selected_clip_id = null,
        selection_source = null,
        playback_starts_at = null,
        answer_deadline_at = null,
        results_end_at = null,
        blocked_reason = null,
        updated_at = v_now
      where match_id = v_state.match_id
      returning * into v_state;

      perform public.movie_buff_phase_event(
        v_state.match_id,
        p_room_id,
        v_state.round_id,
        v_state.phase_version,
        v_from_phase,
        'round_intro',
        'next_round',
        v_actor,
        pg_catalog.jsonb_build_object(
          'roundNumber', v_state.round_number,
          'selectorSeatIndex', v_next_selector
        )
      );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'advanced', v_state.phase <> coalesce(v_from_phase, v_state.phase),
    'matchId', v_state.match_id,
    'roundId', v_state.round_id,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'phaseEndsAt', v_state.phase_ends_at,
    'blockedReason', v_state.blocked_reason,
    'serverNow', v_now
  );
end;
$$;

create or replace function public.get_movie_buff_match_phase_view(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_selector public.movie_buff_match_participant_seats%rowtype;
  v_participants jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);
  if v_player_id is not null then
    perform public.touch_movie_buff_match_participant(p_room_id);
  end if;

  -- A caller-safe read also ticks one expired/complete transition. Any active
  -- member may race; the phase row lock and version make the result singular.
  perform public.advance_movie_buff_match_phase(p_room_id, null);

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  select seat.*
  into v_selector
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.seat_index = v_state.selector_seat_index;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'seatIndex', seat.seat_index,
        'playerId', seat.original_player_id,
        'controllerType', seat.controller_type,
        'participantState', seat.participant_state,
        'reconnectDeadlineAt', seat.reconnect_deadline_at,
        'isSelector', seat.seat_index = v_state.selector_seat_index,
        'score', coalesce(rp.score, 0)
      )
      order by seat.seat_index
    ),
    '[]'::jsonb
  )
  into v_participants
  from public.movie_buff_match_participant_seats as seat
  left join public.room_players as rp
    on rp.room_id = p_room_id
   and rp.player_id = seat.original_player_id
  where seat.match_id = v_state.match_id;

  return pg_catalog.jsonb_build_object(
    'roomId', v_state.room_id,
    'matchId', v_state.match_id,
    'roundId', v_state.round_id,
    'roundNumber', v_state.round_number,
    'totalRounds', v_state.total_rounds,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'phaseStartedAt', v_state.phase_started_at,
    'phaseEndsAt', v_state.phase_ends_at,
    'phaseRoute', public.movie_buff_phase_route(v_state.phase),
    'selectorSeatIndex', v_state.selector_seat_index,
    'selectorPlayerId', case
      when v_selector.controller_type = 'human'
      then v_selector.controller_player_id
      else null
    end,
    'selectorControllerType', v_selector.controller_type,
    'callerIsSelector', (
      v_player_id is not null
      and v_selector.controller_type = 'human'
      and v_selector.controller_player_id = v_player_id
      and v_selector.participant_state = 'active'
    ),
    'selectorDeadlineAt', v_state.selector_deadline_at,
    'selectedTileId', v_state.selected_tile_id,
    'selectedClipId', v_state.selected_clip_id,
    'selectionSource', v_state.selection_source,
    'playbackStartsAt', v_state.playback_starts_at,
    'answerDeadlineAt', v_state.answer_deadline_at,
    'resultsEndAt', v_state.results_end_at,
    'blockedReason', v_state.blocked_reason,
    'participants', v_participants,
    'serverNow', v_now
  );
end;
$$;

alter function public.movie_buff_clip_playback_seconds(uuid) owner to postgres;
alter function public.movie_buff_phase_require_access(uuid) owner to postgres;
alter function public.movie_buff_next_selector_seat(uuid, integer) owner to postgres;
alter function public.movie_buff_phase_event(uuid,uuid,uuid,bigint,text,text,text,uuid,jsonb) owner to postgres;
alter function public.ensure_movie_buff_match_phase_state(uuid) owner to postgres;
alter function public.touch_movie_buff_match_participant(uuid) owner to postgres;
alter function public.movie_buff_phase_set_vip_activation(uuid,uuid,text) owner to postgres;
alter function public.movie_buff_phase_open_vip_window(uuid,uuid,uuid,timestamptz) owner to postgres;
alter function public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text) owner to postgres;
alter function public.movie_buff_phase_vip_ready(uuid) owner to postgres;
alter function public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text) owner to postgres;
alter function public.select_movie_buff_match_tile(uuid,uuid,bigint,text) owner to postgres;
alter function public.advance_movie_buff_match_phase(uuid,bigint) owner to postgres;
alter function public.get_movie_buff_match_phase_view(uuid) owner to postgres;

revoke all on function public.movie_buff_phase_duration_seconds(text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_route(text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_clip_playback_seconds(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_require_access(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_next_selector_seat(uuid,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_event(uuid,uuid,uuid,bigint,text,text,text,uuid,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_movie_buff_match_phase_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.touch_movie_buff_match_participant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_set_vip_activation(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_open_vip_window(uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_vip_ready(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.advance_movie_buff_match_phase(uuid,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_match_phase_view(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  to authenticated, service_role;
grant execute on function public.advance_movie_buff_match_phase(uuid,bigint)
  to authenticated, service_role;
grant execute on function public.get_movie_buff_match_phase_view(uuid)
  to authenticated, service_role;
grant execute on function public.touch_movie_buff_match_participant(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
