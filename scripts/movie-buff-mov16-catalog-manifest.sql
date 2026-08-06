with expected(identity) as (
  values
    ('public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)'::regprocedure),
    ('public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])'::regprocedure),
    ('public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz)'::regprocedure),
    ('public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'::regprocedure),
    ('public.set_movie_buff_vip_activation_phase(uuid,uuid,text)'::regprocedure),
    ('public.get_movie_buff_vip_round_view(uuid,uuid)'::regprocedure),
    ('public.lock_movie_buff_round_vip(uuid,uuid,uuid,text)'::regprocedure),
    ('public.activate_movie_buff_round_vip(uuid,uuid,text)'::regprocedure),
    ('public.finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)'::regprocedure)
),
function_rows as (
  select
    p.oid,
    p.oid::regprocedure::text as identity,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
    owner_role.rolname as owner,
    p.prosecdef as security_definer,
    p.proconfig as configuration,
    pg_catalog.jsonb_build_object(
      'PUBLIC', pg_catalog.jsonb_build_object(
        'direct', exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        ),
        'effective', exists (
          select 1
          from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        )
      ),
      'anon', pg_catalog.jsonb_build_object(
        'direct', exists (
          select 1
          from pg_catalog.pg_roles as role
          cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
          where role.rolname = 'anon' and acl.grantee = role.oid and acl.privilege_type = 'EXECUTE'
        ),
        'effective', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      ),
      'authenticated', pg_catalog.jsonb_build_object(
        'direct', exists (
          select 1
          from pg_catalog.pg_roles as role
          cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
          where role.rolname = 'authenticated' and acl.grantee = role.oid and acl.privilege_type = 'EXECUTE'
        ),
        'effective', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ),
      'service_role', pg_catalog.jsonb_build_object(
        'direct', exists (
          select 1
          from pg_catalog.pg_roles as role
          cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as acl
          where role.rolname = 'service_role' and acl.grantee = role.oid and acl.privilege_type = 'EXECUTE'
        ),
        'effective', pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
    ) as execute_matrix,
    coalesce((
      select pg_catalog.jsonb_agg(dependency.object_identity order by dependency.object_identity)
      from (
        select distinct
          case d.refclassid
            when 'pg_catalog.pg_class'::regclass then
              pg_catalog.concat('relation:', d.refobjid::regclass::text)
            when 'pg_catalog.pg_proc'::regclass then
              pg_catalog.concat('function:', d.refobjid::regprocedure::text)
            when 'pg_catalog.pg_type'::regclass then
              pg_catalog.concat('type:', pg_catalog.format_type(d.refobjid, null))
            when 'pg_catalog.pg_namespace'::regclass then
              pg_catalog.concat('schema:', namespace.nspname)
            when 'pg_catalog.pg_extension'::regclass then
              pg_catalog.concat('extension:', extension.extname)
            else
              pg_catalog.concat(d.refclassid::regclass::text, ':', d.refobjid::text)
          end as object_identity
        from pg_catalog.pg_depend as d
        left join pg_catalog.pg_namespace as namespace
          on d.refclassid = 'pg_catalog.pg_namespace'::regclass
         and namespace.oid = d.refobjid
        left join pg_catalog.pg_extension as extension
          on d.refclassid = 'pg_catalog.pg_extension'::regclass
         and extension.oid = d.refobjid
        where d.classid = 'pg_catalog.pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype in ('n', 'a')
      ) as dependency
    ), '[]'::jsonb) as dependencies
  from expected
  join pg_catalog.pg_proc as p on p.oid = expected.identity
  join pg_catalog.pg_roles as owner_role on owner_role.oid = p.proowner
)
select pg_catalog.jsonb_pretty(
  pg_catalog.jsonb_build_object(
    'generatedAt', pg_catalog.clock_timestamp(),
    'functionCount', (select count(*) from function_rows),
    'functions', (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'identity', identity,
          'name', proname,
          'identityArguments', identity_arguments,
          'owner', owner,
          'securityDefiner', security_definer,
          'configuration', configuration,
          'execute', execute_matrix,
          'dependencies', dependencies
        )
        order by identity
      )
      from function_rows
    )
  )
);
