-- Movie Buff: the tile choice is shared, but playback and answer completion
-- are individual to each active player.
--
-- A player may start after the selector locks the tile. If the player does not
-- start before the launch window expires, the server starts that player's
-- clock automatically. The round remains in the play surface until every
-- active player has answered or their individual clock has expired.

begin;

do $rename_legacy_functions$
begin
  if pg_catalog.to_regprocedure(
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_get_round_player_time_left(uuid,uuid,timestamptz,integer)'
  ) is null then
    alter function public.get_movie_buff_round_player_time_left(
      uuid,
      uuid,
      timestamptz,
      integer
    ) rename to movie_buff_get_round_player_time_left;
  end if;

  if pg_catalog.to_regprocedure(
    'public.prepare_movie_buff_round_playback(uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_prepare_round_playback_legacy(uuid)'
  ) is null then
    alter function public.prepare_movie_buff_round_playback(uuid)
      rename to movie_buff_prepare_round_playback_legacy;
  end if;

  if pg_catalog.to_regprocedure(
    'public.mark_movie_buff_round_media_ready(uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_mark_round_media_ready_legacy(uuid)'
  ) is null then
    alter function public.mark_movie_buff_round_media_ready(uuid)
      rename to movie_buff_mark_round_media_ready_legacy;
  end if;

  if pg_catalog.to_regprocedure(
    'public.start_movie_buff_round_playback(uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_start_round_playback_legacy(uuid)'
  ) is null then
    alter function public.start_movie_buff_round_playback(uuid)
      rename to movie_buff_start_round_playback_legacy;
  end if;

  if pg_catalog.to_regprocedure(
    'public.submit_movie_buff_answer(uuid,text)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_submit_answer_legacy(uuid,text)'
  ) is null then
    alter function public.submit_movie_buff_answer(uuid, text)
      rename to movie_buff_submit_answer_legacy;
  end if;

  if pg_catalog.to_regprocedure(
    'public.advance_movie_buff_match_phase(uuid,bigint)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_advance_phase_legacy(uuid,bigint)'
  ) is null then
    alter function public.advance_movie_buff_match_phase(uuid, bigint)
      rename to movie_buff_advance_phase_legacy;
  end if;
end;
$rename_legacy_functions$;

create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_has_playback_row boolean := false;
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
  v_player_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as answer
    where answer.round_id = p_round_id
      and answer.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    coalesce(player_playback.round_id is not null, false),
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_has_playback_row,
    v_preplay_started_at,
    v_play_requested_at,
    v_player_playback_started_at,
    v_hint_penalty_seconds
  from public.match_rounds as round
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = round.id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = round.id
   and player_hint.player_id = p_player_id
  where round.id = p_round_id;

  if not found then
    return greatest(0, coalesce(p_time_limit_seconds, 0));
  end if;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  -- The match_rounds.playback_started_at column is a legacy shared clock.
  -- New rounds use only the caller's player playback row.
  if v_player_playback_started_at is not null then
    return greatest(
      0,
      v_effective_time_limit -
      greatest(
        0,
        floor(
          extract(
            epoch from (
              pg_catalog.clock_timestamp() -
              v_player_playback_started_at
            )
          )
        )::integer
      )
    );
  end if;

  if v_play_requested_at is not null then
    if floor(
      extract(
        epoch from (
          pg_catalog.clock_timestamp() - v_play_requested_at
        )
      )
    )::integer >= public.movie_buff_playback_launch_timeout_seconds() then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_preplay_started_at is not null then
    if floor(
      extract(
        epoch from (
          pg_catalog.clock_timestamp() - v_preplay_started_at
        )
      )
    )::integer >= public.movie_buff_preplay_timeout_seconds() then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_has_playback_row then
    return v_effective_time_limit;
  end if;

  if p_round_started_at is not null
     and floor(
       extract(
         epoch from (
           pg_catalog.clock_timestamp() - p_round_started_at
         )
       )
     )::integer >= public.movie_buff_round_entry_timeout_seconds() then
    return 0;
  end if;

  return v_effective_time_limit;
end;
$function$;

create or replace function public.prepare_movie_buff_round_playback(
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
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.phase
  into v_phase
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_phase not in ('transition', 'playback') then
    raise exception 'Movie Buff playback is not available in the current phase.';
  end if;

  return query
  select *
  from public.movie_buff_prepare_round_playback_legacy(p_room_id);
end;
$function$;

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
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.phase
  into v_phase
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_phase not in ('transition', 'playback') then
    raise exception 'Movie Buff media is not available in the current phase.';
  end if;

  return query
  select *
  from public.movie_buff_mark_round_media_ready_legacy(p_room_id);
end;
$function$;

create or replace function public.start_movie_buff_round_playback(
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
  v_round_id uuid;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
  v_phase text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.phase
  into v_phase
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_phase not in ('transition', 'playback') then
    raise exception 'Movie Buff playback cannot start before the selector locks the tile.';
  end if;

  select
    game_round.id,
    game_round.started_at,
    game_round.time_limit_seconds
  into
    v_round_id,
    v_round_started_at,
    v_time_limit_seconds
  from public.game_rooms as game_room
  join public.matches as game_match
    on game_match.room_id = game_room.id
   and game_match.status = 'active'
  join public.match_rounds as game_round
    on game_round.match_id = game_match.id
   and game_round.round_number = game_room.current_round
  where game_room.id = p_room_id
  order by game_match.started_at desc
  limit 1
  for update of game_round;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if public.get_movie_buff_round_player_time_left(
    v_round_id,
    auth.uid(),
    v_round_started_at,
    v_time_limit_seconds
  ) <= 0 then
    raise exception 'Time has expired for this round.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    v_now,
    v_now,
    v_now
  )
  on conflict (round_id, player_id) do update
  set
    started_at = coalesce(
      public.match_round_player_playback.started_at,
      excluded.started_at
    ),
    play_requested_at = coalesce(
      public.match_round_player_playback.play_requested_at,
      excluded.play_requested_at
    ),
    playback_started_at = coalesce(
      public.match_round_player_playback.playback_started_at,
      excluded.playback_started_at
    );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$function$;

create or replace function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_hint_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_phase text;
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.phase
  into v_phase
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  if v_phase not in ('transition', 'playback') then
    raise exception 'Movie Buff is not accepting answers in the current phase.';
  end if;

  return query
  select *
  from public.movie_buff_submit_answer_legacy(
    p_room_id,
    p_submitted_answer
  );
end;
$function$;

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
  v_saved_phase_ends_at timestamptz;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_legacy_result jsonb;
  v_round_started_at timestamptz;
  v_time_limit_seconds integer;
  v_players_total integer := 0;
  v_players_finished integer := 0;
  v_launch_expired boolean := false;
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

  -- Let the legacy machine perform presence/abandonment checks without
  -- allowing its old playback -> answer transition to fire.
  v_saved_phase_ends_at := v_state.phase_ends_at;

  if v_saved_phase_ends_at is not null
     and v_saved_phase_ends_at <= v_now then
    -- Start every player who did not click before the launch window closed
    -- before evaluating the legacy completion predicate. Otherwise a row
    -- created during pre-play can look expired for one tick and the wrapper
    -- would advance with no player playback clock.
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
  end if;

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

  -- Restore the launch deadline (or its closed/null state) after the
  -- protected legacy tick.
  update public.movie_buff_match_phase_state
  set
    phase_ends_at = case
      when v_launch_expired then null
      else v_saved_phase_ends_at
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

alter function public.get_movie_buff_round_player_time_left(
  uuid,
  uuid,
  timestamptz,
  integer
) owner to postgres;
alter function public.get_movie_buff_round_player_time_left(
  uuid,
  uuid,
  timestamptz,
  integer
) set search_path = pg_catalog, public;

alter function public.prepare_movie_buff_round_playback(uuid)
  owner to postgres;
alter function public.prepare_movie_buff_round_playback(uuid)
  set search_path = pg_catalog, public;
alter function public.mark_movie_buff_round_media_ready(uuid)
  owner to postgres;
alter function public.mark_movie_buff_round_media_ready(uuid)
  set search_path = pg_catalog, public;
alter function public.start_movie_buff_round_playback(uuid)
  owner to postgres;
alter function public.start_movie_buff_round_playback(uuid)
  set search_path = pg_catalog, public;
alter function public.submit_movie_buff_answer(uuid, text)
  owner to postgres;
alter function public.submit_movie_buff_answer(uuid, text)
  set search_path = pg_catalog, public;
alter function public.advance_movie_buff_match_phase(uuid, bigint)
  owner to postgres;
alter function public.advance_movie_buff_match_phase(uuid, bigint)
  set search_path = pg_catalog, public;

revoke all on function public.movie_buff_get_round_player_time_left(
  uuid,
  uuid,
  timestamptz,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_prepare_round_playback_legacy(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_mark_round_media_ready_legacy(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_start_round_playback_legacy(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_submit_answer_legacy(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_advance_phase_legacy(uuid, bigint)
  from public, anon, authenticated, service_role;

revoke all on function public.prepare_movie_buff_round_playback(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_movie_buff_round_media_ready(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.start_movie_buff_round_playback(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_movie_buff_answer(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.advance_movie_buff_match_phase(uuid, bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.prepare_movie_buff_round_playback(uuid)
  to authenticated, service_role;
grant execute on function public.mark_movie_buff_round_media_ready(uuid)
  to authenticated, service_role;
grant execute on function public.start_movie_buff_round_playback(uuid)
  to authenticated, service_role;
grant execute on function public.submit_movie_buff_answer(uuid, text)
  to authenticated, service_role;
grant execute on function public.advance_movie_buff_match_phase(uuid, bigint)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
