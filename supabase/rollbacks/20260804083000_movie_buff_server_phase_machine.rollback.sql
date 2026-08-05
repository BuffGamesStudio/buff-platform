-- MOV-17 rollback is destructive once phase history or seat state exists.
-- It is intended for an authorized disposable local/staging rehearsal.
-- To authorize destructive rollback in the same database session:
--   set movie_buff.allow_destructive_phase_rollback = 'on';

begin;

do $$
begin
  if (
    exists (select 1 from public.movie_buff_match_phase_state)
    or exists (select 1 from public.movie_buff_match_participant_seats)
    or exists (select 1 from public.movie_buff_match_phase_actions)
    or exists (select 1 from public.movie_buff_match_phase_events)
  ) and coalesce(
    current_setting('movie_buff.allow_destructive_phase_rollback', true),
    'off'
  ) <> 'on' then
    raise exception
      'MOV-17 rollback blocked: authoritative phase data exists. Preserve/contain it or explicitly authorize destructive rollback on a disposable target.';
  end if;
end;
$$;

drop trigger if exists movie_buff_answers_require_authoritative_phase
  on public.answers;

drop function if exists public.movie_buff_guard_authoritative_answer_phase();
drop function if exists public.get_movie_buff_match_phase_view(uuid);
drop function if exists public.advance_movie_buff_match_phase(uuid,bigint);
drop function if exists public.select_movie_buff_match_tile(uuid,uuid,bigint,text);
drop function if exists public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text);
drop function if exists public.movie_buff_phase_vip_ready(uuid);
drop function if exists public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text);
drop function if exists public.movie_buff_phase_open_vip_window(uuid,uuid,uuid,timestamptz);
drop function if exists public.movie_buff_phase_set_vip_activation(uuid,uuid,text);
drop function if exists public.touch_movie_buff_match_participant(uuid);
drop function if exists public.ensure_movie_buff_match_phase_state(uuid);
drop function if exists public.movie_buff_phase_event(uuid,uuid,uuid,bigint,text,text,text,uuid,jsonb);
drop function if exists public.movie_buff_next_selector_seat(uuid,integer);
drop function if exists public.movie_buff_phase_require_access(uuid);
drop function if exists public.movie_buff_clip_playback_seconds(uuid);
drop function if exists public.movie_buff_phase_route(text);
drop function if exists public.movie_buff_phase_duration_seconds(text);

drop table if exists public.movie_buff_match_phase_events;
drop table if exists public.movie_buff_match_phase_actions;
drop table if exists public.movie_buff_match_participant_seats;
drop table if exists public.movie_buff_match_phase_state;

-- Restore the pre-MOV-17 authenticated manual round-advance grant. This does
-- not authorize using the legacy flow after integration; it only restores the
-- repository's prior database ACL when the phase machine is fully rolled back.
grant execute on function public.advance_movie_buff_round(uuid)
  to authenticated, service_role;

commit;
