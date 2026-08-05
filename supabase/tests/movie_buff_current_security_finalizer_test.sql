begin;
create extension if not exists pgtap;
select plan(37);

create temporary table movie_buff_expected_authenticated_rpcs(identity text primary key) on commit drop;
insert into movie_buff_expected_authenticated_rpcs(identity) values
  ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
  ('public.join_movie_buff_room(text)'),
  ('public.leave_movie_buff_room(uuid)'),
  ('public.set_movie_buff_player_ready(uuid,boolean)'),
  ('public.touch_movie_buff_room_presence(uuid)'),
  ('public.get_movie_buff_round(uuid)'),
  ('public.mark_movie_buff_round_media_ready(uuid)'),
  ('public.use_movie_buff_round_hint(uuid,integer)'),
  ('public.submit_movie_buff_answer(uuid,text)'),
  ('public.get_movie_buff_round_results(uuid)'),
  ('public.get_movie_buff_round_results(uuid,uuid)'),
  ('public.get_movie_buff_final_results(uuid)'),
  ('public.get_movie_buff_round_completion(uuid,uuid,timestamp with time zone,integer)'),
  ('public.get_movie_buff_round_player_time_left(uuid,uuid,timestamp with time zone,integer)'),
  ('public.is_movie_buff_round_player_finished(uuid,uuid,timestamp with time zone,integer)'),
  ('public.get_movie_buff_match_phase_view(uuid)'),
  ('public.advance_movie_buff_match_phase(uuid,bigint)'),
  ('public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'),
  ('public.touch_movie_buff_match_participant(uuid)'),
  ('public.get_movie_buff_vip_round_view(uuid,uuid)'),
  ('public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'),
  ('public.activate_movie_buff_round_vip(uuid,uuid,text)'),
  ('public.get_movie_buff_active_leave_quote(uuid)'),
  ('public.confirm_movie_buff_active_leave(uuid,text)');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.match_round_player_hints'::regclass),'hints use FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.match_round_player_playback'::regclass),'playback uses FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_boards'::regclass),'boards use FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_categories'::regclass),'categories use FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_tiles'::regclass),'tiles use FORCE RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_events'::regclass),'events use FORCE RLS');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('match_round_player_hints','match_round_player_playback','movie_buff_boards','movie_buff_board_categories','movie_buff_board_tiles','movie_buff_board_events')),5,'exactly five browser policies exist');

select is(has_table_privilege('authenticated','public.match_round_player_hints','SELECT'),true,'authenticated can request own hints');
select is(has_table_privilege('authenticated','public.match_round_player_playback','SELECT'),true,'authenticated can request own playback');
select is(has_table_privilege('authenticated','public.movie_buff_boards','SELECT'),true,'authenticated can request member boards');
select is(has_table_privilege('authenticated','public.movie_buff_board_categories','SELECT'),true,'authenticated can request member categories');
select is(has_table_privilege('authenticated','public.movie_buff_board_tiles','SELECT'),true,'authenticated can request member tiles');
select is(has_table_privilege('authenticated','public.movie_buff_board_events','SELECT'),false,'raw events remain service-only');
select is(has_table_privilege('anon','public.match_round_player_hints','SELECT'),false,'anon cannot read hints');
select is(has_table_privilege('anon','public.match_round_player_playback','SELECT'),false,'anon cannot read playback');
select is(has_table_privilege('anon','public.movie_buff_boards','SELECT'),false,'anon cannot read boards');
select is(has_table_privilege('anon','public.movie_buff_board_categories','SELECT'),false,'anon cannot read categories');
select is(has_table_privilege('anon','public.movie_buff_board_tiles','SELECT'),false,'anon cannot read tiles');
select is(has_table_privilege('anon','public.movie_buff_board_events','SELECT'),false,'anon cannot read events');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and acl.grantee=0 and acl.privilege_type='EXECUTE'),0,'PUBLIC executes no hardened function');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and has_function_privilege('anon',p.oid,'EXECUTE')),0,'anon executes no hardened function');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and not has_function_privilege('service_role',p.oid,'EXECUTE')),0,'service role retains every hardened function');
select is((select count(*)::integer from movie_buff_expected_authenticated_rpcs),24,'allowlist contains 24 exact identities');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and has_function_privilege('authenticated',p.oid,'EXECUTE') and not exists (select 1 from movie_buff_expected_authenticated_rpcs e where to_regprocedure(e.identity)=p.oid)),0,'authenticated has no unexpected hardened RPC');
select is((select count(*)::integer from movie_buff_expected_authenticated_rpcs e where not has_function_privilege('authenticated',to_regprocedure(e.identity),'EXECUTE')),0,'authenticated has every required RPC');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and r.rolname<>'postgres'),0,'hardened owners are postgres');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and not coalesce(p.proconfig,'{}'::text[]) && array['search_path=pg_catalog','search_path=pg_catalog, public']),0,'hardened paths are fixed');
select is(has_function_privilege('authenticated','public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamp with time zone)','EXECUTE'),false,'VIP finalizer remains service-only');
select is(has_function_privilege('authenticated','public.get_movie_buff_active_leave_quote(uuid)','EXECUTE'),true,'leave quote remains caller callable');
select is(has_function_privilege('authenticated','public.confirm_movie_buff_active_leave(uuid,text)','EXECUTE'),true,'leave confirm remains caller callable');

select is((select count(*)::integer from pg_event_trigger where evtname='ensure_rls' and evtfoid='public.rls_auto_enable()'::regprocedure and evtevent='ddl_command_end' and evtenabled<>'D'),1,'ensure_rls remains enabled');
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid='public.rls_auto_enable()'::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE'),0,'PUBLIC cannot execute rls_auto_enable');
select is(has_function_privilege('anon','public.rls_auto_enable()','EXECUTE'),false,'anon cannot execute rls_auto_enable');
select is(has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE'),false,'authenticated cannot execute rls_auto_enable');
select is(has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE'),false,'service cannot directly execute event callback');
select is((select proowner::regrole::text from pg_proc where oid='public.rls_auto_enable()'::regprocedure),'postgres','RLS callback owner is postgres');
select is((select coalesce(proconfig,'{}'::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.rls_auto_enable()'::regprocedure),true,'RLS callback path is pg_catalog-only');

select * from finish();
rollback;
