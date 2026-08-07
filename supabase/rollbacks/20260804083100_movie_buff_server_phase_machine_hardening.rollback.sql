-- Reverse only MOV-17 migration 20260804083100.
-- Apply after rolling back 20260804083200 and every later MOV-17 migration.
-- This rollback preserves phase, seat, action, event, board, answer, and match data.

begin;

drop trigger if exists movie_buff_answers_require_authoritative_phase
  on public.answers;
drop function if exists public.movie_buff_guard_authoritative_answer_phase();

-- Restore the immediately preceding 20260804083000 bootstrap implementation.
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

-- Restore the pre-hardening MOV-16 release compatibility behavior.
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

-- Restore the immediately preceding selector implementation. The hardening
-- migration's positive-version check is intentionally removed; stale-version
-- rejection and selector ownership remain unchanged.
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

alter function public.ensure_movie_buff_match_phase_state(uuid) owner to postgres;
alter function public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)
  owner to postgres;
alter function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  owner to postgres;

revoke all on function public.ensure_movie_buff_match_phase_state(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  from public, anon, authenticated, service_role;

grant execute on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  to authenticated, service_role;

-- Restore the pre-83100 ACL. This does not authorize using the legacy manual
-- flow after the hardening migration is reapplied.
revoke all on function public.advance_movie_buff_round(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.advance_movie_buff_round(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
