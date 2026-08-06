-- Independent staging-security clearance for the current Movie Buff catalog.
-- This migration is additive, fail-closed, and restricted to the isolated
-- staging/database-security lane. It does not authorize production execution.

begin;

-- These helpers are internal implementation details. They accept arbitrary
-- room/round/player identifiers and rely on their SECURITY DEFINER callers to
-- establish authorization. Direct browser execution would create cross-room
-- timing/completion oracles, so retain service-role execution only.
do $required_internal_helpers$
declare
  v_identity text;
begin
  foreach v_identity in array array[
    'public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)',
    'public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)',
    'public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'
  ] loop
    if pg_catalog.to_regprocedure(v_identity) is null then
      raise exception 'required internal helper is absent: %', v_identity;
    end if;
  end loop;
end;
$required_internal_helpers$;

alter function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer) owner to postgres;
alter function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)
  to service_role;

alter function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer) owner to postgres;
alter function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)
  to service_role;

alter function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer) owner to postgres;
alter function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  set search_path = pg_catalog, public;
revoke all on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)
  to service_role;

-- Preserve the browser-facing media-ready signature, but bind every write to
-- the same active-room membership guard used by the authoritative MOV-17 RPCs.
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

-- This shared content-management predicate is intentionally browser callable,
-- but it must use an immutable search path and the same explicit persona ACL.
do $required_content_manager$
begin
  if pg_catalog.to_regprocedure('public.is_buff_content_manager()') is null then
    raise exception 'required shared function is absent: public.is_buff_content_manager()';
  end if;
end;
$required_content_manager$;

alter function public.is_buff_content_manager() owner to postgres;
alter function public.is_buff_content_manager()
  set search_path = pg_catalog, public;
revoke all on function public.is_buff_content_manager()
  from public, anon, authenticated, service_role;
grant execute on function public.is_buff_content_manager()
  to authenticated, service_role;

-- The following tables are internal server-state ledgers. Browser roles have
-- no table privileges and receive an explicit restrictive deny policy. This
-- removes advisor ambiguity while preserving service-role continuity.
do $internal_table_clearance$
declare
  v_table text;
  v_tables constant text[] := array[
    'movie_buff_abandonment_ledger',
    'movie_buff_board_events',
    'movie_buff_match_participant_seats',
    'movie_buff_match_playbacks',
    'movie_buff_match_rounds',
    'movie_buff_match_state',
    'movie_buff_penalty_config',
    'movie_buff_phase_idempotency',
    'movie_buff_round_player_answers',
    'movie_buff_round_player_media',
    'movie_buff_round_results',
    'movie_buff_rounds',
    'movie_buff_selection_idempotency',
    'movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  ];
begin
  foreach v_table in array v_tables loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise exception 'required internal table is absent: public.%', v_table;
    end if;

    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('alter table public.%I force row level security', v_table);
    execute pg_catalog.format('revoke all on table public.%I from anon, authenticated', v_table);
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
$internal_table_clearance$;

-- Fail the migration if catalog state differs from the intended contract.
do $clearance_assertions$
declare
  v_identity text;
  v_table text;
  v_oid oid;
  v_config text[];
  v_owner text;
  v_policy_count integer;
  v_force boolean;
  v_definition text;
  v_tables constant text[] := array[
    'movie_buff_abandonment_ledger','movie_buff_board_events',
    'movie_buff_match_participant_seats','movie_buff_match_playbacks',
    'movie_buff_match_rounds','movie_buff_match_state',
    'movie_buff_penalty_config','movie_buff_phase_idempotency',
    'movie_buff_round_player_answers','movie_buff_round_player_media',
    'movie_buff_round_results','movie_buff_rounds',
    'movie_buff_selection_idempotency','movie_buff_vip_round_required_players',
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
    from pg_catalog.pg_proc p where p.oid = v_oid;
    if v_owner is distinct from 'postgres'
       or v_config is distinct from array['search_path=pg_catalog, public']::text[]
       or pg_catalog.has_function_privilege('public', v_oid, 'execute')
       or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'internal helper ACL/owner/search_path mismatch: %', v_identity;
    end if;
  end loop;

  v_oid := pg_catalog.to_regprocedure('public.mark_movie_buff_round_media_ready(uuid)');
  select pg_catalog.pg_get_userbyid(p.proowner), p.proconfig,
         pg_catalog.pg_get_functiondef(p.oid)
    into v_owner, v_config, v_definition
  from pg_catalog.pg_proc p where p.oid = v_oid;
  if v_owner is distinct from 'postgres'
     or v_config is distinct from array['search_path=pg_catalog, public']::text[]
     or pg_catalog.has_function_privilege('public', v_oid, 'execute')
     or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute')
     or pg_catalog.position('movie_buff_phase_require_access(p_room_id)' in v_definition) = 0 then
    raise exception 'media-ready function clearance mismatch';
  end if;

  v_oid := pg_catalog.to_regprocedure('public.is_buff_content_manager()');
  select pg_catalog.pg_get_userbyid(p.proowner), p.proconfig
    into v_owner, v_config
  from pg_catalog.pg_proc p where p.oid = v_oid;
  if v_owner is distinct from 'postgres'
     or v_config is distinct from array['search_path=pg_catalog, public']::text[]
     or pg_catalog.has_function_privilege('public', v_oid, 'execute')
     or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
     or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'content-manager function clearance mismatch';
  end if;

  foreach v_table in array v_tables loop
    select c.relforcerowsecurity,
           (select count(*) from pg_catalog.pg_policy pol
             where pol.polrelid = c.oid
               and pol.polname = 'movie_buff_internal_browser_deny')
      into v_force, v_policy_count
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;

    if not coalesce(v_force, false) or v_policy_count <> 1 then
      raise exception 'internal table RLS policy mismatch: public.%', v_table;
    end if;

    v_oid := pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table));
    if pg_catalog.has_table_privilege('anon', v_oid, 'select')
       or pg_catalog.has_table_privilege('anon', v_oid, 'insert')
       or pg_catalog.has_table_privilege('anon', v_oid, 'update')
       or pg_catalog.has_table_privilege('anon', v_oid, 'delete')
       or pg_catalog.has_table_privilege('authenticated', v_oid, 'select')
       or pg_catalog.has_table_privilege('authenticated', v_oid, 'insert')
       or pg_catalog.has_table_privilege('authenticated', v_oid, 'update')
       or pg_catalog.has_table_privilege('authenticated', v_oid, 'delete') then
      raise exception 'browser table privilege mismatch: public.%', v_table;
    end if;
  end loop;
end;
$clearance_assertions$;

notify pgrst, 'reload schema';
commit;
