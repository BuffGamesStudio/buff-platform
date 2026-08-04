-- MOV-16: authoritative private VIP inventory, lock, reconnect, and consumption.
-- Additive and fail-closed. This migration intentionally seeds no VIP definitions
-- or inventory and opens no round windows.

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
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_until is null or active_from is null or active_until > active_from)
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
  required_player_count integer not null check (required_player_count > 0),
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
  check ((vip_id is null and inventory_id is null) or (vip_id is not null and inventory_id is not null))
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

alter table public.movie_buff_vip_definitions enable row level security;
alter table public.movie_buff_vip_inventory enable row level security;
alter table public.movie_buff_vip_round_windows enable row level security;
alter table public.movie_buff_vip_round_locks enable row level security;
alter table public.movie_buff_vip_consumptions enable row level security;

revoke all on public.movie_buff_vip_definitions from public, anon, authenticated;
revoke all on public.movie_buff_vip_inventory from public, anon, authenticated;
revoke all on public.movie_buff_vip_round_windows from public, anon, authenticated;
revoke all on public.movie_buff_vip_round_locks from public, anon, authenticated;
revoke all on public.movie_buff_vip_consumptions from public, anon, authenticated;
grant all on public.movie_buff_vip_definitions to service_role;
grant all on public.movie_buff_vip_inventory to service_role;
grant all on public.movie_buff_vip_round_windows to service_role;
grant all on public.movie_buff_vip_round_locks to service_role;
grant all on public.movie_buff_vip_consumptions to service_role;

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
declare
  v_round_number integer;
  v_required integer;
  v_existing public.movie_buff_vip_round_windows%rowtype;
begin
  select mr.round_number
  into v_round_number
  from public.match_rounds mr
  join public.matches m on m.id = mr.match_id
  where mr.id = p_round_id
    and mr.match_id = p_match_id
    and m.room_id = p_room_id
    and m.status = 'active';

  if v_round_number is null then
    raise exception 'Active Movie Buff round not found.';
  end if;
  if p_deadline_at <= pg_catalog.clock_timestamp() then
    raise exception 'VIP deadline must be in the future.';
  end if;

  select count(*)::integer into v_required
  from public.room_players rp
  where rp.room_id = p_room_id and rp.left_at is null;
  if v_required < 1 then
    raise exception 'No active human players are available.';
  end if;

  select * into v_existing
  from public.movie_buff_vip_round_windows w
  where w.round_id = p_round_id
  for update;

  if found then
    if v_existing.room_id <> p_room_id
       or v_existing.match_id <> p_match_id
       or v_existing.deadline_at <> p_deadline_at then
      raise exception 'Contradictory VIP window request.';
    end if;
  else
    insert into public.movie_buff_vip_round_windows (
      round_id, match_id, room_id, round_number, opens_at, deadline_at,
      required_player_count
    ) values (
      p_round_id, p_match_id, p_room_id, v_round_number,
      pg_catalog.clock_timestamp(), p_deadline_at, v_required
    ) returning * into v_existing;
  end if;

  return pg_catalog.jsonb_build_object(
    'roundId', v_existing.round_id,
    'deadlineAt', v_existing.deadline_at,
    'requiredPlayerCount', v_existing.required_player_count,
    'status', v_existing.status
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
  set activation_phase = p_activation_phase, updated_at = pg_catalog.clock_timestamp()
  where room_id = p_room_id and round_id = p_round_id;
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
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.player_id = v_player_id and rp.left_at is null
  ) then raise exception 'Active room membership required.'; end if;

  select * into v_window
  from public.movie_buff_vip_round_windows w
  where w.room_id = p_room_id and w.round_id = p_round_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'roomId', p_room_id, 'matchId', null, 'roundId', p_round_id,
      'roundNumber', null, 'serverNow', v_now, 'deadlineAt', null,
      'status', 'unavailable', 'lockedCount', 0, 'requiredPlayerCount', 0,
      'advanceReady', false, 'inventory', '[]'::jsonb, 'lock', null
    );
  end if;

  if v_window.status = 'open' and v_now >= v_window.deadline_at then
    update public.movie_buff_vip_round_windows
    set status = 'closed', closed_at = coalesce(closed_at, v_now), updated_at = v_now
    where round_id = p_round_id;
    v_window.status := 'closed';
  end if;

  select count(*)::integer into v_locked_count
  from public.movie_buff_vip_round_locks l where l.round_id = p_round_id;

  select pg_catalog.jsonb_build_object(
    'lockId', l.id, 'vipId', l.vip_id, 'vipName', d.name,
    'lockedAt', l.locked_at, 'activatedAt', l.activated_at, 'consumedAt', l.consumed_at
  ) into v_lock
  from public.movie_buff_vip_round_locks l
  left join public.movie_buff_vip_definitions d on d.id = l.vip_id
  where l.round_id = p_round_id and l.player_id = v_player_id;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'vipId', d.id, 'code', d.code, 'name', d.name, 'description', d.description,
    'quantityRemaining', i.quantity_remaining,
    'available', (
      i.quantity_remaining > 0 and d.is_active
      and (i.expires_at is null or i.expires_at > v_now)
      and (i.cooldown_until is null or i.cooldown_until <= v_now)
      and (d.active_from is null or d.active_from <= v_now)
      and (d.active_until is null or d.active_until > v_now)
      and d.activation_window = 'round_intro'
    ),
    'unavailableReason', case
      when i.quantity_remaining <= 0 then 'No quantity remaining'
      when not d.is_active then 'VIP is inactive'
      when i.expires_at is not null and i.expires_at <= v_now then 'VIP has expired'
      when i.cooldown_until is not null and i.cooldown_until > v_now then 'VIP is cooling down'
      when d.activation_window <> 'round_intro' then 'Not permitted during Round Intro'
      when d.active_from is not null and d.active_from > v_now then 'VIP is not active yet'
      when d.active_until is not null and d.active_until <= v_now then 'VIP is no longer active'
      else null end
  ) order by d.name), '[]'::jsonb) into v_inventory
  from public.movie_buff_vip_inventory i
  join public.movie_buff_vip_definitions d on d.id = i.vip_id
  where i.player_id = v_player_id;

  return pg_catalog.jsonb_build_object(
    'roomId', v_window.room_id, 'matchId', v_window.match_id,
    'roundId', v_window.round_id, 'roundNumber', v_window.round_number,
    'serverNow', v_now, 'deadlineAt', v_window.deadline_at,
    'status', v_window.status, 'lockedCount', v_locked_count,
    'requiredPlayerCount', v_window.required_player_count,
    'advanceReady', (v_window.status = 'closed' or v_locked_count >= v_window.required_player_count),
    'inventory', v_inventory, 'lock', v_lock
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
  v_locked_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if char_length(trim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'Invalid idempotency key.';
  end if;
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.player_id = v_player_id and rp.left_at is null
  ) then raise exception 'Active room membership required.'; end if;

  select * into v_window from public.movie_buff_vip_round_windows w
  where w.room_id = p_room_id and w.round_id = p_round_id for update;
  if not found then raise exception 'VIP selection is unavailable.'; end if;
  if v_window.status <> 'open' or v_now >= v_window.deadline_at then
    update public.movie_buff_vip_round_windows
    set status = 'closed', closed_at = coalesce(closed_at, v_now), updated_at = v_now
    where round_id = p_round_id;
    raise exception 'VIP selection deadline has passed.';
  end if;

  select * into v_existing from public.movie_buff_vip_round_locks l
  where l.round_id = p_round_id and l.player_id = v_player_id for update;
  if found then
    if v_existing.vip_id is not distinct from p_vip_id then
      return pg_catalog.jsonb_build_object(
        'lockId', v_existing.id, 'vipId', v_existing.vip_id,
        'lockedAt', v_existing.locked_at, 'activatedAt', v_existing.activated_at,
        'consumedAt', v_existing.consumed_at
      );
    end if;
    raise exception 'VIP selection is already locked with a different choice.';
  end if;

  if p_vip_id is not null then
    select * into v_inventory from public.movie_buff_vip_inventory i
    where i.player_id = v_player_id and i.vip_id = p_vip_id for update;
    if not found then raise exception 'VIP is not owned.'; end if;
    select * into v_definition from public.movie_buff_vip_definitions d
    where d.id = p_vip_id;
    if v_inventory.quantity_remaining <= 0 then raise exception 'VIP quantity is exhausted.'; end if;
    if not v_definition.is_active
       or v_definition.activation_window <> 'round_intro'
       or (v_inventory.expires_at is not null and v_inventory.expires_at <= v_now)
       or (v_inventory.cooldown_until is not null and v_inventory.cooldown_until > v_now)
       or (v_definition.active_from is not null and v_definition.active_from > v_now)
       or (v_definition.active_until is not null and v_definition.active_until <= v_now) then
      raise exception 'VIP is not eligible for this round.';
    end if;
  end if;

  insert into public.movie_buff_vip_round_locks (
    room_id, match_id, round_id, player_id, vip_id, inventory_id, idempotency_key
  ) values (
    p_room_id, v_window.match_id, p_round_id, v_player_id, p_vip_id,
    case when p_vip_id is null then null else v_inventory.id end,
    trim(p_idempotency_key)
  ) returning * into v_existing;

  select count(*)::integer into v_locked_count
  from public.movie_buff_vip_round_locks l where l.round_id = p_round_id;
  if v_locked_count >= v_window.required_player_count then
    update public.movie_buff_vip_round_windows
    set status = 'closed', closed_at = coalesce(closed_at, v_now), updated_at = v_now
    where round_id = p_round_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'lockId', v_existing.id, 'vipId', v_existing.vip_id,
    'lockedAt', v_existing.locked_at, 'activatedAt', null, 'consumedAt', null
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
  v_consumption public.movie_buff_vip_consumptions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_player_id is null then raise exception 'Authentication required.'; end if;
  if char_length(trim(p_activation_key)) not between 8 and 128 then
    raise exception 'Invalid activation key.';
  end if;
  if not exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id and rp.player_id = v_player_id and rp.left_at is null
  ) then raise exception 'Active room membership required.'; end if;

  select * into v_lock from public.movie_buff_vip_round_locks l
  where l.room_id = p_room_id and l.round_id = p_round_id and l.player_id = v_player_id
  for update;
  if not found or v_lock.vip_id is null then raise exception 'No VIP is locked for activation.'; end if;

  select * into v_consumption from public.movie_buff_vip_consumptions c
  where c.lock_id = v_lock.id;
  if found then
    return pg_catalog.jsonb_build_object(
      'lockId', v_lock.id, 'vipId', v_lock.vip_id,
      'activatedAt', v_lock.activated_at, 'consumedAt', v_consumption.consumed_at
    );
  end if;

  select * into v_window from public.movie_buff_vip_round_windows w
  where w.round_id = p_round_id and w.room_id = p_room_id;
  select * into v_definition from public.movie_buff_vip_definitions d
  where d.id = v_lock.vip_id;
  if v_window.activation_phase is null
     or v_window.activation_phase <> v_definition.activation_window then
    raise exception 'VIP cannot be activated in the current server phase.';
  end if;

  update public.movie_buff_vip_inventory
  set quantity_remaining = quantity_remaining - 1,
      cooldown_until = case
        when v_definition.cooldown_seconds > 0
        then v_now + pg_catalog.make_interval(secs => v_definition.cooldown_seconds)
        else cooldown_until end,
      updated_at = v_now
  where id = v_lock.inventory_id and player_id = v_player_id and quantity_remaining > 0;
  if not found then raise exception 'VIP quantity is exhausted.'; end if;

  insert into public.movie_buff_vip_consumptions (
    lock_id, inventory_id, player_id, vip_id, activation_key, consumed_at
  ) values (
    v_lock.id, v_lock.inventory_id, v_player_id, v_lock.vip_id,
    trim(p_activation_key), v_now
  ) returning * into v_consumption;

  update public.movie_buff_vip_round_locks
  set activated_at = coalesce(activated_at, v_now), consumed_at = coalesce(consumed_at, v_now)
  where id = v_lock.id
  returning * into v_lock;

  return pg_catalog.jsonb_build_object(
    'lockId', v_lock.id, 'vipId', v_lock.vip_id,
    'activatedAt', v_lock.activated_at, 'consumedAt', v_lock.consumed_at
  );
end;
$$;

alter function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz) owner to postgres;
alter function public.set_movie_buff_vip_activation_phase(uuid, uuid, text) owner to postgres;
alter function public.get_movie_buff_vip_round_view(uuid, uuid) owner to postgres;
alter function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text) owner to postgres;
alter function public.activate_movie_buff_round_vip(uuid, uuid, text) owner to postgres;

revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_movie_buff_vip_round_view(uuid, uuid) from public, anon;
revoke all on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.activate_movie_buff_round_vip(uuid, uuid, text) from public, anon;

grant execute on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text) to service_role;
grant execute on function public.get_movie_buff_vip_round_view(uuid, uuid) to authenticated, service_role;
grant execute on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.activate_movie_buff_round_vip(uuid, uuid, text) to authenticated, service_role;
