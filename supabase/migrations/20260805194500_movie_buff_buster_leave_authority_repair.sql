-- MOV-17 successor repair: bind Buster takeover to authoritative safe-phase
-- entry and add policy-backed, quote/confirm active-match leave authority.
--
-- No penalty policy is seeded here. Operators must explicitly configure a
-- versioned policy. Missing policy fails closed before abandonment or charge.

create table if not exists public.movie_buff_leave_penalty_policies (
  policy_version text not null,
  reason text not null check (
    reason in ('voluntary_active_leave', 'disconnect_grace_expired')
  ),
  penalty_points integer not null check (penalty_points >= 0),
  quote_ttl_seconds integer not null default 60
    check (quote_ttl_seconds between 10 and 900),
  effective_from timestamptz not null,
  effective_until timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (policy_version, reason),
  check (effective_until is null or effective_until > effective_from)
);

create unique index if not exists movie_buff_leave_policy_one_active_reason_idx
  on public.movie_buff_leave_penalty_policies(reason)
  where is_active;

create table if not exists public.movie_buff_active_leave_quotes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  quote_token uuid not null unique default pg_catalog.gen_random_uuid(),
  match_id uuid not null,
  room_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  seat_index integer not null check (seat_index > 0),
  phase text not null,
  phase_version bigint not null check (phase_version > 0),
  policy_version text not null,
  penalty_reason text not null default 'voluntary_active_leave'
    check (penalty_reason = 'voluntary_active_leave'),
  penalty_points integer not null check (penalty_points >= 0),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  idempotency_key text,
  result jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (policy_version, penalty_reason)
    references public.movie_buff_leave_penalty_policies(policy_version, reason),
  check (expires_at > created_at),
  check (
    (confirmed_at is null and idempotency_key is null and result is null)
    or (confirmed_at is not null and idempotency_key is not null and result is not null)
  )
);

create index if not exists movie_buff_active_leave_quotes_actor_idx
  on public.movie_buff_active_leave_quotes(player_id, match_id, created_at desc);

create table if not exists public.movie_buff_leave_penalty_ledger (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  match_id uuid not null,
  room_id uuid not null,
  round_id uuid not null,
  player_id uuid not null,
  seat_index integer not null check (seat_index > 0),
  reason text not null check (
    reason in ('voluntary_active_leave', 'disconnect_grace_expired')
  ),
  policy_version text not null,
  penalty_points integer not null check (penalty_points >= 0),
  score_before integer not null,
  score_after integer not null,
  quote_id uuid references public.movie_buff_active_leave_quotes(id)
    on delete set null,
  idempotency_key text not null
    check (pg_catalog.char_length(idempotency_key) between 8 and 160),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (match_id, player_id, reason),
  unique (player_id, idempotency_key),
  foreign key (policy_version, reason)
    references public.movie_buff_leave_penalty_policies(policy_version, reason),
  check (score_after = score_before - penalty_points)
);

alter table public.movie_buff_match_participant_seats
  add column if not exists abandonment_reason text,
  add column if not exists abandoned_phase text,
  add column if not exists abandonment_policy_version text,
  add column if not exists abandonment_penalty_points integer,
  add column if not exists abandonment_quote_id uuid,
  add column if not exists abandonment_idempotency_key text;

alter table public.movie_buff_match_participant_seats
  drop constraint if exists movie_buff_participant_abandonment_reason_check;
alter table public.movie_buff_match_participant_seats
  add constraint movie_buff_participant_abandonment_reason_check
  check (
    abandonment_reason is null
    or abandonment_reason in (
      'voluntary_active_leave', 'disconnect_grace_expired'
    )
  );

alter table public.movie_buff_match_participant_seats
  drop constraint if exists movie_buff_participant_abandoned_phase_check;
alter table public.movie_buff_match_participant_seats
  add constraint movie_buff_participant_abandoned_phase_check
  check (
    abandoned_phase is null
    or abandoned_phase in (
      'round_intro', 'vip_lock', 'board_select', 'transition',
      'playback', 'answer', 'results', 'finished', 'abandoned', 'blocked'
    )
  );

alter table public.movie_buff_match_participant_seats
  drop constraint if exists movie_buff_participant_abandonment_penalty_check;
alter table public.movie_buff_match_participant_seats
  add constraint movie_buff_participant_abandonment_penalty_check
  check (
    (participant_state <> 'abandoned')
    or (
      abandonment_reason is not null
      and abandoned_phase is not null
      and abandonment_policy_version is not null
      and abandonment_penalty_points is not null
      and abandonment_penalty_points >= 0
      and abandonment_idempotency_key is not null
    )
  ) not valid;

alter table public.movie_buff_match_participant_seats
  validate constraint movie_buff_participant_abandonment_penalty_check;

alter table public.movie_buff_leave_penalty_policies enable row level security;
alter table public.movie_buff_active_leave_quotes enable row level security;
alter table public.movie_buff_leave_penalty_ledger enable row level security;

revoke all on public.movie_buff_leave_penalty_policies
  from public, anon, authenticated;
revoke all on public.movie_buff_active_leave_quotes
  from public, anon, authenticated;
revoke all on public.movie_buff_leave_penalty_ledger
  from public, anon, authenticated;

grant all on public.movie_buff_leave_penalty_policies to service_role;
grant all on public.movie_buff_active_leave_quotes to service_role;
grant all on public.movie_buff_leave_penalty_ledger to service_role;

create or replace function public.movie_buff_prepare_abandonment_policy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_policy public.movie_buff_leave_penalty_policies%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if old.participant_state = 'abandoned'
     or new.participant_state <> 'abandoned' then
    return new;
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = new.match_id
    and state.room_id = new.room_id;

  if not found then
    raise exception 'Authoritative Movie Buff phase state is required for abandonment.';
  end if;

  new.abandonment_reason := coalesce(
    new.abandonment_reason,
    'disconnect_grace_expired'
  );
  new.abandoned_phase := coalesce(new.abandoned_phase, v_state.phase);

  if new.abandonment_reason not in (
    'voluntary_active_leave', 'disconnect_grace_expired'
  ) then
    raise exception 'Unsupported Movie Buff abandonment reason.';
  end if;

  if new.abandonment_reason = 'voluntary_active_leave' then
    if new.abandonment_quote_id is null
       or new.abandonment_policy_version is null
       or new.abandonment_penalty_points is null
       or new.abandonment_idempotency_key is null then
      raise exception 'A verified active-leave quote is required.';
    end if;

    select policy.*
    into v_policy
    from public.movie_buff_leave_penalty_policies as policy
    where policy.reason = 'voluntary_active_leave'
      and policy.policy_version = new.abandonment_policy_version
      and policy.penalty_points = new.abandonment_penalty_points
      and policy.is_active
      and policy.effective_from <= v_now
      and (policy.effective_until is null or policy.effective_until > v_now)
    for share;

    if not found then
      raise exception 'The quoted Movie Buff active-leave policy is unavailable.';
    end if;
  else
    select policy.*
    into v_policy
    from public.movie_buff_leave_penalty_policies as policy
    where policy.reason = 'disconnect_grace_expired'
      and policy.is_active
      and policy.effective_from <= v_now
      and (policy.effective_until is null or policy.effective_until > v_now)
    for share;

    if not found then
      raise exception 'No active Movie Buff disconnect-abandonment policy is configured.';
    end if;

    new.abandonment_policy_version := v_policy.policy_version;
    new.abandonment_penalty_points := v_policy.penalty_points;
    new.abandonment_idempotency_key := pg_catalog.concat(
      'disconnect:', new.match_id::text, ':', new.original_player_id::text
    );
    new.abandonment_quote_id := null;
  end if;

  new.abandoned_at := coalesce(new.abandoned_at, v_now);
  new.reconnect_deadline_at := null;

  -- Intro/VIP abandonment is immediately replacement-ready, but the helper
  -- is phase-gated so Buster cannot control the seat before board_select.
  -- Board-select abandonment retains the authored two-second takeover delay.
  -- Mid-clip abandonment is ready immediately but activates only at results.
  new.replacement_ready_at := case v_state.phase
    when 'round_intro' then v_now
    when 'vip_lock' then v_now
    when 'board_select' then v_now + pg_catalog.make_interval(secs => 2)
    else v_now
  end;

  return new;
end;
$$;

create or replace function public.movie_buff_apply_abandonment_penalty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_score_before integer;
  v_score_after integer;
  v_ledger public.movie_buff_leave_penalty_ledger%rowtype;
  v_existing public.movie_buff_leave_penalty_ledger%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if old.participant_state = 'abandoned'
     or new.participant_state <> 'abandoned' then
    return new;
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = new.match_id
    and state.room_id = new.room_id;

  if not found then
    raise exception 'Authoritative Movie Buff phase state is required for penalty application.';
  end if;

  select rp.score
  into v_score_before
  from public.room_players as rp
  where rp.room_id = new.room_id
    and rp.player_id = new.original_player_id
  for update;

  if not found then
    raise exception 'Active Movie Buff membership row is required for penalty application.';
  end if;

  v_score_after := v_score_before - new.abandonment_penalty_points;

  insert into public.movie_buff_leave_penalty_ledger (
    match_id,
    room_id,
    round_id,
    player_id,
    seat_index,
    reason,
    policy_version,
    penalty_points,
    score_before,
    score_after,
    quote_id,
    idempotency_key
  )
  values (
    new.match_id,
    new.room_id,
    v_state.round_id,
    new.original_player_id,
    new.seat_index,
    new.abandonment_reason,
    new.abandonment_policy_version,
    new.abandonment_penalty_points,
    v_score_before,
    v_score_after,
    new.abandonment_quote_id,
    new.abandonment_idempotency_key
  )
  on conflict (match_id, player_id, reason) do nothing
  returning * into v_ledger;

  if not found then
    select ledger.*
    into v_existing
    from public.movie_buff_leave_penalty_ledger as ledger
    where ledger.match_id = new.match_id
      and ledger.player_id = new.original_player_id
      and ledger.reason = new.abandonment_reason;

    if not found
       or v_existing.policy_version <> new.abandonment_policy_version
       or v_existing.penalty_points <> new.abandonment_penalty_points
       or v_existing.idempotency_key <> new.abandonment_idempotency_key
       or v_existing.quote_id is distinct from new.abandonment_quote_id then
      raise exception 'Contradictory duplicate Movie Buff abandonment penalty.';
    end if;

    return new;
  end if;

  update public.room_players
  set
    score = v_score_after,
    is_ready = false,
    is_host = false,
    left_at = coalesce(left_at, v_now)
  where room_id = new.room_id
    and player_id = new.original_player_id;

  perform public.movie_buff_phase_release_vip_participant(
    new.room_id,
    v_state.round_id,
    new.original_player_id,
    new.abandonment_reason
  );

  perform public.movie_buff_phase_event(
    new.match_id,
    new.room_id,
    v_state.round_id,
    v_state.phase_version,
    v_state.phase,
    v_state.phase,
    'participant_abandoned',
    new.original_player_id,
    pg_catalog.jsonb_build_object(
      'seatIndex', new.seat_index,
      'reason', new.abandonment_reason,
      'policyVersion', new.abandonment_policy_version,
      'penaltyPoints', new.abandonment_penalty_points,
      'scoreBefore', v_score_before,
      'scoreAfter', v_score_after,
      'quoteId', new.abandonment_quote_id,
      'ledgerId', v_ledger.id
    )
  );

  return new;
end;
$$;

drop trigger if exists movie_buff_prepare_abandonment_policy
  on public.movie_buff_match_participant_seats;
create trigger movie_buff_prepare_abandonment_policy
before update of participant_state
on public.movie_buff_match_participant_seats
for each row
when (
  old.participant_state is distinct from new.participant_state
  and new.participant_state = 'abandoned'
)
execute function public.movie_buff_prepare_abandonment_policy();

drop trigger if exists movie_buff_apply_abandonment_penalty
  on public.movie_buff_match_participant_seats;
create trigger movie_buff_apply_abandonment_penalty
after update of participant_state
on public.movie_buff_match_participant_seats
for each row
when (
  old.participant_state is distinct from new.participant_state
  and new.participant_state = 'abandoned'
)
execute function public.movie_buff_apply_abandonment_penalty();

create or replace function public.movie_buff_activate_ready_busters(p_room_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count integer := 0;
  v_seat record;
begin
  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for update;

  if not found or v_state.phase not in ('board_select', 'results') then
    return 0;
  end if;

  for v_seat in
    update public.movie_buff_match_participant_seats
    set
      controller_type = 'buster',
      controller_player_id = null,
      updated_at = v_now
    where match_id = v_state.match_id
      and participant_state = 'abandoned'
      and controller_type = 'human'
      and controller_player_id = original_player_id
      and replacement_ready_at is not null
      and (
        (
          v_state.phase = 'board_select'
          and (
            abandoned_phase in ('round_intro', 'vip_lock')
            or replacement_ready_at <= v_now
          )
        )
        or (
          v_state.phase = 'results'
          and (
            abandoned_phase in ('transition', 'playback', 'answer', 'results')
            or replacement_ready_at <= v_now
          )
        )
      )
    returning seat_index, original_player_id, replacement_ready_at, abandoned_phase
  loop
    v_count := v_count + 1;
    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_state.phase,
      v_state.phase,
      'buster_activated_at_safe_boundary',
      null,
      pg_catalog.jsonb_build_object(
        'seatIndex', v_seat.seat_index,
        'originalPlayerId', v_seat.original_player_id,
        'abandonedPhase', v_seat.abandoned_phase,
        'replacementReadyAt', v_seat.replacement_ready_at,
        'activatedAt', v_now
      )
    );
  end loop;

  return v_count;
end;
$$;

create or replace function public.movie_buff_activate_busters_on_safe_phase_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.movie_buff_activate_ready_busters(new.room_id);
  return new;
end;
$$;

drop trigger if exists movie_buff_activate_busters_on_safe_phase_entry
  on public.movie_buff_match_phase_state;
create trigger movie_buff_activate_busters_on_safe_phase_entry
after update of phase
on public.movie_buff_match_phase_state
for each row
when (
  old.phase is distinct from new.phase
  and new.phase in ('board_select', 'results')
)
execute function public.movie_buff_activate_busters_on_safe_phase_entry();

create or replace function public.get_movie_buff_active_leave_quote(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_seat public.movie_buff_match_participant_seats%rowtype;
  v_policy public.movie_buff_leave_penalty_policies%rowtype;
  v_quote public.movie_buff_active_leave_quotes%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  if v_player_id is null then
    raise exception 'Authenticated human participant required.';
  end if;

  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for share;

  if not found or v_state.phase in ('finished', 'abandoned', 'blocked') then
    raise exception 'Movie Buff match is not eligible for active leave.';
  end if;

  select seat.*
  into v_seat
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.original_player_id = v_player_id
  for share;

  if not found
     or v_seat.controller_type <> 'human'
     or v_seat.controller_player_id <> v_player_id
     or v_seat.participant_state not in ('active', 'reconnect_grace') then
    raise exception 'Active human Movie Buff seat required.';
  end if;

  select policy.*
  into v_policy
  from public.movie_buff_leave_penalty_policies as policy
  where policy.reason = 'voluntary_active_leave'
    and policy.is_active
    and policy.effective_from <= v_now
    and (policy.effective_until is null or policy.effective_until > v_now)
  for share;

  if not found then
    raise exception 'No active Movie Buff voluntary-leave policy is configured.';
  end if;

  select quote.*
  into v_quote
  from public.movie_buff_active_leave_quotes as quote
  where quote.match_id = v_state.match_id
    and quote.player_id = v_player_id
    and quote.phase_version = v_state.phase_version
    and quote.policy_version = v_policy.policy_version
    and quote.penalty_points = v_policy.penalty_points
    and quote.confirmed_at is null
    and quote.expires_at > v_now
  order by quote.created_at desc
  limit 1
  for update;

  if not found then
    insert into public.movie_buff_active_leave_quotes (
      match_id,
      room_id,
      round_id,
      player_id,
      seat_index,
      phase,
      phase_version,
      policy_version,
      penalty_reason,
      penalty_points,
      expires_at
    )
    values (
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_player_id,
      v_seat.seat_index,
      v_state.phase,
      v_state.phase_version,
      v_policy.policy_version,
      'voluntary_active_leave',
      v_policy.penalty_points,
      v_now + pg_catalog.make_interval(secs => v_policy.quote_ttl_seconds)
    )
    returning * into v_quote;
  end if;

  return pg_catalog.jsonb_build_object(
    'quoteToken', v_quote.quote_token,
    'matchId', v_quote.match_id,
    'roomId', v_quote.room_id,
    'roundId', v_quote.round_id,
    'seatIndex', v_quote.seat_index,
    'phase', v_quote.phase,
    'phaseVersion', v_quote.phase_version,
    'policyVersion', v_quote.policy_version,
    'penaltyPoints', v_quote.penalty_points,
    'expiresAt', v_quote.expires_at,
    'serverNow', v_now
  );
end;
$$;

create or replace function public.confirm_movie_buff_active_leave(
  p_quote_token uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_quote public.movie_buff_active_leave_quotes%rowtype;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_seat public.movie_buff_match_participant_seats%rowtype;
  v_ledger public.movie_buff_leave_penalty_ledger%rowtype;
  v_humans integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_result jsonb;
begin
  if v_player_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_quote_token is null then
    raise exception 'Active-leave quote token required.';
  end if;

  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_idempotency_key, '')))
     not between 8 and 128 then
    raise exception 'Invalid active-leave idempotency key.';
  end if;

  select quote.*
  into v_quote
  from public.movie_buff_active_leave_quotes as quote
  where quote.quote_token = p_quote_token
    and quote.player_id = v_player_id
  for update;

  if not found then
    raise exception 'Active-leave quote not found.';
  end if;

  if v_quote.confirmed_at is not null then
    if v_quote.idempotency_key <> pg_catalog.btrim(p_idempotency_key) then
      raise exception 'Contradictory duplicate active-leave confirmation.';
    end if;
    return v_quote.result;
  end if;

  if v_quote.expires_at <= v_now then
    raise exception 'Active-leave quote expired.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = v_quote.match_id
    and state.room_id = v_quote.room_id
  for update;

  if not found
     or v_state.phase_version <> v_quote.phase_version
     or v_state.phase <> v_quote.phase
     or v_state.round_id <> v_quote.round_id
     or v_state.phase in ('finished', 'abandoned', 'blocked') then
    raise exception 'Active-leave quote is stale.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = v_quote.room_id
      and rp.player_id = v_player_id
      and rp.left_at is null
  ) then
    raise exception 'Active Movie Buff membership required.';
  end if;

  select seat.*
  into v_seat
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_quote.match_id
    and seat.original_player_id = v_player_id
  for update;

  if not found
     or v_seat.seat_index <> v_quote.seat_index
     or v_seat.controller_type <> 'human'
     or v_seat.controller_player_id <> v_player_id
     or v_seat.participant_state not in ('active', 'reconnect_grace') then
    raise exception 'Active human Movie Buff seat required.';
  end if;

  if exists (
    select 1
    from public.movie_buff_leave_penalty_ledger as ledger
    where ledger.match_id = v_quote.match_id
      and ledger.player_id = v_player_id
      and ledger.reason = 'voluntary_active_leave'
  ) then
    raise exception 'Contradictory duplicate active-leave confirmation.';
  end if;

  update public.movie_buff_match_participant_seats
  set
    participant_state = 'abandoned',
    controller_type = 'buster',
    controller_player_id = null,
    abandoned_at = v_now,
    abandonment_reason = 'voluntary_active_leave',
    abandoned_phase = v_state.phase,
    abandonment_policy_version = v_quote.policy_version,
    abandonment_penalty_points = v_quote.penalty_points,
    abandonment_quote_id = v_quote.id,
    abandonment_idempotency_key = pg_catalog.btrim(p_idempotency_key),
    updated_at = v_now
  where match_id = v_quote.match_id
    and seat_index = v_quote.seat_index
  returning * into v_seat;

  select ledger.*
  into v_ledger
  from public.movie_buff_leave_penalty_ledger as ledger
  where ledger.match_id = v_quote.match_id
    and ledger.player_id = v_player_id
    and ledger.reason = 'voluntary_active_leave';

  if not found then
    raise exception 'Active-leave penalty ledger was not written.';
  end if;

  select count(*)::integer
  into v_humans
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_quote.match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_humans = 0 and v_state.phase not in ('finished', 'abandoned') then
    update public.movie_buff_match_phase_state
    set
      phase = 'abandoned',
      phase_version = phase_version + 1,
      phase_started_at = v_now,
      phase_ends_at = null,
      selector_deadline_at = null,
      answer_deadline_at = null,
      results_end_at = null,
      blocked_reason = 'no_reconnect_eligible_humans',
      updated_at = v_now
    where match_id = v_quote.match_id
    returning * into v_state;

    update public.matches
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = v_quote.match_id;

    update public.game_rooms
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = v_quote.room_id;

    perform public.movie_buff_phase_event(
      v_quote.match_id,
      v_quote.room_id,
      v_quote.round_id,
      v_state.phase_version,
      v_quote.phase,
      'abandoned',
      'no_humans_remaining',
      v_player_id,
      pg_catalog.jsonb_build_object('reason', 'voluntary_active_leave')
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'confirmed', true,
    'quoteToken', v_quote.quote_token,
    'matchId', v_quote.match_id,
    'roomId', v_quote.room_id,
    'seatIndex', v_quote.seat_index,
    'participantState', v_seat.participant_state,
    'controllerType', v_seat.controller_type,
    'policyVersion', v_ledger.policy_version,
    'penaltyPoints', v_ledger.penalty_points,
    'scoreBefore', v_ledger.score_before,
    'scoreAfter', v_ledger.score_after,
    'ledgerId', v_ledger.id,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'serverNow', v_now
  );

  update public.movie_buff_active_leave_quotes
  set
    confirmed_at = v_now,
    idempotency_key = pg_catalog.btrim(p_idempotency_key),
    result = v_result
  where id = v_quote.id;

  return v_result;
end;
$$;

alter function public.movie_buff_prepare_abandonment_policy() owner to postgres;
alter function public.movie_buff_apply_abandonment_penalty() owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid) owner to postgres;
alter function public.movie_buff_activate_busters_on_safe_phase_entry() owner to postgres;
alter function public.get_movie_buff_active_leave_quote(uuid) owner to postgres;
alter function public.confirm_movie_buff_active_leave(uuid, text) owner to postgres;

revoke all on function public.movie_buff_prepare_abandonment_policy()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_apply_abandonment_penalty()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_busters_on_safe_phase_entry()
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_active_leave_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_movie_buff_active_leave(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_movie_buff_active_leave_quote(uuid)
  to authenticated, service_role;
grant execute on function public.confirm_movie_buff_active_leave(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
