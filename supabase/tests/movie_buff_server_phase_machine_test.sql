begin;
create extension if not exists pgtap;
select plan(46);

select has_table('public','movie_buff_match_phase_state','canonical phase state exists');
select has_table('public','movie_buff_match_participant_seats','stable participant seats exist');
select has_table('public','movie_buff_match_phase_actions','idempotent action ledger exists');
select has_table('public','movie_buff_match_phase_events','phase event history exists');

select has_column('public','movie_buff_match_phase_state','phase_version','phase version exists');
select has_column('public','movie_buff_match_phase_state','phase_ends_at','server phase deadline exists');
select has_column('public','movie_buff_match_phase_state','selector_deadline_at','selector deadline exists');
select has_column('public','movie_buff_match_phase_state','playback_starts_at','shared playback timestamp exists');
select has_column('public','movie_buff_match_phase_state','answer_deadline_at','shared answer deadline exists');
select has_column('public','movie_buff_match_phase_state','results_end_at','shared results deadline exists');
select has_column('public','movie_buff_match_participant_seats','controller_type','seat controller type exists');
select has_column('public','movie_buff_match_participant_seats','reconnect_deadline_at','reconnect grace deadline exists');
select has_column('public','movie_buff_match_participant_seats','abandoned_at','abandonment timestamp exists');

select has_function('public','ensure_movie_buff_match_phase_state',array['uuid'],'phase bootstrap exists');
select has_function('public','touch_movie_buff_match_participant',array['uuid'],'presence touch exists');
select has_function('public','advance_movie_buff_match_phase',array['uuid','bigint'],'authoritative advance exists');
select has_function('public','get_movie_buff_match_phase_view',array['uuid'],'caller-safe view exists');
select has_function('public','select_movie_buff_match_tile',array['uuid','uuid','bigint','text'],'selector tile RPC exists');
select has_function('public','movie_buff_guard_authoritative_answer_phase',array[]::text[],'answer guard exists');

select ok((select relrowsecurity from pg_class where oid='public.movie_buff_match_phase_state'::regclass),'phase state has RLS');
select ok((select relrowsecurity from pg_class where oid='public.movie_buff_match_participant_seats'::regclass),'participant seats have RLS');
select ok((select relrowsecurity from pg_class where oid='public.movie_buff_match_phase_actions'::regclass),'action ledger has RLS');
select ok((select relrowsecurity from pg_class where oid='public.movie_buff_match_phase_events'::regclass),'event history has RLS');

select is(has_table_privilege('anon','public.movie_buff_match_phase_state','SELECT'),false,'anon cannot read phase rows');
select is(has_table_privilege('authenticated','public.movie_buff_match_phase_state','SELECT'),false,'members cannot broadly read phase rows');
select is(has_table_privilege('anon','public.movie_buff_match_participant_seats','SELECT'),false,'anon cannot read seat rows');
select is(has_table_privilege('authenticated','public.movie_buff_match_participant_seats','SELECT'),false,'members cannot broadly read seat rows');
select is(has_table_privilege('authenticated','public.movie_buff_match_phase_actions','SELECT'),false,'members cannot enumerate idempotency actions');
select is(has_table_privilege('authenticated','public.movie_buff_match_phase_events','SELECT'),false,'members cannot enumerate raw phase events');

select is(has_function_privilege('anon','public.get_movie_buff_match_phase_view(uuid)','EXECUTE'),false,'anon cannot read match view');
select is(has_function_privilege('authenticated','public.get_movie_buff_match_phase_view(uuid)','EXECUTE'),true,'authenticated member can call caller-safe view');
select is(has_function_privilege('authenticated','public.advance_movie_buff_match_phase(uuid,bigint)','EXECUTE'),true,'authenticated member can race safe advance');
select is(has_function_privilege('authenticated','public.select_movie_buff_match_tile(uuid,uuid,bigint,text)','EXECUTE'),true,'authenticated selector can request tile selection');
select is(has_function_privilege('authenticated','public.ensure_movie_buff_match_phase_state(uuid)','EXECUTE'),false,'internal bootstrap is not browser callable');
select is(has_function_privilege('authenticated','public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text)','EXECUTE'),false,'internal tile mutator is not browser callable');
select is(has_function_privilege('authenticated','public.movie_buff_phase_open_vip_window(uuid,uuid,uuid,timestamptz)','EXECUTE'),false,'browser cannot open VIP window');
select is(has_function_privilege('authenticated','public.advance_movie_buff_round(uuid)','EXECUTE'),false,'legacy manual round advance is revoked');
select is(has_function_privilege('service_role','public.advance_movie_buff_round(uuid)','EXECUTE'),true,'service continuity retains legacy advance for containment');

select is((select prosecdef from pg_proc where oid='public.advance_movie_buff_match_phase(uuid,bigint)'::regprocedure),true,'phase advance is SECURITY DEFINER');
select is((select proowner::regrole::text from pg_proc where oid='public.advance_movie_buff_match_phase(uuid,bigint)'::regprocedure),'postgres','phase advance owner is postgres');
select is((select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.advance_movie_buff_match_phase(uuid,bigint)'::regprocedure),true,'phase advance has fixed search path');
select is((select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure),true,'tile selection has fixed search path');
select is((select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.get_movie_buff_match_phase_view(uuid)'::regprocedure),true,'phase view has fixed search path');

select has_trigger('public','answers','movie_buff_answers_require_authoritative_phase','answer phase guard trigger exists');
select is((select count(*)::integer from public.movie_buff_match_phase_state),0,'migration creates no synthetic phase rows');
select is((select count(*)::integer from public.movie_buff_match_participant_seats),0,'migration creates no synthetic seats');

select * from finish();
rollback;
