-- Restore the least-privilege EXECUTE contract required by Movie Buff RLS
-- policies after the catalog-driven function security finalizer.
--
-- This candidate migration is transaction-wrapped and intended for local and
-- isolated-staging proof only until the exact candidate completes independent
-- validation. It does not authorize hosted or production execution.

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
      raise exception 'required Movie Buff RLS helper is absent: %', v_identity;
    end if;
  end loop;
end;
$required_helpers$;

alter function public.is_movie_buff_room_member(uuid) owner to postgres;
alter function public.is_movie_buff_room_member(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_room_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_room_member(uuid)
  to authenticated, service_role;

alter function public.is_movie_buff_match_member(uuid) owner to postgres;
alter function public.is_movie_buff_match_member(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_match_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_match_member(uuid)
  to authenticated, service_role;

alter function public.is_movie_buff_round_member(uuid) owner to postgres;
alter function public.is_movie_buff_round_member(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_round_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_round_member(uuid)
  to authenticated, service_role;

do $verify_helper_contract$
declare
  v_identity text;
  v_oid oid;
  v_owner text;
  v_config text[];
  v_security_definer boolean;
  v_public_execute boolean;
begin
  foreach v_identity in array array[
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_identity);

    select
      pg_catalog.pg_get_userbyid(p.proowner),
      p.proconfig,
      p.prosecdef,
      exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    into
      v_owner,
      v_config,
      v_security_definer,
      v_public_execute
    from pg_catalog.pg_proc as p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres'
       or v_config is distinct from array['search_path=pg_catalog, public']::text[]
       or not coalesce(v_security_definer, false)
       or coalesce(v_public_execute, false)
       or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Movie Buff RLS helper security contract failed: %', v_identity;
    end if;
  end loop;
end;
$verify_helper_contract$;

notify pgrst, 'reload schema';
commit;
