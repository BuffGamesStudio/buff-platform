begin;
create extension if not exists pgtap;
select plan(13);

select has_function(
  'public',
  'submit_movie_buff_answer',
  array['uuid','text'],
  'caller-safe answer RPC exists'
);
select has_function(
  'public',
  'submit_movie_buff_answer_legacy_unchecked',
  array['uuid','text'],
  'legacy implementation remains available only behind the wrapper'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.submit_movie_buff_answer(uuid,text)'::regprocedure),
  true,
  'answer wrapper is SECURITY DEFINER'
);
select is(
  (select proowner::regrole::text from pg_proc where oid = 'public.submit_movie_buff_answer(uuid,text)'::regprocedure),
  'postgres',
  'answer wrapper owner is postgres'
);
select is(
  (select coalesce(proconfig,array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.submit_movie_buff_answer(uuid,text)'::regprocedure),
  true,
  'answer wrapper has fixed pg_catalog search path'
);
select is(
  has_function_privilege('anon','public.submit_movie_buff_answer(uuid,text)','EXECUTE'),
  false,
  'anon cannot submit an answer'
);
select is(
  has_function_privilege('authenticated','public.submit_movie_buff_answer(uuid,text)','EXECUTE'),
  true,
  'authenticated player may call the guarded answer wrapper'
);
select is(
  has_function_privilege('service_role','public.submit_movie_buff_answer(uuid,text)','EXECUTE'),
  true,
  'service role retains guarded answer continuity'
);
select is(
  has_function_privilege('anon','public.submit_movie_buff_answer_legacy_unchecked(uuid,text)','EXECUTE'),
  false,
  'anon cannot bypass the wrapper'
);
select is(
  has_function_privilege('authenticated','public.submit_movie_buff_answer_legacy_unchecked(uuid,text)','EXECUTE'),
  false,
  'authenticated caller cannot bypass the wrapper'
);
select is(
  has_function_privilege('service_role','public.submit_movie_buff_answer_legacy_unchecked(uuid,text)','EXECUTE'),
  false,
  'service role cannot bypass the wrapper'
);
select ok(
  position('v_state.phase <> ''answer''' in pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure)) > 0
  and position('answer_deadline_at is null' in pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure)) > 0
  and position('Movie Buff answer window is not open' in pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure)) > 0,
  'wrapper rejects non-answer or expired phases before legacy lookup'
);
select ok(
  position('submit_movie_buff_answer_legacy_unchecked' in pg_get_functiondef('public.submit_movie_buff_answer(uuid,text)'::regprocedure)) > 0,
  'wrapper delegates only after authoritative phase validation'
);

select * from finish();
rollback;
