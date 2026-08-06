begin;
create extension if not exists pgtap;
select plan(18);

create temporary table mov16_expected_functions (
  identity regprocedure primary key,
  public_execute boolean not null,
  anon_execute boolean not null,
  authenticated_execute boolean not null,
  service_role_execute boolean not null
) on commit drop;

insert into mov16_expected_functions values
  ('public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)',false,false,false,false),
  ('public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])',false,false,false,true),
  ('public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)',false,false,false,true),
  ('public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)',false,false,false,true),
  ('public.set_movie_buff_vip_activation_phase(uuid,uuid,text)',false,false,false,true),
  ('public.get_movie_buff_vip_round_view(uuid,uuid)',false,false,true,true),
  ('public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)',false,false,true,true),
  ('public.activate_movie_buff_round_vip(uuid,uuid,text)',false,false,true,true),
  ('public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)',false,false,false,true);

select is((select count(*)::integer from mov16_expected_functions),9,'nine exact MOV-16 regprocedures are declared');

select is((
  select count(*)::integer
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'movie_buff_vip_ineligibility_reason','open_movie_buff_vip_round_window',
    'release_movie_buff_vip_required_player','set_movie_buff_vip_activation_phase',
    'get_movie_buff_vip_round_view','lock_movie_buff_round_vip',
    'activate_movie_buff_round_vip','finalize_movie_buff_vip_round_window'
  )
),9,'no missing or unsafe MOV-16 overload exists');

select is((
  select count(*)::integer
  from mov16_expected_functions e
  join pg_catalog.pg_proc p on p.oid=e.identity
  join pg_catalog.pg_roles r on r.oid=p.proowner
  where r.rolname='postgres' and p.prosecdef
    and p.proconfig=array['search_path=pg_catalog']::text[]
),9,'all functions are postgres-owned SECURITY DEFINER with exact pg_catalog path');

with roles(role_name,role_oid) as (
  values ('PUBLIC'::text,0::oid)
  union all select rolname,oid from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
), matrix as (
  select e.identity, roles.role_name, roles.role_oid,
    case roles.role_name
      when 'PUBLIC' then e.public_execute
      when 'anon' then e.anon_execute
      when 'authenticated' then e.authenticated_execute
      when 'service_role' then e.service_role_execute
    end expected
  from mov16_expected_functions e cross join roles
)
select is((
  select count(*)::integer from matrix m
  where m.expected is distinct from exists (
    select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
    ) acl
    where p.oid=m.identity and acl.grantee=m.role_oid
      and acl.privilege_type='EXECUTE'
  )
),0,'direct EXECUTE matrix matches PUBLIC/anon/authenticated/service_role exactly');

with matrix(identity,role_name,expected) as (
  select identity,'public',public_execute from mov16_expected_functions union all
  select identity,'anon',anon_execute from mov16_expected_functions union all
  select identity,'authenticated',authenticated_execute from mov16_expected_functions union all
  select identity,'service_role',service_role_execute from mov16_expected_functions
)
select is((
  select count(*)::integer from matrix
  where expected is distinct from pg_catalog.has_function_privilege(role_name,identity,'EXECUTE')
),0,'effective inherited EXECUTE matrix matches exactly');

select is((
  select count(*)::integer from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='finalize_movie_buff_vip_round_window'
),1,'finalizer has exactly one overload');

select ok(pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(
  'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)'::regprocedure
)),'explicit required-human participant ids are required')>0,
'count-derived open overload fails closed');

select ok(pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])'::regprocedure
),'select distinct player_id')>0
and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(
  'public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])'::regprocedure
)),'duplicate players')>0,
'exact required-human snapshots are deduplicated and duplicates fail closed');

select ok(pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(
  'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
)),'contradictory vip finalization deadline')>0
and pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
),'required.released_at is null')>0,
'finalizer binds exact deadline and excludes released humans');

select ok(pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
),'locked.vip_id is null')>0
and pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
),'locked.inventory_id is null')>0,
'deadline passes are explicit null-VIP null-inventory locks');

select ok(pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure
),'movie-buff-vip-window|')>0
and pg_catalog.strpos(pg_catalog.pg_get_functiondef(
  'public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure
),'movie-buff-vip-window|')>0,
'release and finalization share one advisory lock');

select ok(pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(
  'public.activate_movie_buff_round_vip(uuid,uuid,text)'::regprocedure
)),'movie_buff_match_phase_state')=0
and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(
  'public.activate_movie_buff_round_vip(uuid,uuid,text)'::regprocedure
)),'phase_deadline')=0,
'activation cannot reset MOV-17 shared phase state or deadline');

select is((
  select count(*)::integer from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (
    'movie_buff_vip_definitions','movie_buff_vip_inventory',
    'movie_buff_vip_round_windows','movie_buff_vip_round_required_players',
    'movie_buff_vip_round_locks','movie_buff_vip_consumptions'
  ) and c.relrowsecurity
),6,'all six MOV-16 tables have RLS');

with tables(name) as (values
 ('movie_buff_vip_definitions'),('movie_buff_vip_inventory'),
 ('movie_buff_vip_round_windows'),('movie_buff_vip_round_required_players'),
 ('movie_buff_vip_round_locks'),('movie_buff_vip_consumptions')
)
select is((select count(*)::integer from tables where
  pg_catalog.has_table_privilege('anon',pg_catalog.format('public.%I',name),'SELECT')
  or pg_catalog.has_table_privilege('anon',pg_catalog.format('public.%I',name),'INSERT')
  or pg_catalog.has_table_privilege('anon',pg_catalog.format('public.%I',name),'UPDATE')
  or pg_catalog.has_table_privilege('anon',pg_catalog.format('public.%I',name),'DELETE')
  or pg_catalog.has_table_privilege('authenticated',pg_catalog.format('public.%I',name),'SELECT')
  or pg_catalog.has_table_privilege('authenticated',pg_catalog.format('public.%I',name),'INSERT')
  or pg_catalog.has_table_privilege('authenticated',pg_catalog.format('public.%I',name),'UPDATE')
  or pg_catalog.has_table_privilege('authenticated',pg_catalog.format('public.%I',name),'DELETE')
),0,'anon and authenticated have no broad table CRUD');

with tables(name) as (values
 ('movie_buff_vip_definitions'),('movie_buff_vip_inventory'),
 ('movie_buff_vip_round_windows'),('movie_buff_vip_round_required_players'),
 ('movie_buff_vip_round_locks'),('movie_buff_vip_consumptions')
)
select is((select count(*)::integer from tables where
  pg_catalog.has_table_privilege('service_role',pg_catalog.format('public.%I',name),'SELECT')
  and pg_catalog.has_table_privilege('service_role',pg_catalog.format('public.%I',name),'INSERT')
  and pg_catalog.has_table_privilege('service_role',pg_catalog.format('public.%I',name),'UPDATE')
  and pg_catalog.has_table_privilege('service_role',pg_catalog.format('public.%I',name),'DELETE')
),6,'service_role retains intended table CRUD');

select is((
  select count(*)::integer from mov16_expected_functions e
  where not exists (
    select 1 from pg_catalog.pg_depend d
    where d.classid='pg_catalog.pg_proc'::regclass and d.objid=e.identity::oid
  )
),0,'every MOV-16 function has catalog dependencies');

select is((select count(*)::integer from public.movie_buff_vip_definitions),0,
'migrations seed no VIP definitions');
select is((select count(*)::integer from public.movie_buff_vip_inventory),0,
'migrations seed no VIP inventory');

select * from finish();
rollback;
