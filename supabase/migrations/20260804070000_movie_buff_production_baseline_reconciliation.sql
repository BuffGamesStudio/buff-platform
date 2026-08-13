-- Movie Buff production baseline reconciliation.
--
-- This migration intentionally sits after the production squashed snapshot
-- version 20260803235116 and before the 20260804073000+ RC functional chain.
-- It creates only four prerequisite SECURITY DEFINER helpers that the later
-- exact-RC security migrations assume already exist.
--
-- It MUST fail closed if any target helper already exists. The intended
-- production-like baseline has all four absent; refusing to replace an
-- existing helper keeps this migration rollback-safe and prevents silent
-- overwrites of an unknown baseline.

begin;

do $preflight$
begin
  if to_regprocedure('auth.uid()') is null then
    raise exception 'Required function auth.uid() is missing.';
  end if;

  if to_regclass('public.game_rooms') is null then
    raise exception 'Required table public.game_rooms is missing.';
  end if;

  if to_regclass('public.room_players') is null then
    raise exception 'Required table public.room_players is missing.';
  end if;

  if to_regclass('public.match_players') is null then
    raise exception 'Required table public.match_players is missing.';
  end if;

  if to_regclass('public.match_rounds') is null then
    raise exception 'Required table public.match_rounds is missing.';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'Required table public.profiles is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_rooms'
      and column_name in ('id', 'host_id')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Required public.game_rooms columns are missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_players'
      and column_name in ('room_id', 'player_id', 'left_at')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'Required public.room_players columns are missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_players'
      and column_name in ('match_id', 'player_id')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Required public.match_players columns are missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name in ('id', 'match_id')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Required public.match_rounds columns are missing.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'playback_started_at'
      and (data_type <> 'timestamp with time zone' or is_nullable <> 'YES')
  ) then
    raise exception 'Baseline mismatch: public.match_rounds.playback_started_at is incompatible.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'hint_used_at'
      and (data_type <> 'timestamp with time zone' or is_nullable <> 'YES')
  ) then
    raise exception 'Baseline mismatch: public.match_rounds.hint_used_at is incompatible.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'hint_penalty_seconds'
      and (data_type <> 'integer' or is_nullable <> 'NO')
  ) then
    raise exception 'Baseline mismatch: public.match_rounds.hint_penalty_seconds is incompatible.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relname = 'match_rounds'
      and a.attname = 'hint_penalty_seconds'
      and coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') not in ('0','0::integer')
  ) then
    raise exception 'Baseline mismatch: public.match_rounds.hint_penalty_seconds default is incompatible.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'match_rounds'
      and c.conname = 'match_rounds_hint_penalty_seconds_check'
      and pg_catalog.pg_get_constraintdef(c.oid) <> 'CHECK (((hint_penalty_seconds >= 0) AND (hint_penalty_seconds <= 10)))'
  ) then
    raise exception 'Baseline mismatch: public.match_rounds.hint_penalty_seconds_check is incompatible.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in ('id', 'platform_role')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Required public.profiles columns are missing.';
  end if;

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

alter table public.match_rounds
  add column if not exists playback_started_at timestamptz,
  add column if not exists hint_used_at timestamptz,
  add column if not exists hint_penalty_seconds integer not null default 0;

do $match_rounds_hint_penalty_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'match_rounds'
      and c.conname = 'match_rounds_hint_penalty_seconds_check'
  ) then
    alter table public.match_rounds
      add constraint match_rounds_hint_penalty_seconds_check
      check (hint_penalty_seconds >= 0 and hint_penalty_seconds <= 10);
  end if;
end;
$match_rounds_hint_penalty_constraint$;

create or replace function public.is_movie_buff_room_member(
  p_room_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.game_rooms as gr
    where gr.id = p_room_id
      and (
        gr.host_id = auth.uid()
        or exists (
          select 1
          from public.room_players as rp
          where rp.room_id = gr.id
            and rp.player_id = auth.uid()
            and rp.left_at is null
        )
      )
  );
$function$;

create or replace function public.is_movie_buff_match_member(
  p_match_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.match_players as mp
    where mp.match_id = p_match_id
      and mp.player_id = auth.uid()
  );
$function$;

create or replace function public.is_movie_buff_round_member(
  p_round_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.match_rounds as mr
    join public.match_players as mp
      on mp.match_id = mr.match_id
    where mr.id = p_round_id
      and mp.player_id = auth.uid()
  );
$function$;

create or replace function public.is_buff_content_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in (
        'creator',
        'moderator',
        'admin'
      )
  );
$function$;

alter function public.is_movie_buff_room_member(uuid) owner to postgres;
alter function public.is_movie_buff_match_member(uuid) owner to postgres;
alter function public.is_movie_buff_round_member(uuid) owner to postgres;
alter function public.is_buff_content_manager() owner to postgres;

revoke all on function public.is_movie_buff_room_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_match_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_round_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_buff_content_manager()
  from public, anon, authenticated, service_role;

grant execute on function public.is_movie_buff_room_member(uuid)
  to authenticated, service_role;
grant execute on function public.is_movie_buff_match_member(uuid)
  to authenticated, service_role;
grant execute on function public.is_movie_buff_round_member(uuid)
  to authenticated, service_role;
grant execute on function public.is_buff_content_manager()
  to authenticated, service_role;

comment on function public.is_movie_buff_room_member(uuid) is
  'movie_buff_baseline_reconciliation:20260804070000';
comment on function public.is_movie_buff_match_member(uuid) is
  'movie_buff_baseline_reconciliation:20260804070000';
comment on function public.is_movie_buff_round_member(uuid) is
  'movie_buff_baseline_reconciliation:20260804070000';
comment on function public.is_buff_content_manager() is
  'movie_buff_baseline_reconciliation:20260804070000';

do $verify$
declare
  v_identity text;
  v_oid oid;
  v_bad text;
begin
  foreach v_identity in array array[
    'public.is_movie_buff_room_member(uuid)',
    'public.is_movie_buff_match_member(uuid)',
    'public.is_movie_buff_round_member(uuid)',
    'public.is_buff_content_manager()'
  ]
  loop
    v_oid := to_regprocedure(v_identity);

    if v_oid is null then
      raise exception 'Reconciliation verification failed: % is missing.', v_identity;
    end if;

    select p.oid::regprocedure::text
    into v_bad
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = p.proowner
    where p.oid = v_oid
      and (
        owner_role.rolname <> 'postgres'
        or p.prosecdef is distinct from true
        or not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, public']
        or exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) as acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
        or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
        or pg_catalog.obj_description(p.oid, 'pg_proc')
           <> 'movie_buff_baseline_reconciliation:20260804070000'
      );

    if v_bad is not null then
      raise exception 'Reconciliation verification failed for %.', v_bad;
    end if;

    v_bad := null;
  end loop;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'playback_started_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) then
    raise exception 'Reconciliation verification failed: public.match_rounds.playback_started_at is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'hint_used_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) then
    raise exception 'Reconciliation verification failed: public.match_rounds.hint_used_at is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    join pg_catalog.pg_attrdef d on d.adrelid = c.table_name::regclass and d.adnum = (
      select attnum
      from pg_catalog.pg_attribute a
      where a.attrelid = c.table_name::regclass and a.attname = c.column_name
    )
    where c.table_schema = 'public'
      and c.table_name = 'match_rounds'
      and c.column_name = 'hint_penalty_seconds'
      and c.data_type = 'integer'
      and c.is_nullable = 'NO'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = '0'
  ) then
    raise exception 'Reconciliation verification failed: public.match_rounds.hint_penalty_seconds is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'match_rounds'
      and c.conname = 'match_rounds_hint_penalty_seconds_check'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'CHECK (((hint_penalty_seconds >= 0) AND (hint_penalty_seconds <= 10)))'
  ) then
    raise exception 'Reconciliation verification failed: match_rounds_hint_penalty_seconds_check is missing or incompatible.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
