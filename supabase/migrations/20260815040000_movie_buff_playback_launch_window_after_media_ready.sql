-- Keep the per-player launch window usable while production media is loading.
-- The phase machine remains authoritative: a player may start manually, and
-- any player still waiting is auto-started when the refreshed deadline expires.

begin;

create or replace function public.mark_movie_buff_round_media_ready(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_phase text;
  v_round_id uuid;
  v_match_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select
    state.phase,
    state.round_id,
    state.match_id
  into
    v_phase,
    v_round_id,
    v_match_id
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_phase not in ('transition', 'playback') then
    raise exception 'Movie Buff media is not available in the current phase.';
  end if;

  return query
  select *
  from public.movie_buff_mark_round_media_ready_legacy(p_room_id);

  -- Media readiness is the first point at which the player can act. Refresh
  -- the shared launch deadline from that point so a slow CDN or production
  -- media response cannot auto-start both players before either UI is usable.
  -- The deadline is only extended while at least one active human player is
  -- still waiting; once all players have started, the phase machine closes it.
  if v_phase = 'playback'
     and exists (
       select 1
       from public.movie_buff_match_participant_seats as seat
       left join public.match_round_player_playback as playback
         on playback.round_id = v_round_id
        and playback.player_id = seat.original_player_id
       where seat.match_id = v_match_id
         and seat.controller_type = 'human'
         and seat.participant_state in ('active', 'reconnect_grace')
         and playback.playback_started_at is null
     ) then
    update public.movie_buff_match_phase_state as state
    set
      phase_ends_at = greatest(
        coalesce(state.phase_ends_at, v_now),
        v_now + pg_catalog.make_interval(
          secs => public.movie_buff_playback_launch_timeout_seconds()
        )
      ),
      updated_at = v_now
    where state.room_id = p_room_id
      and state.phase = 'playback';
  end if;
end;
$function$;

alter function public.mark_movie_buff_round_media_ready(uuid)
  owner to postgres;
alter function public.mark_movie_buff_round_media_ready(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_movie_buff_round_media_ready(uuid)
  to authenticated, service_role;

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

  -- Preserve a deadline refreshed by media readiness. If no refresh exists,
  -- fall back to the original phase-start launch window.
  v_launch_deadline := greatest(
    coalesce(
      v_state.phase_ends_at,
      v_state.phase_started_at + pg_catalog.make_interval(
        secs => public.movie_buff_playback_launch_timeout_seconds()
      )
    ),
    v_state.phase_started_at + pg_catalog.make_interval(
      secs => public.movie_buff_playback_launch_timeout_seconds()
    )
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

  -- Restore the launch deadline, or leave it closed once automatic launch
  -- has started all remaining players.
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
      where exists (
        select 1
        from public.answers as answer
        where answer.round_id = v_state.round_id
          and answer.player_id = seat.original_player_id
      )
      or (
        exists (
          select 1
          from public.match_round_player_playback as playback
          where playback.round_id = v_state.round_id
            and playback.player_id = seat.original_player_id
            and playback.playback_started_at is not null
        )
        and public.is_movie_buff_round_player_finished(
          v_state.round_id,
          seat.original_player_id,
          v_round_started_at,
          v_time_limit_seconds
        )
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
