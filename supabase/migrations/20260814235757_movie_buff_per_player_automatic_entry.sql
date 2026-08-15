-- Movie Buff: make automatic per-player round entry use the same
-- authenticated, active-membership boundary as manual entry.
--
-- The browser can reach the play phase without clicking Start Round when the
-- launch window expires. This private helper makes that entry idempotent and
-- keeps a room member who is not an active match participant fail-closed.

begin;

do $preflight$
begin
  if pg_catalog.to_regnamespace('movie_buff_security') is null then
    raise exception 'Required internal schema movie_buff_security is absent.';
  end if;
end;
$preflight$;

create or replace function movie_buff_security.ensure_player_round_entry(
  p_room_id uuid,
  p_round_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_player_id uuid := auth.uid();
  v_match_id uuid;
  v_phase text;
begin
  if v_player_id is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as room_player
    where room_player.room_id = p_room_id
      and room_player.player_id = v_player_id
      and room_player.left_at is null
  ) then
    raise exception 'Active Movie Buff room membership required.';
  end if;

  select
    state.match_id,
    state.phase
  into
    v_match_id,
    v_phase
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
    and state.round_id = p_round_id;

  if not found then
    raise exception 'The current round is unavailable.';
  end if;

  -- A player may enter during the transition, playback, or answer surface.
  -- Before the selector locks a tile there is no playback row to materialize.
  if v_phase not in ('transition', 'playback', 'answer') then
    return;
  end if;

  if not exists (
    select 1
    from public.movie_buff_match_participant_seats as seat
    where seat.match_id = v_match_id
      and seat.original_player_id = v_player_id
      and seat.controller_type = 'human'
      and seat.participant_state in ('active', 'reconnect_grace')
  ) then
    raise exception 'Active Movie Buff match membership required.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    p_round_id,
    v_player_id,
    null,
    null,
    null
  )
  on conflict (round_id, player_id) do nothing;
end;
$function$;

alter function movie_buff_security.ensure_player_round_entry(uuid, uuid)
  owner to postgres;
alter function movie_buff_security.ensure_player_round_entry(uuid, uuid)
  set search_path = pg_catalog, public;
revoke all on function movie_buff_security.ensure_player_round_entry(uuid, uuid)
  from public, anon, authenticated, service_role;

-- The authenticated browser RPC allowlist deliberately removes EXECUTE from
-- the legacy public membership helpers. Repoint every policy-only caller in
-- the launch-security baseline before the automatic-entry path is exercised;
-- otherwise a normal authenticated read can fail with
-- "permission denied for function is_movie_buff_room_member".
alter policy "game_rooms_select"
  on public.game_rooms
  using (
    (host_id = (select auth.uid()))
    or (select movie_buff_security.room_member(id))
  );

alter policy "room_players_select"
  on public.room_players
  using (
    (player_id = (select auth.uid()))
    or (
      left_at is null
      and (select movie_buff_security.room_member(room_id))
    )
  );

alter policy "Players view their matches"
  on public.matches
  using ((select movie_buff_security.match_member(id)));

alter policy "Players view match participants"
  on public.match_players
  using (
    (player_id = (select auth.uid()))
    or (select movie_buff_security.match_member(match_id))
  );

alter policy "Players view match rounds"
  on public.match_rounds
  using ((select movie_buff_security.match_member(match_id)));

alter policy "Players view answers from their matches"
  on public.answers
  using (
    (player_id = (select auth.uid()))
    or (select movie_buff_security.round_member(round_id))
  );

alter policy "match_round_player_hints_select_self"
  on public.match_round_player_hints
  using (
    (player_id = (select auth.uid()))
    and (select movie_buff_security.active_round_member(round_id))
  );

alter policy "match_round_player_playback_select_self"
  on public.match_round_player_playback
  using (
    (player_id = (select auth.uid()))
    and (select movie_buff_security.active_round_member(round_id))
  );

do $policy_verify$
declare
  v_policy record;
begin
  for v_policy in
    select *
    from (values
      ('public.game_rooms'::regclass, 'game_rooms_select'::name),
      ('public.room_players'::regclass, 'room_players_select'::name),
      ('public.matches'::regclass, 'Players view their matches'::name),
      ('public.match_players'::regclass, 'Players view match participants'::name),
      ('public.match_rounds'::regclass, 'Players view match rounds'::name),
      ('public.answers'::regclass, 'Players view answers from their matches'::name),
      ('public.match_round_player_hints'::regclass, 'match_round_player_hints_select_self'::name),
      ('public.match_round_player_playback'::regclass, 'match_round_player_playback_select_self'::name)
    ) as required(relid, policy_name)
  loop
    if exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = v_policy.relid
        and policy.polname = v_policy.policy_name
        and (
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) like '%public.is_movie_buff_%'
          or pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) like '%public.is_movie_buff_%'
        )
    ) then
      raise exception 'Legacy public Movie Buff membership helper remains in policy %.%',
        v_policy.relid,
        v_policy.policy_name;
    end if;
  end loop;
end;
$policy_verify$;

create or replace function public.enter_movie_buff_round(
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
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as room_player
    where room_player.room_id = p_room_id
      and room_player.player_id = auth.uid()
      and room_player.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select game_round.id
  into v_round_id
  from public.game_rooms as game_room
  join public.matches as game_match
    on game_match.room_id = game_room.id
   and game_match.status = 'active'
  join public.match_rounds as game_round
    on game_round.match_id = game_match.id
   and game_round.round_number = game_room.current_round
  where game_room.id = p_room_id
  order by game_match.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  perform movie_buff_security.ensure_player_round_entry(
    p_room_id,
    v_round_id
  );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$function$;

alter function public.enter_movie_buff_round(uuid) owner to postgres;
alter function public.enter_movie_buff_round(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.enter_movie_buff_round(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.enter_movie_buff_round(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
