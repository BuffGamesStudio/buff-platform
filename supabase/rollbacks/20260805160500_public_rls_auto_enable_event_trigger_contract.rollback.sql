-- Fail-closed containment rollback for the public RLS event-trigger contract.
-- Keep automatic RLS enablement active and keep all direct execution revoked.

begin;

alter function public.rls_auto_enable() owner to postgres;
alter function public.rls_auto_enable() set search_path = pg_catalog;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

alter event trigger ensure_rls owner to postgres;
alter event trigger ensure_rls enable;

do $verify$
begin
  if not exists (
    select 1
    from pg_catalog.pg_event_trigger event_row
    where event_row.evtname = 'ensure_rls'
      and event_row.evtevent = 'ddl_command_end'
      and event_row.evtfoid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
      and event_row.evtenabled <> 'D'
  ) then
    raise exception 'Containment must preserve enabled ensure_rls automation.';
  end if;

  if exists (
      select 1
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where p.oid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    or pg_catalog.has_function_privilege('anon','public.rls_auto_enable()','execute')
    or pg_catalog.has_function_privilege('authenticated','public.rls_auto_enable()','execute')
    or pg_catalog.has_function_privilege('service_role','public.rls_auto_enable()','execute') then
    raise exception 'Containment must keep direct rls_auto_enable() execution closed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
