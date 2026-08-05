begin;
create extension if not exists pgtap;
select plan(4);

select ok(
  position(
    'reconnect_deadline_at <= v_now'
    in pg_get_functiondef(
      'public.touch_movie_buff_match_participant(uuid)'::regprocedure
    )
  ) = 0,
  'rollback removes the repaired expired-deadline branch'
);

select ok(
  position(
    'v_state.phase not in'
    in pg_get_functiondef(
      'public.movie_buff_activate_ready_busters(uuid)'::regprocedure
    )
  ) > 0,
  'rollback restores the preceding multi-boundary Buster definition'
);

select ok(
  position(
    '''vip_lock'''
    in pg_get_functiondef(
      'public.movie_buff_activate_ready_busters(uuid)'::regprocedure
    )
  ) > 0,
  'rollback restores vip_lock in the preceding Buster boundary set'
);

select is(
  (
    select count(*)::integer
    from public.movie_buff_match_participant_seats
  ),
  0,
  'rollback rehearsal creates no participant-seat data'
);

select * from finish();
rollback;
