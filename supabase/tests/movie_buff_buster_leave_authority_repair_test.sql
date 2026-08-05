begin;
create extension if not exists pgtap;
select plan(25);

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

select is(
  (
    select r.rolname
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_roles as r on r.oid = p.proowner
    where p.oid =
      'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
  ),
  'postgres',
  'release adapter is owned by postgres'
);
select is(
  (
    select p.proconfig
    from pg_catalog.pg_proc as p
    where p.oid =
      'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'release adapter fixes search_path to pg_catalog'
);
select ok(
  pg_catalog.position(
    'when ''disconnect_grace_expired'' then ''reconnect_grace_expired'''
    in pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
      )
    )
  ) > 0,
  'disconnect expiry is canonicalized to the existing MOV-16 reason'
);
select ok(
  pg_catalog.position(
    'release_movie_buff_vip_required_player'
    in pg_catalog.pg_get_functiondef(
      'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
    )
  ) > 0,
  'adapter still delegates to MOV-16 release authority'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot call the internal release adapter'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'service role retains internal release-adapter continuity'
);
select ok(
  pg_catalog.position(
    'already released with a different reason'
    in pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure
      )
    )
  ) > 0,
  'MOV-16 still rejects unrelated contradictory release reasons'
);

select * from finish();
rollback;
