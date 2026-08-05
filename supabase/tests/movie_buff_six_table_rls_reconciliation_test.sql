begin;

select plan(25);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.match_round_player_hints'::regclass),
  'match_round_player_hints has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.match_round_player_playback'::regclass),
  'match_round_player_playback has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.movie_buff_boards'::regclass),
  'movie_buff_boards has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.movie_buff_board_categories'::regclass),
  'movie_buff_board_categories has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.movie_buff_board_tiles'::regclass),
  'movie_buff_board_tiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.movie_buff_board_events'::regclass),
  'movie_buff_board_events has RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.match_round_player_hints', 'SELECT'),
  'authenticated can select own hint rows through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.match_round_player_playback', 'SELECT'),
  'authenticated can select own playback rows through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.movie_buff_boards', 'SELECT'),
  'authenticated can select member-visible boards through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.movie_buff_board_categories', 'SELECT'),
  'authenticated can select member-visible board categories through RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.movie_buff_board_tiles', 'SELECT'),
  'authenticated can select member-visible board tiles through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.movie_buff_board_events', 'SELECT'),
  'board event payloads remain server-only'
);

select ok(
  has_table_privilege('service_role', 'public.match_round_player_hints', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full hint-table continuity'
);
select ok(
  has_table_privilege('service_role', 'public.match_round_player_playback', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full playback-table continuity'
);
select ok(
  has_table_privilege('service_role', 'public.movie_buff_boards', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full board-table continuity'
);
select ok(
  has_table_privilege('service_role', 'public.movie_buff_board_categories', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full board-category continuity'
);
select ok(
  has_table_privilege('service_role', 'public.movie_buff_board_tiles', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full board-tile continuity'
);
select ok(
  has_table_privilege('service_role', 'public.movie_buff_board_events', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role keeps full board-event continuity'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'movie_buff_boards'
      and policyname = 'movie_buff_boards_select_active_member'
      and cmd = 'SELECT'
  ),
  'board active-member policy exists'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'movie_buff_board_categories'
      and policyname = 'movie_buff_board_categories_select_active_member'
      and cmd = 'SELECT'
  ),
  'board category active-member policy exists'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'movie_buff_board_tiles'
      and policyname = 'movie_buff_board_tiles_select_active_member'
      and cmd = 'SELECT'
  ),
  'board tile active-member policy exists'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'match_round_player_hints'
      and policyname = 'match_round_player_hints_select_self'
      and cmd = 'SELECT'
  ),
  'hint self-only policy exists'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'match_round_player_playback'
      and policyname = 'match_round_player_playback_select_self'
      and cmd = 'SELECT'
  ),
  'playback self-only policy exists'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.match_round_player_hints',
      'public.match_round_player_playback',
      'public.movie_buff_boards',
      'public.movie_buff_board_categories',
      'public.movie_buff_board_tiles',
      'public.movie_buff_board_events'
    ]) as target(table_name)
    where has_table_privilege('anon', target.table_name, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'anon has no direct CRUD on the six tables'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'public.match_round_player_hints',
      'public.match_round_player_playback',
      'public.movie_buff_boards',
      'public.movie_buff_board_categories',
      'public.movie_buff_board_tiles',
      'public.movie_buff_board_events'
    ]) as target(table_name)
    where has_table_privilege('public', target.table_name, 'SELECT,INSERT,UPDATE,DELETE')
  ),
  'PUBLIC has no direct CRUD on the six tables'
);

select * from finish();
rollback;
