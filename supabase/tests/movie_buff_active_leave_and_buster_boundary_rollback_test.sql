begin;
create extension if not exists pgtap;
select plan(14);

select has_table('public','movie_buff_active_leave_quotes','rollback preserves durable quotes');
select has_table('public','movie_buff_active_leave_penalty_ledger','rollback preserves durable penalty ledger');
select has_table('public','movie_buff_match_abandonment_events','rollback preserves abandonment events');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_active_leave_quotes'::regclass),'quotes remain forced-RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_active_leave_penalty_ledger'::regclass),'penalty ledger remains forced-RLS');
select is(has_function_privilege('authenticated','public.get_movie_buff_active_leave_quote(uuid)','EXECUTE'),false,'rollback contains browser quote access');
select is(has_function_privilege('authenticated','public.confirm_movie_buff_active_leave(uuid,text,text)','EXECUTE'),false,'rollback contains browser confirm access');
select is(has_function_privilege('service_role','public.get_movie_buff_active_leave_quote(uuid)','EXECUTE'),true,'service quote diagnostics remain');
select is(has_function_privilege('service_role','public.confirm_movie_buff_active_leave(uuid,text,text)','EXECUTE'),true,'service confirm diagnostics remain');
select is((select count(*)::integer from pg_trigger where tgrelid='public.movie_buff_match_phase_state'::regclass and tgname='movie_buff_activate_busters_on_phase_boundary' and not tgisinternal),0,'atomic boundary trigger is removed');
select ok(position('v_state.phase <> ''board_select''' in pg_get_functiondef('public.movie_buff_activate_ready_busters(uuid)'::regprocedure)) > 0,'prior board-only helper is restored');
select ok(position('''results''' in pg_get_functiondef('public.movie_buff_activate_ready_busters(uuid)'::regprocedure)) = 0,'rollback removes expanded safe phases');
select has_trigger('public','movie_buff_active_leave_penalty_ledger','movie_buff_penalty_ledger_immutable','penalty records stay immutable');
select has_trigger('public','movie_buff_match_abandonment_events','movie_buff_abandonment_events_immutable','abandonment records stay immutable');

select * from finish();
rollback;