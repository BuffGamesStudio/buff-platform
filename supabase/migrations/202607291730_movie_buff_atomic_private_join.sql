create or replace function public.join_movie_buff_room(
  p_room_code text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_existing_player public.room_players%rowtype;
  v_active_players integer := 0;
  v_normalized_code text := upper(trim(coalesce(p_room_code, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_normalized_code = '' then
    raise exception 'Room code is required.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where room_code = v_normalized_code
    and status = 'waiting'
  for update;

  if not found then
    raise exception 'Room not found or is no longer accepting players.';
  end if;

  select *
  into v_existing_player
  from public.room_players
  where room_id = v_room.id
    and player_id = auth.uid()
  limit 1;

  if found and v_existing_player.left_at is null then
    return v_room;
  end if;

  select count(*)::integer
  into v_active_players
  from public.room_players as rp
  where rp.room_id = v_room.id
    and rp.left_at is null;

  if v_active_players >= v_room.max_players then
    raise exception 'This room is full.';
  end if;

  insert into public.room_players (
    room_id,
    player_id,
    is_ready,
    is_host,
    left_at
  )
  values (
    v_room.id,
    auth.uid(),
    false,
    false,
    null
  )
  on conflict (room_id, player_id)
  do update
    set is_ready = false,
        is_host = false,
        left_at = null;

  return v_room;
end;
$$;

grant execute on function public.join_movie_buff_room(text) to authenticated;

notify pgrst, 'reload schema';
