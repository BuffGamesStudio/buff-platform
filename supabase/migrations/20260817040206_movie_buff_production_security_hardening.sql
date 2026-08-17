-- Movie Buff production function-security finalizer.
--
-- Browser gameplay RPCs are intentionally exposed to signed-in players. The
-- advisor warning for those entry points is expected; this migration makes
-- the boundary explicit and fails closed if an internal SECURITY DEFINER
-- function becomes browser-callable or anonymous execution reappears.

begin;

do $hardening$
declare
  v_identity text;
  v_oid oid;
  v_definition text;
  v_public_execute boolean;
  v_function record;
  v_allowlist constant text[] := array[
    'public.activate_movie_buff_round_vip(uuid,uuid,text)',
    'public.advance_movie_buff_match_phase(uuid,bigint)',
    'public.advance_movie_buff_round(uuid)',
    'public.confirm_movie_buff_active_leave(uuid,text,text)',
    'public.enter_movie_buff_round(uuid)',
    'public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)',
    'public.get_movie_buff_active_leave_quote(uuid)',
    'public.get_movie_buff_final_results(uuid)',
    'public.get_movie_buff_match_phase_view(uuid)',
    'public.get_movie_buff_round(uuid)',
    'public.get_movie_buff_round_results(uuid)',
    'public.get_movie_buff_round_results(uuid,uuid)',
    'public.get_movie_buff_vip_round_view(uuid,uuid)',
    'public.join_movie_buff_room(text)',
    'public.leave_movie_buff_room(uuid)',
    'public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)',
    'public.mark_movie_buff_round_media_ready(uuid)',
    'public.prepare_movie_buff_round_playback(uuid)',
    'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)',
    'public.set_movie_buff_player_ready(uuid,boolean)',
    'public.start_movie_buff_match(uuid)',
    'public.start_movie_buff_round_playback(uuid)',
    'public.submit_movie_buff_answer(uuid,text)',
    'public.touch_movie_buff_match_participant(uuid)',
    'public.touch_movie_buff_room_presence(uuid)',
    'public.use_movie_buff_round_hint(uuid,integer)'
  ];
  v_policy_helpers constant text[] := array[
    'movie_buff_security.is_content_manager()',
    'movie_buff_security.room_member(uuid)',
    'movie_buff_security.match_member(uuid)',
    'movie_buff_security.round_member(uuid)'
  ];
  v_legacy_helpers constant text[] := array[
    'public.is_buff_content_manager()',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ];
begin
  if pg_catalog.to_regnamespace('movie_buff_security') is null then
    raise exception 'Required internal schema movie_buff_security is absent.';
  end if;

  -- Reassert the policy-helper boundary. These functions are needed by RLS,
  -- so authenticated retains only the privilege required for policy
  -- evaluation; the schema is not a browser-facing API schema.
  revoke usage on schema movie_buff_security from public, anon;
  grant usage on schema movie_buff_security to authenticated, service_role;

  foreach v_identity in array v_policy_helpers loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    if v_oid is null then
      raise exception 'Required policy helper is absent: %', v_identity;
    end if;

    execute pg_catalog.format(
      'alter function %s owner to postgres',
      v_identity
    );
    execute pg_catalog.format(
      'alter function %s set search_path = pg_catalog',
      v_identity
    );
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_identity
    );
    execute pg_catalog.format(
      'grant execute on function %s to authenticated, service_role',
      v_identity
    );
  end loop;

  -- The old public policy helpers are not gameplay RPCs. Keep them available
  -- only to service-side jobs, including when a legacy overload exists.
  foreach v_identity in array v_legacy_helpers loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    if v_oid is not null then
      execute pg_catalog.format(
        'alter function %s owner to postgres',
        v_identity
      );
      execute pg_catalog.format(
        'alter function %s set search_path = pg_catalog, public',
        v_identity
      );
      execute pg_catalog.format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_identity
      );
      execute pg_catalog.format(
        'grant execute on function %s to service_role',
        v_identity
      );
    end if;
  end loop;

  -- Reassert the only public functions that authenticated browsers may call.
  foreach v_identity in array v_allowlist loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    if v_oid is null then
      raise exception 'Required browser RPC is absent: %', v_identity;
    end if;

    execute pg_catalog.format(
      'alter function %s owner to postgres',
      v_identity
    );
    execute pg_catalog.format(
      'alter function %s set search_path = pg_catalog, public',
      v_identity
    );
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_identity
    );
    execute pg_catalog.format(
      'grant execute on function %s to authenticated, service_role',
      v_identity
    );
  end loop;

  -- Deny browser access to every other SECURITY DEFINER function in the
  -- exposed public schema. Do not remove service_role from unknown server
  -- functions; this loop only closes the public/anon/authenticated boundary.
  for v_function in
    select
      p.oid,
      format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
      ) as identity
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1
        from pg_catalog.unnest(v_allowlist) as allowed(identity)
        where pg_catalog.to_regprocedure(allowed.identity) = p.oid
      )
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated',
      v_function.oid::regprocedure
    );
  end loop;

  -- Every browser function must retain its authoritative guard. The phase
  -- wrappers delegate to movie_buff_phase_require_access; match admission
  -- delegates to begin_movie_buff_match_from_admission; the remaining
  -- gameplay functions contain the caller/membership checks directly.
  foreach v_identity in array v_allowlist loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    select pg_catalog.pg_get_functiondef(p.oid)
    into v_definition
    from pg_catalog.pg_proc as p
    where p.oid = v_oid;

    if v_identity = 'public.start_movie_buff_match(uuid)' then
      if pg_catalog.strpos(v_definition, 'begin_movie_buff_match_from_admission') = 0 then
        raise exception 'Start RPC is not bound to the guarded admission helper.';
      end if;
    elsif v_identity = 'public.advance_movie_buff_round(uuid)' then
      if pg_catalog.strpos(v_definition, 'auth.uid') = 0
         or pg_catalog.strpos(v_definition, 'host_id') = 0 then
        raise exception 'Host-only round advance lacks auth/host checks.';
      end if;
    elsif v_identity = 'public.get_movie_buff_round(uuid)' then
      -- The timer-gated wrapper delegates room membership to the shared-clock
      -- implementation and derives the caller-specific clock with auth.uid().
      if pg_catalog.strpos(v_definition, 'movie_buff_get_round_shared_clock') = 0
         or pg_catalog.strpos(v_definition, 'auth.uid') = 0 then
        raise exception 'Round read is not bound to the guarded shared-clock helper.';
      end if;
    elsif v_identity = 'public.mark_movie_buff_round_media_ready(uuid)' then
      -- This wrapper adds media-readiness behavior around the guarded current
      -- implementation, then returns the guarded round read.
      if pg_catalog.strpos(v_definition, 'movie_buff_mark_round_media_ready_current') = 0
         or pg_catalog.strpos(v_definition, 'get_movie_buff_round') = 0 then
        raise exception 'Media-ready RPC is not bound to guarded implementations.';
      end if;
    elsif v_identity in (
      'public.advance_movie_buff_match_phase(uuid,bigint)',
      'public.confirm_movie_buff_active_leave(uuid,text,text)',
      'public.get_movie_buff_active_leave_quote(uuid)',
      'public.get_movie_buff_match_phase_view(uuid)',
      'public.mark_movie_buff_round_media_ready(uuid)',
      'public.prepare_movie_buff_round_playback(uuid)',
      'public.select_movie_buff_match_tile(uuid,uuid,bigint,text)',
      'public.start_movie_buff_round_playback(uuid)',
      'public.submit_movie_buff_answer(uuid,text)',
      'public.touch_movie_buff_match_participant(uuid)'
    ) then
      if pg_catalog.strpos(v_definition, 'movie_buff_phase_require_access') = 0 then
        raise exception 'Phase RPC lacks the authoritative room guard: %', v_identity;
      end if;
    else
      if pg_catalog.strpos(v_definition, 'auth.uid') = 0
         or pg_catalog.strpos(v_definition, 'room_players') = 0 then
        raise exception 'Gameplay RPC lacks auth/room-membership checks: %', v_identity;
      end if;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.movie_buff_phase_require_access(uuid)'
  );
  if pg_catalog.strpos(v_definition, 'auth.uid') = 0
     or pg_catalog.strpos(v_definition, 'room_players') = 0 then
    raise exception 'Phase access helper lacks auth/room-membership checks.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.movie_buff_get_round_shared_clock(uuid)'
  );
  if v_definition is null
     or pg_catalog.strpos(v_definition, 'auth.uid') = 0
     or pg_catalog.strpos(v_definition, 'room_players') = 0 then
    raise exception 'Shared-clock round read lacks auth/room-membership checks.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.movie_buff_mark_round_media_ready_current(uuid)'
  );
  if v_definition is null
     or pg_catalog.strpos(v_definition, 'movie_buff_phase_require_access') = 0 then
    raise exception 'Media-ready implementation lacks the authoritative room guard.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_movie_buff_match_from_admission(uuid)'
  );
  if pg_catalog.strpos(v_definition, 'auth.uid') = 0
     or pg_catalog.strpos(v_definition, 'room_players') = 0
     or pg_catalog.strpos(v_definition, 'host_id') = 0 then
    raise exception 'Match admission helper lacks auth/room/host checks.';
  end if;

  -- Fail closed on the final ACL contract. PUBLIC grants are checked
  -- explicitly because a PUBLIC grant also flows to anon/authenticated.
  foreach v_identity in array v_allowlist loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    select exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    into v_public_execute
    from pg_catalog.pg_proc as p
    where p.oid = v_oid;

    if coalesce(v_public_execute, true)
       or pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Browser RPC ACL contract failed: %', v_identity;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        pg_catalog.has_function_privilege('anon', p.oid, 'execute')
        or exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) as acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
      )
  ) then
    raise exception 'A public SECURITY DEFINER function is still executable by anon/PUBLIC.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
      and not exists (
        select 1
        from pg_catalog.unnest(v_allowlist) as allowed(identity)
        where pg_catalog.to_regprocedure(allowed.identity) = p.oid
      )
  ) then
    raise exception 'An unallowlisted public SECURITY DEFINER function is executable by authenticated.';
  end if;
end;
$hardening$;

notify pgrst, 'reload schema';

commit;
