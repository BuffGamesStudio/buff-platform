begin;

create extension if not exists pgtap with schema extensions;
select plan(111);

-- Six exposed tables: object presence, RLS, minimum grants, and policy shape.
with targets(table_name) as (
  values
    ('match_round_player_hints'),
    ('match_round_player_playback'),
    ('movie_buff_boards'),
    ('movie_buff_board_categories'),
    ('movie_buff_board_tiles'),
    ('movie_buff_board_events')
)
select extensions.has_table(
  'public',
  table_name,
  format('public.%s exists', table_name)
)
from targets;

with targets(table_name) as (
  values
    ('match_round_player_hints'),
    ('match_round_player_playback'),
    ('movie_buff_boards'),
    ('movie_buff_board_categories'),
    ('movie_buff_board_tiles'),
    ('movie_buff_board_events')
)
select extensions.ok(
  coalesce(c.relrowsecurity, false),
  format('public.%s has RLS enabled', targets.table_name)
)
from targets
left join pg_catalog.pg_class c
  on c.oid = pg_catalog.to_regclass(format('public.%I', targets.table_name));

with targets(table_name) as (
  values
    ('match_round_player_hints'),
    ('match_round_player_playback'),
    ('movie_buff_boards'),
    ('movie_buff_board_categories'),
    ('movie_buff_board_tiles'),
    ('movie_buff_board_events')
), privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select extensions.ok(
  not coalesce(
    pg_catalog.has_table_privilege(
      'anon',
      format('public.%I', targets.table_name),
      privileges.privilege_name
    ),
    false
  ),
  format(
    'anon lacks %s on public.%s',
    privileges.privilege_name,
    targets.table_name
  )
)
from targets
cross join privileges;

with targets(table_name) as (
  values
    ('match_round_player_hints'),
    ('match_round_player_playback'),
    ('movie_buff_boards'),
    ('movie_buff_board_categories'),
    ('movie_buff_board_tiles'),
    ('movie_buff_board_events')
), privileges(privilege_name) as (
  values ('INSERT'), ('UPDATE'), ('DELETE')
)
select extensions.ok(
  not coalesce(
    pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', targets.table_name),
      privileges.privilege_name
    ),
    false
  ),
  format(
    'authenticated lacks direct %s on public.%s',
    privileges.privilege_name,
    targets.table_name
  )
)
from targets
cross join privileges;

with readable(table_name) as (
  values
    ('match_round_player_hints'),
    ('match_round_player_playback'),
    ('movie_buff_boards'),
    ('movie_buff_board_categories'),
    ('movie_buff_board_tiles')
)
select extensions.ok(
  coalesce(
    pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', readable.table_name),
      'SELECT'
    ),
    false
  ),
  format('authenticated retains intended SELECT on public.%s', readable.table_name)
)
from readable;

select extensions.ok(
  not coalesce(
    pg_catalog.has_table_privilege(
      'authenticated',
      'public.movie_buff_board_events',
      'SELECT'
    ),
    false
  ),
  'authenticated cannot directly read unfiltered movie_buff_board_events payloads'
);

with targets(table_name, minimum_policy_count) as (
  values
    ('match_round_player_hints', 1),
    ('match_round_player_playback', 1),
    ('movie_buff_boards', 1),
    ('movie_buff_board_categories', 1),
    ('movie_buff_board_tiles', 1),
    ('movie_buff_board_events', 0)
)
select extensions.ok(
  (
    select count(*)
    from pg_catalog.pg_policy p
    where p.polrelid = pg_catalog.to_regclass(format('public.%I', targets.table_name))
  ) >= targets.minimum_policy_count,
  format(
    'public.%s has the required minimum policy count %s',
    targets.table_name,
    targets.minimum_policy_count
  )
)
from targets;

-- High-risk RPC floor. Authenticated grants are deliberately not blanket-
-- asserted here; each must be reconciled with intended call sites and internal
-- authorization. Anonymous execution, mutable search_path, and service-role
-- discontinuity are always failures for these privileged routines.
with functions(signature) as (
  values
    ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
    ('public.join_movie_buff_room(text)'),
    ('public.advance_movie_buff_round(uuid)'),
    ('public.mark_movie_buff_round_media_ready(uuid)'),
    ('public.prepare_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_match(uuid)'),
    ('public.submit_movie_buff_answer(uuid,text)'),
    ('public.use_movie_buff_round_hint(uuid,integer)')
)
select extensions.ok(
  pg_catalog.to_regprocedure(signature) is not null,
  format('%s exists', signature)
)
from functions;

with functions(signature) as (
  values
    ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
    ('public.join_movie_buff_room(text)'),
    ('public.advance_movie_buff_round(uuid)'),
    ('public.mark_movie_buff_round_media_ready(uuid)'),
    ('public.prepare_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_match(uuid)'),
    ('public.submit_movie_buff_answer(uuid,text)'),
    ('public.use_movie_buff_round_hint(uuid,integer)')
)
select extensions.ok(
  coalesce(p.prosecdef, false),
  format('%s is SECURITY DEFINER', functions.signature)
)
from functions
left join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(functions.signature);

with functions(signature) as (
  values
    ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
    ('public.join_movie_buff_room(text)'),
    ('public.advance_movie_buff_round(uuid)'),
    ('public.mark_movie_buff_round_media_ready(uuid)'),
    ('public.prepare_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_match(uuid)'),
    ('public.submit_movie_buff_answer(uuid,text)'),
    ('public.use_movie_buff_round_hint(uuid,integer)')
)
select extensions.ok(
  coalesce(
    exists (
      select 1
      from pg_catalog.unnest(p.proconfig) as setting
      where setting in ('search_path=pg_catalog', 'search_path=')
    ),
    false
  ),
  format('%s has a fixed safe search_path', functions.signature)
)
from functions
left join pg_catalog.pg_proc p
  on p.oid = pg_catalog.to_regprocedure(functions.signature);

with functions(signature) as (
  values
    ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
    ('public.join_movie_buff_room(text)'),
    ('public.advance_movie_buff_round(uuid)'),
    ('public.mark_movie_buff_round_media_ready(uuid)'),
    ('public.prepare_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_match(uuid)'),
    ('public.submit_movie_buff_answer(uuid,text)'),
    ('public.use_movie_buff_round_hint(uuid,integer)')
)
select extensions.ok(
  not coalesce(
    pg_catalog.has_function_privilege(
      'anon',
      pg_catalog.to_regprocedure(functions.signature),
      'EXECUTE'
    ),
    false
  ),
  format('anon cannot execute %s', functions.signature)
)
from functions;

with functions(signature) as (
  values
    ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
    ('public.join_movie_buff_room(text)'),
    ('public.advance_movie_buff_round(uuid)'),
    ('public.mark_movie_buff_round_media_ready(uuid)'),
    ('public.prepare_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_round_playback(uuid)'),
    ('public.start_movie_buff_match(uuid)'),
    ('public.submit_movie_buff_answer(uuid,text)'),
    ('public.use_movie_buff_round_hint(uuid,integer)')
)
select extensions.ok(
  coalesce(
    pg_catalog.has_function_privilege(
      'service_role',
      pg_catalog.to_regprocedure(functions.signature),
      'EXECUTE'
    ),
    false
  ),
  format('service_role retains EXECUTE on %s', functions.signature)
)
from functions;

select * from extensions.finish();
rollback;
