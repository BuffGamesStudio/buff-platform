begin;
create extension if not exists pgtap;
select plan(9);

select has_function(
  'public',
  'release_movie_buff_vip_required_player',
  array['uuid','uuid','uuid','text'],
  'required-player release RPC exists'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'browser callers cannot release required humans'
);

select is(
  has_function_privilege(
    'service_role',
    'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'service role can perform authoritative participant release'
);

select is(
  (select p.prosecdef
   from pg_catalog.pg_proc as p
   where p.oid = 'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure),
  true,
  'release RPC is SECURITY DEFINER'
);

select is(
  (select r.rolname
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure),
  'postgres',
  'release RPC owner is postgres'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',')
   from pg_catalog.pg_proc as p
   where p.oid = 'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure),
  'search_path=pg_catalog',
  'release RPC has fixed pg_catalog search path'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure
    ),
    'status'', ''unavailable'''
  ) > 0,
  'missing VIP window returns an explicit unavailable no-op'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure
      )
    ),
    'already released with a different reason'
  ) > 0,
  'contradictory release reasons fail closed'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure
    ),
    'required.released_at is null'
  ) > 0,
  'released identities are excluded from readiness counts'
);

select * from finish();
rollback;
