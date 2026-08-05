-- Fail-closed containment rollback for the function finalizer.
-- Never restore PUBLIC, anon, or authenticated execution. Preserve service continuity.
begin;
do $rollback$
declare v_function record; v_identity text;
begin
  for v_function in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user'))
  loop
    v_identity := v_function.oid::pg_catalog.regprocedure::text;
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role', v_identity);
    execute pg_catalog.format('grant execute on function %s to service_role', v_identity);
    execute pg_catalog.format('alter function %s owner to postgres', v_identity);
  end loop;
end;
$rollback$;
notify pgrst, 'reload schema';
commit;
