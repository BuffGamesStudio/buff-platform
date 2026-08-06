begin;
create extension if not exists pgtap;
select plan(44);

select has_table('public', 'movie_buff_vip_definitions', 'VIP definitions table exists');
select has_table('public', 'movie_buff_vip_inventory', 'VIP inventory table exists');
select has_table('public', 'movie_buff_vip_round_windows', 'VIP round windows table exists');
select has_table('public', 'movie_buff_vip_round_required_players', 'required-human identity snapshot exists');
select has_table('public', 'movie_buff_vip_round_locks', 'VIP private locks table exists');
select has_table('public', 'movie_buff_vip_consumptions', 'VIP consumption ledger exists');

select has_function(
  'public',
  'movie_buff_vip_ineligibility_reason',
  array['uuid','uuid','uuid','uuid','uuid','timestamp with time zone'],
  'fail-closed eligibility helper exists'
);
select has_function(
  'public',
  'open_movie_buff_vip_round_window',
  array['uuid','uuid','uuid','timestamp with time zone','uuid[]'],
  'service opens deadline with explicit required-human IDs'
);
select has_function(
  'public',
  'open_movie_buff_vip_round_window',
  array['uuid','uuid','uuid','timestamp with time zone'],
  'legacy count-derived window overload remains as a fail-closed wrapper'
);
select has_function(
  'public',
  'release_movie_buff_vip_required_player',
  array['uuid','uuid','uuid','text'],
  'service can release an abandoned required human'
);
select has_function('public', 'get_movie_buff_vip_round_view', array['uuid','uuid'], 'private reconnect view exists');
select has_function('public', 'lock_movie_buff_round_vip', array['uuid','uuid','uuid','text'], 'authoritative lock exists');
select has_function('public', 'activate_movie_buff_round_vip', array['uuid','uuid','text'], 'exactly-once activation exists');
select has_function('public', 'set_movie_buff_vip_activation_phase', array['uuid','uuid','text'], 'server activation phase exists');

select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_definitions'::regclass), 'definitions have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_inventory'::regclass), 'inventory has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_windows'::regclass), 'windows have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_required_players'::regclass), 'required-player snapshot has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_locks'::regclass), 'private locks have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_consumptions'::regclass), 'consumption ledger has RLS');

select is(has_table_privilege('anon', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'anon cannot read inventory');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'authenticated cannot broadly read inventory');
select is(has_table_privilege('anon', 'public.movie_buff_vip_round_required_players', 'SELECT'), false, 'anon cannot read participant snapshot');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_round_required_players', 'SELECT'), false, 'authenticated cannot enumerate participant snapshot');
select is(has_table_privilege('anon', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'anon cannot read locks');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'members cannot enumerate private locks');
select is(has_table_privilege('anon', 'public.movie_buff_vip_consumptions', 'SELECT'), false, 'anon cannot read consumptions');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_consumptions', 'SELECT'), false, 'authenticated cannot enumerate consumptions');

select is(has_function_privilege('anon', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), false, 'anon cannot lock VIPs');
select is(has_function_privilege('authenticated', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])', 'EXECUTE'), false, 'browser cannot open or extend an authoritative window');
select is(has_function_privilege('service_role', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])', 'EXECUTE'), true, 'service role can open a snapshotted window');
select is(has_function_privilege('authenticated', 'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)', 'EXECUTE'), false, 'browser cannot release required humans');
select is(has_function_privilege('service_role', 'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)', 'EXECUTE'), true, 'service role can release required humans');
select is(has_function_privilege('authenticated', 'public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)', 'EXECUTE'), false, 'internal eligibility helper is not browser callable');
select is(has_function_privilege('authenticated', 'public.get_movie_buff_vip_round_view(uuid,uuid)', 'EXECUTE'), true, 'authenticated caller can read only the caller-scoped view');
select is(has_function_privilege('authenticated', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), true, 'authenticated caller can lock only through the caller-scoped RPC');
select is(has_function_privilege('authenticated', 'public.activate_movie_buff_round_vip(uuid,uuid,text)', 'EXECUTE'), true, 'authenticated caller can request caller-scoped activation');

select is(
  (select proowner::regrole::text from pg_proc where oid = 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'::regprocedure),
  'postgres',
  'VIP lock RPC is owned by postgres'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'::regprocedure),
  true,
  'VIP lock RPC is SECURITY DEFINER'
);
select is(
  (select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'::regprocedure),
  true,
  'VIP lock RPC has fixed pg_catalog search path'
);
select is(
  (select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.activate_movie_buff_round_vip(uuid,uuid,text)'::regprocedure),
  true,
  'VIP activation RPC has fixed pg_catalog search path'
);
select is(
  (select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])'::regprocedure),
  true,
  'VIP window RPC has fixed pg_catalog search path'
);

select is((select count(*)::integer from public.movie_buff_vip_definitions), 0, 'migration invents no VIP definitions');
select is((select count(*)::integer from public.movie_buff_vip_inventory), 0, 'migration invents no VIP inventory');

select * from finish();
rollback;
