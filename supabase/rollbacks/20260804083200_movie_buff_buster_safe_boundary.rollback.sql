-- Reverse only the MOV-17 safe-boundary Buster correction.
-- Restore the canonical view from the immediately preceding hardening migration
-- before removing the correction-only trigger and functions. No phase, seat,
-- event, board, answer, or match data is deleted.

begin;

drop trigger if exists movie_buff_stage_abandoned_controller
  on public.movie_buff_match_participant_seats;

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

alter function public.get_movie_buff_match_phase_view(uuid) owner to postgres;
revoke all on function public.get_movie_buff_match_phase_view(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_match_phase_view(uuid)
  to authenticated, service_role;

drop function if exists public.movie_buff_stage_abandoned_controller();
drop function if exists public.movie_buff_activate_ready_busters(uuid);

notify pgrst, 'reload schema';
commit;
