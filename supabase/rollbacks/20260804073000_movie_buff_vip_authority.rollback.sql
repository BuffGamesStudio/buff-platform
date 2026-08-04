revoke all on function public.activate_movie_buff_round_vip(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.lock_movie_buff_round_vip(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.get_movie_buff_vip_round_view(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_movie_buff_vip_activation_phase(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;

drop function if exists public.activate_movie_buff_round_vip(uuid, uuid, text);
drop function if exists public.lock_movie_buff_round_vip(uuid, uuid, uuid, text);
drop function if exists public.get_movie_buff_vip_round_view(uuid, uuid);
drop function if exists public.set_movie_buff_vip_activation_phase(uuid, uuid, text);
drop function if exists public.open_movie_buff_vip_round_window(uuid, uuid, uuid, timestamptz);

drop table if exists public.movie_buff_vip_consumptions;
drop table if exists public.movie_buff_vip_round_locks;
drop table if exists public.movie_buff_vip_round_windows;
drop table if exists public.movie_buff_vip_inventory;
drop table if exists public.movie_buff_vip_definitions;
