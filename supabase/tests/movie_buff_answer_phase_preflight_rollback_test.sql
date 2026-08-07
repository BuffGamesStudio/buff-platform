begin;
create extension if not exists pgtap;
select plan(6);

select has_function(
  'public',
  'submit_movie_buff_answer',
  array['uuid','text'],
  'legacy answer RPC identity is restored'
);
select is(
  to_regprocedure('public.submit_movie_buff_answer_legacy_unchecked(uuid,text)') is null,
  true,
  'temporary legacy alias is removed'
);
select is(
  has_function_privilege('anon','public.submit_movie_buff_answer(uuid,text)','EXECUTE'),
  false,
  'anon remains denied after rollback'
);
select is(
  has_function_privilege('authenticated','public.submit_movie_buff_answer(uuid,text)','EXECUTE'),
  true,
  'authenticated caller regains the preceding RPC contract'
);
select ok(
  position('submit_movie_buff_answer_legacy_unchecked' in pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure)) = 0,
  'rollback removes wrapper delegation'
);
select ok(
  position('delete from' in lower(pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure))) = 0,
  'restored answer function does not introduce destructive rollback behavior'
);

select * from finish();
rollback;
