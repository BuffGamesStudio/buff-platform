-- MOV-17 follow-up: reconnect-grace expiry creates a pending system
-- controller. Buster activates only after the delay at a safe phase boundary.

create or replace function public.movie_buff_stage_abandoned_controller()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.participant_state <> 'abandoned'
     and new.participant_state = 'abandoned'
     and new.controller_type = 'buster' then
    new.controller_type := 'system';
    new.controller_player_id := null;
    new.replacement_ready_at := coalesce(
      new.replacement_ready_at,
      pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => 2)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists movie_buff_stage_abandoned_controller
  on public.movie_buff_match_participant_seats;
create trigger movie_buff_stage_abandoned_controller
before update on public.movie_buff_match_participant_seats
for each row execute function public.movie_buff_stage_abandoned_controller();

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
      and controller_type = 'system'
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

  perform public.advance_movie_buff_match_phase(p_room_id, null);
  perform public.movie_buff_activate_ready_busters(p_room_id);

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
        'replacementReadyAt', seat.replacement_ready_at,
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

alter function public.movie_buff_stage_abandoned_controller() owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid) owner to postgres;
alter function public.get_movie_buff_match_phase_view(uuid) owner to postgres;

revoke all on function public.movie_buff_stage_abandoned_controller()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
