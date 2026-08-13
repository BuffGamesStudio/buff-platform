begin;

create or replace function public.advance_movie_buff_match_phase(
  p_room_id uuid,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_before_phase text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_legacy_result jsonb;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
  v_players_total integer := 0;
  v_players_finished integer := 0;
  v_players_started integer := 0;
  v_launch_deadline timestamptz;
  v_launch_expired boolean := false;
  v_all_players_started boolean := false;
begin
  v_actor := public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for update;

  v_before_phase := v_state.phase;

  if p_expected_version is not null
     and v_state.phase_version <> p_expected_version then
    return pg_catalog.jsonb_build_object(
      'advanced', false,
      'reason', 'version_changed',
      'phase', v_state.phase,
      'phaseVersion', v_state.phase_version
    );
  end if;

  if v_state.phase <> 'playback' then
    v_legacy_result := public.movie_buff_advance_phase_legacy(
      p_room_id,
      p_expected_version
    );

    select state.*
    into v_state
    from public.movie_buff_match_phase_state as state
    where state.room_id = p_room_id;

    -- The legacy machine uses the clip duration as the playback phase
    -- deadline. For the individual-player flow that deadline is the launch
    -- window; player clocks begin independently after that window.
    if v_state.phase = 'playback' then
      update public.movie_buff_match_phase_state
      set
        phase_ends_at = v_state.phase_started_at +
          pg_catalog.make_interval(
            secs => public.movie_buff_playback_launch_timeout_seconds()
          ),
        updated_at = v_now
      where match_id = v_state.match_id;

      select state.*
      into v_state
      from public.movie_buff_match_phase_state as state
      where state.room_id = p_room_id;
    end if;

    return pg_catalog.jsonb_build_object(
      'advanced', v_state.phase <> v_before_phase,
      'matchId', v_state.match_id,
      'roundId', v_state.round_id,
      'phase', v_state.phase,
      'phaseVersion', v_state.phase_version,
      'phaseEndsAt', v_state.phase_ends_at,
      'blockedReason', v_state.blocked_reason,
      'serverNow', v_now
    );
  end if;

  -- Derive the launch deadline from the authoritative playback start on every
  -- tick. Legacy media-ready calls can leave the old clip-duration deadline
  -- in the phase row, which must not shorten this player launch window.
  v_launch_deadline := v_state.phase_started_at +
    pg_catalog.make_interval(
      secs => public.movie_buff_playback_launch_timeout_seconds()
    );

  select
    count(*)::integer,
    count(*) filter (
      where playback.playback_started_at is not null
    )::integer
  into
    v_players_total,
    v_players_started
  from public.movie_buff_match_participant_seats as seat
  left join public.match_round_player_playback as playback
    on playback.round_id = v_state.round_id
   and playback.player_id = seat.original_player_id
  where seat.match_id = v_state.match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_players_total > 0
     and v_players_started < v_players_total
     and v_launch_deadline <= v_now then
    insert into public.match_round_player_playback (
      round_id,
      player_id,
      started_at,
      play_requested_at,
      playback_started_at
    )
    select
      v_state.round_id,
      seat.original_player_id,
      v_now,
      null,
      v_now
    from public.movie_buff_match_participant_seats as seat
    left join public.match_round_player_playback as playback
      on playback.round_id = v_state.round_id
     and playback.player_id = seat.original_player_id
    where seat.match_id = v_state.match_id
      and seat.controller_type = 'human'
      and seat.participant_state in ('active', 'reconnect_grace')
      and (
        playback.round_id is null
        or playback.playback_started_at is null
      )
    on conflict (round_id, player_id) do update
    set
      started_at = coalesce(
        public.match_round_player_playback.started_at,
        excluded.started_at
      ),
      playback_started_at = coalesce(
        public.match_round_player_playback.playback_started_at,
        excluded.playback_started_at
      );

    update public.movie_buff_match_phase_state
    set
      phase_ends_at = null,
      updated_at = v_now
    where match_id = v_state.match_id;

    v_launch_expired := true;
  elsif v_players_total > 0
        and v_players_started >= v_players_total then
    v_all_players_started := true;
    update public.movie_buff_match_phase_state
    set
      phase_ends_at = null,
      updated_at = v_now
    where match_id = v_state.match_id;
  else
    update public.movie_buff_match_phase_state
    set
      phase_ends_at = v_launch_deadline,
      updated_at = v_now
    where match_id = v_state.match_id;
  end if;

  -- Let the legacy machine perform presence/abandonment checks without
  -- allowing its old playback -> answer transition to fire.
  update public.movie_buff_match_phase_state
  set phase_ends_at = v_now + pg_catalog.make_interval(days => 1)
  where match_id = v_state.match_id;

  perform public.movie_buff_advance_phase_legacy(p_room_id, null);

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_state.phase <> 'playback' then
    return pg_catalog.jsonb_build_object(
      'advanced', v_state.phase <> v_before_phase,
      'matchId', v_state.match_id,
      'roundId', v_state.round_id,
      'phase', v_state.phase,
      'phaseVersion', v_state.phase_version,
      'phaseEndsAt', v_state.phase_ends_at,
      'blockedReason', v_state.blocked_reason,
      'serverNow', v_now
    );
  end if;

  -- Restore the launch deadline, or leave it closed once automatic launch has
  -- started all remaining players.
  update public.movie_buff_match_phase_state
  set
    phase_ends_at = case
      when v_launch_expired or v_all_players_started then null
      else v_launch_deadline
    end,
    updated_at = v_now
  where match_id = v_state.match_id;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  select
    round.started_at,
    round.time_limit_seconds
  into
    v_round_started_at,
    v_time_limit_seconds
  from public.match_rounds as round
  where round.id = v_state.round_id;

  select
    count(*)::integer,
    count(*) filter (
      where public.is_movie_buff_round_player_finished(
        v_state.round_id,
        seat.original_player_id,
        v_round_started_at,
        v_time_limit_seconds
      )
    )::integer
  into
    v_players_total,
    v_players_finished
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  if v_players_total > 0
     and v_players_finished >= v_players_total then
    -- Reuse the already-tested results transition in the legacy machine.
    update public.movie_buff_match_phase_state
    set
      phase = 'answer',
      phase_version = phase_version + 1,
      phase_started_at = v_now,
      phase_ends_at = v_now,
      answer_deadline_at = v_now,
      results_end_at = null,
      updated_at = v_now
    where match_id = v_state.match_id
    returning * into v_state;

    perform public.movie_buff_phase_event(
      v_state.match_id,
      p_room_id,
      v_state.round_id,
      v_state.phase_version,
      'playback',
      'answer',
      'all_players_finished',
      v_actor,
      pg_catalog.jsonb_build_object(
        'playersFinished', v_players_finished,
        'playersTotal', v_players_total
      )
    );

    perform public.movie_buff_advance_phase_legacy(p_room_id, null);

    select state.*
    into v_state
    from public.movie_buff_match_phase_state as state
    where state.room_id = p_room_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'advanced', v_state.phase <> v_before_phase,
    'matchId', v_state.match_id,
    'roundId', v_state.round_id,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'phaseEndsAt', v_state.phase_ends_at,
    'blockedReason', v_state.blocked_reason,
    'serverNow', v_now
  );
end;
$function$;

alter function public.advance_movie_buff_match_phase(uuid, bigint)
  owner to postgres;
alter function public.advance_movie_buff_match_phase(uuid, bigint)
  set search_path = pg_catalog, public;

notify pgrst, 'reload schema';

commit;
