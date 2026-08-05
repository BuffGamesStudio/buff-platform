-- Fail-closed containment rollback. Do not restore the broken public.digest
-- reference. Remove browser execution while keeping service-role diagnostics.

revoke execute on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  from authenticated;
grant execute on function public.select_movie_buff_match_tile(uuid,uuid,bigint,text)
  to service_role;

notify pgrst, 'reload schema';
