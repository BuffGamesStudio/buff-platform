-- Roll back MOV-17 phase-contract alignment only.

drop trigger if exists movie_buff_phase_requires_vip_finalize
  on public.movie_buff_match_phase_state;
drop function if exists public.movie_buff_require_vip_window_finalized();

alter table public.movie_buff_match_participant_seats
  drop constraint if exists movie_buff_match_participant_seats_nonseat_system_check;

create or replace function public.movie_buff_phase_route(p_phase text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_phase
    when 'round_intro' then '/games/movie-buff/round-intro'
    when 'vip_lock' then '/games/movie-buff/round-intro'
    when 'board_select' then '/games/movie-buff/board-preview'
    when 'transition' then '/games/movie-buff/play'
    when 'playback' then '/games/movie-buff/play'
    when 'answer' then '/games/movie-buff/play'
    when 'results' then '/games/movie-buff/round-results'
    when 'finished' then '/games/movie-buff/final-results'
    else null
  end;
$$;

alter function public.movie_buff_phase_route(text) owner to postgres;
revoke all on function public.movie_buff_phase_route(text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
