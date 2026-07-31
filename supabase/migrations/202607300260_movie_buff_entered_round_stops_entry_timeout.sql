create or replace function public.get_movie_buff_round_player_time_left(
  p_round_id uuid,
  p_player_id uuid,
  p_round_started_at timestamptz,
  p_time_limit_seconds integer
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_playback_row boolean := false;
  v_preplay_started_at timestamptz;
  v_play_requested_at timestamptz;
  v_playback_started_at timestamptz;
  v_hint_penalty_seconds integer := 0;
  v_effective_time_limit integer;
begin
  if exists (
    select 1
    from public.answers as a
    where a.round_id = p_round_id
      and a.player_id = p_player_id
  ) then
    return 0;
  end if;

  select
    player_playback.round_id is not null,
    player_playback.started_at,
    player_playback.play_requested_at,
    player_playback.playback_started_at,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_has_playback_row,
    v_preplay_started_at,
    v_play_requested_at,
    v_playback_started_at,
    v_hint_penalty_seconds
  from (select 1) as stub
  left join public.match_round_player_playback as player_playback
    on player_playback.round_id = p_round_id
   and player_playback.player_id = p_player_id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = p_round_id
   and player_hint.player_id = p_player_id;

  v_effective_time_limit := greatest(
    0,
    coalesce(p_time_limit_seconds, 0) -
    coalesce(v_hint_penalty_seconds, 0)
  );

  if v_playback_started_at is not null then
    return greatest(
      0,
      v_effective_time_limit -
      greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - v_playback_started_at
            )
          )
        )::integer
      )
    );
  end if;

  if v_play_requested_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_play_requested_at
          )
        )
      )::integer >=
        public.movie_buff_playback_launch_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_preplay_started_at is not null then
    if
      floor(
        extract(
          epoch from (
            now() - v_preplay_started_at
          )
        )
      )::integer >=
        public.movie_buff_preplay_timeout_seconds()
    then
      return 0;
    end if;

    return v_effective_time_limit;
  end if;

  if v_has_playback_row then
    return v_effective_time_limit;
  end if;

  if
    p_round_started_at is not null
    and floor(
      extract(
        epoch from (
          now() - p_round_started_at
        )
      )
    )::integer >=
      public.movie_buff_round_entry_timeout_seconds()
  then
    return 0;
  end if;

  return v_effective_time_limit;
end;
$$;
