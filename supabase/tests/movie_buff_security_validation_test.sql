begin;
create extension if not exists pgtap;
select plan(31);

select ok(
  to_regclass('public.movie_buff_vip_definitions') is not null,
  'VIP definitions table exists on the target under validation'
);
select ok(
  to_regclass('public.movie_buff_vip_inventory') is not null,
  'VIP inventory table exists on the target under validation'
);
select ok(
  to_regclass('public.movie_buff_vip_round_windows') is not null,
  'VIP round windows table exists on the target under validation'
);
select ok(
  to_regclass('public.movie_buff_vip_round_locks') is not null,
  'VIP private locks table exists on the target under validation'
);
select ok(
  to_regclass('public.movie_buff_vip_consumptions') is not null,
  'VIP consumption ledger exists on the target under validation'
);

select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_definitions'::regclass), 'VIP definitions have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_inventory'::regclass), 'VIP inventory has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_windows'::regclass), 'VIP windows have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_round_locks'::regclass), 'VIP locks have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.movie_buff_vip_consumptions'::regclass), 'VIP consumptions have RLS');

select is(has_table_privilege('anon', 'public.movie_buff_vip_definitions', 'SELECT'), false, 'anon cannot read VIP definitions');
select is(has_table_privilege('anon', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'anon cannot read VIP inventory');
select is(has_table_privilege('anon', 'public.movie_buff_vip_round_windows', 'SELECT'), false, 'anon cannot read VIP windows');
select is(has_table_privilege('anon', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'anon cannot read VIP locks');
select is(has_table_privilege('anon', 'public.movie_buff_vip_consumptions', 'SELECT'), false, 'anon cannot read VIP consumptions');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_inventory', 'SELECT'), false, 'authenticated cannot broadly read inventory');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_round_locks', 'SELECT'), false, 'authenticated cannot enumerate locks');
select is(has_table_privilege('authenticated', 'public.movie_buff_vip_consumptions', 'SELECT'), false, 'authenticated cannot enumerate consumptions');

select is(has_function_privilege('public', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)', 'EXECUTE'), false, 'PUBLIC cannot open VIP windows');
select is(has_function_privilege('anon', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)', 'EXECUTE'), false, 'anon cannot open VIP windows');
select is(has_function_privilege('authenticated', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)', 'EXECUTE'), false, 'authenticated cannot open VIP windows');
select is(has_function_privilege('service_role', 'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)', 'EXECUTE'), true, 'service role can open VIP windows');

select is(has_function_privilege('public', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), false, 'PUBLIC cannot lock VIPs');
select is(has_function_privilege('anon', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), false, 'anon cannot lock VIPs');
select is(has_function_privilege('authenticated', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), true, 'authenticated callers may use the caller-scoped lock RPC');
select is(has_function_privilege('service_role', 'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)', 'EXECUTE'), true, 'service role retains lock RPC continuity');

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
  (select count(*)::integer from public.movie_buff_vip_definitions),
  0,
  'the additive migration grants no placeholder VIP definitions'
);
select is(
  (select count(*)::integer from public.movie_buff_vip_inventory),
  0,
  'the additive migration grants no placeholder VIP inventory'
);

select * from finish();
rollback;
