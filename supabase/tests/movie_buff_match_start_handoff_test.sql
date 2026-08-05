begin;
create extension if not exists pgtap;
select plan(14);

select has_function(
  'public',
  'begin_movie_buff_match_from_admission',
  array['uuid'],
  'authoritative admission handoff exists'
);
select has_function(
  'public',
  'start_movie_buff_match',
  array['uuid'],
  'public match-start wrapper exists'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
  ),
  true,
  'authoritative admission handoff is SECURITY DEFINER'
);
select is(
  (
    select proowner::regrole::text
    from pg_proc
    where oid = 'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
  ),
  'postgres',
  'authoritative admission handoff is postgres owned'
);
select is(
  (
    select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog']
    from pg_proc
    where oid = 'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
  ),
  true,
  'authoritative admission handoff has a fixed search path'
);
select is(
  (
    select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog']
    from pg_proc
    where oid = 'public.start_movie_buff_match(uuid)'::regprocedure
  ),
  true,
  'public match-start wrapper has a fixed search path'
);

select is(
  has_function_privilege(
    'anon',
    'public.begin_movie_buff_match_from_admission(uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute the internal handoff'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.begin_movie_buff_match_from_admission(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute the internal handoff directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.begin_movie_buff_match_from_admission(uuid)',
    'EXECUTE'
  ),
  true,
  'service role retains explicit internal handoff continuity'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.start_movie_buff_match(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated callers can request the public wrapper'
);
select is(
  has_function_privilege(
    'anon',
    'public.start_movie_buff_match(uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot request match start'
);

select ok(
  position(
    'insert into public.match_rounds'
    in pg_get_functiondef(
      'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'v_match.id,\n      null,\n      1,\n      30,\n      null'
    in pg_get_functiondef(
      'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
    )
  ) > 0,
  'authoritative start creates an inert first-round shell'
);
select ok(
  position(
    'pick_movie_buff_clip'
    in pg_get_functiondef(
      'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
    )
  ) = 0,
  'authoritative start does not select a clip'
);
select ok(
  position(
    'ensure_movie_buff_match_phase_state(p_room_id)'
    in pg_get_functiondef(
      'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
    )
  ) > 0
  and position(
    'started_at = v_state.phase_started_at'
    in pg_get_functiondef(
      'public.begin_movie_buff_match_from_admission(uuid)'::regprocedure
    )
  ) > 0,
  'canonical round intro owns room activation time'
);

select * from finish();
rollback;
