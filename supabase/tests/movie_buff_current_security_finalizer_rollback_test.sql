begin;
create extension if not exists pgtap;
select plan(28);

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.match_round_player_hints'::regclass),'rollback preserves FORCE RLS on hints');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.match_round_player_playback'::regclass),'rollback preserves FORCE RLS on playback');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_boards'::regclass),'rollback preserves FORCE RLS on boards');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_categories'::regclass),'rollback preserves FORCE RLS on categories');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_tiles'::regclass),'rollback preserves FORCE RLS on tiles');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.movie_buff_board_events'::regclass),'rollback preserves FORCE RLS on events');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('match_round_player_hints','match_round_player_playback','movie_buff_boards','movie_buff_board_categories','movie_buff_board_tiles','movie_buff_board_events')),0,'rollback removes all browser policies');

select is(has_table_privilege('authenticated','public.match_round_player_hints','SELECT'),false,'rollback contains authenticated hint reads');
select is(has_table_privilege('authenticated','public.match_round_player_playback','SELECT'),false,'rollback contains authenticated playback reads');
select is(has_table_privilege('authenticated','public.movie_buff_boards','SELECT'),false,'rollback contains authenticated board reads');
select is(has_table_privilege('authenticated','public.movie_buff_board_categories','SELECT'),false,'rollback contains authenticated category reads');
select is(has_table_privilege('authenticated','public.movie_buff_board_tiles','SELECT'),false,'rollback contains authenticated tile reads');
select is(has_table_privilege('authenticated','public.movie_buff_board_events','SELECT'),false,'rollback keeps events contained');

select is(has_table_privilege('service_role','public.match_round_player_hints','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service hint CRUD');
select is(has_table_privilege('service_role','public.match_round_player_playback','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service playback CRUD');
select is(has_table_privilege('service_role','public.movie_buff_boards','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service board CRUD');
select is(has_table_privilege('service_role','public.movie_buff_board_categories','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service category CRUD');
select is(has_table_privilege('service_role','public.movie_buff_board_tiles','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service tile CRUD');
select is(has_table_privilege('service_role','public.movie_buff_board_events','SELECT,INSERT,UPDATE,DELETE'),true,'rollback preserves service event CRUD');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and has_function_privilege('authenticated',p.oid,'EXECUTE')),0,'rollback contains every authenticated hardened RPC');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user')) and not has_function_privilege('service_role',p.oid,'EXECUTE')),0,'rollback preserves every service hardened RPC');

select is((select count(*)::integer from pg_event_trigger where evtname='ensure_rls' and evtfoid='public.rls_auto_enable()'::regprocedure and evtevent='ddl_command_end' and evtenabled<>'D'),1,'rollback preserves enabled ensure_rls event trigger');
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid='public.rls_auto_enable()'::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE'),0,'rollback keeps PUBLIC away from rls_auto_enable');
select is(has_function_privilege('anon','public.rls_auto_enable()','EXECUTE'),false,'rollback keeps anon away from rls_auto_enable');
select is(has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE'),false,'rollback keeps authenticated away from rls_auto_enable');
select is(has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE'),false,'rollback keeps service direct execution closed');
select is((select proowner::regrole::text from pg_proc where oid='public.rls_auto_enable()'::regprocedure),'postgres','rollback preserves RLS callback owner');
select is((select coalesce(proconfig,'{}'::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid='public.rls_auto_enable()'::regprocedure),true,'rollback preserves RLS callback path');

select * from finish();
rollback;
