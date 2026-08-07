-- MOV-17 exact-race repair.
--
-- 1. Reject direct answers from any non-answer phase before legacy round/clip
--    resolution can obscure the authoritative phase failure.
-- 2. Keep abandoned human seats human throughout round_intro and vip_lock;
--    Buster may activate only at board_select/results safe boundaries.

alter function public.submit_movie_buff_answer(uuid,text)
  rename to submit_movie_buff_answer_legacy_unchecked;

revoke all on function public.submit_movie_buff_answer_legacy_unchecked(uuid,text)
  from public, anon, authenticated, service_role;

create function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for share;

  if not found
     or v_state.phase <> 'answer'
     or v_state.answer_deadline_at is null
     or v_now > v_state.answer_deadline_at then
    raise exception 'Movie Buff answer window is not open.';
  end if;

  return query
  select *
  from public.submit_movie_buff_answer_legacy_unchecked(
    p_room_id,
    p_submitted_answer
  );
end;
$$;

alter function public.submit_movie_buff_answer(uuid,text)
  owner to postgres;

revoke all on function public.submit_movie_buff_answer(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_movie_buff_answer(uuid,text)
  to authenticated, service_role;

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
     or v_state.phase not in ('board_select', 'results') then
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
     and new.phase not in ('board_select', 'results') then
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
