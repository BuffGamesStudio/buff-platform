-- Movie Buff Live: durable show runner, contestant queue, and episode lease.
--
-- The existing Movie Buff phase machine remains authoritative for gameplay.
-- This migration adds only the long-lived show lifecycle around it:
--   1. authenticated players can queue for the main live show;
--   2. one leased worker atomically selects three queued contestants;
--   3. the worker starts and ticks the existing Movie Buff match timeline;
--   4. completed contestants enter a short cooldown before re-queueing.
--
-- Production deployment is intentionally separate from this repository change.

create table if not exists public.movie_buff_live_shows (
  id uuid primary key default extensions.gen_random_uuid(),
  show_key text not null unique,
  status text not null default 'waiting_for_contestants'
    check (status in (
      'waiting_for_contestants',
      'casting',
      'live',
      'cooldown',
      'paused',
      'error'
    )),
  episode_number bigint not null default 0 check (episode_number >= 0),
  current_episode_id uuid,
  current_phase text,
  current_phase_ends_at timestamptz,
  next_tick_at timestamptz,
  worker_id text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  last_error text,
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.movie_buff_live_show_episodes (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid not null references public.movie_buff_live_shows(id) on delete cascade,
  episode_number bigint not null check (episode_number > 0),
  room_id uuid references public.game_rooms(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  status text not null default 'casting'
    check (status in ('casting', 'live', 'completed', 'abandoned')),
  winner_player_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (show_id, episode_number),
  unique (room_id),
  unique (match_id)
);

alter table public.movie_buff_live_shows
  drop constraint if exists movie_buff_live_show_current_episode_fk;
alter table public.movie_buff_live_shows
  add constraint movie_buff_live_show_current_episode_fk
  foreign key (current_episode_id)
  references public.movie_buff_live_show_episodes(id)
  on delete set null;

create table if not exists public.movie_buff_live_queue (
  id uuid primary key default extensions.gen_random_uuid(),
  show_id uuid not null references public.movie_buff_live_shows(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'on_stage', 'cooldown', 'left', 'expired')),
  joined_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  selected_at timestamptz,
  completed_at timestamptz,
  cooldown_until timestamptz,
  current_episode_id uuid references public.movie_buff_live_show_episodes(id)
    on delete set null,
  seat_index integer check (seat_index is null or seat_index > 0),
  last_result text check (last_result is null or last_result in ('winner', 'contestant')),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists movie_buff_live_queue_one_active_entry_idx
  on public.movie_buff_live_queue(show_id, player_id)
  where status in ('queued', 'on_stage', 'cooldown');

create index if not exists movie_buff_live_queue_pick_idx
  on public.movie_buff_live_queue(show_id, status, joined_at, id);

create index if not exists movie_buff_live_queue_episode_idx
  on public.movie_buff_live_queue(current_episode_id, status, seat_index);

create index if not exists movie_buff_live_episode_status_idx
  on public.movie_buff_live_show_episodes(show_id, status, episode_number desc);

alter table public.movie_buff_live_shows enable row level security;
alter table public.movie_buff_live_shows force row level security;
alter table public.movie_buff_live_show_episodes enable row level security;
alter table public.movie_buff_live_show_episodes force row level security;
alter table public.movie_buff_live_queue enable row level security;
alter table public.movie_buff_live_queue force row level security;

revoke all on public.movie_buff_live_shows from public, anon, authenticated;
revoke all on public.movie_buff_live_show_episodes from public, anon, authenticated;
revoke all on public.movie_buff_live_queue from public, anon, authenticated;
grant all on public.movie_buff_live_shows to service_role;
grant all on public.movie_buff_live_show_episodes to service_role;
grant all on public.movie_buff_live_queue to service_role;

insert into public.movie_buff_live_shows (show_key)
values ('main')
on conflict (show_key) do nothing;

create or replace function public.movie_buff_live_show_view(
  p_show_key text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_user_id uuid := auth.uid();
  v_show public.movie_buff_live_shows%rowtype;
  v_episode public.movie_buff_live_show_episodes%rowtype;
  v_phase public.movie_buff_match_phase_state%rowtype;
  v_contestants jsonb;
  v_queue_count integer := 0;
  v_my_status text;
  v_my_queue_position integer;
begin
  select show.*
  into v_show
  from public.movie_buff_live_shows as show
  where show.show_key = pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main')))
  limit 1;

  if not found then
    raise exception 'Movie Buff Live show not found.';
  end if;

  if v_show.current_episode_id is not null then
    select episode.*
    into v_episode
    from public.movie_buff_live_show_episodes as episode
    where episode.id = v_show.current_episode_id;
  end if;

  if v_episode.match_id is not null then
    select state.*
    into v_phase
    from public.movie_buff_match_phase_state as state
    where state.match_id = v_episode.match_id;
  end if;

  select count(*)::integer
  into v_queue_count
  from public.movie_buff_live_queue as queue
  where queue.show_id = v_show.id
    and queue.status = 'queued';

  if v_user_id is not null then
    select queue.status
    into v_my_status
    from public.movie_buff_live_queue as queue
    where queue.show_id = v_show.id
      and queue.player_id = v_user_id
      and queue.status in ('queued', 'on_stage', 'cooldown')
    order by queue.updated_at desc, queue.id desc
    limit 1;

    if v_my_status = 'queued' then
      select count(*)::integer + 1
      into v_my_queue_position
      from public.movie_buff_live_queue as queue
      where queue.show_id = v_show.id
        and queue.status = 'queued'
        and queue.joined_at < (
          select current_queue.joined_at
          from public.movie_buff_live_queue as current_queue
          where current_queue.show_id = v_show.id
            and current_queue.player_id = v_user_id
            and current_queue.status = 'queued'
          order by current_queue.updated_at desc, current_queue.id desc
          limit 1
        );
    end if;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'seatIndex', queue.seat_index,
        'displayName', coalesce(nullif(profile.display_name, ''), nullif(profile.username, ''), 'Movie Buff'),
        'avatarUrl', profile.avatar_url,
        'score', coalesce(room_player.score, 0),
        'participantState', coalesce(seat.participant_state, 'active')
      )
      order by queue.seat_index
    ),
    '[]'::jsonb
  )
  into v_contestants
  from public.movie_buff_live_queue as queue
  join public.profiles as profile
    on profile.id = queue.player_id
  left join public.movie_buff_match_participant_seats as seat
    on seat.match_id = v_episode.match_id
   and seat.seat_index = queue.seat_index
  left join public.room_players as room_player
    on room_player.room_id = v_episode.room_id
   and room_player.player_id = queue.player_id
  where queue.current_episode_id = v_show.current_episode_id
    and queue.status = 'on_stage';

  return pg_catalog.jsonb_build_object(
    'showKey', v_show.show_key,
    'status', v_show.status,
    'episodeNumber', v_show.episode_number,
    'roomId', v_episode.room_id,
    'matchId', v_episode.match_id,
    'currentPhase', v_phase.phase,
    'currentPhaseVersion', v_phase.phase_version,
    'currentPhaseEndsAt', v_phase.phase_ends_at,
    'currentRoundNumber', v_phase.round_number,
    'totalRounds', v_phase.total_rounds,
    'queueCount', v_queue_count,
    'queueCapacity', 3,
    'myQueueStatus', v_my_status,
    'myQueuePosition', v_my_queue_position,
    'contestants', v_contestants,
    'serverNow', v_now,
    'nextTickAt', v_show.next_tick_at,
    'lastHeartbeatAt', v_show.last_heartbeat_at
  );
end;
$$;

create or replace function public.get_movie_buff_live_show_view(
  p_show_key text default 'main'
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select public.movie_buff_live_show_view(p_show_key);
$$;

create or replace function public.join_movie_buff_live_queue(
  p_show_key text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_user_id uuid := auth.uid();
  v_show public.movie_buff_live_shows%rowtype;
  v_entry public.movie_buff_live_queue%rowtype;
  v_position integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to join the Movie Buff Live contestant queue.';
  end if;

  select show.*
  into v_show
  from public.movie_buff_live_shows as show
  where show.show_key = pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main')))
  for update;

  if not found then
    raise exception 'Movie Buff Live show not found.';
  end if;

  select queue.*
  into v_entry
  from public.movie_buff_live_queue as queue
  where queue.show_id = v_show.id
    and queue.player_id = v_user_id
    and queue.status in ('queued', 'on_stage', 'cooldown')
  order by queue.updated_at desc, queue.id desc
  limit 1
  for update;

  if found then
    if v_entry.status = 'cooldown'
       and coalesce(v_entry.cooldown_until, v_now) <= v_now then
      update public.movie_buff_live_queue
      set
        status = 'queued',
        joined_at = v_now,
        last_seen_at = v_now,
        selected_at = null,
        completed_at = null,
        cooldown_until = null,
        current_episode_id = null,
        seat_index = null,
        last_result = null,
        updated_at = v_now
      where id = v_entry.id
      returning * into v_entry;
    else
      update public.movie_buff_live_queue
      set last_seen_at = v_now, updated_at = v_now
      where id = v_entry.id
      returning * into v_entry;
    end if;
  else
    insert into public.movie_buff_live_queue (
      show_id,
      player_id,
      status,
      joined_at,
      last_seen_at,
      updated_at
    )
    values (v_show.id, v_user_id, 'queued', v_now, v_now, v_now)
    returning * into v_entry;
  end if;

  if v_entry.status = 'queued' then
    select count(*)::integer + 1
    into v_position
    from public.movie_buff_live_queue as queue
    where queue.show_id = v_show.id
      and queue.status = 'queued'
      and queue.joined_at < v_entry.joined_at;
  end if;

  return pg_catalog.jsonb_build_object(
    'entryId', v_entry.id,
    'status', v_entry.status,
    'position', v_position,
    'cooldownUntil', v_entry.cooldown_until,
    'joinedAt', v_entry.joined_at,
    'serverNow', v_now
  );
end;
$$;

create or replace function public.heartbeat_movie_buff_live_queue(
  p_show_key text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to heartbeat the Movie Buff Live queue.';
  end if;

  update public.movie_buff_live_queue as queue
  set last_seen_at = v_now, updated_at = v_now
  from public.movie_buff_live_shows as show
  where show.id = queue.show_id
    and show.show_key = pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main')))
    and queue.player_id = v_user_id
    and queue.status in ('queued', 'on_stage')
    and queue.last_seen_at > v_now - pg_catalog.make_interval(mins => 30);

  get diagnostics v_updated = row_count;

  return pg_catalog.jsonb_build_object(
    'updated', v_updated > 0,
    'serverNow', v_now
  );
end;
$$;

create or replace function public.leave_movie_buff_live_queue(
  p_show_key text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_user_id uuid := auth.uid();
  v_entry public.movie_buff_live_queue%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in to leave the Movie Buff Live queue.';
  end if;

  select queue.*
  into v_entry
  from public.movie_buff_live_queue as queue
  join public.movie_buff_live_shows as show
    on show.id = queue.show_id
  where show.show_key = pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main')))
    and queue.player_id = v_user_id
    and queue.status in ('queued', 'on_stage')
  order by queue.updated_at desc, queue.id desc
  limit 1
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('left', false, 'serverNow', v_now);
  end if;

  if v_entry.status = 'on_stage' then
    raise exception 'Contestants cannot leave while an episode is live.';
  end if;

  update public.movie_buff_live_queue
  set status = 'left', updated_at = v_now
  where id = v_entry.id;

  return pg_catalog.jsonb_build_object('left', true, 'serverNow', v_now);
end;
$$;

create or replace function public.tick_movie_buff_live_show(
  p_show_key text default 'main',
  p_worker_id text default 'movie-buff-live-runner'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_show public.movie_buff_live_shows%rowtype;
  v_episode public.movie_buff_live_show_episodes%rowtype;
  v_phase public.movie_buff_match_phase_state%rowtype;
  v_start record;
  v_room public.game_rooms%rowtype;
  v_first_queue public.movie_buff_live_queue%rowtype;
  v_queue record;
  v_contestant_count integer := 0;
  v_eligible_count integer := 0;
  v_episode_number bigint;
  v_room_code text;
  v_winner uuid;
  v_new_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Movie Buff Live runner ticks require the service role.';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_worker_id, ''))) not between 3 and 128 then
    raise exception 'Invalid Movie Buff Live runner worker id.';
  end if;

  insert into public.movie_buff_live_shows (show_key)
  values (pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main'))))
  on conflict (show_key) do nothing;

  select show.*
  into v_show
  from public.movie_buff_live_shows as show
  where show.show_key = pg_catalog.lower(pg_catalog.btrim(coalesce(p_show_key, 'main')))
  for update;

  if v_show.lease_expires_at is not null
     and v_show.lease_expires_at > v_now
     and v_show.worker_id is distinct from p_worker_id then
    return pg_catalog.jsonb_build_object(
      'action', 'lease_owned',
      'showKey', v_show.show_key,
      'status', v_show.status,
      'workerId', v_show.worker_id,
      'leaseExpiresAt', v_show.lease_expires_at,
      'serverNow', v_now
    );
  end if;

  update public.movie_buff_live_shows
  set
    worker_id = pg_catalog.btrim(p_worker_id),
    lease_expires_at = v_now + pg_catalog.make_interval(secs => 15),
    last_heartbeat_at = v_now,
    updated_at = v_now,
    last_error = null
  where id = v_show.id
  returning * into v_show;

  update public.movie_buff_live_queue
  set
    status = 'expired',
    updated_at = v_now
  where show_id = v_show.id
    and status = 'queued'
    and last_seen_at < v_now - pg_catalog.make_interval(mins => 10);

  if v_show.current_episode_id is not null then
    select episode.*
    into v_episode
    from public.movie_buff_live_show_episodes as episode
    where episode.id = v_show.current_episode_id
    for update;

    if v_episode.status = 'live' and v_episode.room_id is not null then
      perform public.advance_movie_buff_match_phase(v_episode.room_id, null);

      select state.*
      into v_phase
      from public.movie_buff_match_phase_state as state
      where state.match_id = v_episode.match_id
      for update;

      if v_phase.phase in ('finished', 'abandoned')
         or exists (
           select 1
           from public.matches as match
           where match.id = v_episode.match_id
             and match.status <> 'active'
         ) then
        select room_player.player_id
        into v_winner
        from public.room_players as room_player
        where room_player.room_id = v_episode.room_id
          and room_player.left_at is null
        order by room_player.score desc, room_player.joined_at asc, room_player.player_id
        limit 1;

        update public.movie_buff_live_show_episodes
        set
          status = case when v_phase.phase = 'abandoned' then 'abandoned' else 'completed' end,
          winner_player_id = v_winner,
          ended_at = v_now
        where id = v_episode.id;

        update public.movie_buff_live_queue as queue
        set
          status = 'cooldown',
          completed_at = v_now,
          cooldown_until = v_now + pg_catalog.make_interval(secs => 30),
          last_result = case when queue.player_id = v_winner then 'winner' else 'contestant' end,
          updated_at = v_now
        where queue.current_episode_id = v_episode.id
          and queue.status = 'on_stage';

        update public.game_rooms
        set status = case when status = 'active' then 'finished' else status end,
            finished_at = coalesce(finished_at, v_now)
        where id = v_episode.room_id;

        update public.movie_buff_live_shows
        set
          current_episode_id = null,
          current_phase = null,
          current_phase_ends_at = null,
          status = 'cooldown',
          next_tick_at = v_now + pg_catalog.make_interval(secs => 5),
          updated_at = v_now
        where id = v_show.id;

        return pg_catalog.jsonb_build_object(
          'action', 'episode_finished',
          'showKey', v_show.show_key,
          'episodeNumber', v_episode.episode_number,
          'episodeId', v_episode.id,
          'status', v_show.status,
          'winnerPlayerId', v_winner,
          'serverNow', v_now
        );
      end if;

      update public.movie_buff_live_shows
      set
        status = 'live',
        current_phase = v_phase.phase,
        current_phase_ends_at = v_phase.phase_ends_at,
        next_tick_at = coalesce(v_phase.phase_ends_at, v_now + pg_catalog.make_interval(secs => 1)),
        updated_at = v_now
      where id = v_show.id;

      return pg_catalog.jsonb_build_object(
        'action', 'phase_tick',
        'showKey', v_show.show_key,
        'episodeNumber', v_episode.episode_number,
        'episodeId', v_episode.id,
        'phase', v_phase.phase,
        'phaseVersion', v_phase.phase_version,
        'phaseEndsAt', v_phase.phase_ends_at,
        'serverNow', v_now
      );
    end if;
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.movie_buff_live_queue as queue
  where queue.show_id = v_show.id
    and queue.status = 'queued'
    and queue.last_seen_at >= v_now - pg_catalog.make_interval(mins => 10);

  if v_eligible_count < 3 then
    update public.movie_buff_live_shows
    set
      status = 'waiting_for_contestants',
      current_phase = null,
      current_phase_ends_at = null,
      next_tick_at = v_now + pg_catalog.make_interval(secs => 2),
      updated_at = v_now
    where id = v_show.id;

    return pg_catalog.jsonb_build_object(
      'action', 'waiting_for_contestants',
      'showKey', v_show.show_key,
      'queueCount', v_eligible_count,
      'requiredContestants', 3,
      'serverNow', v_now
    );
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.movie_buff_live_queue as queue
  where queue.show_id = v_show.id
    and queue.status = 'queued'
    and queue.last_seen_at >= v_now - pg_catalog.make_interval(mins => 10)
    and not exists (
      select 1
      from public.room_players as active_room_player
      join public.game_rooms as active_room
        on active_room.id = active_room_player.room_id
      where active_room_player.player_id = queue.player_id
        and active_room_player.left_at is null
        and active_room.status in ('waiting', 'starting', 'active')
    );

  if v_eligible_count < 3 then
    update public.movie_buff_live_shows
    set
      status = 'casting',
      next_tick_at = v_now + pg_catalog.make_interval(secs => 2),
      updated_at = v_now
    where id = v_show.id;

    return pg_catalog.jsonb_build_object(
      'action', 'casting',
      'showKey', v_show.show_key,
      'queueCount', v_eligible_count,
      'serverNow', v_now
    );
  end if;

  select queue.*
  into v_first_queue
  from public.movie_buff_live_queue as queue
  where queue.show_id = v_show.id
    and queue.status = 'queued'
    and queue.last_seen_at >= v_now - pg_catalog.make_interval(mins => 10)
    and not exists (
      select 1
      from public.room_players as active_room_player
      join public.game_rooms as active_room
        on active_room.id = active_room_player.room_id
      where active_room_player.player_id = queue.player_id
        and active_room_player.left_at is null
        and active_room.status in ('waiting', 'starting', 'active')
    )
  order by queue.joined_at, queue.id
  limit 1
  for update;

  if not found then
    update public.movie_buff_live_shows
    set
      status = 'casting',
      next_tick_at = v_now + pg_catalog.make_interval(secs => 2),
      updated_at = v_now
    where id = v_show.id;

    return pg_catalog.jsonb_build_object(
      'action', 'casting',
      'showKey', v_show.show_key,
      'queueCount', v_contestant_count,
      'serverNow', v_now
    );
  end if;

  v_episode_number := v_show.episode_number + 1;
  v_room_code := 'LIVE' || pg_catalog.upper(
    pg_catalog.substr(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8)
  );

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
    is_ranked,
    public_matchmaking_key
  )
  values (
    v_room_code,
    v_first_queue.player_id,
    'public',
    'waiting',
    null,
    'mixed',
    10,
    3,
    0,
    false,
    'movie-buff-live:' || v_show.id::text
  )
  returning * into v_room;

  v_contestant_count := 0;

  for v_queue in
    select queue.*
    from public.movie_buff_live_queue as queue
    where queue.show_id = v_show.id
      and queue.status = 'queued'
      and queue.last_seen_at >= v_now - pg_catalog.make_interval(mins => 10)
      and not exists (
        select 1
        from public.room_players as active_room_player
        join public.game_rooms as active_room
          on active_room.id = active_room_player.room_id
        where active_room_player.player_id = queue.player_id
          and active_room_player.left_at is null
          and active_room.status in ('waiting', 'starting', 'active')
      )
    order by queue.joined_at, queue.id
    limit 3
    for update of queue
  loop
    v_contestant_count := v_contestant_count + 1;

    insert into public.room_players (
      room_id,
      player_id,
      is_ready,
      is_host,
      joined_at,
      last_seen_at
    )
    values (
      v_room.id,
      v_queue.player_id,
      true,
      v_contestant_count = 1,
      v_now,
      v_now
    );
  end loop;

  if v_contestant_count <> 3 then
    raise exception 'Movie Buff Live contestant selection changed during episode admission.';
  end if;

  select *
  into v_start
  from public.begin_movie_buff_match_from_admission(v_room.id);

  insert into public.movie_buff_live_show_episodes (
    show_id,
    episode_number,
    room_id,
    match_id,
    status,
    started_at
  )
  values (
    v_show.id,
    v_episode_number,
    v_room.id,
    v_start.created_match_id,
    'live',
    v_now
  )
  returning * into v_episode;

  update public.movie_buff_live_queue as queue
  set
    status = 'on_stage',
    selected_at = v_now,
    current_episode_id = v_episode.id,
    seat_index = room_player.seat_index,
    updated_at = v_now
  from (
    select player_id, row_number() over (order by joined_at, player_id)::integer as seat_index
    from public.room_players
    where room_id = v_room.id
  ) as room_player
  where queue.show_id = v_show.id
    and queue.player_id = room_player.player_id
    and queue.status = 'queued';

  select state.*
  into v_phase
  from public.movie_buff_match_phase_state as state
  where state.match_id = v_start.created_match_id;

  update public.movie_buff_live_shows
  set
    episode_number = v_episode_number,
    current_episode_id = v_episode.id,
    status = 'live',
    current_phase = v_phase.phase,
    current_phase_ends_at = v_phase.phase_ends_at,
    next_tick_at = v_now + pg_catalog.make_interval(secs => 1),
    updated_at = v_now
  where id = v_show.id;

  return pg_catalog.jsonb_build_object(
    'action', 'episode_started',
    'showKey', v_show.show_key,
    'episodeNumber', v_episode_number,
    'episodeId', v_episode.id,
    'roomId', v_room.id,
    'matchId', v_start.created_match_id,
    'phase', v_phase.phase,
    'phaseEndsAt', v_phase.phase_ends_at,
    'serverNow', v_now
  );
end;
$$;

alter function public.movie_buff_live_show_view(text) owner to postgres;
alter function public.get_movie_buff_live_show_view(text) owner to postgres;
alter function public.join_movie_buff_live_queue(text) owner to postgres;
alter function public.heartbeat_movie_buff_live_queue(text) owner to postgres;
alter function public.leave_movie_buff_live_queue(text) owner to postgres;
alter function public.tick_movie_buff_live_show(text, text) owner to postgres;

revoke all on function public.movie_buff_live_show_view(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_live_show_view(text)
  from public, anon, authenticated, service_role;
revoke all on function public.join_movie_buff_live_queue(text)
  from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_movie_buff_live_queue(text)
  from public, anon, authenticated, service_role;
revoke all on function public.leave_movie_buff_live_queue(text)
  from public, anon, authenticated, service_role;
revoke all on function public.tick_movie_buff_live_show(text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_movie_buff_live_show_view(text)
  to anon, authenticated;
grant execute on function public.join_movie_buff_live_queue(text)
  to authenticated;
grant execute on function public.heartbeat_movie_buff_live_queue(text)
  to authenticated;
grant execute on function public.leave_movie_buff_live_queue(text)
  to authenticated;
grant execute on function public.tick_movie_buff_live_show(text, text)
  to service_role;

notify pgrst, 'reload schema';
