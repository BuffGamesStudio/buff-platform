begin;
create extension if not exists pgtap;
select plan(20);

select has_table('public', 'movie_buff_vip_definitions', 'VIP definitions table exists');
select has_table('public', 'movie_buff_vip_inventory', 'VIP inventory table exists');
select has_table('public', 'movie_buff_vip_round_windows', 'VIP round windows table exists');
select has_table('public', 'movie_buff_vip_round_locks', 'VIP private locks table exists');
select has_table('public', 'movie_buff_vip_consumptions', 'VIP consumption ledger exists');

select has_function('public', 'open_movie_buff_vip_round_window', array['uuid','uuid','uuid','timestamp with time zone'], 'service opens authoritative deadline');
select has_function('public', 'get_movie_buff_vip_round_view', array['uuid','uuid'], 'private reconnect view exists');
select has_function('public', 'lock_movie_buff_round_vip', array['uuid','uuid','uuid','text'], 'authoritative lock exists');
select has_function('public', 'activate_movie_buff_round_vip', array['uuid','uuid','text'], 'exactly-once activation exists');
select has_function('public', 'set_movie_buff_vip_activation_phase', array['uuid','uuid','text'], 'server activation phase exists');

select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_inventory'::regclass), 'inventory has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_locks'::regclass), 'private locks have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_consumptions'::regclass), 'consumption ledger has RLS');

select is(has_table_privilege('anon', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'anon cannot read inventory');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'authenticated cannot broadly read inventory');
select is(has_table_privilege('anon', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'anon cannot read locks');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'members cannot enumerate private locks');
select is(has_function_privilege('anon', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), false, 'anon cannot lock VIPs');
select is(has_function_privilege('authenticated', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)', 'EXECUTE'), false, 'browser cannot extend deadline');
select is((select count(*)::integer from public.movie_buff_vip_definitions), 0, 'migration invents no VIP definitions');

select * from finish();
rollback;
