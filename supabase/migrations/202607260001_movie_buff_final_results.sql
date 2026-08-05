create or replace function public.get_movie_buff_final_results(
  p_room_id uuid
)
returns table (
  result_room_status text,
  result_player_id uuid,
  result_total_rounds integer,
  result_completed_rounds integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
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
  ) then
    raise exception 'You are not a player in this room.';
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

  return query
  select
    v_room.status,
    auth.uid(),
    v_room.total_rounds,
    (
      select count(*)::integer
      from public.match_rounds as completed_round
      where completed_round.match_id = v_match_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id',
            standing.player_id,
            'display_name',
            standing.display_name,
            'score',
            standing.score,
            'correct_answers',
            standing.correct_answers,
            'answers_submitted',
            standing.answers_submitted,
            'accuracy',
            standing.accuracy,
            'current_streak',
            standing.current_streak,
            'lives',
            standing.lives
          )
          order by
            standing.score desc,
            standing.correct_answers desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            coalesce(rp.score, 0) as score,
            coalesce(rp.current_streak, 0) as current_streak,
            coalesce(rp.lives, 0) as lives,
            rp.joined_at,
            count(a.id) filter (
              where a.is_correct = true
            )::integer as correct_answers,
            count(a.id)::integer as answers_submitted,
            case
              when v_room.total_rounds > 0 then
                round(
                  (
                    count(a.id) filter (
                      where a.is_correct = true
                    )::numeric
                    / v_room.total_rounds::numeric
                  ) * 100
                )::integer
              else 0
            end as accuracy
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.match_rounds as mr
            on mr.match_id = v_match_id
          left join public.answers as a
            on a.round_id = mr.id
           and a.player_id = rp.player_id
          where rp.room_id = p_room_id
          group by
            rp.player_id,
            p.display_name,
            p.username,
            rp.score,
            rp.current_streak,
            rp.lives,
            rp.joined_at
        ) as standing
      ),
      '[]'::jsonb
    );
end;
$$;

revoke all on function
  public.get_movie_buff_final_results(uuid)
from public;

grant execute on function
  public.get_movie_buff_final_results(uuid)
to authenticated;

notify pgrst, 'reload schema';
