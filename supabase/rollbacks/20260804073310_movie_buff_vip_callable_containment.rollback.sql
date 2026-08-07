-- MOV-16 data-preserving callable containment rollback.
--
-- This rollback intentionally removes only the MOV-16 callable surface. It
-- preserves VIP definitions, inventory, windows, required-human snapshots,
-- private locks, explicit no-VIP pass records, consumption history, and all
-- related table rows for diagnosis and forward restoration.
--
-- Apply only to an approved disposable local or isolated staging target.
-- Production or hosted execution is not authorized by this artifact.

begin;

revoke all on function public.finalize_movie_buff_vip_round_window(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.activate_movie_buff_round_vip(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_vip_round_view(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_vip_ineligibility_reason(uuid, uuid, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

drop function if exists public.finalize_movie_buff_vip_round_window(uuid, uuid, timestamptz);
drop function if exists public.activate_movie_buff_round_vip(uuid, uuid, text);
drop function if exists public.lock_movie_buff_round_vip(uuid, uuid, uuid, text);
drop function if exists public.get_movie_buff_vip_round_view(uuid, uuid);
drop function if exists public.set_movie_buff_vip_activation_phase(uuid, uuid, text);
drop function if exists public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text);
drop function if exists public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[]);
drop function if exists public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz);
drop function if exists public.movie_buff_vip_ineligibility_reason(uuid, uuid, uuid, uuid, uuid, timestamptz);

notify pgrst, 'reload schema';
commit;
