create or replace function public.leave_movie_buff_room(
  p_room_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_departing_player public.room_players%rowtype;
  v_next_host_id uuid;
  v_remaining_players integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found';
  end if;

  update public.room_players
  set is_ready = false,
      is_host = false,
      left_at = timezone('utc', now())
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null
  returning *
  into v_departing_player;

  if not found then
    return v_room;
  end if;

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    update public.game_rooms
    set status =
          case
            when status in ('finished', 'cancelled') then status
            else 'cancelled'
          end,
        finished_at =
          case
            when status = 'active' and finished_at is null
              then timezone('utc', now())
            else finished_at
          end
    where id = p_room_id
    returning *
    into v_room;

    return v_room;
  end if;

  if v_room.host_id = auth.uid()
     or coalesce(v_departing_player.is_host, false) then
    select rp.player_id
    into v_next_host_id
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.joined_at asc, rp.player_id asc
    limit 1;

    if v_next_host_id is not null then
      update public.room_players
      set is_host = (
        player_id = v_next_host_id
        and left_at is null
      )
      where room_id = p_room_id;

      update public.game_rooms
      set host_id = v_next_host_id
      where id = p_room_id
      returning *
      into v_room;

      return v_room;
    end if;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id;

  return v_room;
end;
$$;

grant execute on function public.leave_movie_buff_room(uuid) to authenticated;
