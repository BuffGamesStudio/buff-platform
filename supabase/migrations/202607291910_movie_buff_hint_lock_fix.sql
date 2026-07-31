create or replace function public.use_movie_buff_round_hint(
  p_room_id uuid,
  p_penalty_seconds integer default 5
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_playback_started_at timestamptz;
  v_penalty_seconds integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
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

  v_penalty_seconds := greatest(
    1,
    least(coalesce(p_penalty_seconds, 5), 10)
  );

  select
    mr.id
  into
    v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1
  for update;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  select player_playback.started_at
  into v_playback_started_at
  from public.match_round_player_playback as player_playback
  where player_playback.round_id = v_round_id
    and player_playback.player_id = auth.uid();

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  insert into public.match_round_player_hints (
    round_id,
    player_id,
    used_at,
    penalty_seconds
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    v_penalty_seconds
  )
  on conflict (round_id, player_id) do nothing;

  if not found then
    raise exception 'The hint has already been used for this round.';
  end if;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
