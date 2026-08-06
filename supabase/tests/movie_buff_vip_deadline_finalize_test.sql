begin;
create extension if not exists pgtap;
select plan(12);

select has_function(
  'public',
  'finalize_movie_buff_vip_round_window',
  array['uuid','uuid','timestamp with time zone'],
  'service-only VIP deadline finalizer exists'
);

select is(
  has_function_privilege(
    'public',
    'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  false,
  'PUBLIC cannot finalize VIP windows'
);
select is(
  has_function_privilege(
    'anon',
    'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  false,
  'anon cannot finalize VIP windows'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot directly finalize VIP windows'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  true,
  'service role can finalize VIP windows'
);

select is(
  (select p.prosecdef
   from pg_catalog.pg_proc as p
   where p.oid = 'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure),
  true,
  'finalizer is SECURITY DEFINER'
);
select is(
  (select r.rolname
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure),
  'postgres',
  'finalizer is owned by postgres'
);
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',')
   from pg_catalog.pg_proc as p
   where p.oid = 'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure),
  'search_path=pg_catalog',
  'finalizer has fixed pg_catalog search path'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
    ),
    'movie-buff-vip-window|'
  ) > 0,
  'finalizer uses the shared round advisory lock'
);
select ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
      )
    ),
    'contradictory vip finalization deadline'
  ) > 0,
  'contradictory deadline binding fails closed'
);
select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
    ),
    'required.released_at is null'
  ) > 0,
  'released humans are excluded from required completion'
);
select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
    ),
    'locked.vip_id is null'
  ) > 0,
  'deadline passes are explicit null-VIP locks'
);

select * from finish();
rollback;
