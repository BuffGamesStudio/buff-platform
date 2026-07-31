create or replace function public.get_movie_buff_round(
  p_room_id uuid
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
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
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

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    case
      when coalesce(v_hint_used, false) then
        v_hint_text
      else
        null
    end,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

grant execute on function public.get_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
