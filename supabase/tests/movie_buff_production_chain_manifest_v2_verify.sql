-- HISTORICAL-ONLY read-only verifier for Movie Buff expected-state manifest v2.
-- This file intentionally validates the pre-v3 contract and must not be used
-- as the final successor-state acceptance proof. Current successor acceptance
-- uses movie_buff_production_chain_successor_manifest_v3_verify.sql.
-- Expected manifest SHA-256:
-- a2357ac91b5a00e98d0f0a30bd69b8fe901cbfb97b484885a39577fce3ac0adb
--
-- Persistent catalog/data are not mutated. Temporary expectation tables exist
-- only inside this transaction and are rolled back at the end.

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

create temporary table expected_six_table_contract (
  table_name text primary key,
  policy_name text not null,
  authenticated_select boolean not null,
  policy_kind text not null
) on commit drop;

insert into expected_six_table_contract values
  ('match_round_player_hints','match_round_player_hints_select_self',true,'self_round'),
  ('match_round_player_playback','match_round_player_playback_select_self',true,'self_round'),
  ('movie_buff_boards','movie_buff_boards_select_active_member',true,'active_room'),
  ('movie_buff_board_categories','movie_buff_board_categories_select_active_member',true,'active_board'),
  ('movie_buff_board_tiles','movie_buff_board_tiles_select_active_member',true,'active_board'),
  ('movie_buff_board_events','movie_buff_internal_browser_deny',false,'restrictive_deny');

do $six_tables$
declare
  e record;
  v_oid oid;
  v_auth oid := (select oid from pg_catalog.pg_roles where rolname='authenticated');
  v_anon oid := (select oid from pg_catalog.pg_roles where rolname='anon');
  v_service oid := (select oid from pg_catalog.pg_roles where rolname='service_role');
  v_policy record;
  v_policy_count integer;
  v_direct_auth text[];
  v_direct_anon text[];
  v_direct_service text[];
  v_direct_public text[];
  v_expected_all text[] := array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
begin
  if v_auth is null or v_anon is null or v_service is null then
    raise exception 'Required API roles are missing.';
  end if;

  for e in select * from expected_six_table_contract order by table_name loop
    v_oid := pg_catalog.to_regclass(pg_catalog.format('public.%I',e.table_name));
    if v_oid is null then
      raise exception 'Manifest table is missing: public.%', e.table_name;
    end if;

    if not (
      select c.relrowsecurity and c.relforcerowsecurity
      from pg_catalog.pg_class c
      where c.oid=v_oid
    ) then
      raise exception 'RLS/FORCE RLS mismatch: public.%',e.table_name;
    end if;

    select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type),array[]::text[])
      into v_direct_public
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=v_oid and a.grantee=0;

    select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type),array[]::text[])
      into v_direct_anon
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=v_oid and a.grantee=v_anon;

    select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type),array[]::text[])
      into v_direct_auth
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=v_oid and a.grantee=v_auth;

    select coalesce(array_agg(distinct a.privilege_type order by a.privilege_type),array[]::text[])
      into v_direct_service
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
    where c.oid=v_oid and a.grantee=v_service;

    if cardinality(v_direct_public) <> 0 or cardinality(v_direct_anon) <> 0 then
      raise exception 'PUBLIC/anon direct table privileges remain on public.%',e.table_name;
    end if;

    if e.authenticated_select then
      if v_direct_auth is distinct from array['SELECT']::text[] then
        raise exception 'authenticated direct ACL mismatch on public.%: %',e.table_name,v_direct_auth;
      end if;
    elsif cardinality(v_direct_auth) <> 0 then
      raise exception 'authenticated must have no direct ACL on public.%: %',e.table_name,v_direct_auth;
    end if;

    if v_direct_service is distinct from v_expected_all then
      raise exception 'service_role ALL ACL mismatch on public.%: %',e.table_name,v_direct_service;
    end if;

    select count(*) into v_policy_count
    from pg_catalog.pg_policy p where p.polrelid=v_oid;
    if v_policy_count <> 1 then
      raise exception 'Expected exactly one policy on public.%, found %',e.table_name,v_policy_count;
    end if;

    select p.polname,p.polpermissive,p.polcmd,p.polroles,
           pg_catalog.pg_get_expr(p.polqual,p.polrelid) as using_expr,
           pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) as check_expr
      into v_policy
    from pg_catalog.pg_policy p
    where p.polrelid=v_oid;

    if v_policy.polname <> e.policy_name then
      raise exception 'Policy-name mismatch on public.%: %',e.table_name,v_policy.polname;
    end if;

    if e.policy_kind='restrictive_deny' then
      if v_policy.polpermissive
         or v_policy.polcmd <> '*'
         or not (v_policy.polroles @> array[v_auth,v_anon]::oid[] and cardinality(v_policy.polroles)=2)
         or v_policy.using_expr <> 'false'
         or v_policy.check_expr <> 'false' then
        raise exception 'Restrictive deny policy mismatch on public.%',e.table_name;
      end if;
    else
      if not v_policy.polpermissive
         or v_policy.polcmd <> 'r'
         or v_policy.polroles is distinct from array[v_auth]::oid[] then
        raise exception 'Authenticated SELECT policy metadata mismatch on public.%',e.table_name;
      end if;

      if e.policy_kind='self_round' and not (
        v_policy.using_expr ilike '%player_id%auth.uid%'
        and v_policy.using_expr ilike '%movie_buff_security.active_round_member%'
      ) then
        raise exception 'Self/active-round policy expression mismatch on public.%',e.table_name;
      end if;

      if e.policy_kind='active_room'
         and v_policy.using_expr not ilike '%movie_buff_security.active_room_member%'
      then
        raise exception 'Active-room policy expression mismatch on public.%',e.table_name;
      end if;

      if e.policy_kind='active_board'
         and v_policy.using_expr not ilike '%movie_buff_security.active_board_member%'
      then
        raise exception 'Active-board policy expression mismatch on public.%',e.table_name;
      end if;
    end if;
  end loop;
end;
$six_tables$;

create temporary table expected_critical_functions (
  identity text primary key,
  expected_search_path text not null,
  authenticated_execute boolean not null,
  service_role_execute boolean not null
) on commit drop;

insert into expected_critical_functions values
  ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)','search_path=pg_catalog',true,true),
  ('public.set_movie_buff_player_ready(uuid,boolean)','search_path=pg_catalog',true,true),
  ('public.get_movie_buff_match_phase_view(uuid)','search_path=pg_catalog',true,true),
  ('public.advance_movie_buff_match_phase(uuid,bigint)','search_path=pg_catalog',true,true),
  ('public.select_movie_buff_match_tile(uuid,uuid,bigint,text)','search_path=pg_catalog',true,true),
  ('public.touch_movie_buff_match_participant(uuid)','search_path=pg_catalog',true,true),
  ('public.get_movie_buff_vip_round_view(uuid,uuid)','search_path=pg_catalog',true,true),
  ('public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)','search_path=pg_catalog',true,true),
  ('public.activate_movie_buff_round_vip(uuid,uuid,text)','search_path=pg_catalog',true,true),
  ('public.get_movie_buff_active_leave_quote(uuid)','search_path=pg_catalog',true,true),
  ('public.confirm_movie_buff_active_leave(uuid,text,text)','search_path=pg_catalog',true,true),
  ('public.join_movie_buff_room(text)','search_path=pg_catalog, public',true,true),
  ('public.leave_movie_buff_room(uuid)','search_path=pg_catalog, public',true,true),
  ('public.touch_movie_buff_room_presence(uuid)','search_path=pg_catalog, public',true,true),
  ('public.get_movie_buff_round(uuid)','search_path=pg_catalog, public',true,true),
  ('public.mark_movie_buff_round_media_ready(uuid)','search_path=pg_catalog, public',true,true),
  ('public.use_movie_buff_round_hint(uuid,integer)','search_path=pg_catalog, public',true,true),
  ('public.submit_movie_buff_answer(uuid,text)','search_path=pg_catalog, public',true,true),
  ('public.get_movie_buff_round_results(uuid)','search_path=pg_catalog, public',true,true),
  ('public.get_movie_buff_round_results(uuid,uuid)','search_path=pg_catalog, public',true,true),
  ('public.get_movie_buff_final_results(uuid)','search_path=pg_catalog, public',true,true),
  ('public.is_buff_content_manager()','search_path=pg_catalog, public',true,true),
  ('public.is_movie_buff_room_member(uuid)','search_path=pg_catalog, public',true,true),
  ('public.is_movie_buff_match_member(uuid)','search_path=pg_catalog, public',true,true),
  ('public.is_movie_buff_round_member(uuid)','search_path=pg_catalog, public',true,true),
  ('public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)','search_path=pg_catalog',false,true),
  ('public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)','search_path=pg_catalog, public',false,true),
  ('public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)','search_path=pg_catalog, public',false,true),
  ('public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)','search_path=pg_catalog, public',false,true);

do $functions$
declare
  e record;
  v_oid oid;
  v_owner text;
  v_secdef boolean;
  v_config text[];
  v_public_execute boolean;
  v_anon_execute boolean;
  v_auth_execute boolean;
  v_service_execute boolean;
begin
  for e in select * from expected_critical_functions order by identity loop
    v_oid := pg_catalog.to_regprocedure(e.identity);
    if v_oid is null then
      raise exception 'Required critical function is missing: %',e.identity;
    end if;

    select pg_catalog.pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,
           exists (
             select 1
             from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
             where a.grantee=0 and a.privilege_type='EXECUTE'
           ),
           pg_catalog.has_function_privilege('anon',p.oid,'execute'),
           pg_catalog.has_function_privilege('authenticated',p.oid,'execute'),
           pg_catalog.has_function_privilege('service_role',p.oid,'execute')
      into v_owner,v_secdef,v_config,v_public_execute,v_anon_execute,v_auth_execute,v_service_execute
    from pg_catalog.pg_proc p
    where p.oid=v_oid;

    if v_owner <> 'postgres' or not v_secdef then
      raise exception 'Owner/SECURITY DEFINER mismatch: %',e.identity;
    end if;
    if v_config is distinct from array[e.expected_search_path]::text[] then
      raise exception 'search_path mismatch for %: %',e.identity,v_config;
    end if;
    if v_public_execute or v_anon_execute then
      raise exception 'PUBLIC/anon EXECUTE exposure on %',e.identity;
    end if;
    if v_auth_execute is distinct from e.authenticated_execute
       or v_service_execute is distinct from e.service_role_execute then
      raise exception 'Persona EXECUTE mismatch on % (auth %, service %)',e.identity,v_auth_execute,v_service_execute;
    end if;
  end loop;
end;
$functions$;

do $media_ready_guard$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.mark_movie_buff_round_media_ready(uuid)')
  ) into v_def;
  if pg_catalog.strpos(v_def,'movie_buff_phase_require_access(p_room_id)')=0 then
    raise exception 'mark_movie_buff_round_media_ready lacks authoritative active-room guard.';
  end if;
end;
$media_ready_guard$;

do $shared_security_schema$
declare
  v_schema oid := pg_catalog.to_regnamespace('movie_buff_security');
  v_identity text;
  v_oid oid;
begin
  if v_schema is null then
    raise exception 'movie_buff_security schema is missing.';
  end if;
  if pg_catalog.pg_get_userbyid((select n.nspowner from pg_catalog.pg_namespace n where n.oid=v_schema)) <> 'postgres'
     or not pg_catalog.has_schema_privilege('authenticated','movie_buff_security','usage')
     or pg_catalog.has_schema_privilege('authenticated','movie_buff_security','create')
     or pg_catalog.has_schema_privilege('anon','movie_buff_security','usage') then
    raise exception 'movie_buff_security schema boundary mismatch.';
  end if;

  foreach v_identity in array array[
    'movie_buff_security.active_room_member(uuid)',
    'movie_buff_security.active_board_member(uuid)',
    'movie_buff_security.active_round_member(uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    if v_oid is null then raise exception 'Shared security helper missing: %',v_identity; end if;
    if pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid=v_oid)) <> 'postgres'
       or not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid)
       or (select p.proconfig from pg_catalog.pg_proc p where p.oid=v_oid) is distinct from array['search_path=pg_catalog']::text[]
       or exists (
         select 1 from pg_catalog.pg_proc p
         cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
         where p.oid=v_oid and a.grantee=0 and a.privilege_type='EXECUTE'
       )
       or pg_catalog.has_function_privilege('anon',v_oid,'execute')
       or not pg_catalog.has_function_privilege('authenticated',v_oid,'execute')
       or not pg_catalog.has_function_privilege('service_role',v_oid,'execute') then
      raise exception 'Shared security helper contract mismatch: %',v_identity;
    end if;
  end loop;
end;
$shared_security_schema$;

do $auto_rls$
declare
  v_oid oid := pg_catalog.to_regprocedure('public.rls_auto_enable()');
  v_public_execute boolean;
begin
  if v_oid is null then raise exception 'public.rls_auto_enable() is missing.'; end if;

  select exists (
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    where p.oid=v_oid and a.grantee=0 and a.privilege_type='EXECUTE'
  ) into v_public_execute;

  if pg_catalog.pg_get_userbyid((select p.proowner from pg_catalog.pg_proc p where p.oid=v_oid)) <> 'postgres'
     or not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid)
     or (select p.proconfig from pg_catalog.pg_proc p where p.oid=v_oid) is distinct from array['search_path=pg_catalog']::text[]
     or v_public_execute
     or pg_catalog.has_function_privilege('anon',v_oid,'execute')
     or pg_catalog.has_function_privilege('authenticated',v_oid,'execute')
     or pg_catalog.has_function_privilege('service_role',v_oid,'execute') then
    raise exception 'rls_auto_enable function contract mismatch.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_event_trigger e
    where e.evtname='ensure_rls'
      and e.evtevent='ddl_command_end'
      and e.evtfoid=v_oid
      and e.evtenabled <> 'D'
      and pg_catalog.pg_get_userbyid(e.evtowner)='postgres'
  ) then
    raise exception 'ensure_rls event trigger is missing, disabled, misowned, or points to wrong function.';
  end if;
end;
$auto_rls$;

select pg_catalog.jsonb_build_object(
  'scope','historical-only',
  'classification','PASS',
  'manifestSha256','a2357ac91b5a00e98d0f0a30bd69b8fe901cbfb97b484885a39577fce3ac0adb',
  'sixTargetTables',6,
  'criticalFunctions',(select count(*) from expected_critical_functions),
  'rlsAutoEnable','PASS',
  'sharedSecuritySchema','PASS'
) as movie_buff_manifest_v2_verification;

rollback;
