begin;

drop trigger if exists movie_buff_stage_abandoned_controller
  on public.movie_buff_match_participant_seats;

drop function if exists public.movie_buff_stage_abandoned_controller();
drop function if exists public.movie_buff_activate_ready_busters(uuid);

-- Restores get_movie_buff_match_phase_view from the preceding MOV-17 migration
-- when that migration is reapplied. This correction rollback intentionally does
-- not recreate a second copy of the view function.

commit;
