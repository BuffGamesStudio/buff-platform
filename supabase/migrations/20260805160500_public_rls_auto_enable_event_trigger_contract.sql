-- Canonical repository source for the public RLS auto-enable event-trigger contract.
-- Hosted staging already contains this function/trigger. Clean local databases do not.
-- This migration reproduces the observed hosted behavior before the later ACL lockdown.

begin;

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute pg_catalog.format(
          'alter table if exists %s enable row level security',
          cmd.object_identity
        );
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema: %)',
        cmd.object_identity,
        cmd.schema_name;
    end if;
  end loop;
end;
$function$;

alter function public.rls_auto_enable() owner to postgres;
alter function public.rls_auto_enable() set search_path = pg_catalog;
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

do $event_trigger$
declare
  v_function_oid oid := 'public.rls_auto_enable()'::pg_catalog.regprocedure;
begin
  if exists (
    select 1
    from pg_catalog.pg_event_trigger event_row
    where event_row.evtname = 'ensure_rls'
  ) then
    if not exists (
      select 1
      from pg_catalog.pg_event_trigger event_row
      where event_row.evtname = 'ensure_rls'
        and event_row.evtevent = 'ddl_command_end'
        and event_row.evtfoid = v_function_oid
    ) then
      raise exception 'Existing ensure_rls event trigger has a contradictory contract.';
    end if;
  else
    execute $ddl$
      create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable()
    $ddl$;
  end if;
end;
$event_trigger$;

alter event trigger ensure_rls owner to postgres;
alter event trigger ensure_rls enable;

do $verify$
declare
  v_public_execute boolean;
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is null then
    raise exception 'public.rls_auto_enable() was not created.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_event_trigger event_row
    where event_row.evtname = 'ensure_rls'
      and event_row.evtevent = 'ddl_command_end'
      and event_row.evtfoid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
      and event_row.evtenabled <> 'D'
  ) then
    raise exception 'ensure_rls event trigger is missing or disabled.';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = 'public.rls_auto_enable()'::pg_catalog.regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;

  if v_public_execute
     or pg_catalog.has_function_privilege('anon','public.rls_auto_enable()','execute')
     or pg_catalog.has_function_privilege('authenticated','public.rls_auto_enable()','execute')
     or pg_catalog.has_function_privilege('service_role','public.rls_auto_enable()','execute') then
    raise exception 'Direct rls_auto_enable() execution remains exposed.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
