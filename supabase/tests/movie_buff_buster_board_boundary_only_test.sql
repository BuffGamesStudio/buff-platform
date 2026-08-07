begin;

select plan(14);

select has_function(
  'public',
  'movie_buff_enforce_buster_board_boundary',
  array[]::text[],
  'board-boundary guard function exists'
);

select is(
  (
    select owner.rolname
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_roles as owner on owner.oid = proc.proowner
    where proc.oid = 'public.movie_buff_enforce_buster_board_boundary()'::regprocedure
  ),
  'postgres',
  'board-boundary guard owner is postgres'
);

select is(
  (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.movie_buff_enforce_buster_board_boundary()'::regprocedure
  ),
  true,
  'board-boundary guard is SECURITY DEFINER'
);

select is(
  (
    select proc.proconfig
    from pg_catalog.pg_proc as proc
    where proc.oid = 'public.movie_buff_enforce_buster_board_boundary()'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'board-boundary guard has fixed search_path'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'movie_buff_match_participant_seats'
      and trigger.tgname = 'movie_buff_buster_requires_board_boundary'
      and not trigger.tgisinternal
  ),
  'participant-seat guard trigger exists'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_enforce_buster_board_boundary()'::regprocedure
    ),
    $$v_phase is distinct from 'board_select'$$
  ) > 0,
  'guard rejects conversion outside board_select'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_ready_busters(uuid)'::regprocedure
    ),
    $$v_state.phase <> 'board_select'$$
  ) > 0,
  'ready-Buster function is board_select-only'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_ready_busters(uuid)'::regprocedure
    ),
    $$'results'$$
  ) = 0,
  'ready-Buster function does not activate during results'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_ready_busters(uuid)'::regprocedure
    ),
    $$'round_intro'$$
  ) = 0,
  'ready-Buster function does not activate during Round Intro'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_busters_on_phase_boundary()'::regprocedure
    ),
    $$new.phase <> 'board_select'$$
  ) > 0,
  'phase-boundary trigger activates only on board_select entry'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_busters_on_phase_boundary()'::regprocedure
    ),
    $$'results'$$
  ) = 0,
  'phase-boundary trigger does not activate during results'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.movie_buff_activate_busters_on_phase_boundary()'::regprocedure
    ),
    $$'round_intro'$$
  ) = 0,
  'phase-boundary trigger does not activate during Round Intro'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.movie_buff_enforce_buster_board_boundary()',
    'EXECUTE'
  ),
  'authenticated cannot execute the internal guard'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.movie_buff_enforce_buster_board_boundary()',
    'EXECUTE'
  ),
  'anonymous cannot execute the internal guard'
);

select * from finish();
rollback;
