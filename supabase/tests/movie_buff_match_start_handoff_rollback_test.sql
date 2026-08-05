begin;
create extension if not exists pgtap;
select plan(6);

select is(
  has_function_privilege(
    'authenticated',
    'public.start_movie_buff_match(uuid)',
    'EXECUTE'
  ),
  false,
  'rollback revokes authenticated match start'
);
select is(
  has_function_privilege(
    'anon',
    'public.start_movie_buff_match(uuid)',
    'EXECUTE'
  ),
  false,
  'rollback keeps anon match start denied'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.begin_movie_buff_match_from_admission(uuid)',
    'EXECUTE'
  ),
  false,
  'rollback keeps the internal handoff denied to authenticated'
);
select is(
  has_function_privilege(
    'service_role',
    'public.begin_movie_buff_match_from_admission(uuid)',
    'EXECUTE'
  ),
  false,
  'rollback contains service-role handoff execution'
);
select ok(
  position(
    'contained pending restoration'
    in pg_get_functiondef(
      'public.start_movie_buff_match(uuid)'::regprocedure
    )
  ) > 0,
  'rollback installs a fail-closed match-start stub'
);
select is(
  (
    select count(*)::integer
    from public.movie_buff_match_phase_state
  ),
  0,
  'rollback rehearsal creates no phase data'
);

select * from finish();
rollback;
