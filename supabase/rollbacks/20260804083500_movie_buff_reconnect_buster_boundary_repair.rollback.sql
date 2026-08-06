-- Roll back only the MOV-17 reconnect/Buster boundary repair. Durable match,
-- participant, phase, event, and action data are preserved.

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
     or v_state.phase not in (
       'round_intro', 'vip_lock', 'board_select', 'results'
     ) then
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
      'buster_activated_at_safe_boundary',
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
