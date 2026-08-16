-- Movie Buff media readiness and mobile playback hardening.
--
-- A launch request is not playback.  The per-player answer clock must start
-- only after the browser has accepted media.play(), while the launch window
-- remains available for a manual tap or a browser that allows autoplay.

begin;

do $rename_current_functions$
begin
  -- Keep the already-reviewed implementations as private, transactional
  -- helpers.  The public wrappers below preserve their behavior while
  -- removing the shared playback clock from browser responses and undoing
  -- the legacy auto-start write before the transaction is visible.
  if pg_catalog.to_regprocedure(
    'public.get_movie_buff_round(uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_get_round_shared_clock(uuid)'
  ) is null then
    alter function public.get_movie_buff_round(uuid)
      rename to movie_buff_get_round_shared_clock;
  end if;

  if pg_catalog.to_regprocedure(
    'public.mark_movie_buff_round_media_ready(uuid)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_mark_round_media_ready_current(uuid)'
  ) is null then
    alter function public.mark_movie_buff_round_media_ready(uuid)
      rename to movie_buff_mark_round_media_ready_current;
  end if;

  if pg_catalog.to_regprocedure(
    'public.advance_movie_buff_match_phase(uuid,bigint)'
  ) is not null
  and pg_catalog.to_regprocedure(
    'public.movie_buff_advance_phase_clock_start(uuid,bigint)'
  ) is null then
    alter function public.advance_movie_buff_match_phase(uuid, bigint)
      rename to movie_buff_advance_phase_clock_start;
  end if;
end;
$rename_current_functions$;

-- Keep the pre-play grace period alive after a browser has requested playback.
-- A rejected autoplay attempt must not consume the answer clock, but it must
-- eventually fail closed instead of leaving a player in an infinite wait.
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

  -- The answer clock begins only after this player's media has actually
  -- started.  A requested-but-blocked autoplay remains in pre-play grace.
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
    )::integer >= public.movie_buff_preplay_timeout_seconds() then
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

-- Return the caller's player clock, never the legacy shared match clock.
create or replace function public.get_movie_buff_round(
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
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select
    base.result_match_id,
    base.result_round_id,
    base.result_round_number,
    base.result_total_rounds,
    base.result_time_limit_seconds,
    base.result_started_at,
    base.result_time_left_seconds,
    base.result_clip_type,
    base.result_prompt,
    base.result_quote_text,
    base.result_media_url,
    playback.playback_started_at,
    base.result_hint_text,
    base.result_hint_used,
    base.result_hint_penalty_seconds
  from public.movie_buff_get_round_shared_clock(p_room_id) as base
  left join public.match_round_player_playback as playback
    on playback.round_id = base.result_round_id
   and playback.player_id = auth.uid();
$function$;

alter function public.movie_buff_get_round_shared_clock(uuid)
  owner to postgres;
alter function public.movie_buff_get_round_shared_clock(uuid)
  set search_path = pg_catalog, public;
alter function public.get_movie_buff_round(uuid)
  owner to postgres;
alter function public.get_movie_buff_round(uuid)
  set search_path = pg_catalog, public;

-- Media readiness closes the old shared launch deadline once a player has a
-- pending play request.  This lets the browser attempt autoplay immediately;
-- a blocked attempt is then represented as pre-play, not answer time.
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
  v_round_id uuid;
begin
  select current_round.result_round_id
  into v_round_id
  from public.movie_buff_mark_round_media_ready_current(p_room_id)
    as current_round;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  if exists (
    select 1
    from public.match_round_player_playback as playback
    where playback.round_id = v_round_id
      and playback.play_requested_at is not null
      and playback.playback_started_at is null
  ) then
    update public.movie_buff_match_phase_state
    set
      phase_ends_at = null,
      updated_at = pg_catalog.clock_timestamp()
    where round_id = v_round_id
      and phase = 'playback';
  end if;

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$function$;

alter function public.movie_buff_mark_round_media_ready_current(uuid)
  owner to postgres;
alter function public.movie_buff_mark_round_media_ready_current(uuid)
  set search_path = pg_catalog, public;
alter function public.mark_movie_buff_round_media_ready(uuid)
  owner to postgres;
alter function public.mark_movie_buff_round_media_ready(uuid)
  set search_path = pg_catalog, public;

-- Keep the phase tick authoritative while repairing its legacy auto-start
-- write inside the same transaction.  Callers see a pending play request,
-- never a prematurely started answer clock.
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
  v_match_id uuid;
  v_round_id uuid;
  v_before_started_players uuid[];
  v_result jsonb;
begin
  perform public.movie_buff_phase_require_access(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  select state.match_id, state.round_id
  into v_match_id, v_round_id
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id;

  select coalesce(
    pg_catalog.array_agg(playback.player_id)
      filter (where playback.playback_started_at is not null),
    array[]::uuid[]
  )
  into v_before_started_players
  from public.movie_buff_match_participant_seats as seat
  left join public.match_round_player_playback as playback
    on playback.round_id = v_round_id
   and playback.player_id = seat.original_player_id
  where seat.match_id = v_match_id
    and seat.controller_type = 'human'
    and seat.participant_state in ('active', 'reconnect_grace');

  v_result := public.movie_buff_advance_phase_clock_start(
    p_room_id,
    p_expected_version
  );

  update public.match_round_player_playback as playback
  set
    playback_started_at = null,
    play_requested_at = coalesce(
      playback.play_requested_at,
      pg_catalog.clock_timestamp()
    )
  where playback.round_id = v_round_id
    and playback.playback_started_at is not null
    and playback.play_requested_at is null
    and not (playback.player_id = any(v_before_started_players));

  return v_result;
end;
$function$;

alter function public.movie_buff_advance_phase_clock_start(uuid, bigint)
  owner to postgres;
alter function public.movie_buff_advance_phase_clock_start(uuid, bigint)
  set search_path = pg_catalog, public;
alter function public.advance_movie_buff_match_phase(uuid, bigint)
  owner to postgres;
alter function public.advance_movie_buff_match_phase(uuid, bigint)
  set search_path = pg_catalog, public;

-- Private helpers are never browser-callable.  The wrappers are the only
-- gameplay entry points exposed to an authenticated client.
revoke all on function public.movie_buff_get_round_shared_clock(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_mark_round_media_ready_current(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_advance_phase_clock_start(uuid, bigint)
  from public, anon, authenticated, service_role;

revoke all on function public.get_movie_buff_round(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round(uuid)
  to authenticated, service_role;
revoke all on function public.mark_movie_buff_round_media_ready(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_movie_buff_round_media_ready(uuid)
  to authenticated, service_role;
revoke all on function public.advance_movie_buff_match_phase(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.advance_movie_buff_match_phase(uuid, bigint)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
