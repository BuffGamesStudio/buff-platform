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
  v_active_match_id uuid;
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

  select m.id
  into v_active_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status not in ('finished', 'cancelled')
  order by m.started_at desc nulls last
  limit 1;

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

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    match_id,
    player_id,
    payload
  )
  values (
    'player_left',
    p_room_id,
    v_active_match_id,
    auth.uid(),
    jsonb_build_object(
      'reason', 'leave_room',
      'roomStatus', v_room.status
    )
  );

  select count(*)::integer
  into v_remaining_players
  from public.room_players as rp
  where rp.room_id = p_room_id
    and rp.left_at is null;

  if v_remaining_players = 0 then
    if
      v_active_match_id is not null
      and v_room.status in ('starting', 'active')
    then
      insert into public.movie_buff_round_events (
        event_type,
        room_id,
        match_id,
        player_id,
        payload
      )
      values (
        'match_abandoned',
        p_room_id,
        v_active_match_id,
        auth.uid(),
        jsonb_build_object(
          'reason', 'all_players_left',
          'roomStatus', v_room.status
        )
      );
    end if;

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
