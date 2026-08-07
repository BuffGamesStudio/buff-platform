-- MOV-17: enforce Buster activation only at the authoritative board_select boundary.
--
-- Reconnect expiry and voluntary abandonment may release the human seat and
-- prepare a replacement, but they must not transfer controller authority while
-- Round Intro, VIP, transition, playback, answer, or results is active.

create or replace function public.movie_buff_enforce_buster_board_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_phase text;
begin
  if old.controller_type = 'human'
     and new.controller_type = 'buster' then
    select state.phase
    into v_phase
    from public.movie_buff_match_phase_state as state
    where state.match_id = new.match_id;

    if v_phase is distinct from 'board_select' then
      new.controller_type := 'human';
      new.controller_player_id := old.controller_player_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists movie_buff_buster_requires_board_boundary
  on public.movie_buff_match_participant_seats;
create trigger movie_buff_buster_requires_board_boundary
before update of controller_type
on public.movie_buff_match_participant_seats
for each row
when (old.controller_type is distinct from new.controller_type)
execute function public.movie_buff_enforce_buster_board_boundary();

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
      'buster_activated_at_board_select',
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
  v_seat record;
begin
  if old.phase is not distinct from new.phase
     or new.phase <> 'board_select' then
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
    returning seat_index, original_player_id, replacement_ready_at
  loop
    perform public.movie_buff_phase_event(
      new.match_id,
      new.room_id,
      new.round_id,
      new.phase_version,
      old.phase,
      new.phase,
      'buster_activated_on_board_entry',
      null,
      pg_catalog.jsonb_build_object(
        'seatIndex', v_seat.seat_index,
        'originalPlayerId', v_seat.original_player_id,
        'replacementReadyAt', v_seat.replacement_ready_at,
        'atomicBoardEntry', true
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

alter function public.movie_buff_enforce_buster_board_boundary()
  owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid)
  owner to postgres;
alter function public.movie_buff_activate_busters_on_phase_boundary()
  owner to postgres;

revoke all on function public.movie_buff_enforce_buster_board_boundary()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_busters_on_phase_boundary()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
