-- MOV-17: align runtime invariants with the authoritative phase/navigation contract.
-- This migration intentionally fails closed until MOV-16 exposes the service-only
-- finalize boundary required to write deadline no-VIP passes atomically.

alter table public.movie_buff_match_participant_seats
  add constraint movie_buff_match_participant_seats_nonseat_system_check
  check (controller_type in ('human', 'buster'));

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
    when 'abandoned' then '/games/movie-buff/match-status'
    when 'blocked' then '/games/movie-buff/match-status'
    else null
  end;
$$;

create or replace function public.movie_buff_require_vip_window_finalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if old.phase = 'vip_lock' and new.phase = 'board_select' then
    if to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    ) is null then
      raise exception 'MOV-16 VIP finalize contract is unavailable.';
    end if;

    execute 'select public.finalize_movie_buff_vip_round_window($1,$2,$3)'
      into v_result
      using new.room_id, new.round_id, old.phase_ends_at;

    if not coalesce((v_result ->> 'advanceReady')::boolean, false) then
      raise exception 'MOV-16 VIP window is not finalized for phase advance.';
    end if;
  end if;

  return new;
end;
$$;

alter function public.movie_buff_phase_route(text) owner to postgres;
alter function public.movie_buff_require_vip_window_finalized() owner to postgres;

revoke all on function public.movie_buff_phase_route(text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_require_vip_window_finalized()
  from public, anon, authenticated, service_role;

drop trigger if exists movie_buff_phase_requires_vip_finalize
  on public.movie_buff_match_phase_state;
create trigger movie_buff_phase_requires_vip_finalize
before update of phase on public.movie_buff_match_phase_state
for each row
when (old.phase is distinct from new.phase)
execute function public.movie_buff_require_vip_window_finalized();

notify pgrst, 'reload schema';
