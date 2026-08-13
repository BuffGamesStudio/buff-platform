-- Remove direct API execution from the public RLS event-trigger callback.
-- The ensure_rls event trigger remains enabled and continues to invoke this
-- function internally after supported CREATE TABLE commands.

begin;

do $contract$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is null then
    raise exception 'Required public.rls_auto_enable() event-trigger function is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_event_trigger event_row
    where event_row.evtfoid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
      and event_row.evtname = 'ensure_rls'
      and event_row.evtevent = 'ddl_command_end'
      and event_row.evtenabled <> 'D'
  ) then
    raise exception 'Required ensure_rls event trigger is missing or disabled.';
  end if;
end;
$contract$;

alter function public.rls_auto_enable() owner to postgres;
alter function public.rls_auto_enable() set search_path = pg_catalog;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

do $verify$
declare
  v_public_execute boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_execute;

  if v_public_execute
     or pg_catalog.has_function_privilege(
       'anon', 'public.rls_auto_enable()', 'execute'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.rls_auto_enable()', 'execute'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.rls_auto_enable()', 'execute'
     ) then
    raise exception 'Direct rls_auto_enable() execution remains exposed.';
  end if;

  if pg_catalog.pg_get_userbyid(
       (select p.proowner
        from pg_catalog.pg_proc p
        where p.oid = 'public.rls_auto_enable()'::pg_catalog.regprocedure)
     ) <> 'postgres' then
    raise exception 'rls_auto_enable() owner must be postgres.';
  end if;

  if not (
    select coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog']
    from pg_catalog.pg_proc p
    where p.oid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
  ) then
    raise exception 'rls_auto_enable() search_path must be pg_catalog.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
