-- Full-candidate Movie Buff function ownership, search_path, and ACL finalizer.
begin;

create temporary table movie_buff_authenticated_rpc_allowlist (
  identity text primary key
) on commit drop;
insert into movie_buff_authenticated_rpc_allowlist(identity) values
  ('public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)'),
  ('public.join_movie_buff_room(text)'),
  ('public.leave_movie_buff_room(uuid)'),
  ('public.set_movie_buff_player_ready(uuid,boolean)'),
  ('public.touch_movie_buff_room_presence(uuid)'),
  ('public.get_movie_buff_round(uuid)'),
  ('public.mark_movie_buff_round_media_ready(uuid)'),
  ('public.use_movie_buff_round_hint(uuid,integer)'),
  ('public.submit_movie_buff_answer(uuid,text)'),
  ('public.get_movie_buff_round_results(uuid)'),
  ('public.get_movie_buff_round_results(uuid,uuid)'),
  ('public.get_movie_buff_final_results(uuid)'),
  ('public.get_movie_buff_round_completion(uuid,uuid,timestamp with time zone,integer)'),
  ('public.get_movie_buff_round_player_time_left(uuid,uuid,timestamp with time zone,integer)'),
  ('public.is_movie_buff_round_player_finished(uuid,uuid,timestamp with time zone,integer)'),
  ('public.get_movie_buff_match_phase_view(uuid)'),
  ('public.advance_movie_buff_match_phase(uuid,bigint)'),
  ('public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'),
  ('public.touch_movie_buff_match_participant(uuid)'),
  ('public.get_movie_buff_vip_round_view(uuid,uuid)'),
  ('public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'),
  ('public.activate_movie_buff_round_vip(uuid,uuid,text)'),
  ('public.get_movie_buff_active_leave_quote(uuid)'),
  ('public.confirm_movie_buff_active_leave(uuid,text)');

do $contract$
declare v_identity text;
begin
  for v_identity in select identity from movie_buff_authenticated_rpc_allowlist loop
    if pg_catalog.to_regprocedure(v_identity) is null then
      raise exception 'Required authenticated Movie Buff RPC is missing: %', v_identity;
    end if;
  end loop;
  if pg_catalog.to_regprocedure('public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamp with time zone)') is null then
    raise exception 'Required service-only VIP finalizer is missing.';
  end if;
end;
$contract$;

do $harden$
declare v_function record; v_identity text;
begin
  for v_function in
    select p.oid, p.proconfig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user'))
  loop
    v_identity := v_function.oid::pg_catalog.regprocedure::text;
    execute pg_catalog.format('alter function %s owner to postgres',v_identity);
    if coalesce(v_function.proconfig,'{}'::text[]) @> array['search_path=pg_catalog'] then
      execute pg_catalog.format('alter function %s set search_path = pg_catalog',v_identity);
    else
      execute pg_catalog.format('alter function %s set search_path = pg_catalog, public',v_identity);
    end if;
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated, service_role',v_identity);
    execute pg_catalog.format('grant execute on function %s to service_role',v_identity);
  end loop;
end;
$harden$;

do $browser$
declare v_identity text;
begin
  for v_identity in select identity from movie_buff_authenticated_rpc_allowlist loop
    execute pg_catalog.format('grant execute on function %s to authenticated',pg_catalog.to_regprocedure(v_identity)::pg_catalog.regprocedure);
  end loop;
end;
$browser$;

do $verify$
declare v_bad text;
begin
  select p.oid::pg_catalog.regprocedure::text into v_bad
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.oid=p.proowner
  where n.nspname='public'
    and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user'))
    and (
      r.rolname<>'postgres'
      or not coalesce(p.proconfig,'{}'::text[]) && array['search_path=pg_catalog','search_path=pg_catalog, public']
      or exists (
        select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE'
      )
      or pg_catalog.has_function_privilege('anon',p.oid,'execute')
      or not pg_catalog.has_function_privilege('service_role',p.oid,'execute')
      or pg_catalog.has_function_privilege('authenticated',p.oid,'execute') <> exists (
        select 1 from movie_buff_authenticated_rpc_allowlist a
        where pg_catalog.to_regprocedure(a.identity)=p.oid
      )
    )
  limit 1;
  if v_bad is not null then raise exception 'Movie Buff function contract failed for %',v_bad; end if;
  if pg_catalog.has_function_privilege('authenticated','public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamp with time zone)','execute') then
    raise exception 'VIP finalizer must remain service-only.';
  end if;
end;
$verify$;

notify pgrst,'reload schema';
commit;
