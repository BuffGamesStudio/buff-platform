-- Movie Buff production-safe manifest security reconciliation.
--
-- This migration carries only the final security semantics that were proven in
-- isolated staging but were previously present only in a staging-only clearance
-- migration. It is intentionally ordered after the 20260805155xxx/160xxx
-- production security finalizers and before the 20260807014500 membership-helper
-- EXECUTE repair.
--
-- It does not create gameplay state, seed data, or replay the staging-only
-- migration. It fails closed unless the exact prerequisite function/table graph
-- already exists.

begin;

do $preflight$
declare
  v_identity text;
  v_table text;
  v_tables constant text[] := array[
    'movie_buff_active_leave_penalty_ledger',
    'movie_buff_active_leave_policies',
    'movie_buff_active_leave_quotes',
    'movie_buff_board_events',
    'movie_buff_match_abandonment_events',
    'movie_buff_match_participant_seats',
    'movie_buff_match_phase_actions',
    'movie_buff_match_phase_events',
    'movie_buff_match_phase_state',
    'movie_buff_vip_consumptions',
    'movie_buff_vip_definitions',
    'movie_buff_vip_inventory',
    'movie_buff_vip_round_locks',
    'movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  ];
begin
  foreach v_identity in array array[
    'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)',
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)',
    'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)',
    'public.mark_movie_buff_round_media_ready(uuid)',
    'public.movie_buff_phase_require_access(uuid)',
    'public.get_movie_buff_round(uuid)'
  ] loop
    if pg_catalog.to_regprocedure(v_identity) is null then
      raise exception 'Required production-security function is absent: %', v_identity;
    end if;
  end loop;

  foreach v_table in array v_tables loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise exception 'Required production-security table is absent: public.%', v_table;
    end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    raise exception 'Required role anon is missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'Required role authenticated is missing.';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Required role service_role is missing.';
  end if;
end;
$preflight$;

-- These three helpers are implementation details, not browser RPCs.
alter function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  owner to postgres;
alter function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  to service_role;

alter function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  owner to postgres;
alter function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  to service_role;

alter function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  owner to postgres;
alter function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  to service_role;

-- Replace the legacy auth-only guard with the authoritative active-room guard.
create or replace function public.mark_movie_buff_round_media_ready(p_room_id uuid)
returns table(
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_round_id uuid;
begin
  perform public.movie_buff_phase_require_access(p_room_id);

  select mr.id
    into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id,
    player_id,
    started_at,
    play_requested_at,
    playback_started_at
  )
  values (
    v_round_id,
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (round_id, player_id) do update
  set started_at = coalesce(
    public.match_round_player_playback.started_at,
    excluded.started_at
  );

  return query
  select *
  from public.get_movie_buff_round(p_room_id);
end;
$function$;

alter function public.mark_movie_buff_round_media_ready(uuid) owner to postgres;
alter function public.mark_movie_buff_round_media_ready(uuid)
  set search_path = pg_catalog, public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_movie_buff_round_media_ready(uuid)
  to authenticated, service_role;

-- Every internal server ledger is fail-closed to browser roles. The five
-- user-readable protected tables are handled separately by 20260805160000.
do $internal_table_reconciliation$
declare
  v_table text;
  v_tables constant text[] := array[
    'movie_buff_active_leave_penalty_ledger',
    'movie_buff_active_leave_policies',
    'movie_buff_active_leave_quotes',
    'movie_buff_board_events',
    'movie_buff_match_abandonment_events',
    'movie_buff_match_participant_seats',
    'movie_buff_match_phase_actions',
    'movie_buff_match_phase_events',
    'movie_buff_match_phase_state',
    'movie_buff_vip_consumptions',
    'movie_buff_vip_definitions',
    'movie_buff_vip_inventory',
    'movie_buff_vip_round_locks',
    'movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  ];
begin
  foreach v_table in array v_tables loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('alter table public.%I force row level security', v_table);
    execute pg_catalog.format(
      'revoke all on table public.%I from public, anon, authenticated',
      v_table
    );
    execute pg_catalog.format(
      'drop policy if exists movie_buff_internal_browser_deny on public.%I',
      v_table
    );
    execute pg_catalog.format(
      'create policy movie_buff_internal_browser_deny on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      v_table
    );
  end loop;
end;
$internal_table_reconciliation$;

do $verify$
declare
  v_identity text;
  v_oid oid;
  v_owner text;
  v_config text[];
  v_definition text;
  v_table text;
  v_table_oid oid;
  v_policy_count integer;
  v_rls boolean;
  v_force boolean;
  v_tables constant text[] := array[
    'movie_buff_active_leave_penalty_ledger',
    'movie_buff_active_leave_policies',
    'movie_buff_active_leave_quotes',
    'movie_buff_board_events',
    'movie_buff_match_abandonment_events',
    'movie_buff_match_participant_seats',
    'movie_buff_match_phase_actions',
    'movie_buff_match_phase_events',
    'movie_buff_match_phase_state',
    'movie_buff_vip_consumptions',
    'movie_buff_vip_definitions',
    'movie_buff_vip_inventory',
    'movie_buff_vip_round_locks',
    'movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  ];
begin
  foreach v_identity in array array[
    'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)',
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)',
    'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    select pg_catalog.pg_get_userbyid(p.proowner), p.proconfig
      into v_owner, v_config
    from pg_catalog.pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres'
       or v_config is distinct from array['search_path=pg_catalog, public']::text[]
       or exists (
         select 1
         from pg_catalog.pg_proc p
         cross join lateral pg_catalog.aclexplode(
           coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
         ) acl
         where p.oid = v_oid
           and acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       )
       or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Internal helper security mismatch: %', v_identity;
    end if;
  end loop;

  v_oid := pg_catalog.to_regprocedure('public.mark_movie_buff_round_media_ready(uuid)');
  select pg_catalog.pg_get_userbyid(p.proowner), p.proconfig,
         pg_catalog.pg_get_functiondef(p.oid)
    into v_owner, v_config, v_definition
  from pg_catalog.pg_proc p
  where p.oid = v_oid;

  if v_owner is distinct from 'postgres'
     or v_config is distinct from array['search_path=pg_catalog, public']::text[]
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute')
     or pg_catalog.strpos(v_definition, 'movie_buff_phase_require_access(p_room_id)') = 0 then
    raise exception 'media-ready function security mismatch';
  end if;

  foreach v_table in array v_tables loop
    v_table_oid := pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table));

    select c.relrowsecurity, c.relforcerowsecurity,
           (
             select count(*)
             from pg_catalog.pg_policy pol
             where pol.polrelid = c.oid
               and pol.polname = 'movie_buff_internal_browser_deny'
               and not pol.polpermissive
               and pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) = 'false'
               and pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false'
           )
      into v_rls, v_force, v_policy_count
    from pg_catalog.pg_class c
    where c.oid = v_table_oid;

    if not coalesce(v_rls, false)
       or not coalesce(v_force, false)
       or v_policy_count <> 1 then
      raise exception 'Internal table RLS/policy mismatch: public.%', v_table;
    end if;

    if pg_catalog.has_table_privilege('anon', v_table_oid, 'select')
       or pg_catalog.has_table_privilege('anon', v_table_oid, 'insert')
       or pg_catalog.has_table_privilege('anon', v_table_oid, 'update')
       or pg_catalog.has_table_privilege('anon', v_table_oid, 'delete')
       or pg_catalog.has_table_privilege('authenticated', v_table_oid, 'select')
       or pg_catalog.has_table_privilege('authenticated', v_table_oid, 'insert')
       or pg_catalog.has_table_privilege('authenticated', v_table_oid, 'update')
       or pg_catalog.has_table_privilege('authenticated', v_table_oid, 'delete')
       or not pg_catalog.has_table_privilege('service_role', v_table_oid, 'select')
       or not pg_catalog.has_table_privilege('service_role', v_table_oid, 'insert')
       or not pg_catalog.has_table_privilege('service_role', v_table_oid, 'update')
       or not pg_catalog.has_table_privilege('service_role', v_table_oid, 'delete') then
      raise exception 'Internal table ACL mismatch: public.%', v_table;
    end if;
  end loop;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
