create or replace function public.movie_buff_playback_launch_timeout_seconds()
returns integer
language sql
immutable
set search_path = public
as $$
  select 45;
$$;
