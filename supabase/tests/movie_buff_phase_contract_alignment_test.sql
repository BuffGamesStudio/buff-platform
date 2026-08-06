begin;

select plan(15);

select ok(
  to_regclass('public.movie_buff_match_participant_seats') is not null,
  'authoritative match participant seats exist'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'movie_buff_match_participant_seats'
      and constraint_row.conname = 'movie_buff_match_participant_seats_nonseat_system_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%human%'
  ),
  'participant controller constraint permits human'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'movie_buff_match_participant_seats'
      and constraint_row.conname = 'movie_buff_match_participant_seats_nonseat_system_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%buster%'
  ),
  'participant controller constraint permits Buster'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'movie_buff_match_participant_seats'
      and constraint_row.conname = 'movie_buff_match_participant_seats_nonseat_system_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%system%'
  ),
  'system automation is not a participant-seat controller'
);

select is(
  public.movie_buff_phase_route('abandoned'),
  '/games/movie-buff/match-status',
  'abandoned routes to canonical containment surface'
);

select is(
  public.movie_buff_phase_route('blocked'),
  '/games/movie-buff/match-status',
  'blocked routes to canonical containment surface'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation
      on relation.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'movie_buff_match_phase_state'
      and trigger_row.tgname = 'movie_buff_phase_requires_vip_finalize'
      and not trigger_row.tgisinternal
  ),
  'VIP finalize guard is installed on authoritative phase state'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure_row.pronamespace
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = procedure_row.proowner
    where namespace.nspname = 'public'
      and procedure_row.proname = 'movie_buff_require_vip_window_finalized'
      and owner_role.rolname = 'postgres'
  ),
  'VIP finalize guard is owned by postgres'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure_row.pronamespace
    where namespace.nspname = 'public'
      and procedure_row.proname = 'movie_buff_require_vip_window_finalized'
      and 'search_path=pg_catalog' = any(procedure_row.proconfig)
  ),
  'VIP finalize guard fixes search_path to pg_catalog'
);

select ok(
  to_regprocedure(
    'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
  ) is not null,
  'MOV-16 finalize service boundary exists'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = procedure_row.proowner
    where procedure_row.oid = to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    )
      and owner_role.rolname = 'postgres'
  ),
  'MOV-16 finalize service boundary is owned by postgres'
);

select ok(
  case
    when to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    ) is null then false
    else not pg_catalog.has_function_privilege(
      'public',
      to_regprocedure(
        'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
      ),
      'EXECUTE'
    )
  end,
  'PUBLIC cannot execute MOV-16 finalize boundary'
);

select ok(
  case
    when to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    ) is null then false
    else not pg_catalog.has_function_privilege(
      'anon',
      to_regprocedure(
        'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
      ),
      'EXECUTE'
    )
  end,
  'anon cannot execute MOV-16 finalize boundary'
);

select ok(
  case
    when to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    ) is null then false
    else not pg_catalog.has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
      ),
      'EXECUTE'
    )
  end,
  'authenticated cannot execute MOV-16 finalize boundary'
);

select ok(
  case
    when to_regprocedure(
      'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
    ) is null then false
    else pg_catalog.has_function_privilege(
      'service_role',
      to_regprocedure(
        'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'
      ),
      'EXECUTE'
    )
  end,
  'service_role can execute MOV-16 finalize boundary'
);

select * from finish();
rollback;
