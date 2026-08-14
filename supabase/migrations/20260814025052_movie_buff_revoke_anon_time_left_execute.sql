-- Keep the round time-left helper internal. Browser-facing round RPCs call it
-- through SECURITY DEFINER wrappers; the client has no direct RPC reference.
begin;

revoke all privileges on function
  public.get_movie_buff_round_player_time_left(
    uuid, uuid, timestamptz, integer
  )
from public, anon, authenticated;

grant execute on function
  public.get_movie_buff_round_player_time_left(
    uuid, uuid, timestamptz, integer
  )
to service_role;

notify pgrst, 'reload schema';

commit;
