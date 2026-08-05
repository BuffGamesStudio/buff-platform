-- MOV-16 data-preserving reverse migration for the deadline finalizer.
--
-- This removes only the callable finalization function. Existing VIP windows,
-- required-player snapshots, explicit no-VIP passes, locks, inventory, and
-- consumption history remain intact for containment and diagnosis.

begin;

revoke all on function public.finalize_movie_buff_vip_round_window(
  uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

drop function if exists public.finalize_movie_buff_vip_round_window(
  uuid, uuid, timestamptz
);

notify pgrst, 'reload schema';
commit;
