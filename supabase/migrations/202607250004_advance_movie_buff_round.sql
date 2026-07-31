create or replace function public.advance_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_status text,
  result_round_number integer,
  result_round_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_next_round integer;
  v_round_id uuid;
  v_clip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only the host can advance the round.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
    and m.status = 'active'
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'No active match was found.';
  end if;

  if v_room.current_round >= v_room.total_rounds then
    update public.matches
    set
      status = 'finished',
      finished_at = now()
    where id = v_match_id;

    update public.game_rooms
    set
      status = 'finished',
      finished_at = now()
    where id = p_room_id;

    return query
    select
      'finished'::text,
      v_room.current_round,
      null::uuid;

    return;
  end if;

  v_next_round := v_room.current_round + 1;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_next_round
  limit 1;

  if v_round_id is null then
    select c.id
    into v_clip_id
    from public.clips as c
    join public.movies as mo
      on mo.id = c.movie_id
    where c.is_active = true
      and mo.is_active = true
      and not exists (
        select 1
        from public.match_rounds as used_round
        where used_round.match_id = v_match_id
          and used_round.clip_id = c.id
      )
      and (
        v_room.difficulty = 'mixed'
        or c.difficulty = v_room.difficulty
      )
    order by random()
    limit 1;

    if v_clip_id is null then
      select c.id
      into v_clip_id
      from public.clips as c
      join public.movies as mo
        on mo.id = c.movie_id
      where c.is_active = true
        and mo.is_active = true
        and not exists (
          select 1
          from public.match_rounds as used_round
          where used_round.match_id = v_match_id
            and used_round.clip_id = c.id
        )
      order by random()
      limit 1;
    end if;

    if v_clip_id is null then
      raise exception 'No unused movie clips remain for this match.';
    end if;

    insert into public.match_rounds (
      match_id,
      clip_id,
      round_number,
      time_limit_seconds,
      started_at
    )
    values (
      v_match_id,
      v_clip_id,
      v_next_round,
      30,
      now()
    )
    returning id into v_round_id;
  else
    update public.match_rounds
    set
      started_at = now(),
      ended_at = null
    where id = v_round_id;
  end if;

  update public.game_rooms
  set current_round = v_next_round
  where id = p_room_id;

  return query
  select
    'active'::text,
    v_next_round,
    v_round_id;
end;
$$;

revoke all on function public.advance_movie_buff_round(uuid) from public;
grant execute on function public.advance_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
