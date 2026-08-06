begin;

drop trigger if exists movie_buff_board_tiles_require_phase_authority
  on public.movie_buff_board_tiles;
drop function if exists public.movie_buff_guard_phase_tile_mutation();

-- The correction also replaced movie_buff_apply_phase_tile_selection. Reapply
-- the preceding MOV-17 migration if this correction alone is rolled back.

commit;
