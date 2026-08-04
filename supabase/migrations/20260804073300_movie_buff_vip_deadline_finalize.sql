-- MOV-16 ordered repair: service-only VIP deadline finalization for MOV-17.
--
-- The shared phase machine owns the canonical VIP deadline. This function binds
-- to that exact deadline, serializes on the same round-scoped advisory lock used
-- by window open/release, writes explicit no-VIP pass locks for every missing
-- unreleased required human only after the deadline, and returns one stable
-- readiness result. It consumes no inventory and owns no shared phase state.

create or replace function public.finalize_movie_buff_vip_round_window(
  p_room_id uuid,
  p_round_id uuid,
  p_deadline_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_required_count integer := 0;
  v_locked_count integer := 0;
  v_pass_count integer := 0;
begin
  if p_deadline_at is null then
    raise exception 'VIP finalization deadline is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('movie-buff-vip-window|' || p_round_id::text, 0)
  );

  select window.*
  into v_window
  from public.movie_buff_vip_round_windows as window
  where window.room_id = p_room_id
    and window.round_id = p_round_id
  for update;

  if not found then
    raise exception 'VIP round window not found.';
  end if;

  if v_window.deadline_at is distinct from p_deadline_at then
    raise exception 'Contradictory VIP finalization deadline.';
  end if;

  select count(*)::integer
  into v_required_count
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = p_round_id
    and required.released_at is null;

  select count(*)::integer
  into v_locked_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  select count(*)::integer
  into v_pass_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id
    and locked.vip_id is null
    and locked.inventory_id is null;

  if v_now < v_window.deadline_at
     and v_locked_count < v_required_count then
    if v_window.status = 'closed' then
      raise exception 'VIP round window closed before all required humans completed.';
    end if;

    return pg_catalog.jsonb_build_object(
      'roomId', v_window.room_id,
      'matchId', v_window.match_id,
      'roundId', v_window.round_id,
      'deadlineAt', v_window.deadline_at,
      'requiredPlayerCount', v_required_count,
      'lockedCount', v_locked_count,
      'passCount', v_pass_count,
      'status', v_window.status,
      'advanceReady', false
    );
  end if;

  if v_now >= v_window.deadline_at
     and v_locked_count < v_required_count then
    insert into public.movie_buff_vip_round_locks (
      room_id,
      match_id,
      round_id,
      player_id,
      vip_id,
      inventory_id,
      idempotency_key,
      locked_at
    )
    select
      v_window.room_id,
      v_window.match_id,
      v_window.round_id,
      required.player_id,
      null,
      null,
      pg_catalog.concat(
        'deadline-pass:',
        v_window.round_id::text,
        ':',
        required.player_id::text
      ),
      v_now
    from public.movie_buff_vip_round_required_players as required
    where required.round_id = p_round_id
      and required.released_at is null
      and not exists (
        select 1
        from public.movie_buff_vip_round_locks as existing
        where existing.round_id = required.round_id
          and existing.player_id = required.player_id
      )
    on conflict (match_id, round_id, player_id) do nothing;
  end if;

  select count(*)::integer
  into v_locked_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  select count(*)::integer
  into v_pass_count
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id
    and locked.vip_id is null
    and locked.inventory_id is null;

  if v_locked_count < v_required_count then
    raise exception 'VIP deadline finalization did not persist every required lock/pass.';
  end if;

  update public.movie_buff_vip_round_windows
  set
    status = 'closed',
    closed_at = coalesce(closed_at, v_now),
    updated_at = v_now
  where round_id = p_round_id;
  v_window.status := 'closed';

  return pg_catalog.jsonb_build_object(
    'roomId', v_window.room_id,
    'matchId', v_window.match_id,
    'roundId', v_window.round_id,
    'deadlineAt', v_window.deadline_at,
    'requiredPlayerCount', v_required_count,
    'lockedCount', v_locked_count,
    'passCount', v_pass_count,
    'status', v_window.status,
    'advanceReady', true
  );
end;
$$;

alter function public.finalize_movie_buff_vip_round_window(uuid, uuid, timestamptz)
  owner to postgres;

revoke all on function public.finalize_movie_buff_vip_round_window(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.finalize_movie_buff_vip_round_window(uuid, uuid, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
