-- Keep the browser-visible round timer aligned with the caller's actual
-- playback row. A play request, media-ready signal, or legacy shared clock
-- must not consume answer time before this player has begun playback.

begin;

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
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select
    base.result_match_id,
    base.result_round_id,
    base.result_round_number,
    base.result_total_rounds,
    base.result_time_limit_seconds,
    base.result_started_at,
    public.get_movie_buff_round_player_time_left(
      base.result_round_id,
      auth.uid(),
      base.result_started_at,
      base.result_time_limit_seconds
    ),
    base.result_clip_type,
    base.result_prompt,
    base.result_quote_text,
    base.result_media_url,
    playback.playback_started_at,
    base.result_hint_text,
    base.result_hint_used,
    base.result_hint_penalty_seconds
  from public.movie_buff_get_round_shared_clock(p_room_id) as base
  left join public.match_round_player_playback as playback
    on playback.round_id = base.result_round_id
   and playback.player_id = auth.uid();
$function$;

alter function public.get_movie_buff_round(uuid)
  owner to postgres;
alter function public.get_movie_buff_round(uuid)
  set search_path = pg_catalog, public;

commit;
