-- MOV-17 repair increment B: atomic Buster activation at authoritative
-- phase boundaries and caller-safe two-step active-match leave authority.

create table if not exists public.movie_buff_active_leave_policies (
  policy_version text primary key,
  penalty_points integer not null check (penalty_points >= 0),
  quote_ttl_seconds integer not null check (quote_ttl_seconds between 10 and 600),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  check (not active or retired_at is null)
);

create unique index if not exists movie_buff_one_active_leave_policy_idx
  on public.movie_buff_active_leave_policies ((active))
  where active;

create table if not exists public.movie_buff_active_leave_quotes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  match_id uuid not null references public.matches(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  seat_index integer not null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  phase_version bigint not null check (phase_version > 0),
  policy_version text not null references public.movie_buff_active_leave_policies(policy_version),
  penalty_points integer not null check (penalty_points >= 0),
  quoted_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_action_id uuid,
  check (expires_at > quoted_at)
);

create index if not exists movie_buff_active_leave_quotes_lookup_idx
  on public.movie_buff_active_leave_quotes (
    room_id, player_id, match_id, expires_at desc
  );

create table if not exists public.movie_buff_active_leave_penalty_ledger (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  quote_id uuid not null unique
    references public.movie_buff_active_leave_quotes(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  room_id uuid not null references public.game_rooms(id) on delete restrict,
  seat_index integer not null,
  player_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (reason = 'voluntary_active_leave'),
  policy_version text not null,
  configured_penalty_points integer not null check (configured_penalty_points >= 0),
  room_score_before integer not null,
  room_score_after integer not null,
  match_score_before integer not null,
  match_score_after integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.movie_buff_match_abandonment_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique,
  quote_id uuid unique references public.movie_buff_active_leave_quotes(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  room_id uuid not null references public.game_rooms(id) on delete restrict,
  round_id uuid references public.match_rounds(id) on delete set null,
  seat_index integer not null,
  player_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  phase text not null,
  phase_version bigint not null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

alter table public.movie_buff_active_leave_policies enable row level security;
alter table public.movie_buff_active_leave_policies force row level security;
alter table public.movie_buff_active_leave_quotes enable row level security;
alter table public.movie_buff_active_leave_quotes force row level security;
alter table public.movie_buff_active_leave_penalty_ledger enable row level security;
alter table public.movie_buff_active_leave_penalty_ledger force row level security;
alter table public.movie_buff_match_abandonment_events enable row level security;
alter table public.movie_buff_match_abandonment_events force row level security;

revoke all on public.movie_buff_active_leave_policies
  from public, anon, authenticated;
revoke all on public.movie_buff_active_leave_quotes
  from public, anon, authenticated;
revoke all on public.movie_buff_active_leave_penalty_ledger
  from public, anon, authenticated;
revoke all on public.movie_buff_match_abandonment_events
  from public, anon, authenticated;

grant all on public.movie_buff_active_leave_policies to service_role;
grant all on public.movie_buff_active_leave_quotes to service_role;
grant all on public.movie_buff_active_leave_penalty_ledger to service_role;
grant all on public.movie_buff_match_abandonment_events to service_role;

create or replace function public.movie_buff_reject_immutable_match_record_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Movie Buff immutable match records cannot be changed.';
end;
$$;

drop trigger if exists movie_buff_penalty_ledger_immutable
  on public.movie_buff_active_leave_penalty_ledger;
create trigger movie_buff_penalty_ledger_immutable
before update or delete on public.movie_buff_active_leave_penalty_ledger
for each row execute function public.movie_buff_reject_immutable_match_record_change();

drop trigger if exists movie_buff_abandonment_events_immutable
  on public.movie_buff_match_abandonment_events;
create trigger movie_buff_abandonment_events_immutable
before update or delete on public.movie_buff_match_abandonment_events
for each row execute function public.movie_buff_reject_immutable_match_record_change();

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

  if not found
     or v_state.phase not in ('board_select', 'results', 'round_intro') then
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
      and replacement_ready_at <= v_now
    returning seat_index, original_player_id, replacement_ready_at
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
        'replacementReadyAt', v_seat.replacement_ready_at
      )
    );
  end loop;

  return v_count;
end;
$$;

create or replace function public.movie_buff_activate_busters_on_phase_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_immediate_board_handoff boolean;
  v_seat record;
begin
  if old.phase is not distinct from new.phase then
    return new;
  end if;

  v_immediate_board_handoff :=
    old.phase in ('round_intro', 'vip_lock')
    and new.phase = 'board_select';

  if not v_immediate_board_handoff
     and new.phase not in ('board_select', 'results', 'round_intro') then
    return new;
  end if;

  for v_seat in
    update public.movie_buff_match_participant_seats
    set
      controller_type = 'buster',
      controller_player_id = null,
      updated_at = v_now
    where match_id = new.match_id
      and participant_state = 'abandoned'
      and controller_type = 'human'
      and controller_player_id = original_player_id
      and (
        v_immediate_board_handoff
        or (
          replacement_ready_at is not null
          and replacement_ready_at <= v_now
        )
      )
    returning seat_index, original_player_id, replacement_ready_at
  loop
    perform public.movie_buff_phase_event(
      new.match_id,
      new.room_id,
      new.round_id,
      new.phase_version,
      old.phase,
      new.phase,
      case
        when v_immediate_board_handoff
          then 'buster_activated_on_board_entry'
        else 'buster_activated_at_safe_boundary'
      end,
      null,
      pg_catalog.jsonb_build_object(
        'seatIndex', v_seat.seat_index,
        'originalPlayerId', v_seat.original_player_id,
        'replacementReadyAt', v_seat.replacement_ready_at,
        'atomicBoardEntry', v_immediate_board_handoff
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists movie_buff_activate_busters_on_phase_boundary
  on public.movie_buff_match_phase_state;
create trigger movie_buff_activate_busters_on_phase_boundary
after update of phase on public.movie_buff_match_phase_state
for each row
when (old.phase is distinct from new.phase)
execute function public.movie_buff_activate_busters_on_phase_boundary();

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
  v_policy public.movie_buff_active_leave_policies%rowtype;
  v_quote_id uuid := extensions.gen_random_uuid();
  v_token text := extensions.gen_random_uuid()::text;
  v_token_hash text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_expires_at timestamptz;
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  if v_player_id is null then
    raise exception 'Authenticated Movie Buff player required.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  join public.matches as m
    on m.id = state.match_id
   and m.status = 'active'
  where state.room_id = p_room_id
    and state.phase not in ('finished', 'abandoned', 'blocked')
  for share of state;

  if not found then
    raise exception 'Active Movie Buff match state required.';
  end if;

  select seat.*
  into v_seat
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.original_player_id = v_player_id
    and seat.controller_type = 'human'
    and seat.controller_player_id = v_player_id
    and seat.participant_state in ('active', 'reconnect_grace')
  for share;

  if not found then
    raise exception 'Active human Movie Buff participant seat required.';
  end if;

  select policy.*
  into v_policy
  from public.movie_buff_active_leave_policies as policy
  where policy.active
    and policy.retired_at is null
  order by policy.created_at desc
  limit 1;

  if not found then
    raise exception 'Active Movie Buff leave policy is unavailable.';
  end if;

  v_expires_at := v_now
    + pg_catalog.make_interval(secs => v_policy.quote_ttl_seconds);
  v_token_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.movie_buff_active_leave_quotes (
    id,
    token_hash,
    match_id,
    room_id,
    seat_index,
    player_id,
    phase_version,
    policy_version,
    penalty_points,
    quoted_at,
    expires_at
  )
  values (
    v_quote_id,
    v_token_hash,
    v_state.match_id,
    p_room_id,
    v_seat.seat_index,
    v_player_id,
    v_state.phase_version,
    v_policy.policy_version,
    v_policy.penalty_points,
    v_now,
    v_expires_at
  );

  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote_id,
    'quoteToken', v_token,
    'roomId', p_room_id,
    'matchId', v_state.match_id,
    'seatIndex', v_seat.seat_index,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'policyVersion', v_policy.policy_version,
    'penaltyPoints', v_policy.penalty_points,
    'quotedAt', v_now,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.confirm_movie_buff_active_leave(
  p_room_id uuid,
  p_quote_token text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_token_hash text;
  v_request_hash text;
  v_existing public.movie_buff_match_phase_actions%rowtype;
  v_quote public.movie_buff_active_leave_quotes%rowtype;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_seat public.movie_buff_match_participant_seats%rowtype;
  v_room_score_before integer;
  v_match_score_before integer;
  v_room_score_after integer;
  v_match_score_after integer;
  v_action_id uuid := extensions.gen_random_uuid();
  v_remaining_humans integer;
  v_result jsonb;
begin
  if v_player_id is null then
    raise exception 'Authentication required.';
  end if;

  if nullif(pg_catalog.btrim(coalesce(p_quote_token, '')), '') is null then
    raise exception 'Leave quote token required.';
  end if;

  if char_length(pg_catalog.btrim(coalesce(p_idempotency_key, '')))
     not between 8 and 128 then
    raise exception 'Valid leave idempotency key required.';
  end if;

  v_token_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(pg_catalog.btrim(p_quote_token), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|',
          p_room_id::text,
          v_token_hash,
          pg_catalog.btrim(p_idempotency_key)
        ),
        'UTF8'
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
    if v_existing.action_type <> 'leave_confirm'
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Contradictory duplicate active-leave confirmation.';
    end if;
    return v_existing.result;
  end if;

  select quote.*
  into v_quote
  from public.movie_buff_active_leave_quotes as quote
  where quote.token_hash = v_token_hash
    and quote.room_id = p_room_id
    and quote.player_id = v_player_id
  for update;

  if not found then
    raise exception 'Active-leave quote is invalid.';
  end if;

  -- Re-check after the quote lock so concurrent identical confirmations converge.
  select action.*
  into v_existing
  from public.movie_buff_match_phase_actions as action
  where action.actor_player_id = v_player_id
    and action.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.action_type <> 'leave_confirm'
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Contradictory duplicate active-leave confirmation.';
    end if;
    return v_existing.result;
  end if;

  if v_quote.consumed_at is not null then
    raise exception 'Active-leave quote was already consumed.';
  end if;
  if v_quote.expires_at <= v_now then
    raise exception 'Active-leave quote expired.';
  end if;

  perform public.movie_buff_phase_require_access(p_room_id);

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
    and state.match_id = v_quote.match_id
  for update;

  if not found
     or v_state.phase in ('finished', 'abandoned', 'blocked')
     or v_state.phase_version <> v_quote.phase_version then
    raise exception 'Active-leave quote is stale for the authoritative phase.';
  end if;

  if not exists (
    select 1
    from public.movie_buff_active_leave_policies as policy
    where policy.policy_version = v_quote.policy_version
      and policy.active
      and policy.retired_at is null
      and policy.penalty_points = v_quote.penalty_points
  ) then
    raise exception 'Active-leave policy changed; request a new quote.';
  end if;

  select seat.*
  into v_seat
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_quote.match_id
    and seat.seat_index = v_quote.seat_index
    and seat.original_player_id = v_player_id
  for update;

  if not found
     or v_seat.controller_type <> 'human'
     or v_seat.controller_player_id <> v_player_id
     or v_seat.participant_state not in ('active', 'reconnect_grace') then
    raise exception 'Active human participant seat required.';
  end if;

  select rp.score, mp.final_score
  into v_room_score_before, v_match_score_before
  from public.room_players as rp
  join public.match_players as mp
    on mp.match_id = v_quote.match_id
   and mp.player_id = rp.player_id
  where rp.room_id = p_room_id
    and rp.player_id = v_player_id
    and rp.left_at is null
  for update of rp, mp;

  if not found then
    raise exception 'Active Movie Buff score binding required.';
  end if;

  v_room_score_after := greatest(
    0, v_room_score_before - v_quote.penalty_points
  );
  v_match_score_after := greatest(
    0, v_match_score_before - v_quote.penalty_points
  );

  update public.room_players
  set
    score = v_room_score_after,
    is_ready = false,
    is_host = false,
    left_at = coalesce(left_at, v_now)
  where room_id = p_room_id
    and player_id = v_player_id
    and left_at is null;

  if not found then
    raise exception 'Active Movie Buff membership changed.';
  end if;

  update public.match_players
  set final_score = v_match_score_after
  where match_id = v_quote.match_id
    and player_id = v_player_id;

  update public.movie_buff_match_participant_seats
  set
    participant_state = 'abandoned',
    abandoned_at = coalesce(abandoned_at, v_now),
    reconnect_deadline_at = null,
    replacement_ready_at = coalesce(
      replacement_ready_at,
      v_now + pg_catalog.make_interval(secs => 2)
    ),
    updated_at = v_now
  where match_id = v_quote.match_id
    and seat_index = v_quote.seat_index
    and participant_state in ('active', 'reconnect_grace')
    and controller_type = 'human'
    and controller_player_id = v_player_id;

  if not found then
    raise exception 'Movie Buff participant seat changed.';
  end if;

  perform public.movie_buff_phase_release_vip_participant(
    p_room_id,
    v_state.round_id,
    v_player_id,
    'voluntary_active_leave'
  );

  select count(*)::integer
  into v_remaining_humans
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_quote.match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_remaining_humans = 0 then
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
    where match_id = v_quote.match_id
    returning * into v_state;

    update public.matches
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = v_quote.match_id;

    update public.game_rooms
    set status = 'cancelled', finished_at = coalesce(finished_at, v_now)
    where id = p_room_id;

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      null,
      'abandoned',
      'no_humans_remaining_after_leave',
      v_player_id,
      '{}'::jsonb
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'confirmed', true,
    'roomId', p_room_id,
    'matchId', v_quote.match_id,
    'seatIndex', v_quote.seat_index,
    'participantState', 'abandoned',
    'policyVersion', v_quote.policy_version,
    'configuredPenaltyPoints', v_quote.penalty_points,
    'roomScoreBefore', v_room_score_before,
    'roomScoreAfter', v_room_score_after,
    'matchScoreBefore', v_match_score_before,
    'matchScoreAfter', v_match_score_after,
    'remainingHumans', v_remaining_humans,
    'matchAbandoned', v_remaining_humans = 0,
    'confirmedAt', v_now
  );

  insert into public.movie_buff_match_phase_actions (
    id,
    match_id,
    room_id,
    actor_player_id,
    action_type,
    idempotency_key,
    request_hash,
    result
  )
  values (
    v_action_id,
    v_quote.match_id,
    p_room_id,
    v_player_id,
    'leave_confirm',
    pg_catalog.btrim(p_idempotency_key),
    v_request_hash,
    v_result
  );

  insert into public.movie_buff_active_leave_penalty_ledger (
    action_id,
    quote_id,
    match_id,
    room_id,
    seat_index,
    player_id,
    reason,
    policy_version,
    configured_penalty_points,
    room_score_before,
    room_score_after,
    match_score_before,
    match_score_after,
    created_at
  )
  values (
    v_action_id,
    v_quote.id,
    v_quote.match_id,
    p_room_id,
    v_quote.seat_index,
    v_player_id,
    'voluntary_active_leave',
    v_quote.policy_version,
    v_quote.penalty_points,
    v_room_score_before,
    v_room_score_after,
    v_match_score_before,
    v_match_score_after,
    v_now
  );

  insert into public.movie_buff_match_abandonment_events (
    action_id,
    quote_id,
    match_id,
    room_id,
    round_id,
    seat_index,
    player_id,
    reason,
    phase,
    phase_version,
    occurred_at,
    payload
  )
  values (
    v_action_id,
    v_quote.id,
    v_quote.match_id,
    p_room_id,
    v_state.round_id,
    v_quote.seat_index,
    v_player_id,
    'voluntary_active_leave',
    v_state.phase,
    v_state.phase_version,
    v_now,
    pg_catalog.jsonb_build_object(
      'policyVersion', v_quote.policy_version,
      'configuredPenaltyPoints', v_quote.penalty_points,
      'roomScoreBefore', v_room_score_before,
      'roomScoreAfter', v_room_score_after,
      'matchScoreBefore', v_match_score_before,
      'matchScoreAfter', v_match_score_after
    )
  );

  update public.movie_buff_active_leave_quotes
  set consumed_at = v_now, consumed_action_id = v_action_id
  where id = v_quote.id
    and consumed_at is null;

  return v_result;
end;
$$;

alter function public.movie_buff_reject_immutable_match_record_change()
  owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid)
  owner to postgres;
alter function public.movie_buff_activate_busters_on_phase_boundary()
  owner to postgres;
alter function public.get_movie_buff_active_leave_quote(uuid)
  owner to postgres;
alter function public.confirm_movie_buff_active_leave(uuid,text,text)
  owner to postgres;

revoke all on function public.movie_buff_reject_immutable_match_record_change()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_busters_on_phase_boundary()
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_active_leave_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_movie_buff_active_leave(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_movie_buff_active_leave_quote(uuid)
  to authenticated, service_role;
grant execute on function public.confirm_movie_buff_active_leave(uuid,text,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';