begin;
create extension if not exists pgtap;
select plan(43);

select has_table('public','movie_buff_active_leave_policies','versioned leave policy table exists');
select has_table('public','movie_buff_active_leave_quotes','opaque leave quote table exists');
select has_table('public','movie_buff_active_leave_penalty_ledger','immutable leave penalty ledger exists');
select has_table('public','movie_buff_match_abandonment_events','immutable abandonment event table exists');

select has_function('public','get_movie_buff_active_leave_quote',array['uuid'],'active leave quote RPC exists');
select has_function('public','confirm_movie_buff_active_leave',array['uuid','text','text'],'active leave confirm RPC exists');
select has_function('public','movie_buff_activate_busters_on_phase_boundary',array[]::text[],'phase-boundary Buster trigger function exists');
select has_function('public','movie_buff_activate_ready_busters',array['uuid'],'delayed Buster worker exists');

select has_trigger('public','movie_buff_match_phase_state','movie_buff_activate_busters_on_phase_boundary','atomic Buster boundary trigger exists');
select has_trigger('public','movie_buff_active_leave_penalty_ledger','movie_buff_penalty_ledger_immutable','penalty ledger is immutable');
select has_trigger('public','movie_buff_match_abandonment_events','movie_buff_abandonment_events_immutable','abandonment events are immutable');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_active_leave_policies'::regclass),'leave policies use forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_active_leave_quotes'::regclass),'leave quotes use forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_active_leave_penalty_ledger'::regclass),'penalty ledger uses forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_match_abandonment_events'::regclass),'abandonment events use forced RLS');

select is(has_table_privilege('anon','public.movie_buff_active_leave_policies','SELECT'),false,'anon cannot read leave policy');
select is(has_table_privilege('authenticated','public.movie_buff_active_leave_policies','SELECT'),false,'authenticated cannot enumerate leave policy');
select is(has_table_privilege('anon','public.movie_buff_active_leave_quotes','SELECT'),false,'anon cannot read leave quotes');
select is(has_table_privilege('authenticated','public.movie_buff_active_leave_quotes','SELECT'),false,'authenticated cannot enumerate leave quotes');
select is(has_table_privilege('authenticated','public.movie_buff_active_leave_penalty_ledger','SELECT'),false,'authenticated cannot enumerate penalty ledger');
select is(has_table_privilege('authenticated','public.movie_buff_match_abandonment_events','SELECT'),false,'authenticated cannot enumerate abandonment events');
select is(has_table_privilege('service_role','public.movie_buff_active_leave_penalty_ledger','SELECT'),true,'service role retains penalty diagnostics');

select is(has_function_privilege('anon','public.get_movie_buff_active_leave_quote(uuid)','EXECUTE'),false,'anon cannot request active leave quote');
select is(has_function_privilege('authenticated','public.get_movie_buff_active_leave_quote(uuid)','EXECUTE'),true,'authenticated caller can request active leave quote');
select is(has_function_privilege('anon','public.confirm_movie_buff_active_leave(uuid,text,text)','EXECUTE'),false,'anon cannot confirm active leave');
select is(has_function_privilege('authenticated','public.confirm_movie_buff_active_leave(uuid,text,text)','EXECUTE'),true,'authenticated caller can confirm active leave');
select is(has_function_privilege('authenticated','public.movie_buff_activate_busters_on_phase_boundary()','EXECUTE'),false,'browser cannot invoke Buster trigger helper');

select is((select prosecdef from pg_proc where oid='public.get_movie_buff_active_leave_quote(uuid)'::regprocedure),true,'quote RPC is SECURITY DEFINER');
select is((select proowner::regrole::text from pg_proc where oid='public.get_movie_buff_active_leave_quote(uuid)'::regprocedure),'postgres','quote RPC owner is postgres');
select is((select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.get_movie_buff_active_leave_quote(uuid)'::regprocedure),true,'quote RPC has fixed search path');
select is((select prosecdef from pg_proc where oid='public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure),true,'confirm RPC is SECURITY DEFINER');
select is((select proowner::regrole::text from pg_proc where oid='public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure),'postgres','confirm RPC owner is postgres');
select is((select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure),true,'confirm RPC has fixed search path');

select is((select count(*)::integer from public.movie_buff_active_leave_policies),0,'migration does not invent production leave penalty');
select ok(position('Active Movie Buff leave policy is unavailable' in pg_get_functiondef('public.get_movie_buff_active_leave_quote(uuid)'::regprocedure)) > 0,'missing policy fails quote closed');
select ok(position('phase_version <> v_quote.phase_version' in pg_get_functiondef('public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure)) > 0,'stale phase quote is rejected');
select ok(position('Contradictory duplicate active-leave confirmation' in pg_get_functiondef('public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure)) > 0,'contradictory replay is rejected');
select ok(position('return v_existing.result' in pg_get_functiondef('public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure)) > 0,'identical replay returns stable result');
select ok(position('voluntary_active_leave' in pg_get_functiondef('public.confirm_movie_buff_active_leave(uuid,text,text)'::regprocedure)) > 0,'leave reason is immutable and explicit');
select ok(position('old.phase in (''round_intro'', ''vip_lock'')' in pg_get_functiondef('public.movie_buff_activate_busters_on_phase_boundary()'::regprocedure)) > 0,'intro or VIP abandonment is recognized');
select ok(position('new.phase = ''board_select''' in pg_get_functiondef('public.movie_buff_activate_busters_on_phase_boundary()'::regprocedure)) > 0,'board entry is the immediate Buster boundary');
select ok(position('replacement_ready_at <= v_now' in pg_get_functiondef('public.movie_buff_activate_ready_busters(uuid)'::regprocedure)) > 0,'non-entry takeover still respects replacement delay');
select ok(position('''vip_lock''' in pg_get_functiondef('public.movie_buff_activate_ready_busters(uuid)'::regprocedure)) = 0,'delayed Buster worker never activates during VIP');

select * from finish();
rollback;