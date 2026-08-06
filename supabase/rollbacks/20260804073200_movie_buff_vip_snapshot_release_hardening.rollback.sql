-- Reverse only the MOV-16 ordered participant-release correction.
-- This restores the immediately preceding strict behavior. It deletes no data.

begin;

create or replace function public.release_movie_buff_vip_required_player(
  p_room_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_release_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_window public.movie_buff_vip_round_windows%rowtype;
  v_required integer;
  v_locked integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if nullif(pg_catalog.btrim(p_release_reason), '') is null then
    raise exception 'Release reason is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('movie-buff-vip-window|' || p_round_id::text, 0)
  );

  select w.* into v_window
  from public.movie_buff_vip_round_windows as w
  where w.room_id = p_room_id
    and w.round_id = p_round_id
  for update;
  if not found then raise exception 'VIP round window not found.'; end if;

  update public.movie_buff_vip_round_required_players
  set
    released_at = coalesce(released_at, v_now),
    release_reason = coalesce(release_reason, pg_catalog.btrim(p_release_reason))
  where room_id = p_room_id
    and round_id = p_round_id
    and player_id = p_player_id;
  if not found then raise exception 'Required player snapshot entry not found.'; end if;

  select count(*)::integer into v_required
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = p_round_id
    and required.released_at is null;

  select count(*)::integer into v_locked
  from public.movie_buff_vip_round_locks as locked
  join public.movie_buff_vip_round_required_players as required
    on required.round_id = locked.round_id
   and required.player_id = locked.player_id
   and required.released_at is null
  where locked.round_id = p_round_id;

  if v_required = 0 or v_locked >= v_required then
    update public.movie_buff_vip_round_windows
    set
      status = 'closed',
      closed_at = coalesce(closed_at, v_now),
      updated_at = v_now
    where round_id = p_round_id;
    v_window.status := 'closed';
  end if;

  return pg_catalog.jsonb_build_object(
    'roundId', p_round_id,
    'releasedPlayerId', p_player_id,
    'requiredPlayerCount', v_required,
    'lockedCount', v_locked,
    'status', v_window.status
  );
end;
$$;

alter function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  owner to postgres;
revoke all on function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
