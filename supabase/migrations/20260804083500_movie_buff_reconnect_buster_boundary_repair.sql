-- MOV-17 repair: an expired reconnect cannot reactivate itself, and Buster
-- control begins only at the authoritative board_select boundary.

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

  if v_seat.participant_state = 'completed' then
    return pg_catalog.jsonb_build_object(
      'matchId', v_match_id,
      'seatIndex', v_seat.seat_index,
      'participantState', 'completed',
      'resumeAllowed', false,
      'reason', 'match_completed',
      'serverNow', v_now
    );
  end if;

  if v_seat.controller_type <> 'human'
     or v_seat.controller_player_id is distinct from v_player_id then
    return pg_catalog.jsonb_build_object(
      'matchId', v_match_id,
      'seatIndex', v_seat.seat_index,
      'participantState', v_seat.participant_state,
      'resumeAllowed', false,
      'reason', 'seat_not_human_controlled',
      'serverNow', v_now
    );
  end if;

  if v_seat.participant_state = 'reconnect_grace'
     and v_seat.reconnect_deadline_at is null then
    return pg_catalog.jsonb_build_object(
      'matchId', v_match_id,
      'seatIndex', v_seat.seat_index,
      'participantState', 'reconnect_grace',
      'resumeAllowed', false,
      'reason', 'reconnect_deadline_missing',
      'serverNow', v_now
    );
  end if;

  if v_seat.participant_state = 'reconnect_grace'
     and v_seat.reconnect_deadline_at <= v_now then
    return pg_catalog.jsonb_build_object(
      'matchId', v_match_id,
      'seatIndex', v_seat.seat_index,
      'participantState', 'reconnect_grace',
      'resumeAllowed', false,
      'reason', 'reconnect_grace_expired',
      'reconnectDeadlineAt', v_seat.reconnect_deadline_at,
      'serverNow', v_now
    );
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
    and seat_index = v_seat.seat_index
    and controller_type = 'human'
    and controller_player_id = v_player_id
    and (
      participant_state = 'active'
      or (
        participant_state = 'reconnect_grace'
        and reconnect_deadline_at is not null
        and reconnect_deadline_at > v_now
      )
    );

  if not found then
    return pg_catalog.jsonb_build_object(
      'matchId', v_match_id,
      'seatIndex', v_seat.seat_index,
      'participantState', v_seat.participant_state,
      'resumeAllowed', false,
      'reason', 'seat_state_changed',
      'serverNow', v_now
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'matchId', v_match_id,
    'seatIndex', v_seat.seat_index,
    'participantState', 'active',
    'resumeAllowed', true,
    'serverNow', v_now
  );
end;
$$;

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

  -- An abandoned human is released from VIP requirements immediately, but
  -- the replacement controller begins only when the shared phase reaches the
  -- board selection boundary.
  if not found or v_state.phase <> 'board_select' then
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
    returning seat_index, original_player_id
  loop
    v_count := v_count + 1;
    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      v_state.phase,
      v_state.phase,
      'buster_activated_at_board_select',
      null,
      pg_catalog.jsonb_build_object(
        'seatIndex', v_seat.seat_index,
        'originalPlayerId', v_seat.original_player_id,
        'replacementReadyAt', v_now
      )
    );
  end loop;

  return v_count;
end;
$$;

alter function public.touch_movie_buff_match_participant(uuid) owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid) owner to postgres;

revoke all on function public.touch_movie_buff_match_participant(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.touch_movie_buff_match_participant(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
