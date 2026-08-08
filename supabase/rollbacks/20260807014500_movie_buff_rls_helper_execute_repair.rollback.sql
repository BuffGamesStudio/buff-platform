-- RC-1 recovery artifact for 20260807014500_movie_buff_rls_helper_execute_repair.sql.
-- Restores the pre-repair fail-closed ACL: service_role may execute the three
-- RLS membership helpers; PUBLIC, anon, and authenticated may not execute them.
-- No tables, rows, policies, or data are dropped or deleted.

begin;

do $required_helpers$
declare
  v_identity text;
begin
  foreach v_identity in array array[
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ] loop
    if pg_catalog.to_regprocedure(v_identity) is null then
      raise exception 'required Movie Buff RLS helper is absent during rollback: %', v_identity;
    end if;
  end loop;
end;
$required_helpers$;

alter function public.is_movie_buff_room_member(uuid) owner to postgres;
alter function public.is_movie_buff_room_member(uuid) set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_room_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_room_member(uuid) to service_role;

alter function public.is_movie_buff_match_member(uuid) owner to postgres;
alter function public.is_movie_buff_match_member(uuid) set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_match_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_match_member(uuid) to service_role;

alter function public.is_movie_buff_round_member(uuid) owner to postgres;
alter function public.is_movie_buff_round_member(uuid) set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_round_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_round_member(uuid) to service_role;

do $verify_rollback$
declare
  v_identity text;
  v_oid oid;
  v_owner text;
  v_config text[];
  v_security_definer boolean;
begin
  foreach v_identity in array array[
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    select pg_catalog.pg_get_userbyid(p.proowner), p.proconfig, p.prosecdef
      into v_owner, v_config, v_security_definer
      from pg_catalog.pg_proc p
      where p.oid = v_oid;

    if v_owner is distinct from 'postgres'
       or v_config is distinct from array['search_path=pg_catalog, public']::text[]
       or not coalesce(v_security_definer, false)
       or pg_catalog.has_function_privilege('public', v_oid, 'execute')
       or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Movie Buff RLS helper rollback contract failed: %', v_identity;
    end if;
  end loop;
end;
$verify_rollback$;

notify pgrst, 'reload schema';
commit;
