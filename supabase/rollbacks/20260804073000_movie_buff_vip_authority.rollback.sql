-- MOV-16 rollback is destructive after definitions, grants, windows, locks, or
-- consumption history exist. It is intended for a disposable local/staging
-- rehearsal before durable VIP data is created.
--
-- An explicitly authorized destructive rollback must run in the same database
-- session after:
--   set local movie_buff.allow_destructive_vip_rollback = 'on';

begin;

do $$
begin
  if (
    exists (select 1 from public.movie_buff_vip_definitions)
    or exists (select 1 from public.movie_buff_vip_inventory)
    or exists (select 1 from public.movie_buff_vip_round_windows)
    or exists (select 1 from public.movie_buff_vip_round_required_players)
    or exists (select 1 from public.movie_buff_vip_round_locks)
    or exists (select 1 from public.movie_buff_vip_consumptions)
  ) and coalesce(
    current_setting('movie_buff.allow_destructive_vip_rollback', true),
    'off'
  ) <> 'on' then
    raise exception
      'MOV-16 rollback blocked: VIP data exists. Preserve/contain the data or explicitly authorize destructive rollback on a disposable target.';
  end if;
end;
$$;

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

drop function if exists public.activate_movie_buff_round_vip(uuid, uuid, text);
drop function if exists public.lock_movie_buff_round_vip(uuid, uuid, uuid, text);
drop function if exists public.get_movie_buff_vip_round_view(uuid, uuid);
drop function if exists public.set_movie_buff_vip_activation_phase(uuid, uuid, text);
drop function if exists public.release_movie_buff_vip_required_player(uuid, uuid, uuid, text);
drop function if exists public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz, uuid[]);
drop function if exists public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz);
drop function if exists public.movie_buff_vip_ineligibility_reason(uuid, uuid, uuid, uuid, uuid, timestamptz);

drop table if exists public.movie_buff_vip_consumptions;
drop table if exists public.movie_buff_vip_round_locks;
drop table if exists public.movie_buff_vip_round_required_players;
drop table if exists public.movie_buff_vip_round_windows;
drop table if exists public.movie_buff_vip_inventory;
drop table if exists public.movie_buff_vip_definitions;

commit;
