begin;
create extension if not exists pgtap;
select no_plan();

create temporary table expected_movie_buff_browser_rpc (
  identity text primary key,
  expected_config text[] not null,
  boundary text not null
) on commit drop;

insert into expected_movie_buff_browser_rpc values
  ('activate_movie_buff_round_vip(uuid,uuid,text)',array['search_path=pg_catalog'],'direct_member'),
  ('advance_movie_buff_match_phase(uuid,bigint)',array['search_path=pg_catalog'],'phase_guard'),
  ('confirm_movie_buff_active_leave(uuid,text,text)',array['search_path=pg_catalog'],'phase_guard'),
  ('find_or_create_movie_buff_public_room(uuid,text,integer,integer)',array['search_path=pg_catalog'],'direct_member'),
  ('get_movie_buff_active_leave_quote(uuid)',array['search_path=pg_catalog'],'phase_guard'),
  ('get_movie_buff_final_results(uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('get_movie_buff_match_phase_view(uuid)',array['search_path=pg_catalog'],'phase_guard'),
  ('get_movie_buff_round_results(uuid,uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('get_movie_buff_round_results(uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('get_movie_buff_round(uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('get_movie_buff_vip_round_view(uuid,uuid)',array['search_path=pg_catalog'],'direct_member'),
  ('is_buff_content_manager()',array['search_path=pg_catalog, public'],'self_profile'),
  ('join_movie_buff_room(text)',array['search_path=pg_catalog, public'],'direct_member'),
  ('leave_movie_buff_room(uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('lock_movie_buff_round_vip(uuid,uuid,uuid,text)',array['search_path=pg_catalog'],'direct_member'),
  ('mark_movie_buff_round_media_ready(uuid)',array['search_path=pg_catalog, public'],'phase_guard'),
  ('select_movie_buff_match_tile(uuid,uuid,bigint,text)',array['search_path=pg_catalog'],'phase_guard'),
  ('set_movie_buff_player_ready(uuid,boolean)',array['search_path=pg_catalog'],'direct_member'),
  ('submit_movie_buff_answer(uuid,text)',array['search_path=pg_catalog, public'],'direct_member'),
  ('touch_movie_buff_match_participant(uuid)',array['search_path=pg_catalog'],'phase_guard'),
  ('touch_movie_buff_room_presence(uuid)',array['search_path=pg_catalog, public'],'direct_member'),
  ('use_movie_buff_round_hint(uuid,integer)',array['search_path=pg_catalog, public'],'direct_member');

create temporary view actual_movie_buff_browser_rpc as
select p.oid, p.oid::regprocedure::text as identity,
       pg_get_userbyid(p.proowner) as owner,
       p.proconfig,
       pg_get_functiondef(p.oid) as definition,
       has_function_privilege('public',p.oid,'execute') as public_execute,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'execute') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and has_function_privilege('authenticated',p.oid,'execute');

select is((select count(*)::integer from actual_movie_buff_browser_rpc),22,
  'exactly twenty-two reviewed browser SECURITY DEFINER RPCs remain');
select is((select count(*)::integer from expected_movie_buff_browser_rpc e
  left join actual_movie_buff_browser_rpc a using(identity) where a.oid is null),0,
  'no reviewed browser RPC is missing');
select is((select count(*)::integer from actual_movie_buff_browser_rpc a
  left join expected_movie_buff_browser_rpc e using(identity) where e.identity is null),0,
  'no unreviewed browser SECURITY DEFINER RPC exists');
select is((select count(*)::integer
  from expected_movie_buff_browser_rpc e join actual_movie_buff_browser_rpc a using(identity)
  where a.owner<>'postgres' or a.public_execute or a.anon_execute
     or not a.authenticated_execute or not a.service_role_execute),0,
  'all browser RPCs have postgres owner and exact persona grants');
select is((select count(*)::integer
  from expected_movie_buff_browser_rpc e join actual_movie_buff_browser_rpc a using(identity)
  where a.proconfig is distinct from e.expected_config),0,
  'all browser RPCs have their independently reviewed fixed search_path');
select is((select count(*)::integer
  from expected_movie_buff_browser_rpc e join actual_movie_buff_browser_rpc a using(identity)
  where e.boundary='phase_guard'
    and a.definition not ilike '%movie_buff_phase_require_access%'),0,
  'all phase-authority RPCs call the active-room guard');
select is((select count(*)::integer
  from expected_movie_buff_browser_rpc e join actual_movie_buff_browser_rpc a using(identity)
  where e.boundary='direct_member'
    and not (a.definition ~* 'auth\.uid\s*\(' and a.definition ilike '%room_players%')),0,
  'all direct membership RPCs bind auth.uid to room membership');
select is((select count(*)::integer
  from expected_movie_buff_browser_rpc e join actual_movie_buff_browser_rpc a using(identity)
  where e.boundary='self_profile'
    and not (a.definition ~* 'auth\.uid\s*\(' and a.definition ilike '%public.profiles%')),0,
  'the content-manager predicate binds to the caller profile');

select ok(not has_function_privilege('authenticated',
  'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)'::regprocedure,'execute'),
  'round-completion helper is not directly browser callable');
select ok(not has_function_privilege('authenticated',
  'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'::regprocedure,'execute'),
  'player-time helper is not directly browser callable');
select ok(not has_function_privilege('authenticated',
  'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'::regprocedure,'execute'),
  'player-finished helper is not directly browser callable');
select ok(
  has_function_privilege('service_role','public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)'::regprocedure,'execute')
  and has_function_privilege('service_role','public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'::regprocedure,'execute')
  and has_function_privilege('service_role','public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'::regprocedure,'execute'),
  'service-role continuity is preserved for all three internal helpers');

create temporary table expected_movie_buff_internal_table(name text primary key) on commit drop;
insert into expected_movie_buff_internal_table values
  ('movie_buff_active_leave_penalty_ledger'),
  ('movie_buff_active_leave_policies'),
  ('movie_buff_active_leave_quotes'),
  ('movie_buff_board_events'),
  ('movie_buff_match_abandonment_events'),
  ('movie_buff_match_participant_seats'),
  ('movie_buff_match_phase_actions'),
  ('movie_buff_match_phase_events'),
  ('movie_buff_match_phase_state'),
  ('movie_buff_vip_consumptions'),
  ('movie_buff_vip_definitions'),
  ('movie_buff_vip_inventory'),
  ('movie_buff_vip_round_locks'),
  ('movie_buff_vip_round_required_players'),
  ('movie_buff_vip_round_windows');

select is((select count(*)::integer from expected_movie_buff_internal_table e
  join pg_class c on c.oid=to_regclass('public.'||e.name)
  where c.relrowsecurity and c.relforcerowsecurity),15,
  'all fifteen internal tables have RLS and FORCE RLS');
select is((select count(*)::integer from expected_movie_buff_internal_table e
  join pg_class c on c.oid=to_regclass('public.'||e.name)
  join pg_policy p on p.polrelid=c.oid
  where p.polname='movie_buff_internal_browser_deny' and not p.polpermissive
    and pg_get_expr(p.polqual,p.polrelid)='false'
    and pg_get_expr(p.polwithcheck,p.polrelid)='false'),15,
  'all fifteen internal tables have the exact restrictive deny policy');
select is((select count(*)::integer from expected_movie_buff_internal_table e where
  has_table_privilege('anon',to_regclass('public.'||e.name),'select') or
  has_table_privilege('anon',to_regclass('public.'||e.name),'insert') or
  has_table_privilege('anon',to_regclass('public.'||e.name),'update') or
  has_table_privilege('anon',to_regclass('public.'||e.name),'delete') or
  has_table_privilege('authenticated',to_regclass('public.'||e.name),'select') or
  has_table_privilege('authenticated',to_regclass('public.'||e.name),'insert') or
  has_table_privilege('authenticated',to_regclass('public.'||e.name),'update') or
  has_table_privilege('authenticated',to_regclass('public.'||e.name),'delete')),0,
  'no internal table exposes browser DML');
select is((select count(*)::integer from expected_movie_buff_internal_table e
  where not has_table_privilege('service_role',to_regclass('public.'||e.name),'select,insert,update,delete')),0,
  'service-role DML continuity is preserved on every internal table');

insert into auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
 ('00000000-0000-0000-0000-000000091001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','clearance-a@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000091002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','clearance-b@example.test','',now(),'{}','{}',now(),now())
on conflict(id) do nothing;
insert into public.game_rooms(id,room_code,host_id,room_type,status,max_players,total_rounds,current_round) values
 ('00000000-0000-0000-0000-000000092001','CLRRA1','00000000-0000-0000-0000-000000091001','private','active',3,10,1),
 ('00000000-0000-0000-0000-000000092002','CLRRB2','00000000-0000-0000-0000-000000091002','private','active',3,10,1);
insert into public.room_players(room_id,player_id,is_ready,is_host,left_at,last_seen_at) values
 ('00000000-0000-0000-0000-000000092001','00000000-0000-0000-0000-000000091001',true,true,null,now()),
 ('00000000-0000-0000-0000-000000092002','00000000-0000-0000-0000-000000091002',true,true,null,now());
insert into public.matches(id,room_id,status) values
 ('00000000-0000-0000-0000-000000093001','00000000-0000-0000-0000-000000092001','active'),
 ('00000000-0000-0000-0000-000000093002','00000000-0000-0000-0000-000000092002','active');
insert into public.match_rounds(id,match_id,round_number) values
 ('00000000-0000-0000-0000-000000094001','00000000-0000-0000-0000-000000093001',1),
 ('00000000-0000-0000-0000-000000094002','00000000-0000-0000-0000-000000093002',1);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000091002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000091002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok(
  $$select * from public.mark_movie_buff_round_media_ready('00000000-0000-0000-0000-000000092001')$$,
  'P0001','Active Movie Buff room membership required.',
  'other-room authenticated caller cannot mutate media-ready state');
reset role;
select is((select count(*)::integer from public.match_round_player_playback
  where round_id='00000000-0000-0000-0000-000000094001'
    and player_id='00000000-0000-0000-0000-000000091002'),0,
  'denied cross-room call leaves no playback mutation');

select * from finish();
rollback;
