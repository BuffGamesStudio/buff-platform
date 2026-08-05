begin;
create extension if not exists pgtap;
select plan(18);

select has_table(
  'public',
  'movie_buff_leave_penalty_policies',
  'versioned leave-penalty policy table exists'
);
select has_table(
  'public',
  'movie_buff_active_leave_quotes',
  'opaque active-leave quote table exists'
);
select has_table(
  'public',
  'movie_buff_leave_penalty_ledger',
  'immutable leave-penalty ledger exists'
);

select has_function(
  'public',
  'get_movie_buff_active_leave_quote',
  array['uuid'],
  'active-leave quote RPC exists'
);
select has_function(
  'public',
  'confirm_movie_buff_active_leave',
  array['uuid', 'text'],
  'active-leave confirm RPC exists'
);
select has_function(
  'public',
  'movie_buff_activate_busters_on_safe_phase_entry',
  array[]::text[],
  'safe-phase Buster trigger function exists'
);

select is(
  (
    select r.rolname
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    join pg_catalog.pg_roles as r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.oid = 'public.get_movie_buff_active_leave_quote(uuid)'::regprocedure
  ),
  'postgres',
  'quote RPC is owned by postgres'
);
select is(
  (
    select r.rolname
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    join pg_catalog.pg_roles as r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.oid = 'public.confirm_movie_buff_active_leave(uuid,text)'::regprocedure
  ),
  'postgres',
  'confirm RPC is owned by postgres'
);

select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc as p
    where p.oid = 'public.get_movie_buff_active_leave_quote(uuid)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'quote RPC fixes search_path to pg_catalog'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc as p
    where p.oid = 'public.confirm_movie_buff_active_leave(uuid,text)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'confirm RPC fixes search_path to pg_catalog'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_movie_buff_active_leave_quote(uuid)',
    'EXECUTE'
  ),
  'authenticated may execute quote RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_movie_buff_active_leave(uuid,text)',
    'EXECUTE'
  ),
  'authenticated may execute confirm RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_movie_buff_active_leave_quote(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute quote RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_movie_buff_active_leave(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute confirm RPC'
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'movie_buff_leave_penalty_policies'
  ),
  'policy table has RLS enabled'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'movie_buff_active_leave_quotes'
  ),
  'quote table has RLS enabled'
);
select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'movie_buff_leave_penalty_ledger'
  ),
  'ledger table has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from public.movie_buff_leave_penalty_policies
    where is_active
  ),
  0,
  'migration seeds no unapproved active penalty policy'
);

select * from finish();
rollback;
