begin;
create extension if not exists pgtap;
select no_plan();

-- The exact browser-callable SECURITY DEFINER allowlist after removing the
-- three internal timing/completion helpers. Every identity is reviewed below.
create temporary table expected_movie_buff_browser_rpc (
  identity text primary key,
  boundary text not null
) on commit drop;

insert into expected_movie_buff_browser_rpc(identity, boundary) values
  ('activate_movie_buff_round_vip(uuid,uuid,text)','auth_uid_plus_room_membership'),
  ('advance_movie_buff_match_phase(uuid,bigint)','movie_buff_phase_require_access'),
  ('confirm_movie_buff_active_leave(uuid,text,text)','movie_buff_phase_require_access'),
  ('find_or_create_movie_buff_public_room(uuid,text,integer,integer)','auth_uid_queue_or_room_assignment'),
  ('get_movie_buff_active_leave_quote(uuid)','movie_buff_phase_require_access'),
  ('get_movie_buff_final_results(uuid)','auth_uid_plus_room_membership'),
  ('get_movie_buff_match_phase_view(uuid)','movie_buff_phase_require_access'),
  ('get_movie_buff_round_results(uuid,uuid)','auth_uid_plus_room_membership'),
  ('get_movie_buff_round_results(uuid)','auth_uid_plus_room_membership'),
  ('get_movie_buff_round(uuid)','auth_uid_plus_room_membership'),
  ('get_movie_buff_vip_round_view(uuid,uuid)','auth_uid_plus_room_membership'),
  ('is_buff_content_manager()','auth_uid_self_profile_role'),
  ('join_movie_buff_room(text)','auth_uid_plus_room_membership'),
  ('leave_movie_buff_room(uuid)','auth_uid_plus_room_membership'),
  ('lock_movie_buff_round_vip(uuid,uuid,uuid,text)','auth_uid_plus_room_membership'),
  ('mark_movie_buff_round_media_ready(uuid)','movie_buff_phase_require_access'),
  ('select_movie_buff_match_tile(uuid,uuid,bigint,text)','movie_buff_phase_require_access'),
  ('set_movie_buff_player_ready(uuid,boolean)','auth_uid_plus_room_membership'),
  ('submit_movie_buff_answer(uuid,text)','auth_uid_plus_room_membership'),
  ('touch_movie_buff_match_participant(uuid)','movie_buff_phase_require_access'),
  ('touch_movie_buff_room_presence(uuid)','auth_uid_plus_room_membership'),
  ('use_movie_buff_round_hint(uuid,integer)','auth_uid_plus_room_membership');

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
  ),
  22,
  'exactly twenty-two reviewed public SECURITY DEFINER RPCs remain browser callable'
);

select is(
  (
    select count(*)::integer
    from (
      select p.oid::regprocedure::text as identity
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'execute')
      except
      select identity from expected_movie_buff_browser_rpc
    ) unexpected
  ),
  0,
  'no unreviewed authenticated-callable SECURITY DEFINER RPC exists'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_browser_rpc expected
    left join pg_proc p on p.oid = to_regprocedure('public.' || expected.identity)
    where p.oid is null
  ),
  0,
  'every reviewed browser RPC exists at its exact regprocedure identity'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_browser_rpc expected
    join pg_proc p on p.oid = to_regprocedure('public.' || expected.identity)
    where pg_get_userbyid(p.proowner) <> 'postgres'
       or p.proconfig is distinct from array['search_path=pg_catalog, public']::text[]
       or has_function_privilege('public', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute')
       or not has_function_privilege('authenticated', p.oid, 'execute')
       or not has_function_privilege('service_role', p.oid, 'execute')
  ),
  0,
  'all reviewed browser RPCs have postgres owner, fixed search_path, and exact persona grants'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_browser_rpc expected
    join pg_proc p on p.oid = to_regprocedure('public.' || expected.identity)
    where expected.boundary = 'movie_buff_phase_require_access'
      and position('movie_buff_phase_require_access' in pg_get_functiondef(p.oid)) = 0
  ),
  0,
  'all phase-access-classified RPCs call the authoritative room-access guard'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_browser_rpc expected
    join pg_proc p on p.oid = to_regprocedure('public.' || expected.identity)
    where expected.boundary = 'auth_uid_plus_room_membership'
      and (
        position('auth.uid()' in pg_get_functiondef(p.oid)) = 0
        or position('room_players' in pg_get_functiondef(p.oid)) = 0
      )
  ),
  0,
  'all direct membership-classified RPCs bind auth.uid to room membership'
);

select like(
  pg_get_functiondef('public.is_buff_content_manager()'::regprocedure),
  '%auth.uid()%',
  'content-manager predicate binds evaluation to the caller identity'
);
select like(
  pg_get_functiondef('public.is_buff_content_manager()'::regprocedure),
  '%public.profiles%',
  'content-manager predicate reads only the qualified caller profile relation'
);

-- Internal helpers remain available to SECURITY DEFINER owners/service workers,
-- but cannot be invoked directly by a browser persona.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  ),
  'authenticated cannot directly execute round-completion helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  ),
  'authenticated cannot directly execute player-time helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  ),
  'authenticated cannot directly execute player-finished helper'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'::regprocedure,
    'execute'
  ),
  'service-role continuity is preserved for internal helpers'
);

-- All advisor-identified internal tables have explicit restrictive browser
-- denial, FORCE RLS, and no direct anon/authenticated DML grants.
create temporary table expected_movie_buff_internal_table(name text primary key) on commit drop;
insert into expected_movie_buff_internal_table(name) values
  ('movie_buff_abandonment_ledger'),
  ('movie_buff_board_events'),
  ('movie_buff_match_participant_seats'),
  ('movie_buff_match_playbacks'),
  ('movie_buff_match_rounds'),
  ('movie_buff_match_state'),
  ('movie_buff_penalty_config'),
  ('movie_buff_phase_idempotency'),
  ('movie_buff_round_player_answers'),
  ('movie_buff_round_player_media'),
  ('movie_buff_round_results'),
  ('movie_buff_rounds'),
  ('movie_buff_selection_idempotency'),
  ('movie_buff_vip_round_required_players'),
  ('movie_buff_vip_round_windows');

select is(
  (
    select count(*)::integer
    from expected_movie_buff_internal_table expected
    join pg_class c on c.oid = to_regclass('public.' || expected.name)
    where c.relrowsecurity and c.relforcerowsecurity
  ),
  15,
  'all fifteen internal tables have RLS and FORCE RLS enabled'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_internal_table expected
    join pg_class c on c.oid = to_regclass('public.' || expected.name)
    join pg_policy pol on pol.polrelid = c.oid
    where pol.polname = 'movie_buff_internal_browser_deny'
      and pol.polpermissive = false
      and pg_get_expr(pol.polqual, pol.polrelid) = 'false'
      and pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false'
  ),
  15,
  'all fifteen internal tables have one explicit restrictive false/false policy'
);

select is(
  (
    select count(*)::integer
    from expected_movie_buff_internal_table expected
    where has_table_privilege('anon', to_regclass('public.' || expected.name), 'select')
       or has_table_privilege('anon', to_regclass('public.' || expected.name), 'insert')
       or has_table_privilege('anon', to_regclass('public.' || expected.name), 'update')
       or has_table_privilege('anon', to_regclass('public.' || expected.name), 'delete')
       or has_table_privilege('authenticated', to_regclass('public.' || expected.name), 'select')
       or has_table_privilege('authenticated', to_regclass('public.' || expected.name), 'insert')
       or has_table_privilege('authenticated', to_regclass('public.' || expected.name), 'update')
       or has_table_privilege('authenticated', to_regclass('public.' || expected.name), 'delete')
  ),
  0,
  'no internal table exposes direct browser DML privileges'
);

-- Executed cross-room negative path for the media-ready mutation. These fixed
-- fixture identities exist only inside this transaction and are rolled back.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000091001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','clearance-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000091002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','clearance-b@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;

insert into public.game_rooms (
  id, room_code, host_id, room_type, status, max_players, total_rounds, current_round
)
values
  ('00000000-0000-0000-0000-000000092001','CLRRA','00000000-0000-0000-0000-000000091001','private','active',3,10,1),
  ('00000000-0000-0000-0000-000000092002','CLRRB','00000000-0000-0000-0000-000000091002','private','active',3,10,1);

insert into public.room_players (
  room_id, player_id, is_ready, is_host, left_at, last_seen_at
)
values
  ('00000000-0000-0000-0000-000000092001','00000000-0000-0000-0000-000000091001',true,true,null,now()),
  ('00000000-0000-0000-0000-000000092002','00000000-0000-0000-0000-000000091002',true,true,null,now());

insert into public.matches (id, room_id, status)
values
  ('00000000-0000-0000-0000-000000093001','00000000-0000-0000-0000-000000092001','active'),
  ('00000000-0000-0000-0000-000000093002','00000000-0000-0000-0000-000000092002','active');

insert into public.match_rounds (id, match_id, round_number)
values
  ('00000000-0000-0000-0000-000000094001','00000000-0000-0000-0000-000000093001',1),
  ('00000000-0000-0000-0000-000000094002','00000000-0000-0000-0000-000000093002',1);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000091002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000091002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok(
  $$select * from public.mark_movie_buff_round_media_ready('00000000-0000-0000-0000-000000092001')$$,
  'P0001',
  'Active Movie Buff room membership required.',
  'other-room authenticated caller cannot mutate media-ready state'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.match_round_player_playback
    where round_id = '00000000-0000-0000-0000-000000094001'
      and player_id = '00000000-0000-0000-0000-000000091002'
  ),
  0,
  'denied cross-room call leaves no playback mutation'
);

select * from finish();
rollback;
