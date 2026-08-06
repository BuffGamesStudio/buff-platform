begin;
create extension if not exists pgtap;
select plan(25);

select ok(
  pg_catalog.to_regnamespace('movie_buff_security') is not null,
  'private Movie Buff policy-helper schema exists'
);

select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_room_member(uuid)') is not null,
  'active_room_member helper exists'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_board_member(uuid)') is not null,
  'active_board_member helper exists'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_round_member(uuid)') is not null,
  'active_round_member helper exists'
);

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select is(
  pg_catalog.pg_get_userbyid(p.proowner),
  'postgres',
  format('%s is owned by postgres', helpers.identity)
)
from helpers
join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(helpers.identity);

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select ok(
  p.prosecdef,
  format('%s is SECURITY DEFINER', helpers.identity)
)
from helpers
join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(helpers.identity);

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select is(
  p.proconfig,
  array['search_path=pg_catalog']::text[],
  format('%s has exact pg_catalog search_path', helpers.identity)
)
from helpers
join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(helpers.identity);

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    pg_catalog.to_regprocedure(helpers.identity),
    'EXECUTE'
  ),
  format('authenticated may invoke %s only as an RLS dependency', helpers.identity)
)
from helpers;

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    pg_catalog.to_regprocedure(helpers.identity),
    'EXECUTE'
  ),
  format('anon cannot invoke %s', helpers.identity)
)
from helpers;

with helpers(identity) as (
  values
    ('movie_buff_security.active_room_member(uuid)'),
    ('movie_buff_security.active_board_member(uuid)'),
    ('movie_buff_security.active_round_member(uuid)')
)
select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    pg_catalog.to_regprocedure(helpers.identity),
    'EXECUTE'
  ),
  format('service_role may invoke %s', helpers.identity)
)
from helpers;

select ok(
  pg_catalog.has_schema_privilege('authenticated','movie_buff_security','USAGE'),
  'authenticated has schema USAGE for policy evaluation'
);
select ok(
  not pg_catalog.has_schema_privilege('authenticated','movie_buff_security','CREATE'),
  'authenticated cannot create objects in policy-helper schema'
);
select ok(
  not pg_catalog.has_schema_privilege('anon','movie_buff_security','USAGE'),
  'anon has no policy-helper schema usage'
);

select * from finish();
rollback;
