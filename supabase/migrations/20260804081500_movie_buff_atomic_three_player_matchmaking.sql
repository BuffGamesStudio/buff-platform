-- MOV-15: atomic strict-three public matchmaking convergence.
-- This migration owns public admission/readiness only. It does not advance shared
-- board, VIP, playback, answer, results, or reconnect phases.

create or replace function public.movie_buff_public_match_size()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select 3;
$$;

create or replace function public.movie_buff_public_compatibility_key(
  p_category_id uuid,
  p_difficulty text,
  p_total_rounds integer
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select pg_catalog.concat_ws(
    '|',
    coalesce(p_category_id::text, 'all'),
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_difficulty, ''))),
    p_total_rounds::text,
    public.movie_buff_public_match_size()::text
  );
$$;

alter table public.game_rooms
  add column if not exists public_matchmaking_key text;

-- Fail closed rather than silently merging or deleting duplicate compatible
-- waiting rooms that predate the durable uniqueness boundary.
do $$
declare
  v_duplicate_key text;
begin
  select duplicate_key
  into v_duplicate_key
  from (
    select
      public.movie_buff_public_compatibility_key(
        gr.category_id,
        gr.difficulty,
        gr.total_rounds
      ) as duplicate_key,
      count(*) as room_count
    from public.game_rooms as gr
    where gr.room_type = 'public'
      and gr.status = 'waiting'
    group by 1
    having count(*) > 1
    order by 1
    limit 1
  ) as duplicates;

  if v_duplicate_key is not null then
    raise exception
      'MOV-15 preflight blocked: duplicate compatible public waiting rooms exist for key %.',
      v_duplicate_key;
  end if;
end;
$$;

update public.game_rooms as gr
set
  difficulty = pg_catalog.lower(pg_catalog.btrim(gr.difficulty)),
  max_players = public.movie_buff_public_match_size(),
  public_matchmaking_key = public.movie_buff_public_compatibility_key(
    gr.category_id,
    gr.difficulty,
    gr.total_rounds
  )
where gr.room_type = 'public'
  and gr.status = 'waiting';

alter table public.game_rooms
  drop constraint if exists movie_buff_public_waiting_room_key_required;
alter table public.game_rooms
  add constraint movie_buff_public_waiting_room_key_required
  check (
    room_type <> 'public'
    or status <> 'waiting'
    or (
      public_matchmaking_key is not null
      and max_players = 3
    )
  ) not valid;
alter table public.game_rooms
  validate constraint movie_buff_public_waiting_room_key_required;

create unique index if not exists game_rooms_one_public_waiting_compatibility_key_idx
  on public.game_rooms(public_matchmaking_key)
  where room_type = 'public'
    and status = 'waiting';

create or replace function public.assert_movie_buff_strict_three_ready(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_room public.game_rooms%rowtype;
  v_active_players integer;
  v_ready_players integer;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.room_type <> 'public' then
    return;
  end if;

  select
    count(*) filter (where rp.left_at is null)::integer,
    count(*) filter (
      where rp.left_at is null
        and rp.is_ready = true
    )::integer
  into v_active_players, v_ready_players
  from public.room_players as rp
  where rp.room_id = p_room_id;

  if v_room.max_players <> public.movie_buff_public_match_size() then
    raise exception 'Public match capacity must be exactly 3 players.';
  end if;

  if v_active_players <> public.movie_buff_public_match_size() then
    raise exception 'Public matches require exactly 3 active players before starting.';
  end if;

  if v_ready_players <> public.movie_buff_public_match_size() then
    raise exception 'All 3 public players must be ready before starting.';
  end if;
end;
$$;

create or replace function public.find_or_create_movie_buff_public_room(
  p_category_id uuid default null,
  p_difficulty text default 'medium',
  p_total_rounds integer default 10,
  p_max_players integer default 3
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
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_difficulty text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(p_difficulty, 'medium'))
  );
  v_public_size integer := public.movie_buff_public_match_size();
  v_compatibility_key text;
  v_existing_room public.game_rooms%rowtype;
  v_candidate_room public.game_rooms%rowtype;
  v_room_code text;
  v_open_memberships integer;
  v_active_members integer;
  v_created_new boolean := false;
  v_presence_cutoff timestamptz;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if v_normalized_difficulty not in ('easy', 'medium', 'hard', 'expert', 'mixed') then
    raise exception 'Select a valid difficulty.';
  end if;

  if p_total_rounds < 1 or p_total_rounds > 50 then
    raise exception 'Select a valid round count.';
  end if;

  -- Retain the legacy parameter for API compatibility, but never let the caller
  -- control public match capacity.
  perform p_max_players;

  v_compatibility_key := public.movie_buff_public_compatibility_key(
    p_category_id,
    v_normalized_difficulty,
    p_total_rounds
  );

  -- Serialize all admission decisions for this authenticated player before
  -- checking or creating an open membership.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'movie-buff-public-player|' || v_user_id::text,
      0
    )
  );

  v_presence_cutoff := pg_catalog.clock_timestamp()
    - pg_catalog.make_interval(
        secs => public.movie_buff_room_presence_timeout_seconds()
      );

  update public.room_players as rp
  set
    is_ready = false,
    is_host = false,
    left_at = pg_catalog.clock_timestamp()
  from public.game_rooms as gr
  where gr.id = rp.room_id
    and gr.room_type = 'public'
    and gr.status = 'waiting'
    and rp.left_at is null
    and rp.last_seen_at < v_presence_cutoff;

  update public.game_rooms as gr
  set status = 'cancelled'
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and not exists (
      select 1
      from public.room_players as rp
      where rp.room_id = gr.id
        and rp.left_at is null
    );

  select count(*)::integer
  into v_open_memberships
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where rp.player_id = v_user_id
    and rp.left_at is null
    and gr.status in ('waiting', 'starting', 'active');

  if v_open_memberships > 1 then
    raise exception 'Player has multiple active Movie Buff room memberships.';
  end if;

  select gr.*
  into v_existing_room
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where rp.player_id = v_user_id
    and rp.left_at is null
    and gr.status in ('waiting', 'starting', 'active')
  order by gr.created_at asc
  limit 1
  for update of gr;

  if found then
    if v_existing_room.room_type = 'public'
       and v_existing_room.status = 'waiting'
       and v_existing_room.public_matchmaking_key = v_compatibility_key
    then
      update public.room_players
      set last_seen_at = pg_catalog.clock_timestamp()
      where room_id = v_existing_room.id
        and player_id = v_user_id
        and left_at is null;

      return query
      select
        v_existing_room.id,
        v_existing_room.room_code,
        v_existing_room.host_id,
        v_existing_room.room_type,
        v_existing_room.status,
        v_existing_room.category_id,
        v_existing_room.difficulty,
        v_existing_room.total_rounds,
        v_existing_room.max_players,
        v_existing_room.current_round,
        v_existing_room.is_ranked,
        v_existing_room.created_at,
        v_existing_room.started_at,
        v_existing_room.finished_at,
        false;
      return;
    end if;

    raise exception 'Leave your current open Movie Buff room before finding another match.';
  end if;

  -- One compatibility lock is the serialization boundary for candidate
  -- selection and creation. Candidate rows are waited on and re-evaluated;
  -- SKIP LOCKED is intentionally forbidden here.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'movie-buff-public-compatibility|' || v_compatibility_key,
      0
    )
  );

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.room_type = 'public'
    and gr.status = 'waiting'
    and gr.public_matchmaking_key = v_compatibility_key
  order by gr.created_at asc
  limit 1
  for update;

  if found then
    update public.room_players as rp
    set
      is_ready = false,
      is_host = false,
      left_at = pg_catalog.clock_timestamp()
    where rp.room_id = v_candidate_room.id
      and rp.left_at is null
      and rp.last_seen_at < v_presence_cutoff;

    select count(*)::integer
    into v_active_members
    from public.room_players as rp
    where rp.room_id = v_candidate_room.id
      and rp.left_at is null;

    if v_active_members = 0 then
      update public.game_rooms
      set status = 'cancelled'
      where id = v_candidate_room.id;
      v_candidate_room.id := null;
    elsif v_active_members >= v_public_size then
      raise exception 'The compatible public room is already full.';
    end if;
  end if;

  if v_candidate_room.id is null then
    loop
      v_room_code := pg_catalog.upper(
        pg_catalog.substr(
          pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
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
          is_ranked,
          public_matchmaking_key
        )
        values (
          v_room_code,
          v_user_id,
          'public',
          'waiting',
          p_category_id,
          v_normalized_difficulty,
          p_total_rounds,
          v_public_size,
          0,
          false,
          v_compatibility_key
        )
        returning * into v_candidate_room;

        v_created_new := true;
        exit;
      exception
        when unique_violation then
          select gr.*
          into v_candidate_room
          from public.game_rooms as gr
          where gr.room_type = 'public'
            and gr.status = 'waiting'
            and gr.public_matchmaking_key = v_compatibility_key
          limit 1
          for update;

          if found then
            v_created_new := false;
            exit;
          end if;
          -- Otherwise the collision was only the generated room code.
      end;
    end loop;
  end if;

  select count(*)::integer
  into v_active_members
  from public.room_players as rp
  where rp.room_id = v_candidate_room.id
    and rp.left_at is null;

  if v_active_members >= v_public_size then
    raise exception 'The compatible public room is already full.';
  end if;

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
    v_created_new,
    null,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  )
  on conflict (room_id, player_id)
  do update
    set
      is_ready = false,
      is_host = excluded.is_host,
      left_at = null,
      joined_at = pg_catalog.clock_timestamp(),
      last_seen_at = pg_catalog.clock_timestamp();

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = v_candidate_room.id
      and rp.left_at is null
      and rp.is_host = true
  ) then
    update public.room_players as rp
    set is_host = (
      rp.player_id = (
        select candidate.player_id
        from public.room_players as candidate
        where candidate.room_id = v_candidate_room.id
          and candidate.left_at is null
        order by candidate.joined_at asc, candidate.player_id asc
        limit 1
      )
    )
    where rp.room_id = v_candidate_room.id;

    select rp.player_id
    into v_candidate_room.host_id
    from public.room_players as rp
    where rp.room_id = v_candidate_room.id
      and rp.left_at is null
      and rp.is_host = true
    limit 1;

    update public.game_rooms
    set host_id = v_candidate_room.host_id
    where id = v_candidate_room.id;
  end if;

  if v_created_new then
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
      pg_catalog.jsonb_build_object(
        'roomType', 'public',
        'difficulty', v_normalized_difficulty,
        'totalRounds', p_total_rounds,
        'maxPlayers', v_public_size,
        'compatibilityKey', v_compatibility_key,
        'mode', 'public_matchmaking'
      )
    );
  end if;

  select gr.*
  into v_candidate_room
  from public.game_rooms as gr
  where gr.id = v_candidate_room.id;

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
    v_created_new;
end;
$$;

create or replace function public.set_movie_buff_player_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
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
  for update of gr;

  if not found then
    raise exception 'You can only change ready status for your current waiting room.';
  end if;

  if v_room.room_type = 'public' then
    perform public.cleanup_movie_buff_waiting_room(p_room_id, v_user_id);
  end if;

  update public.room_players
  set
    is_ready = p_is_ready,
    last_seen_at = pg_catalog.clock_timestamp()
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
    count(*) filter (where rp.left_at is null)::integer,
    count(*) filter (
      where rp.left_at is null
        and rp.is_ready = true
    )::integer
  into v_active_players, v_ready_players
  from public.room_players as rp
  where rp.room_id = p_room_id;

  if v_active_players > public.movie_buff_public_match_size() then
    raise exception 'Public room contains more than 3 active players.';
  end if;

  if v_active_players <> public.movie_buff_public_match_size()
     or v_ready_players <> public.movie_buff_public_match_size()
  then
    return;
  end if;

  perform public.start_movie_buff_match(p_room_id);
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
set search_path = pg_catalog
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

  if v_room.status in ('starting', 'active') then
    select m.id
    into v_match_id
    from public.matches as m
    where m.room_id = p_room_id
      and m.status = 'active'
    order by m.started_at desc
    limit 1;

    if v_match_id is null then
      raise exception 'Active room has no authoritative active match.';
    end if;

    select mr.id
    into v_round_id
    from public.match_rounds as mr
    where mr.match_id = v_match_id
    order by mr.round_number asc
    limit 1;

    if v_round_id is null then
      raise exception 'Active match has no authoritative round.';
    end if;

    return query select v_match_id, v_round_id;
    return;
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'This room cannot be started from its current state.';
  end if;

  select count(*)::integer
  into v_player_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  select count(*)::integer
  into v_ready_count
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null
    and rp.is_ready = true;

  if v_player_count = 0 then
    raise exception 'The room has no active players.';
  end if;

  if v_room.room_type = 'public' then
    perform public.assert_movie_buff_strict_three_ready(p_room_id);
  elsif v_ready_count <> v_player_count then
    raise exception 'Every player must be ready before starting.';
  end if;

  select count(*)::integer
  into v_available_clip_count
  from public.clips as c
  join public.movies as mo
    on mo.id = c.movie_id
  where c.is_active = true
    and mo.is_active = true
    and c.clip_type = 'video'
    and nullif(pg_catalog.btrim(coalesce(c.media_url, '')), '') is not null
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
      pg_catalog.clock_timestamp()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = coalesce(started_at, pg_catalog.clock_timestamp()),
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
    started_at = coalesce(gr.started_at, pg_catalog.clock_timestamp())
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
    pg_catalog.jsonb_build_object(
      'trigger', case
        when v_room.room_type = 'public' then 'strict_three_public_match_start'
        else 'start_match'
      end,
      'roundNumber', 1,
      'totalRounds', v_room.total_rounds,
      'roomType', v_room.room_type
    )
  );

  return query select v_match_id, v_round_id;
end;
$$;

alter function public.movie_buff_public_match_size() owner to postgres;
alter function public.movie_buff_public_compatibility_key(uuid, text, integer) owner to postgres;
alter function public.assert_movie_buff_strict_three_ready(uuid) owner to postgres;
alter function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer) owner to postgres;
alter function public.set_movie_buff_player_ready(uuid, boolean) owner to postgres;
alter function public.start_movie_buff_match(uuid) owner to postgres;

revoke all on function public.movie_buff_public_match_size() from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_public_compatibility_key(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.assert_movie_buff_strict_three_ready(uuid) from public, anon, authenticated, service_role;
revoke all on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.set_movie_buff_player_ready(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.start_movie_buff_match(uuid) from public, anon, authenticated, service_role;

grant execute on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.start_movie_buff_match(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
