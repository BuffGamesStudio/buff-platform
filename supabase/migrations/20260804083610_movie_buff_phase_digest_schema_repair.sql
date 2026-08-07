-- MOV-17 exact runtime repair: Supabase installs pgcrypto in the extensions
-- schema. The prior function referenced public.digest and failed before the
-- selector/version checks could run.

do $$
begin
  if pg_catalog.to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Required extensions.digest(bytea,text) is unavailable.';
  end if;
end;
$$;

create or replace function public.select_movie_buff_match_tile(
  p_room_id uuid,
  p_tile_id uuid,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_player_id uuid;
  v_state public.movie_buff_match_phase_state%rowtype;
  v_selector public.movie_buff_match_participant_seats%rowtype;
  v_existing public.movie_buff_match_phase_actions%rowtype;
  v_request_hash text;
  v_result jsonb;
begin
  v_player_id := public.movie_buff_phase_require_access(p_room_id);
  if v_player_id is null then
    raise exception 'Authenticated human selector required.';
  end if;

  if char_length(pg_catalog.btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'Invalid idempotency key.';
  end if;

  perform public.touch_movie_buff_match_participant(p_room_id);
  perform public.ensure_movie_buff_match_phase_state(p_room_id);

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          '|', p_room_id::text, p_tile_id::text, p_expected_version::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select action.*
  into v_existing
  from public.movie_buff_match_phase_actions as action
  where action.actor_player_id = v_player_id
    and action.idempotency_key = pg_catalog.btrim(p_idempotency_key)
  for update;

  if found then
    if v_existing.action_type <> 'tile_select'
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Contradictory duplicate board selection request.';
    end if;
    return v_existing.result;
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for update;

  if v_state.phase <> 'board_select' then
    raise exception 'Movie Buff match is not in board selection.';
  end if;
  if v_state.phase_version <> p_expected_version then
    raise exception 'Movie Buff phase version changed.';
  end if;

  select seat.*
  into v_selector
  from public.movie_buff_match_participant_seats as seat
  where seat.match_id = v_state.match_id
    and seat.seat_index = v_state.selector_seat_index;

  if not found
     or v_selector.controller_type <> 'human'
     or v_selector.participant_state <> 'active'
     or v_selector.controller_player_id <> v_player_id then
    raise exception 'Only the current active human selector may choose a tile.';
  end if;

  v_result := public.movie_buff_apply_phase_tile_selection(
    p_room_id,
    v_state.match_id,
    p_tile_id,
    v_player_id,
    'human'
  );

  insert into public.movie_buff_match_phase_actions (
    match_id,
    room_id,
    actor_player_id,
    action_type,
    idempotency_key,
    request_hash,
    result
  )
  values (
    v_state.match_id,
    p_room_id,
    v_player_id,
    'tile_select',
    pg_catalog.btrim(p_idempotency_key),
    v_request_hash,
    v_result
  );

  return v_result;
end;
$$;

alter function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  owner to postgres;
revoke all on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
