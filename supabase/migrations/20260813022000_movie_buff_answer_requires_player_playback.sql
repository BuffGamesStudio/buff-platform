-- Movie Buff: a player submits only after their own clip has started.
-- The server launch deadline creates the same per-player playback row for
-- players who do not click, so the automatic path remains valid.

begin;

create or replace function public.movie_buff_guard_authoritative_answer_phase()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is not null and new.player_id <> auth.uid() then
    raise exception 'Answers may be submitted only for the authenticated player.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.round_id = new.round_id;

  if not found then
    raise exception 'Authoritative Movie Buff phase state is unavailable.';
  end if;

  if v_state.phase not in ('transition', 'playback', 'answer') then
    raise exception 'Movie Buff answer window is not open.';
  end if;

  if v_state.phase = 'answer'
     and (
       v_state.answer_deadline_at is null
       or v_now > v_state.answer_deadline_at
     ) then
    raise exception 'Movie Buff answer window is not open.';
  end if;

  if not exists (
    select 1
    from public.movie_buff_match_participant_seats as seat
    where seat.match_id = v_state.match_id
      and seat.original_player_id = new.player_id
      and seat.controller_type = 'human'
      and seat.participant_state in ('active', 'reconnect_grace')
  ) then
    raise exception 'Only a current human participant may submit an answer.';
  end if;

  if not exists (
    select 1
    from public.match_round_player_playback as playback
    where playback.round_id = new.round_id
      and playback.player_id = new.player_id
      and playback.playback_started_at is not null
  ) then
    raise exception 'Your clip has not started yet.';
  end if;

  return new;
end;
$function$;

alter function public.movie_buff_guard_authoritative_answer_phase()
  owner to postgres;
alter function public.movie_buff_guard_authoritative_answer_phase()
  set search_path = pg_catalog, public;
revoke all on function public.movie_buff_guard_authoritative_answer_phase()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
