-- Movie Buff browser RPC allowlist and internal SECURITY DEFINER boundary.
-- Production migration version: 20260814031456.
--
-- Browser-facing gameplay functions are intentionally kept in public, but
-- only the explicit allowlist below is executable by authenticated users.
-- Policy predicates are moved to movie_buff_security so the public helper
-- names are not callable through PostgREST.

begin;

do $preflight$
declare
  v_identity text;
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
  v_internal constant text[] := array[
    'public.is_buff_content_manager()',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ];
begin
  if pg_catalog.to_regnamespace('movie_buff_security') is null then
    raise exception 'Required internal schema movie_buff_security is absent.';
  end if;

  foreach v_identity in array (v_allowlist || v_internal) loop
    if pg_catalog.to_regprocedure(v_identity) is null then
      raise exception 'Required Movie Buff function is absent: %', v_identity;
    end if;
  end loop;

  foreach v_identity in array array[
    'public.match_players',
    'public.match_rounds',
    'public.challenge_set_items',
    'public.challenge_sets',
    'public.content_answers',
    'public.content_categories',
    'public.content_items',
    'public.content_media',
    'public.content_tags',
    'public.tags'
  ] loop
    if pg_catalog.to_regclass(v_identity) is null then
      raise exception 'Required Movie Buff policy table is absent: %', v_identity;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.match_players'::regclass
      and polname = 'Players view match participants'
  ) then
    raise exception 'Required match_players policy is absent.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy
    where polrelid = 'public.match_rounds'::regclass
      and polname = 'Players view match rounds'
  ) then
    raise exception 'Required match_rounds policy is absent.';
  end if;
end;
$preflight$;

-- These predicates are needed by RLS evaluation, but are not browser RPCs.
-- Keep them in a non-public schema and retain only the grants required for
-- policy evaluation by signed-in callers and server-side jobs.
revoke usage on schema movie_buff_security from public, anon;
grant usage on schema movie_buff_security to authenticated, service_role;

create or replace function movie_buff_security.is_content_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and platform_role in ('creator', 'moderator', 'admin')
  );
$function$;

create or replace function movie_buff_security.room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.game_rooms as gr
    where gr.id = p_room_id
      and (
        gr.host_id = (select auth.uid())
        or exists (
          select 1
          from public.room_players as rp
          where rp.room_id = gr.id
            and rp.player_id = (select auth.uid())
            and rp.left_at is null
        )
      )
  );
$function$;

create or replace function movie_buff_security.match_member(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.match_players as mp
    where mp.match_id = p_match_id
      and mp.player_id = (select auth.uid())
  );
$function$;

create or replace function movie_buff_security.round_member(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.match_rounds as mr
    join public.matches as m
      on m.id = mr.match_id
    join public.match_players as mp
      on mp.match_id = m.id
    where mr.id = p_round_id
      and mp.player_id = (select auth.uid())
  );
$function$;

do $internal_function_acl$
declare
  v_identity text;
  v_internal constant text[] := array[
    'movie_buff_security.is_content_manager()',
    'movie_buff_security.room_member(uuid)',
    'movie_buff_security.match_member(uuid)',
    'movie_buff_security.round_member(uuid)'
  ];
begin
  foreach v_identity in array v_internal loop
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
end;
$internal_function_acl$;

-- Repoint policy-only callers before removing authenticated EXECUTE from the
-- old public helper names.
alter policy "Players view match participants"
  on public.match_players
  using (
    (player_id = (select auth.uid()))
    or (select movie_buff_security.match_member(match_id))
  );

alter policy "Players view match rounds"
  on public.match_rounds
  using ((select movie_buff_security.match_member(match_id)));

alter policy "Managers manage challenge items"
  on public.challenge_set_items
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers manage challenge sets"
  on public.challenge_sets
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers manage content answers"
  on public.content_answers
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers manage content categories"
  on public.content_categories
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers create content"
  on public.content_items
  with check (
    (select movie_buff_security.is_content_manager())
    and ((created_by is null) or (created_by = (select auth.uid())))
  );

alter policy "Managers update content"
  on public.content_items
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers view all content"
  on public.content_items
  using ((select movie_buff_security.is_content_manager()));

alter policy "Managers create media"
  on public.content_media
  with check (
    (select movie_buff_security.is_content_manager())
    and ((created_by is null) or (created_by = (select auth.uid())))
  );

alter policy "Managers update media"
  on public.content_media
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers view all media"
  on public.content_media
  using ((select movie_buff_security.is_content_manager()));

alter policy "Managers manage content tags"
  on public.content_tags
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

alter policy "Managers manage tags"
  on public.tags
  using ((select movie_buff_security.is_content_manager()))
  with check ((select movie_buff_security.is_content_manager()));

-- Harden the final-results wrapper before exposing it in the allowlist. A
-- departed player must not retain access through a historical membership row.
create or replace function public.get_movie_buff_final_results(
  p_room_id uuid
)
returns table (
  result_room_status text,
  result_player_id uuid,
  result_total_rounds integer,
  result_completed_rounds integer,
  result_standings jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_room public.game_rooms%rowtype;
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;

  if not found then
    raise exception 'Room not found.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select m.id
  into v_match_id
  from public.matches as m
  where m.room_id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_match_id is null then
    raise exception 'Match not found.';
  end if;

  return query
  select
    v_room.status,
    auth.uid(),
    v_room.total_rounds,
    (
      select count(*)::integer
      from public.match_rounds as completed_round
      where completed_round.match_id = v_match_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'player_id', standing.player_id,
            'display_name', standing.display_name,
            'score', standing.score,
            'correct_answers', standing.correct_answers,
            'answers_submitted', standing.answers_submitted,
            'accuracy', standing.accuracy,
            'current_streak', standing.current_streak,
            'lives', standing.lives
          )
          order by
            standing.score desc,
            standing.correct_answers desc,
            standing.joined_at asc
        )
        from (
          select
            rp.player_id,
            coalesce(
              nullif(p.display_name, ''),
              nullif(p.username, ''),
              'Player ' || left(rp.player_id::text, 6)
            ) as display_name,
            coalesce(rp.score, 0) as score,
            coalesce(rp.current_streak, 0) as current_streak,
            coalesce(rp.lives, 0) as lives,
            rp.joined_at,
            count(a.id) filter (
              where a.is_correct = true
            )::integer as correct_answers,
            count(a.id)::integer as answers_submitted,
            case
              when v_room.total_rounds > 0 then
                round(
                  (
                    count(a.id) filter (
                      where a.is_correct = true
                    )::numeric
                    / v_room.total_rounds::numeric
                  ) * 100
                )::integer
              else 0
            end as accuracy
          from public.room_players as rp
          left join public.profiles as p
            on p.id = rp.player_id
          left join public.match_rounds as mr
            on mr.match_id = v_match_id
          left join public.answers as a
            on a.round_id = mr.id
           and a.player_id = rp.player_id
          where rp.room_id = p_room_id
          group by
            rp.player_id,
            p.display_name,
            p.username,
            rp.score,
            rp.current_streak,
            rp.lives,
            rp.joined_at
        ) as standing
      ),
      '[]'::jsonb
    );
end;
$function$;

alter function public.get_movie_buff_final_results(uuid) owner to postgres;
alter function public.get_movie_buff_final_results(uuid)
  set search_path = pg_catalog, public;

-- Revoke the exposed policy-helper RPCs. Their internal replacements above
-- remain callable only as part of authenticated RLS evaluation.
do $legacy_helper_acl$
declare
  v_identity text;
  v_internal constant text[] := array[
    'public.is_buff_content_manager()',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ];
begin
  foreach v_identity in array v_internal loop
    execute pg_catalog.format(
      'alter function %s owner to postgres',
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
  end loop;
end;
$legacy_helper_acl$;

-- Explicit browser-facing allowlist. Every other public SECURITY DEFINER
-- function in the audited set is denied to anon/authenticated/public.
do $browser_rpc_acl$
declare
  v_identity text;
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
begin
  foreach v_identity in array v_allowlist loop
    execute pg_catalog.format(
      'alter function %s owner to postgres',
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
end;
$browser_rpc_acl$;

do $verify$
declare
  v_identity text;
  v_oid oid;
  v_definition text;
  v_public_execute boolean;
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
  v_internal constant text[] := array[
    'public.is_buff_content_manager()',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_round_member(uuid)'
  ];
begin
  foreach v_identity in array v_allowlist loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    select
      pg_catalog.pg_get_functiondef(p.oid),
      exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) as acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
    into v_definition, v_public_execute
    from pg_catalog.pg_proc as p
    where p.oid = v_oid
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
      and pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'execute');

    if not found or coalesce(v_public_execute, true) then
      raise exception 'Browser RPC ACL contract failed: %', v_identity;
    end if;

    if v_identity = 'public.start_movie_buff_match(uuid)' then
      if coalesce(pg_catalog.strpos(v_definition, 'begin_movie_buff_match_from_admission'), 0) = 0 then
        raise exception 'Start RPC is not bound to the guarded admission helper.';
      end if;
    elsif v_identity = 'public.advance_movie_buff_round(uuid)' then
      if coalesce(pg_catalog.strpos(v_definition, 'auth.uid'), 0) = 0
         or coalesce(pg_catalog.strpos(v_definition, 'host_id'), 0) = 0 then
        raise exception 'Host-only round advance lacks an auth/host guard.';
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
      if coalesce(pg_catalog.strpos(v_definition, 'movie_buff_phase_require_access'), 0) = 0 then
        raise exception 'Phase RPC lacks the authoritative room guard: %', v_identity;
      end if;
    else
      if coalesce(pg_catalog.strpos(v_definition, 'auth.uid'), 0) = 0
         or coalesce(pg_catalog.strpos(v_definition, 'room_players'), 0) = 0 then
        raise exception 'Gameplay RPC lacks an auth/room-membership guard: %', v_identity;
      end if;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.movie_buff_phase_require_access(uuid)'
  );

  if coalesce(pg_catalog.strpos(v_definition, 'auth.uid'), 0) = 0
     or coalesce(pg_catalog.strpos(v_definition, 'room_players'), 0) = 0 then
    raise exception 'Authoritative phase access helper lacks auth/room membership checks.';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.begin_movie_buff_match_from_admission(uuid)'
  );

  if coalesce(pg_catalog.strpos(v_definition, 'auth.uid'), 0) = 0
     or coalesce(pg_catalog.strpos(v_definition, 'room_players'), 0) = 0
     or coalesce(pg_catalog.strpos(v_definition, 'host_id'), 0) = 0 then
    raise exception 'Authoritative match admission helper lacks auth/room/host checks.';
  end if;

  foreach v_identity in array v_internal loop
    v_oid := pg_catalog.to_regprocedure(v_identity);
    if pg_catalog.has_function_privilege('anon', v_oid, 'execute')
       or pg_catalog.has_function_privilege('authenticated', v_oid, 'execute')
       or exists (
         select 1
         from pg_catalog.pg_proc as p
         cross join lateral pg_catalog.aclexplode(
           coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
         ) as acl
         where p.oid = v_oid
           and acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       )
       or not pg_catalog.has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'Internal helper ACL contract failed: %', v_identity;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'match_players'
      and policyname = 'Players view match participants'
      and coalesce(qual, '') like '%movie_buff_security.match_member%'
  ) then
    raise exception 'match_players policy was not moved to the internal helper.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'match_rounds'
      and policyname = 'Players view match rounds'
      and coalesce(qual, '') like '%movie_buff_security.match_member%'
  ) then
    raise exception 'match_rounds policy was not moved to the internal helper.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'challenge_set_items', 'challenge_sets', 'content_answers',
        'content_categories', 'content_items', 'content_media',
        'content_tags', 'tags'
      )
      and (
        coalesce(qual, '') like '%is_buff_content_manager%'
        or coalesce(with_check, '') like '%is_buff_content_manager%'
      )
  ) then
    raise exception 'A content policy still references the public manager helper.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
