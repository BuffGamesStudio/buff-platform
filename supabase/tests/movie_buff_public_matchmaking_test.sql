begin;
create extension if not exists pgtap;
select plan(26);

select has_column(
  'public',
  'game_rooms',
  'public_matchmaking_key',
  'public rooms persist a normalized compatibility key'
);

select has_function(
  'public',
  'movie_buff_public_match_size',
  array[]::text[],
  'strict public match size helper exists'
);
select has_function(
  'public',
  'movie_buff_public_compatibility_key',
  array['uuid','text','integer'],
  'compatibility-key helper exists'
);
select has_function(
  'public',
  'assert_movie_buff_strict_three_ready',
  array['uuid'],
  'strict-three readiness assertion exists'
);
select has_function(
  'public',
  'find_or_create_movie_buff_public_room',
  array['uuid','text','integer','integer'],
  'atomic public admission function exists'
);
select has_function(
  'public',
  'set_movie_buff_player_ready',
  array['uuid','boolean'],
  'ready function exists'
);
select has_function(
  'public',
  'start_movie_buff_match',
  array['uuid'],
  'start function exists'
);

select is(
  public.movie_buff_public_match_size(),
  3,
  'public match size is exactly three'
);

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
  has_function_privilege(
    'anon',
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)',
    'EXECUTE'
  ),
  false,
  'anon cannot call public matchmaking'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)',
    'EXECUTE'
  ),
  true,
  'authenticated players can call public matchmaking'
);
select is(
  has_function_privilege(
    'anon',
    'public.set_movie_buff_player_ready(uuid,boolean)',
    'EXECUTE'
  ),
  false,
  'anon cannot change ready state'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.set_movie_buff_player_ready(uuid,boolean)',
    'EXECUTE'
  ),
  true,
  'authenticated players can change their ready state'
);
select is(
  has_function_privilege(
    'anon',
    'public.start_movie_buff_match(uuid)',
    'EXECUTE'
  ),
  false,
  'anon cannot start a match'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.assert_movie_buff_strict_three_ready(uuid)',
    'EXECUTE'
  ),
  false,
  'internal readiness assertion is not browser callable'
);

select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure),
  'matchmaking function is security definer'
);
select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure),
  'ready function is security definer'
);
select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'start function is security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',')
   from pg_catalog.pg_proc as p
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure),
  'search_path=pg_catalog',
  'matchmaking function has fixed pg_catalog search path'
);
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',')
   from pg_catalog.pg_proc as p
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure),
  'search_path=pg_catalog',
  'ready function has fixed pg_catalog search path'
);
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',')
   from pg_catalog.pg_proc as p
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'search_path=pg_catalog',
  'start function has fixed pg_catalog search path'
);

select is(
  (select r.rolname
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure),
  'postgres',
  'matchmaking function owner is postgres'
);
select is(
  (select r.rolname
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.set_movie_buff_player_ready(uuid,boolean)'::regprocedure),
  'postgres',
  'ready function owner is postgres'
);
select is(
  (select r.rolname
   from pg_catalog.pg_proc as p
   join pg_catalog.pg_roles as r on r.oid = p.proowner
   where p.oid = 'public.start_movie_buff_match(uuid)'::regprocedure),
  'postgres',
  'start function owner is postgres'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure
  ) !~* 'skip[[:space:]]+locked',
  'matchmaking never skips a locked compatible room'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'::regprocedure
  ) ~ 'movie-buff-public-compatibility',
  'compatibility admission uses an advisory transaction lock'
);

select * from finish();
rollback;
