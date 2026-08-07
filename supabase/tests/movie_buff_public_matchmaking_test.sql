begin;
create extension if not exists pgtap;
select plan(20);

select has_column(
  'public', 'game_rooms', 'public_matchmaking_key',
  'public rooms persist a normalized compatibility key'
);

select has_function('public', 'movie_buff_public_match_size', array[]::text[], 'strict size helper exists');
select has_function('public', 'movie_buff_public_compatibility_key', array['uuid','text','integer'], 'compatibility helper exists');
select has_function('public', 'assert_movie_buff_strict_three_ready', array['uuid'], 'strict readiness assertion exists');
select has_function('public', 'find_or_create_movie_buff_public_room', array['uuid','text','integer','integer'], 'atomic admission exists');
select has_function('public', 'set_movie_buff_player_ready', array['uuid','boolean'], 'ready RPC exists');
select has_function('public', 'start_movie_buff_match', array['uuid'], 'start RPC exists');

select is(public.movie_buff_public_match_size(), 3, 'public match size is exactly three');

select ok(
  to_regclass('public.game_rooms_one_public_waiting_compatibility_key_idx') is not null,
  'one waiting room per compatibility key index exists'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.game_rooms'::regclass
      and c.conname = 'movie_buff_public_waiting_room_key_required'
  ),
  'waiting-room compatibility constraint exists'
);

select is(
  has_function_privilege('anon', 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)', 'EXECUTE'),
  false,
  'anon cannot call public matchmaking'
);
select is(
  has_function_privilege('authenticated', 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)', 'EXECUTE'),
  true,
  'authenticated players can call public matchmaking'
);
select is(
  has_function_privilege('anon', 'public.set_movie_buff_player_ready(uuid,boolean)', 'EXECUTE'),
  false,
  'anon cannot change ready state'
);
select is(
  has_function_privilege('authenticated', 'public.set_movie_buff_player_ready(uuid,boolean)', 'EXECUTE'),
  true,
  'authenticated players can change ready state'
);
select is(
  has_function_privilege('anon', 'public.start_movie_buff_match(uuid)', 'EXECUTE'),
  false,
  'anon cannot start a match'
);
select is(
  has_function_privilege('authenticated', 'public.assert_movie_buff_strict_three_ready(uuid)', 'EXECUTE'),
  false,
  'internal readiness assertion is not browser callable'
);

select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure)
  and
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure)
  and
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'browser-callable matchmaking functions are security definer'
);

select ok(
  (select pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=pg_catalog'
   from pg_catalog.pg_proc as p
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure)
  and
  (select pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=pg_catalog'
   from pg_catalog.pg_proc as p
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure)
  and
  (select pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=pg_catalog'
   from pg_catalog.pg_proc as p
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'browser-callable matchmaking functions have fixed pg_catalog search paths'
);

select ok(
  (select r.rolname = 'postgres'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure)
  and
  (select r.rolname = 'postgres'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure)
  and
  (select r.rolname = 'postgres'
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'browser-callable matchmaking functions are owned by postgres'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure
  ) !~* 'for[[:space:]]+update[[:space:]]+skip[[:space:]]+locked'
  and
  pg_catalog.pg_get_functiondef(
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure
  ) ~ 'movie-buff-public-compatibility',
  'admission waits on one compatibility lock and never uses SKIP LOCKED'
);

select * from finish();
rollback;
