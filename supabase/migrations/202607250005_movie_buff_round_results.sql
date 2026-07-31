create or replace function public.get_movie_buff_round_results(
  p_room_id uuid
)
returns table (
  result_room_status text,
  result_is_host boolean,
  result_round_number integer,
  result_total_rounds integer,
  result_movie_title text,
  result_release_year integer,
  result_director text,
  result_submitted_answer text,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'Match not found.';
  end if;

  select mr.id
  into v_round_id
  from public.match_rounds as mr
  where mr.match_id = v_match_id
    and mr.round_number = v_room.current_round
  limit 1;

  if v_round_id is null then
    raise exception 'Round not found.';
  end if;

  return query
  select
    v_room.status,
    v_room.host_id = auth.uid(),
    mr.round_number,
    v_room.total_rounds,
    mo.title,
    mo.release_year,
    mo.director,
    my_answer.submitted_answer,
    coalesce(my_answer.is_correct, false),
    coalesce(my_answer.base_points, 0),
    coalesce(my_answer.speed_bonus, 0),
    coalesce(my_answer.streak_bonus, 0),
    coalesce(my_answer.total_points, 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id', standing.player_id,
            'display_name', standing.display_name,
            'score', standing.score,
            'round_points', standing.round_points,
            'is_correct', standing.is_correct
          )
          order by standing.score desc, standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            rp.score,
            rp.joined_at,
            coalesce(a.total_points, 0) as round_points,
            coalesce(a.is_correct, false) as is_correct
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.answers as a
            on a.round_id = v_round_id
           and a.player_id = rp.player_id
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) as standing
      ),
      '[]'::jsonb
    )
  from public.match_rounds as mr
  join public.clips as c
    on c.id = mr.clip_id
  join public.movies as mo
    on mo.id = c.movie_id
  left join public.answers as my_answer
    on my_answer.round_id = mr.id
   and my_answer.player_id = auth.uid()
  where mr.id = v_round_id;
end;
$$;

revoke all on function public.get_movie_buff_round_results(uuid) from public;
grant execute on function public.get_movie_buff_round_results(uuid)
to authenticated;

notify pgrst, 'reload schema';
