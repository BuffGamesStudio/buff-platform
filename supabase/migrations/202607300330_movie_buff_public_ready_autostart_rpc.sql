create or replace function public.set_movie_buff_player_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_active_players integer := 0;
  v_ready_players integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update ready status.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  join public.room_players as rp
    on rp.room_id = gr.id
  where gr.id = p_room_id
    and gr.status = 'waiting'
    and rp.player_id = v_user_id
    and rp.left_at is null
  limit 1
  for update;

  if not found then
    raise exception 'You can only change ready status for your current waiting room.';
  end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id
    and player_id = v_user_id
    and left_at is null;

  if not found then
    raise exception 'Ready status could not be updated.';
  end if;

  if v_room.room_type <> 'public' or p_is_ready is distinct from true then
    return;
  end if;

  select
    count(*) filter (where rp.left_at is null),
    count(*) filter (
      where rp.left_at is null
        and rp.is_ready = true
    )
  into
    v_active_players,
    v_ready_players
  from public.room_players as rp
  where rp.room_id = p_room_id;

  if v_active_players < 2 then
    return;
  end if;

  if v_ready_players <> v_active_players then
    return;
  end if;

  perform
    public.start_movie_buff_match(p_room_id);
end;
$$;

revoke all on function public.set_movie_buff_player_ready(uuid, boolean) from public;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean)
to authenticated;

notify pgrst, 'reload schema';
