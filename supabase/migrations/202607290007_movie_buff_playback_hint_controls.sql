alter table public.match_rounds
  add column if not exists playback_started_at timestamptz,
  add column if not exists hint_used_at timestamptz,
  add column if not exists hint_penalty_seconds integer not null default 0;

alter table public.match_rounds
  drop constraint if exists match_rounds_hint_penalty_seconds_check;

alter table public.match_rounds
  add constraint match_rounds_hint_penalty_seconds_check
  check (hint_penalty_seconds >= 0 and hint_penalty_seconds <= 10);

drop function if exists public.get_movie_buff_round(uuid);

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
    case
      when nullif(trim(mo.description), '') is not null then
        trim(mo.description)
      when (
        c.clip_type in ('video', 'audio', 'image', 'poster')
        and nullif(trim(c.prompt), '') is not null
        and trim(c.prompt) !~* '^Name the movie from this 30-second montage'
      ) then
        regexp_replace(
          trim(c.prompt),
          '\s+Name the movie\.?$',
          '',
          'i'
        )
      else
        null
    end,
    mr.hint_used_at is not null,
    coalesce(mr.hint_penalty_seconds, 0)
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
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

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
      v_time_limit_seconds -
      floor(
        extract(
          epoch from (
            now() - coalesce(v_started_at, now())
          )
        )
      )::integer
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

create or replace function public.start_movie_buff_round_playback(
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
  v_round_id uuid;
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

  select mr.id
  into v_round_id
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

  update public.match_rounds
  set
    started_at = coalesce(started_at, now()),
    playback_started_at = coalesce(
      playback_started_at,
      now()
    )
  where id = v_round_id;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

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
  v_hint_used_at timestamptz;
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
    mr.id,
    mr.playback_started_at,
    mr.hint_used_at
  into
    v_round_id,
    v_playback_started_at,
    v_hint_used_at
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

  if v_playback_started_at is not null then
    raise exception 'Hints are only available before playback starts.';
  end if;

  if v_hint_used_at is not null then
    raise exception 'The hint has already been used for this round.';
  end if;

  update public.match_rounds
  set
    hint_used_at = now(),
    hint_penalty_seconds =
      v_penalty_seconds,
    started_at =
      coalesce(started_at, now()) -
      make_interval(
        secs => v_penalty_seconds
      )
  where id = v_round_id;

  return query
  select *
  from public.get_movie_buff_round(
    p_room_id
  );
end;
$$;

revoke all on function public.get_movie_buff_round(uuid) from public;
revoke all on function public.start_movie_buff_round_playback(uuid) from public;
revoke all on function public.use_movie_buff_round_hint(uuid, integer) from public;

grant execute on function public.get_movie_buff_round(uuid)
to authenticated;

grant execute on function public.start_movie_buff_round_playback(uuid)
to authenticated;

grant execute on function public.use_movie_buff_round_hint(uuid, integer)
to authenticated;

notify pgrst, 'reload schema';
