-- Rollback for 20260804070000_movie_buff_production_baseline_reconciliation.sql.
--
-- This rollback is intentionally fail-closed. It drops only the four helpers
-- created by the reconciliation migration and only when they still carry the
-- reconciliation marker. It uses no CASCADE; later dependencies must be
-- removed first in reverse migration order.

begin;

do $preflight$
declare
  v_identity text;
  v_oid oid;
  v_marker text;
begin
  foreach v_identity in array array[
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_round_member(uuid)',
    'public.is_buff_content_manager()'
  ]
  loop
    v_oid := to_regprocedure(v_identity);

    if v_oid is null then
      raise exception 'Rollback preflight failed: % is missing.', v_identity;
    end if;

    select pg_catalog.obj_description(v_oid, 'pg_proc')
    into v_marker;

    if v_marker <> 'movie_buff_baseline_reconciliation:20260804070000' then
      raise exception
        'Rollback preflight failed: % does not carry the reconciliation marker.',
        v_identity;
    end if;
  end loop;
end;
$preflight$;

revoke all on function public.is_movie_buff_room_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_match_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_round_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_buff_content_manager()
  from public, anon, authenticated, service_role;

drop function public.is_movie_buff_round_member(uuid);
drop function public.is_movie_buff_match_member(uuid);
drop function public.is_movie_buff_room_member(uuid);
drop function public.is_buff_content_manager();

do $verify$
begin
  if to_regprocedure('public.is_movie_buff_room_member(uuid)') is not null
     or to_regprocedure('public.is_movie_buff_match_member(uuid)') is not null
     or to_regprocedure('public.is_movie_buff_round_member(uuid)') is not null
     or to_regprocedure('public.is_buff_content_manager()') is not null then
    raise exception 'Rollback verification failed: one or more reconciliation helpers remain.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
