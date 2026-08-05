-- Fail-closed containment rollback for MOV-17 repair increment B.
-- Durable quote, penalty, abandonment, action, and phase history is preserved.

revoke all on function public.get_movie_buff_active_leave_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_movie_buff_active_leave(uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_movie_buff_active_leave_quote(uuid)
  to service_role;
grant execute on function public.confirm_movie_buff_active_leave(uuid,text,text)
  to service_role;

drop trigger if exists movie_buff_activate_busters_on_phase_boundary
  on public.movie_buff_match_phase_state;

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

alter function public.movie_buff_activate_ready_busters(uuid)
  owner to postgres;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;

-- Immutable records and service-role table continuity remain intact.
alter table public.movie_buff_active_leave_policies force row level security;
alter table public.movie_buff_active_leave_quotes force row level security;
alter table public.movie_buff_active_leave_penalty_ledger force row level security;
alter table public.movie_buff_match_abandonment_events force row level security;

notify pgrst, 'reload schema';