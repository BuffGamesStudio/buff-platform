begin;
create extension if not exists pgtap;
select plan(10);

select has_table(
  'public',
  'movie_buff_leave_penalty_policies',
  'containment preserves policy identity'
);
select has_table(
  'public',
  'movie_buff_active_leave_quotes',
  'containment preserves quote evidence'
);
select has_table(
  'public',
  'movie_buff_leave_penalty_ledger',
  'containment preserves immutable penalty evidence'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_movie_buff_active_leave_quote(uuid)',
    'EXECUTE'
  ),
  'containment revokes authenticated quote execution'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.confirm_movie_buff_active_leave(uuid,text)',
    'EXECUTE'
  ),
  'containment revokes authenticated confirm execution'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_movie_buff_active_leave_quote(uuid)',
    'EXECUTE'
  ),
  'service role retains fail-closed quote diagnostic execution'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.confirm_movie_buff_active_leave(uuid,text)',
    'EXECUTE'
  ),
  'service role retains fail-closed confirm diagnostic execution'
);

select ok(
  position(
    'Movie Buff active-leave containment is active.'
    in pg_catalog.pg_get_functiondef(
      'public.get_movie_buff_active_leave_quote(uuid)'::regprocedure
    )
  ) > 0,
  'quote function fails closed under containment'
);
select ok(
  position(
    'Movie Buff active-leave containment is active.'
    in pg_catalog.pg_get_functiondef(
      'public.confirm_movie_buff_active_leave(uuid,text)'::regprocedure
    )
  ) > 0,
  'confirm function fails closed under containment'
);
select is(
  public.movie_buff_activate_ready_busters(
    '00000000-0000-4000-8000-000000000001'::uuid
  ),
  0,
  'containment suspends automatic Buster takeover'
);

select * from finish();
rollback;
