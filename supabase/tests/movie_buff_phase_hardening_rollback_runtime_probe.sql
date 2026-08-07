begin;

select plan(17);

select ok(
  to_regprocedure('public.movie_buff_guard_authoritative_answer_phase()') is null,
  '83100 answer guard function is removed'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'answers'
      and trigger.tgname = 'movie_buff_answers_require_authoritative_phase'
      and not trigger.tgisinternal
  ),
  '83100 answer guard trigger is removed'
);

select is(
  (
    select owner.rolname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner on owner.oid = proc.proowner
    where proc.oid = 'public.ensure_movie_buff_match_phase_state(uuid)'::regprocedure
  ),
  'postgres',
  'phase bootstrap owner is postgres'
);

select is(
  (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.ensure_movie_buff_match_phase_state(uuid)'::regprocedure
  ),
  true,
  'phase bootstrap remains SECURITY DEFINER'
);

select is(
  (
    select proc.proconfig
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.ensure_movie_buff_match_phase_state(uuid)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'phase bootstrap keeps fixed search_path'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.ensure_movie_buff_match_phase_state(uuid)'::regprocedure
    ),
    'pg_advisory_xact_lock'
  ) = 0,
  '83100 bootstrap advisory-lock hardening is reversed'
);

select is(
  (
    select owner.rolname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner on owner.oid = proc.proowner
    where proc.oid = 'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
  ),
  'postgres',
  'VIP release compatibility owner is postgres'
);

select is(
  (
    select proc.proconfig
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.movie_buff_phase_release_vip_participant(uuid,uuid,uuid,text)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'VIP release compatibility keeps fixed search_path'
);

select is(
  (
    select owner.rolname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner on owner.oid = proc.proowner
    where proc.oid = 'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure
  ),
  'postgres',
  'selector function owner is postgres'
);

select is(
  (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure
  ),
  true,
  'selector function remains SECURITY DEFINER'
);

select is(
  (
    select proc.proconfig
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'selector function keeps fixed search_path'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure
    ),
    'positive expected phase version is required'
  ) = 0,
  '83100 positive-version hardening is reversed'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)',
    'EXECUTE'
  ),
  'authenticated selector execution is restored'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)',
    'EXECUTE'
  ),
  'service-role selector execution is restored'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)',
    'EXECUTE'
  ),
  'anonymous selector execution remains denied'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.advance_movie_buff_round(uuid)',
    'EXECUTE'
  ),
  'pre-83100 authenticated legacy-round ACL is restored'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.advance_movie_buff_round(uuid)',
    'EXECUTE'
  ),
  'pre-83100 service-role legacy-round ACL is restored'
);

select * from finish();
rollback;
