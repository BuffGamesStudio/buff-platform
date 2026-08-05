-- MOV-16: authoritative private VIP inventory, selection, reconnect, and consumption.
-- Additive and fail-closed. This migration intentionally seeds no VIP definitions,
-- grants no inventory, and opens no round window.

create table if not exists public.movie_buff_vip_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text not null default '',
  effect_scope text not null check (effect_scope in ('personal', 'shared')),
  activation_window text not null check (
    activation_window in ('round_intro', 'board_select', 'playback', 'answer', 'results')
  ),
  is_stackable boolean not null default false,
  max_per_round integer not null default 1 check (max_per_round between 1 and 10),
  cooldown_seconds integer not null default 0 check (cooldown_seconds >= 0),
  active_from timestamptz,
  active_until timestamptz,
  is_active boolean not null default false,

  -- Generic rules remain descriptive only. Eligibility is enforced through the
  -- explicit fields below so missing product policy cannot silently grant use.
  rules jsonb not null default '{}'::jsonb,
  eligibility_configured boolean not null default false,
  allowed_room_types text[] not null default '{}'::text[],
  allowed_difficulties text[] not null default '{}'::text[],
  allow_any_category boolean not null default false,
  allowed_category_ids uuid[] not null default '{}'::uuid[],
  minimum_round_number integer not null default 1 check (minimum_round_number > 0),
  maximum_round_number integer check (maximum_round_number is null or maximum_round_number > 0),
  allow_ranked boolean not null default false,
  allow_unranked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_until is null or active_from is null or active_until > active_from),
  check (maximum_round_number is null or maximum_round_number >= minimum_round_number),
  check (allowed_room_types <@ array['public', 'private', 'ai']::text[]),
  check (allowed_difficulties <@ array['easy', 'medium', 'hard', 'expert', 'mixed']::text[]),
  check (array_position(allowed_room_types, null) is null),
  check (array_position(allowed_difficulties, null) is null),
  check (array_position(allowed_category_ids, null) is null),
  check (
    not eligibility_configured
    or (
      cardinality(allowed_room_types) > 0
      and cardinality(allowed_difficulties) > 0
      and (allow_any_category or cardinality(allowed_category_ids) > 0)
      and (allow_ranked or allow_unranked)
    )
  )
);

create table if not exists public.movie_buff_vip_inventory (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  vip_id uuid not null references public.movie_buff_vip_definitions(id) on delete restrict,
  quantity_remaining integer not null check (quantity_remaining >= 0),
  expires_at timestamptz,
  cooldown_until timestamptz,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, vip_id)
);

create table if not exists public.movie_buff_vip_round_windows (
  round_id uuid primary key references public.match_rounds(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  opens_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  original_required_player_count integer not null check (original_required_player_count > 0),
  activation_phase text check (
    activation_phase is null or activation_phase in (
      'round_intro', 'board_select', 'playback', 'answer', 'results'
    )
  ),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, round_number),
  check (deadline_at > opens_at)
);

create table if not exists public.movie_buff_vip_round_required_players (
  round_id uuid not null references public.movie_buff_vip_round_windows(round_id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  required_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  primary key (round_id, player_id),
  check (
    (released_at is null and release_reason is null)
    or (released_at is not null and nullif(pg_catalog.btrim(release_reason), '') is not null)
  )
);

create table if not exists public.movie_buff_vip_round_locks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  round_id uuid not null references public.match_rounds(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  vip_id uuid references public.movie_buff_vip_definitions(id) on delete restrict,
  inventory_id uuid references public.movie_buff_vip_inventory(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  locked_at timestamptz not null default now(),
  activated_at timestamptz,
  consumed_at timestamptz,
  unique (match_id, round_id, player_id),
  unique (player_id, idempotency_key),
  check (
    (vip_id is null and inventory_id is null)
    or (vip_id is not null and inventory_id is not null)
  )
);

create table if not exists public.movie_buff_vip_consumptions (
  id uuid primary key default gen_random_uuid(),
  lock_id uuid not null unique references public.movie_buff_vip_round_locks(id) on delete cascade,
  inventory_id uuid not null references public.movie_buff_vip_inventory(id) on delete restrict,
  player_id uuid not null references public.profiles(id) on delete cascade,
  vip_id uuid not null references public.movie_buff_vip_definitions(id) on delete restrict,
  activation_key text not null check (char_length(activation_key) between 8 and 128),
  consumed_at timestamptz not null default now(),
  unique (player_id, activation_key)
);

create index if not exists movie_buff_vip_inventory_player_idx
  on public.movie_buff_vip_inventory(player_id);
create index if not exists movie_buff_vip_locks_round_idx
  on public.movie_buff_vip_round_locks(round_id, player_id);
create index if not exists movie_buff_vip_windows_room_idx
  on public.movie_buff_vip_round_windows(room_id, status, deadline_at);
create index if not exists movie_buff_vip_required_players_round_idx
  on public.movie_buff_vip_round_required_players(round_id, released_at, player_id);

alter table public.movie_buff_vip_definitions enable row level security;
alter table public.movie_buff_vip_inventory enable row level security;
alter table public.movie_buff_vip_round_windows enable row level security;
alter table public.movie_buff_vip_round_required_players enable row level security;
alter table public.movie_buff_vip_round_locks enable row level security;
alter table public.movie_buff_vip_consumptions enable row level security;

revoke all on public.movie_buff_vip_definitions from public, anon, authenticated;
revoke all on public.movie_buff_vip_inventory from public, anon, authenticated;
revoke all on public.movie_buff_vip_round_windows from public, anon, authenticated;
revoke all on public.movie_buff_vip_round_required_players from public, anon, authenticated;
revoke all on public.movie_buff_vip_round_locks from public, anon, authenticated;
revoke all on public.movie_buff_vip_consumptions from public, anon, authenticated;
grant all on public.movie_buff_vip_definitions to service_role;
grant all on public.movie_buff_vip_inventory to service_role;
grant all on public.movie_buff_vip_round_windows to service_role;
grant all on public.movie_buff_vip_round_required_players to service_role;
grant all on public.movie_buff_vip_round_locks to service_role;
grant all on public.movie_buff_vip_consumptions to service_role;

create or replace function public.movie_buff_vip_ineligibility_reason(
  p_player_id uuid,
  p_vip_id uuid,
  p_room_id uuid,
  p_match_id uuid,
  p_round_id uuid,
  p_at timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_definition public.movie_buff_vip_definitions%rowtype;
  v_inventory public.movie_buff_vip_inventory%rowtype;
  v_room public.game_rooms%rowtype;
  v_match public.matches%rowtype;
  v_round public.match_rounds%rowtype;
begin
  select d.* into v_definition
  from public.movie_buff_vip_definitions as d
  where d.id = p_vip_id;
  if not found then return 'VIP definition is missing'; end if;

  select i.* into v_inventory
  from public.movie_buff_vip_inventory as i
  where i.player_id = p_player_id
    and i.vip_id = p_vip_id;
  if not found then return 'VIP is not owned'; end if;

  select gr.* into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;
  if not found then return 'Room context is missing'; end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id
    and m.room_id = p_room_id;
  if not found or v_match.status <> 'active' then
    return 'Active match context is missing';
  end if;

  select mr.* into v_round
  from public.match_rounds as mr
  where mr.id = p_round_id
    and mr.match_id = p_match_id;
  if not found then return 'Round does not belong to the active match'; end if;

  if v_match.category_id is distinct from v_room.category_id
     or v_match.difficulty is distinct from v_room.difficulty
     or v_match.total_rounds is distinct from v_room.total_rounds then
    return 'Room and match eligibility context is inconsistent';
  end if;

  if not v_definition.is_active then return 'VIP is inactive'; end if;
  if not v_definition.eligibility_configured then
    return 'VIP eligibility is not configured';
  end if;
  if v_definition.is_stackable or v_definition.max_per_round <> 1 then
    return 'Multi-VIP stacking is not supported';
  end if;
  if v_inventory.quantity_remaining <= 0 then return 'No quantity remaining'; end if;
  if v_inventory.expires_at is not null and v_inventory.expires_at <= p_at then
    return 'VIP inventory has expired';
  end if;
  if v_inventory.cooldown_until is not null and v_inventory.cooldown_until > p_at then
    return 'VIP is cooling down';
  end if;
  if v_definition.active_from is not null and v_definition.active_from > p_at then
    return 'VIP is not active yet';
  end if;
  if v_definition.active_until is not null and v_definition.active_until <= p_at then
    return 'VIP is no longer active';
  end if;
  if not (v_room.room_type = any(v_definition.allowed_room_types)) then
    return 'VIP is not allowed for this room type';
  end if;
  if not (v_match.difficulty = any(v_definition.allowed_difficulties)) then
    return 'VIP is not allowed for this difficulty';
  end if;
  if not v_definition.allow_any_category
     and not (v_match.category_id = any(v_definition.allowed_category_ids)) then
    return 'VIP is not allowed for this category';
  end if;
  if v_room.is_ranked and not v_definition.allow_ranked then
    return 'VIP is not allowed in ranked matches';
  end if;
  if not v_room.is_ranked and not v_definition.allow_unranked then
    return 'VIP is not allowed in unranked matches';
  end if;
  if v_round.round_number < v_definition.minimum_round_number then
    return 'VIP is not available for this round number';
  end if;
  if v_definition.maximum_round_number is not null
     and v_round.round_number > v_definition.maximum_round_number then
    return 'VIP is not available for this round number';
  end if;

  return null;
end;
$$;

-- The authoritative overload requires MOV-17 to provide the exact required-human
-- participant snapshot. Buster and system actors are never passed as player IDs.
create or replace function public.open_movie_buff_vip_round_window(
  p_room_id uuid,
  p_match_id uuid,
  p_round_id uuid,
  p_deadline_at timestamptz,
  p_required_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_round_number integer;
  v_required_ids uuid[];
  v_existing_ids uuid[];
  v_existing public.movie_buff_vip_round_windows%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_required_player_ids is null
     or cardinality(p_required_player_ids) < 1
     or array_position(p_required_player_ids, null) is not null then
    raise exception 'An explicit non-empty required-human snapshot is required.';
  end if;

  select pg_catalog.array_agg(ids.player_id order by ids.player_id)
  into v_required_ids
  from (
    select distinct player_id
    from pg_catalog.unnest(p_required_player_ids) as supplied(player_id)
  ) as ids;

  if cardinality(v_required_ids) <> cardinality(p_required_player_ids) then
    raise exception 'Required-human snapshot contains duplicate players.';
  end if;

  select mr.round_number
  into v_round_number
  from public.match_rounds as mr
  join public.matches as m on m.id = mr.match_id
  where mr.id = p_round_id
    and mr.match_id = p_match_id
    and m.room_id = p_room_id
    and m.status = 'active';
  if v_round_number is null then
    raise exception 'Active Movie Buff round not found.';
  end if;
  if p_deadline_at <= v_now then
    raise exception 'VIP deadline must be in the future.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(v_required_ids) as required(player_id)
    where not exists (
      select 1
      from public.room_players as rp
      join public.match_players as mp
        on mp.match_id = p_match_id
       and mp.player_id = rp.player_id
      where rp.room_id = p_room_id
        and rp.player_id = required.player_id
        and rp.left_at is null
    )
  ) then
    raise exception 'Required-human snapshot contains a nonmember or nonparticipant.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('movie-buff-vip-window|' || p_round_id::text, 0)
  );

  select w.* into v_existing
  from public.movie_buff_vip_round_windows as w
  where w.round_id = p_round_id
  for update;

  if found then
    select pg_catalog.array_agg(rp.player_id order by rp.player_id)
    into v_existing_ids
    from public.movie_buff_vip_round_required_players as rp
    where rp.round_id = p_round_id;

    if v_existing.room_id <> p_room_id
       or v_existing.match_id <> p_match_id
       or v_existing.deadline_at <> p_deadline_at
       or v_existing_ids is distinct from v_required_ids then
      raise exception 'Contradictory VIP window request.';
    end if;
  else
    insert into public.movie_buff_vip_round_windows (
      round_id,
      match_id,
      room_id,
      round_number,
      opens_at,
      deadline_at,
      original_required_player_count
    )
    values (
      p_round_id,
      p_match_id,
      p_room_id,
      v_round_number,
      v_now,
      p_deadline_at,
      cardinality(v_required_ids)
    )
    returning * into v_existing;

    insert into public.movie_buff_vip_round_required_players (
      round_id,
      match_id,
      room_id,
      player_id,
      required_at
    )
    select
      p_round_id,
      p_match_id,
      p_room_id,
      required.player_id,
      v_now
    from pg_catalog.unnest(v_required_ids) as required(player_id);
  end if;

  return pg_catalog.jsonb_build_object(
    'roundId', v_existing.round_id,
    'deadlineAt', v_existing.deadline_at,
    'requiredPlayerCount', cardinality(v_required_ids),
    'status', v_existing.status
  );
end;
$$;

-- Compatibility overload deliberately fails closed. A count derived from lobby
-- membership is not an authoritative active-human participant snapshot.
create or replace function public.open_movie_buff_vip_round_window(
  p_room_id uuid,
  p_match_id uuid,
  p_round_id uuid,
  p_deadline_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Explicit required-human participant IDs are required.';
end;
$$;

create or replace function public.release_movie_buff_vip_required_player(
  p_room_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_release_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_required integer;
  v_locked integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if nullif(pg_catalog.btrim(p_release_reason), '') is null then
    raise exception 'Release reason is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('movie-buff-vip-window|' || p_round_id::text, 0)
  );

  select w.* into v_window
  from public.movie_buff_vip_round_windows as w
  where w.room_id = p_room_id
    and w.round_id = p_round_id
  for update;
  if not found then raise exception 'VIP round window not found.'; end if;

  update public.movie_buff_vip_round_required_players
  set
    released_at = coalesce(released_at, v_now),
    release_reason = coalesce(release_reason, pg_catalog.btrim(p_release_reason))
  where room_id = p_room_id
    and round_id = p_round_id
    and player_id = p_player_id;
  if not found then raise exception 'Required player snapshot entry not found.'; end if;

  select count(*)::integer into v_required
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = p_round_id
    and required.released_at is null;

  select count(*)::integer into v_locked
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  if v_required = 0 or v_locked >= v_required then
    update public.movie_buff_vip_round_windows
    set
      status = 'closed',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where round_id = p_round_id;
    v_window.status := 'closed';
  end if;

  return pg_catalog.jsonb_build_object(
    'roundId', p_round_id,
    'releasedPlayerId', p_player_id,
    'requiredPlayerCount', v_required,
    'lockedCount', v_locked,
    'status', v_window.status
  );
end;
$$;

create or replace function public.set_movie_buff_vip_activation_phase(
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
  if p_activation_phase not in ('round_intro', 'board_select', 'playback', 'answer', 'results') then
    raise exception 'Invalid VIP activation phase.';
  end if;

  update public.movie_buff_vip_round_windows
  set
    activation_phase = p_activation_phase,
    updated_at = pg_catalog.clock_timestamp()
  where room_id = p_room_id
    and round_id = p_round_id;
  if not found then raise exception 'VIP round window not found.'; end if;
end;
$$;

create or replace function public.get_movie_buff_vip_round_view(
  p_room_id uuid,
  p_round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_lock jsonb;
  v_inventory jsonb;
  v_locked_count integer := 0;
  v_required_count integer := 0;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = v_player_id
      and rp.left_at is null
  ) then
    raise exception 'Active room membership required.';
  end if;

  select w.* into v_window
  from public.movie_buff_vip_round_windows as w
  where w.room_id = p_room_id
    and w.round_id = p_round_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'roomId', p_room_id,
      'matchId', null,
      'roundId', p_round_id,
      'roundNumber', null,
      'serverNow', v_now,
      'deadlineAt', null,
      'status', 'unavailable',
      'lockedCount', 0,
      'requiredPlayerCount', 0,
      'originalRequiredPlayerCount', 0,
      'advanceReady', false,
      'inventory', '[]'::jsonb,
      'lock', null
    );
  end if;

  if not exists (
    select 1
    from public.movie_buff_vip_round_required_players as required
    where required.round_id = p_round_id
      and required.player_id = v_player_id
      and required.released_at is null
  ) then
    raise exception 'Player is not required for this VIP window.';
  end if;

  if v_window.status = 'open' and v_now >= v_window.deadline_at then
    update public.movie_buff_vip_round_windows
    set
      status = 'closed',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where round_id = p_round_id;
    v_window.status := 'closed';
  end if;

  select count(*)::integer into v_required_count
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = p_round_id
    and required.released_at is null;

  select count(*)::integer into v_locked_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  select pg_catalog.jsonb_build_object(
    'lockId', locked.id,
    'vipId', locked.vip_id,
    'vipName', definition.name,
    'lockedAt', locked.locked_at,
    'activatedAt', locked.activated_at,
    'consumedAt', locked.consumed_at
  )
  into v_lock
  from public.movie_buff_vip_round_locks as locked
  left join public.movie_buff_vip_definitions as definition
    on definition.id = locked.vip_id
  where locked.round_id = p_round_id
    and locked.player_id = v_player_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'vipId', definition.id,
        'code', definition.code,
        'name', definition.name,
        'description', definition.description,
        'activationWindow', definition.activation_window,
        'effectScope', definition.effect_scope,
        'quantityRemaining', inventory.quantity_remaining,
        'available', (
          v_window.status = 'open'
          and public.movie_buff_vip_ineligibility_reason(
            v_player_id,
            definition.id,
            v_window.room_id,
            v_window.match_id,
            v_window.round_id,
            v_now
          ) is null
        ),
        'unavailableReason', case
          when v_window.status <> 'open' then 'Selection window is closed'
          else public.movie_buff_vip_ineligibility_reason(
            v_player_id,
            definition.id,
            v_window.room_id,
            v_window.match_id,
            v_window.round_id,
            v_now
          )
        end
      )
      order by definition.name
    ),
    '[]'::jsonb
  )
  into v_inventory
  from public.movie_buff_vip_inventory as inventory
  join public.movie_buff_vip_definitions as definition
    on definition.id = inventory.vip_id
  where inventory.player_id = v_player_id;

  return pg_catalog.jsonb_build_object(
    'roomId', v_window.room_id,
    'matchId', v_window.match_id,
    'roundId', v_window.round_id,
    'roundNumber', v_window.round_number,
    'serverNow', v_now,
    'deadlineAt', v_window.deadline_at,
    'status', v_window.status,
    'lockedCount', v_locked_count,
    'requiredPlayerCount', v_required_count,
    'originalRequiredPlayerCount', v_window.original_required_player_count,
    'advanceReady', (
      v_window.status = 'closed'
      or v_required_count = 0
      or v_locked_count >= v_required_count
    ),
    'inventory', v_inventory,
    'lock', v_lock
  );
end;
$$;

create or replace function public.lock_movie_buff_round_vip(
  p_room_id uuid,
  p_round_id uuid,
  p_vip_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_existing public.movie_buff_vip_round_locks%rowtype;
  v_inventory public.movie_buff_vip_inventory%rowtype;
  v_definition public.movie_buff_vip_definitions%rowtype;
  v_reason text;
  v_locked_count integer;
  v_required_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if char_length(pg_catalog.btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'Invalid idempotency key.';
  end if;
  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = v_player_id
      and rp.left_at is null
  ) then
    raise exception 'Active room membership required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'movie-buff-vip-lock|' || p_round_id::text || '|' || v_player_id::text,
      0
    )
  );

  select w.* into v_window
  from public.movie_buff_vip_round_windows as w
  where w.room_id = p_room_id
    and w.round_id = p_round_id
  for update;
  if not found then raise exception 'VIP selection is unavailable.'; end if;

  if not exists (
    select 1
    from public.movie_buff_vip_round_required_players as required
    where required.round_id = p_round_id
      and required.player_id = v_player_id
      and required.released_at is null
  ) then
    raise exception 'Player is not required for this VIP window.';
  end if;

  select locked.* into v_existing
  from public.movie_buff_vip_round_locks as locked
  where locked.round_id = p_round_id
    and locked.player_id = v_player_id
  for update;
  if found then
    if v_existing.vip_id is not distinct from p_vip_id then
      return pg_catalog.jsonb_build_object(
        'lockId', v_existing.id,
        'vipId', v_existing.vip_id,
        'lockedAt', v_existing.locked_at,
        'activatedAt', v_existing.activated_at,
        'consumedAt', v_existing.consumed_at
      );
    end if;
    raise exception 'VIP selection is already locked with a different choice.';
  end if;

  if v_window.status <> 'open' or v_now >= v_window.deadline_at then
    update public.movie_buff_vip_round_windows
    set
      status = 'closed',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where round_id = p_round_id;
    raise exception 'VIP selection deadline has passed.';
  end if;

  if p_vip_id is not null then
    select inventory.* into v_inventory
    from public.movie_buff_vip_inventory as inventory
    where inventory.player_id = v_player_id
      and inventory.vip_id = p_vip_id
    for update;
    if not found then raise exception 'VIP is not owned.'; end if;

    select definition.* into v_definition
    from public.movie_buff_vip_definitions as definition
    where definition.id = p_vip_id
    for update;
    if not found then raise exception 'VIP definition is missing.'; end if;

    v_reason := public.movie_buff_vip_ineligibility_reason(
      v_player_id,
      p_vip_id,
      p_room_id,
      v_window.match_id,
      p_round_id,
      v_now
    );
    if v_reason is not null then
      raise exception 'VIP is not eligible for this round: %.', v_reason;
    end if;
  end if;

  insert into public.movie_buff_vip_round_locks (
    room_id,
    match_id,
    round_id,
    player_id,
    vip_id,
    inventory_id,
    idempotency_key
  )
  values (
    p_room_id,
    v_window.match_id,
    p_round_id,
    v_player_id,
    p_vip_id,
    case when p_vip_id is null then null else v_inventory.id end,
    pg_catalog.btrim(p_idempotency_key)
  )
  returning * into v_existing;

  select count(*)::integer into v_required_count
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = p_round_id
    and required.released_at is null;

  select count(*)::integer into v_locked_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  if v_required_count = 0 or v_locked_count >= v_required_count then
    update public.movie_buff_vip_round_windows
    set
      status = 'closed',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where round_id = p_round_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'lockId', v_existing.id,
    'vipId', v_existing.vip_id,
    'lockedAt', v_existing.locked_at,
    'activatedAt', null,
    'consumedAt', null
  );
end;
$$;

create or replace function public.activate_movie_buff_round_vip(
  p_room_id uuid,
  p_round_id uuid,
  p_activation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_lock public.movie_buff_vip_round_locks%rowtype;
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_definition public.movie_buff_vip_definitions%rowtype;
  v_inventory public.movie_buff_vip_inventory%rowtype;
  v_consumption public.movie_buff_vip_consumptions%rowtype;
  v_reason text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if char_length(pg_catalog.btrim(p_activation_key)) not between 8 and 128 then
    raise exception 'Invalid activation key.';
  end if;
  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = v_player_id
      and rp.left_at is null
  ) then
    raise exception 'Active room membership required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'movie-buff-vip-activation|' || p_round_id::text || '|' || v_player_id::text,
      0
    )
  );

  select locked.* into v_lock
  from public.movie_buff_vip_round_locks as locked
  where locked.room_id = p_room_id
    and locked.round_id = p_round_id
    and locked.player_id = v_player_id
  for update;
  if not found or v_lock.vip_id is null then
    raise exception 'No VIP is locked for activation.';
  end if;

  if not exists (
    select 1
    from public.movie_buff_vip_round_required_players as required
    where required.round_id = p_round_id
      and required.player_id = v_player_id
      and required.released_at is null
  ) then
    raise exception 'Player is no longer eligible to activate this VIP.';
  end if;

  select consumption.* into v_consumption
  from public.movie_buff_vip_consumptions as consumption
  where consumption.lock_id = v_lock.id
  for update;
  if found then
    if v_consumption.activation_key <> pg_catalog.btrim(p_activation_key) then
      raise exception 'VIP was already activated with a different request.';
    end if;
    return pg_catalog.jsonb_build_object(
      'lockId', v_lock.id,
      'vipId', v_lock.vip_id,
      'activatedAt', v_lock.activated_at,
      'consumedAt', v_consumption.consumed_at
    );
  end if;

  select vip_window.* into v_window
  from public.movie_buff_vip_round_windows as vip_window
  where vip_window.round_id = p_round_id
    and vip_window.room_id = p_room_id
    and vip_window.match_id = v_lock.match_id
  for update;
  if not found then raise exception 'VIP round window is unavailable.'; end if;

  select definition.* into v_definition
  from public.movie_buff_vip_definitions as definition
  where definition.id = v_lock.vip_id
  for update;
  if not found then raise exception 'VIP definition is missing.'; end if;

  select inventory.* into v_inventory
  from public.movie_buff_vip_inventory as inventory
  where inventory.id = v_lock.inventory_id
    and inventory.player_id = v_player_id
    and inventory.vip_id = v_lock.vip_id
  for update;
  if not found then raise exception 'Locked VIP inventory is unavailable.'; end if;

  if v_window.activation_phase is null
     or v_window.activation_phase <> v_definition.activation_window then
    raise exception 'VIP cannot be activated in the current server phase.';
  end if;

  v_reason := public.movie_buff_vip_ineligibility_reason(
    v_player_id,
    v_lock.vip_id,
    p_room_id,
    v_lock.match_id,
    p_round_id,
    v_now
  );
  if v_reason is not null then
    raise exception 'VIP is not eligible for activation: %.', v_reason;
  end if;

  update public.movie_buff_vip_inventory
  set
    quantity_remaining = quantity_remaining - 1,
    cooldown_until = case
      when v_definition.cooldown_seconds > 0
      then v_now + pg_catalog.make_interval(secs => v_definition.cooldown_seconds)
      else cooldown_until
    end,
    updated_at = v_now
  where id = v_inventory.id
    and player_id = v_player_id
    and vip_id = v_lock.vip_id
    and quantity_remaining > 0
    and (expires_at is null or expires_at > v_now)
    and (cooldown_until is null or cooldown_until <= v_now);
  if not found then raise exception 'VIP inventory changed before activation.'; end if;

  insert into public.movie_buff_vip_consumptions (
    lock_id,
    inventory_id,
    player_id,
    vip_id,
    activation_key,
    consumed_at
  )
  values (
    v_lock.id,
    v_lock.inventory_id,
    v_player_id,
    v_lock.vip_id,
    pg_catalog.btrim(p_activation_key),
    v_now
  )
  returning * into v_consumption;

  update public.movie_buff_vip_round_locks
  set
    activated_at = coalesce(activated_at, v_now),
    consumed_at = coalesce(consumed_at, v_now)
  where id = v_lock.id
  returning * into v_lock;

  return pg_catalog.jsonb_build_object(
    'lockId', v_lock.id,
    'vipId', v_lock.vip_id,
    'activatedAt', v_lock.activated_at,
    'consumedAt', v_lock.consumed_at
  );
end;
$$;

alter function public.movie_buff_vip_ineligibility_reason(uuid, uuid, uuid, uuid, uuid, timestamptz) owner to postgres;
alter function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[]) owner to postgres;
alter function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz) owner to postgres;
alter function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text) owner to postgres;
alter function public.set_movie_buff_vip_activation_phase(uuid, uuid, text) owner to postgres;
alter function public.get_movie_buff_vip_round_view(uuid, uuid) owner to postgres;
alter function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text) owner to postgres;
alter function public.activate_movie_buff_round_vip(uuid, uuid, text) owner to postgres;

revoke all on function public.movie_buff_vip_ineligibility_reason(uuid, uuid, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_vip_round_view(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_movie_buff_round_vip(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[])
  to service_role;
grant execute on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text)
  to service_role;
grant execute on function public.get_movie_buff_vip_round_view(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text)
  to authenticated, service_role;
grant execute on function public.activate_movie_buff_round_vip(uuid, uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
