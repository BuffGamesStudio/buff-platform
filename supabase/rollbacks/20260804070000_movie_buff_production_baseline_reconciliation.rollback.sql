-- Rollback for 20260804070000_movie_buff_production_baseline_reconciliation.sql.
--
-- This rollback is intentionally fail-closed. It drops only the four helpers
-- created by the reconciliation migration and only when they still carry the
-- reconciliation marker. It uses no CASCADE. Before dropping the helpers it
-- rewrites the exact live helper-dependent policies into inline, no-helper
-- equivalents so containment can succeed without broadening browser access.

begin;

do $preflight$
declare
  v_identity text;
  v_oid oid;
  v_marker text;
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
      raise exception 'Rollback preflight failed: % is missing.', v_identity;
    end if;

    select pg_catalog.obj_description(v_oid, 'pg_proc')
    into v_marker;

    if v_marker <> 'movie_buff_baseline_reconciliation:20260804070000' then
      raise exception
        'Rollback preflight failed: % does not carry the reconciliation marker.',
        v_identity;
    end if;
  end loop;
end;
$preflight$;

revoke all on function public.is_movie_buff_room_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_match_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_movie_buff_round_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_buff_content_manager()
  from public, anon, authenticated, service_role;

drop policy if exists "Managers view all content"
  on public.content_items;
create policy "Managers view all content"
on public.content_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers create content"
  on public.content_items;
create policy "Managers create content"
on public.content_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
  and (
    created_by is null
    or created_by = auth.uid()
  )
);

drop policy if exists "Managers update content"
  on public.content_items;
create policy "Managers update content"
on public.content_items
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage content categories"
  on public.content_categories;
create policy "Managers manage content categories"
on public.content_categories
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage tags"
  on public.tags;
create policy "Managers manage tags"
on public.tags
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage content tags"
  on public.content_tags;
create policy "Managers manage content tags"
on public.content_tags
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers view all media"
  on public.content_media;
create policy "Managers view all media"
on public.content_media
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers create media"
  on public.content_media;
create policy "Managers create media"
on public.content_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
  and (
    created_by is null
    or created_by = auth.uid()
  )
);

drop policy if exists "Managers update media"
  on public.content_media;
create policy "Managers update media"
on public.content_media
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage content answers"
  on public.content_answers;
create policy "Managers manage content answers"
on public.content_answers
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage challenge sets"
  on public.challenge_sets;
create policy "Managers manage challenge sets"
on public.challenge_sets
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "Managers manage challenge items"
  on public.challenge_set_items;
create policy "Managers manage challenge items"
on public.challenge_set_items
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.platform_role in ('creator', 'moderator', 'admin')
  )
);

drop policy if exists "game_rooms_select"
  on public.game_rooms;
create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (
  host_id = auth.uid()
  or exists (
    select 1
    from public.room_players as rp
    where rp.room_id = id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  )
);

drop policy if exists "room_players_select"
  on public.room_players;
create policy "room_players_select"
on public.room_players
for select
to authenticated
using (
  player_id = auth.uid()
  or (
    left_at is null
    and exists (
      select 1
      from public.game_rooms as gr
      where gr.id = room_id
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
    )
  )
);

drop policy if exists "Players view their matches"
  on public.matches;
create policy "Players view their matches"
on public.matches
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players as mp
    where mp.match_id = id
      and mp.player_id = auth.uid()
  )
);

drop policy if exists "Players view match participants"
  on public.match_players;
create policy "Players view match participants"
on public.match_players
for select
to authenticated
using (
  player_id = auth.uid()
  or exists (
    select 1
    from public.match_players as mine
    where mine.match_id = match_id
      and mine.player_id = auth.uid()
  )
);

drop policy if exists "Players view match rounds"
  on public.match_rounds;
create policy "Players view match rounds"
on public.match_rounds
for select
to authenticated
using (
  exists (
    select 1
    from public.match_players as mp
    where mp.match_id = match_id
      and mp.player_id = auth.uid()
  )
);

drop policy if exists "Players view answers from their matches"
  on public.answers;
create policy "Players view answers from their matches"
on public.answers
for select
to authenticated
using (
  player_id = auth.uid()
  or exists (
    select 1
    from public.match_rounds as mr
    join public.match_players as mp
      on mp.match_id = mr.match_id
    where mr.id = round_id
      and mp.player_id = auth.uid()
  )
);

do $dependency_verify$
declare
  v_dependency text;
begin
  select pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid)
  into v_dependency
  from pg_catalog.pg_depend as d
  where d.refclassid = 'pg_proc'::pg_catalog.regclass
    and d.refobjid in (
      to_regprocedure('public.is_movie_buff_room_member(uuid)'),
      to_regprocedure('public.is_movie_buff_match_member(uuid)'),
      to_regprocedure('public.is_movie_buff_round_member(uuid)'),
      to_regprocedure('public.is_buff_content_manager()')
    )
  limit 1;

  if v_dependency is not null then
    raise exception
      'Rollback verification failed: helper dependency remains on %.',
      v_dependency;
  end if;
end;
$dependency_verify$;

do $remove_match_rounds_runtime$
declare
  v_default text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'playback_started_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) then
    raise exception 'Rollback preflight failed: public.match_rounds.playback_started_at is missing or incompatible.';
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
    raise exception 'Rollback preflight failed: public.match_rounds.hint_used_at is missing or incompatible.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_rounds'
      and column_name = 'hint_penalty_seconds'
      and data_type = 'integer'
      and is_nullable = 'NO'
  ) then
    raise exception 'Rollback preflight failed: public.match_rounds.hint_penalty_seconds is missing or incompatible.';
  end if;

  select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  into v_default
  from pg_catalog.pg_attrdef d
  join pg_catalog.pg_class c on c.oid = d.adrelid
  join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where c.relname = 'match_rounds'
    and a.attname = 'hint_penalty_seconds';

  if v_default not in ('0', '0::integer') then
    raise exception 'Rollback preflight failed: public.match_rounds.hint_penalty_seconds default is incompatible.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'match_rounds'
      and c.conname = 'match_rounds_hint_penalty_seconds_check'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'CHECK (hint_penalty_seconds >= 0 AND hint_penalty_seconds <= 10)'
  ) then
    raise exception 'Rollback preflight failed: match_rounds_hint_penalty_seconds_check is missing or incompatible.';
  end if;

  alter table public.match_rounds
    drop constraint match_rounds_hint_penalty_seconds_check;
  alter table public.match_rounds
    drop column playback_started_at;
  alter table public.match_rounds
    drop column hint_used_at;
  alter table public.match_rounds
    drop column hint_penalty_seconds;
end;
$remove_match_rounds_runtime$;

drop function public.is_movie_buff_round_member(uuid);
drop function public.is_movie_buff_match_member(uuid);
drop function public.is_movie_buff_room_member(uuid);
drop function public.is_buff_content_manager();

do $verify$
begin
  if to_regprocedure('public.is_movie_buff_room_member(uuid)') is not null
     or to_regprocedure('public.is_movie_buff_match_member(uuid)') is not null
     or to_regprocedure('public.is_movie_buff_round_member(uuid)') is not null
     or to_regprocedure('public.is_buff_content_manager()') is not null then
    raise exception 'Rollback verification failed: one or more reconciliation helpers remain.';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
