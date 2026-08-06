-- MOV-15 repair: admission/readiness delegates the shared match timeline to MOV-17.
--
-- This migration intentionally owns no clip selection, round start timestamp,
-- playback/hint reset, shared phase mutation, or board/VIP/answer/results state.

create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_room public.game_rooms%rowtype;
  v_active_players integer := 0;
  v_ready_players integer := 0;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.status in ('finished', 'cancelled') then
    raise exception 'This room is no longer active.';
  end if;

  if v_room.status not in ('waiting', 'starting', 'active') then
    raise exception 'This room cannot enter the authoritative match timeline from its current state.';
  end if;

  if v_role <> 'service_role' then
    if v_actor is null then
      raise exception 'You must be signed in.';
    end if;

    if v_room.room_type = 'public' then
      if not exists (
        select 1
        from public.room_players as rp
        where rp.room_id = p_room_id
          and rp.player_id = v_actor
          and rp.left_at is null
      ) then
        raise exception 'Only active room members can start this public match.';
      end if;
    elsif v_room.host_id is distinct from v_actor then
      raise exception 'Only the host can start this match.';
    end if;
  end if;

  if v_room.status <> 'active' then
    select
      (count(*) filter (where rp.left_at is null))::integer,
      (count(*) filter (
        where rp.left_at is null
          and rp.is_ready = true
      ))::integer
    into v_active_players, v_ready_players
    from public.room_players as rp
    where rp.room_id = p_room_id;

    if v_room.room_type = 'public' then
      perform public.assert_movie_buff_strict_three_ready(p_room_id);
    else
      if v_active_players = 0 then
        raise exception 'The room has no active players.';
      end if;

      if v_ready_players <> v_active_players then
        raise exception 'Every player must be ready before starting.';
      end if;
    end if;
  end if;

  if pg_catalog.to_regprocedure(
    'public.begin_movie_buff_match_from_admission(uuid)'
  ) is null then
    raise exception 'MOV-17 authoritative match-start handoff is unavailable.';
  end if;

  return query execute
    'select * from public.begin_movie_buff_match_from_admission($1)'
    using p_room_id;
end;
$$;

alter function public.start_movie_buff_match(uuid) owner to postgres;

revoke all on function public.start_movie_buff_match(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.start_movie_buff_match(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
