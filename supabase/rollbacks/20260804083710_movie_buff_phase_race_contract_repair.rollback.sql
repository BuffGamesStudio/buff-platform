-- Data-preserving rollback for 20260804083710.
-- Restores the immediately preceding answer function identity and the 83700
-- Buster safe-boundary implementation. No gameplay rows are deleted.

do $$
begin
  if current_setting(
    'movie_buff.allow_phase_race_contract_rollback',
    true
  ) is distinct from 'on' then
    raise exception
      'Set movie_buff.allow_phase_race_contract_rollback=on for this rollback.';
  end if;
end;
$$;

drop function if exists public.submit_movie_buff_answer(uuid,text);

alter function public.submit_movie_buff_answer_legacy_unchecked(uuid,text)
  rename to submit_movie_buff_answer;

alter function public.submit_movie_buff_answer(uuid,text)
  owner to postgres;
revoke all on function public.submit_movie_buff_answer(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_movie_buff_answer(uuid,text)
  to authenticated;

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

alter function public.movie_buff_activate_ready_busters(uuid)
  owner to postgres;
alter function public.movie_buff_activate_busters_on_phase_boundary()
  owner to postgres;

revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_busters_on_phase_boundary()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
