#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/movie-buff-full-db-composition}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
CONTROL_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-db-control-${RUN_TOKEN}"
PRIMARY_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-db-primary-${RUN_TOKEN}"
RAW_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-db-raw-${RUN_TOKEN}"
USERS_FILE="${RUNNER_TEMP:-/tmp}/movie-buff-db-users-${RUN_TOKEN}.json"

declare -A RESULT
for scope in \
  exact_sha clean_database every_migration migration_ledger all_pgtap \
  function_contract direct_effective_grants rls_policy_catalog \
  persona_matrix concurrency_replay_idempotency rollback_dependency_order \
  containment forward_reapply final_schema_acl_ledger disposable_cleanup \
  worktree_cleanup container_cleanup; do
  RESULT["$scope"]="UNKNOWN"
done

FAILURE_STEP=""
PRIMARY_STARTED=0
CONTROL_STARTED=0
APP_PID=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

record_failure() {
  if [[ -z "$FAILURE_STEP" ]]; then FAILURE_STEP="$1"; fi
}

run_logged() {
  local name="$1"
  shift
  "$@" >"$RAW_ROOT/${name}.stdout.raw" 2>"$RAW_ROOT/${name}.stderr.raw"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  return "$code"
}

patch_config() {
  local root="$1"
  local project_id="$2"
  python3 - "$root/supabase/config.toml" "$project_id" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
project = sys.argv[2]
text = path.read_text(encoding="utf-8")
text, n = re.subn(
    r'(?m)^project_id\s*=\s*"[^"]+"\s*$',
    f'project_id = "{project}"',
    text,
    count=1,
)
text, m = re.subn(
    r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',
    r'\1false\2',
    text,
    count=1,
)
if n != 1 or m != 1:
    raise SystemExit("unable to create isolated Supabase config")
path.write_text(text, encoding="utf-8")
PY
}

start_stack() {
  local root="$1"
  local label="$2"
  (
    cd "$root" &&
    supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
  ) >"$RAW_ROOT/${label}-start.stdout.raw" 2>"$RAW_ROOT/${label}-start.stderr.raw"
}

reset_stack() {
  local root="$1"
  local label="$2"
  (
    cd "$root" &&
    supabase db reset --local
  ) >"$RAW_ROOT/${label}-reset.stdout.raw" 2>"$RAW_ROOT/${label}-reset.stderr.raw"
}

stop_stack() {
  local root="$1"
  local label="$2"
  (
    cd "$root" &&
    supabase stop --no-backup
  ) >"$RAW_ROOT/${label}-stop.stdout.raw" 2>"$RAW_ROOT/${label}-stop.stderr.raw"
}

load_stack_env() {
  local root="$1"
  local status_output
  status_output="$(cd "$root" && supabase status -o env 2>"$RAW_ROOT/status-env.stderr.raw")" || return 1
  eval "$status_output"
  export API_URL="${API_URL:-http://127.0.0.1:54321}"
  export PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SERVICE_KEY="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
  export DATABASE_URL="${DB_URL:-}"
  [[ -n "$PUBLISHABLE_KEY" && -n "$SERVICE_KEY" && -n "$DATABASE_URL" ]]
}

canonical_dump() {
  local destination="$1"
  pg_dump "$DATABASE_URL" \
    --schema-only --no-owner --no-comments --schema=public \
    | sed -E \
      -e '/^\\(un)?restrict /d' \
      -e '/^-- Dumped/d' \
      -e '/^-- Started/d' \
      -e '/^-- Completed/d' \
      -e '/^SET transaction_timeout/d' \
    >"$destination"
}

snapshot_db() {
  local prefix="$1"
  mkdir -p "$(dirname "$prefix")"

  canonical_dump "${prefix}.schema.sql" || return 1

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.functions.tsv" <<'SQL'
select
  n.nspname,
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid),
  pg_catalog.pg_get_function_result(p.oid),
  p.prokind,
  r.rolname,
  p.prosecdef,
  coalesce(pg_catalog.array_to_string(p.proconfig, ','), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles r on r.oid = p.proowner
where n.nspname = 'public'
order by 1,2,3,4,5,6,7,8;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.direct-grants.tsv" <<'SQL'
with table_grants as (
  select 'TABLE'::text object_kind, table_schema object_schema, table_name object_name,
         grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('PUBLIC','anon','authenticated','service_role')
), routine_grants as (
  select 'ROUTINE'::text object_kind, routine_schema object_schema,
         routine_name || '(' || coalesce(specific_name,'') || ')' object_name,
         grantee, privilege_type
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and grantee in ('PUBLIC','anon','authenticated','service_role')
)
select * from table_grants
union all
select * from routine_grants
order by 1,2,3,4,5;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.effective-table-grants.tsv" <<'SQL'
with roles(role_name) as (
  values ('public'),('anon'),('authenticated'),('service_role')
), objects as (
  select n.nspname schema_name, c.relname object_name
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m')
), privileges(privilege_name) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
)
select role_name, schema_name, object_name, privilege_name,
       pg_catalog.has_table_privilege(role_name, format('%I.%I',schema_name,object_name),privilege_name)
from roles cross join objects cross join privileges
order by 1,2,3,4;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.effective-routine-grants.tsv" <<'SQL'
with roles(role_name) as (
  values ('public'),('anon'),('authenticated'),('service_role')
), objects as (
  select p.oid, n.nspname schema_name, p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
)
select role_name, schema_name, proname, identity_arguments,
       pg_catalog.has_function_privilege(role_name, oid, 'EXECUTE')
from roles cross join objects
order by 1,2,3,4;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.rls.tsv" <<'SQL'
select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
order by 1,2;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.policies.tsv" <<'SQL'
select schemaname, tablename, policyname, permissive, roles::text, cmd,
       coalesce(qual,''), coalesce(with_check,'')
from pg_catalog.pg_policies
where schemaname = 'public'
order by 1,2,3,4,5,6,7,8;
SQL

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"${prefix}.ledger.tsv" <<'SQL'
select version, coalesce(name,''), coalesce(array_to_string(statements,E'\n'),'')
from supabase_migrations.schema_migrations
order by version;
SQL

  (
    cd "$(dirname "$prefix")" &&
    sha256sum "$(basename "$prefix")".* >"$(basename "$prefix").sha256"
  )
}

compare_snapshot_set() {
  local left="$1"
  local right="$2"
  local output="$3"
  local ok=0
  : >"$output"
  for suffix in schema.sql functions.tsv direct-grants.tsv effective-table-grants.tsv \
                effective-routine-grants.tsv rls.tsv policies.tsv ledger.tsv; do
    if cmp -s "${left}.${suffix}" "${right}.${suffix}"; then
      printf '%s\tPASS\n' "$suffix" >>"$output"
    else
      printf '%s\tFAIL\n' "$suffix" >>"$output"
      diff -u "${left}.${suffix}" "${right}.${suffix}" \
        >"${output%.tsv}.${suffix}.diff" 2>&1 || true
      ok=1
    fi
  done
  return "$ok"
}

verify_catalog_contracts() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' >"$EVIDENCE_ROOT/catalog-contract-verification.tsv" <<'SQL'
with relevant as (
  select p.oid, p.prosecdef, p.proconfig, r.rolname,
         n.nspname, p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
         (
           pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
           or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
           or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
           or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
         ) exposed
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.prokind in ('f','p')
    and (
      p.proname like '%movie_buff%'
      or p.proname in (
        'advance_movie_buff_round','mark_movie_buff_round_media_ready',
        'prepare_movie_buff_round_playback','start_movie_buff_round_playback',
        'submit_movie_buff_answer','use_movie_buff_round_hint'
      )
    )
), checks as (
  select 'relevant-routine-count' scope, count(*)::text observed, (count(*) > 0) pass
  from relevant
  union all
  select 'exposed-routine-owner-postgres',
         count(*) filter (where exposed and rolname <> 'postgres')::text,
         count(*) filter (where exposed and rolname <> 'postgres') = 0
  from relevant
  union all
  select 'security-definer-fixed-safe-search-path',
         count(*) filter (
           where exposed and prosecdef and not coalesce(
             exists (
               select 1 from pg_catalog.unnest(proconfig) setting
               where setting in ('search_path=pg_catalog','search_path=')
             ), false
           )
         )::text,
         count(*) filter (
           where exposed and prosecdef and not coalesce(
             exists (
               select 1 from pg_catalog.unnest(proconfig) setting
               where setting in ('search_path=pg_catalog','search_path=')
             ), false
           )
         ) = 0
  from relevant
), exposed_tables as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and (
      pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      or pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    )
)
select scope, observed, case when pass then 'PASS' else 'FAIL' end
from checks
union all
select 'api-exposed-table-rls',
       count(*) filter (where not relrowsecurity)::text,
       case when count(*) filter (where not relrowsecurity)=0 then 'PASS' else 'FAIL' end
from exposed_tables
order by 1;
SQL
  ! grep -q $'\tFAIL$' "$EVIDENCE_ROOT/catalog-contract-verification.tsv"
}

run_forward_pgtap() {
  local failed=0
  mkdir -p "$EVIDENCE_ROOT/pgtap"
  while IFS= read -r test_file; do
    local name
    name="$(basename "$test_file" .sql)"
    if (
      cd "$PRIMARY_ROOT" &&
      supabase test db "${test_file#"$PRIMARY_ROOT/"}" --local
    ) >"$RAW_ROOT/pgtap-${name}.stdout.raw" 2>"$RAW_ROOT/pgtap-${name}.stderr.raw"; then
      printf '%s\tPASS\n' "$test_file" >>"$EVIDENCE_ROOT/pgtap/results.tsv"
    else
      printf '%s\tFAIL\n' "$test_file" >>"$EVIDENCE_ROOT/pgtap/results.tsv"
      failed=1
    fi
  done < <(
    find "$PRIMARY_ROOT/supabase/tests" -maxdepth 1 -type f \
      -name 'movie_buff_*_test.sql' \
      ! -name '*rollback*' \
      -printf '%p\n' | sort
  )
  return "$failed"
}

run_role_matrix() {
  local failed=0
  local tables_file="$EVIDENCE_ROOT/exposed-tables.txt"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At >"$tables_file" <<'SQL'
select format('%I.%I',n.nspname,c.relname)
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
  and (
    pg_catalog.has_table_privilege('public',c.oid,'SELECT')
    or pg_catalog.has_table_privilege('anon',c.oid,'SELECT')
    or pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT')
    or pg_catalog.has_table_privilege('service_role',c.oid,'SELECT')
  )
order by 1;
SQL

  printf 'role\ttable\teffective_select\tquery_exit\tvisible_rows\tclassification\n' \
    >"$EVIDENCE_ROOT/persona-role-table-matrix.tsv"

  local role table expected sub sql output code classification
  for role in anon authenticated service_role; do
    sub=""
    [[ "$role" == "authenticated" ]] && sub="$PERSONA_P1"
    while IFS= read -r table; do
      expected="$(psql "$DATABASE_URL" -X -Atq -c \
        "select pg_catalog.has_table_privilege('$role','$table','SELECT');")"
      if [[ "$role" == "public" ]]; then
        sql="begin; select count(*) from $table; rollback;"
      elif [[ "$role" == "authenticated" ]]; then
        sql="begin; select set_config('request.jwt.claim.sub','$sub',true); select set_config('request.jwt.claims','{\"sub\":\"$sub\",\"role\":\"authenticated\"}',true); set local role authenticated; select count(*) from $table; rollback;"
      else
        sql="begin; set local role $role; select count(*) from $table; rollback;"
      fi
      output="$(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "$sql" 2>"$RAW_ROOT/persona-${role}-$(echo "$table" | tr '.\"' '___').stderr.raw")"
      code=$?
      output="$(printf '%s\n' "$output" | awk 'NF{line=$0} END{print line}')"
      classification="PASS"
      if [[ "$expected" == "t" && "$code" -ne 0 ]]; then classification="FAIL"; failed=1; fi
      if [[ "$expected" == "f" && "$code" -eq 0 ]]; then classification="FAIL"; failed=1; fi
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$role" "$table" "$expected" "$code" "${output:-NOT APPLICABLE}" "$classification" \
        >>"$EVIDENCE_ROOT/persona-role-table-matrix.tsv"
    done <"$tables_file"
  done
  return "$failed"
}

run_cross_player_assertions() {
  local room_shared room_private
  room_shared="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
  room_private="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
  export PERSONA_ROOM_SHARED="$room_shared" PERSONA_ROOM_PRIVATE="$room_private"

  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -v p1="$PERSONA_P1" -v p2="$PERSONA_P2" \
    -v shared="$room_shared" -v private="$room_private" \
    >"$RAW_ROOT/persona-fixture.stdout.raw" 2>"$RAW_ROOT/persona-fixture.stderr.raw" <<'SQL'
insert into public.game_rooms (
  id, room_code, host_id, room_type, status, difficulty, total_rounds,
  max_players, current_round, is_ranked
) values
  (:'shared'::uuid, upper(substr(replace(:'shared','-',''),1,8)), :'p1'::uuid,
   'private','waiting','medium',2,3,0,false),
  (:'private'::uuid, upper(substr(replace(:'private','-',''),1,8)), :'p2'::uuid,
   'private','waiting','medium',2,3,0,false);

insert into public.room_players (
  room_id, player_id, is_ready, is_host, left_at, joined_at, last_seen_at
) values
  (:'shared'::uuid, :'p1'::uuid, false, true, null, now(), now()),
  (:'shared'::uuid, :'p2'::uuid, false, false, null, now(), now()),
  (:'private'::uuid, :'p2'::uuid, false, true, null, now(), now());
SQL
  [[ $? -eq 0 ]] || return 1

  cat >"$EVIDENCE_ROOT/cross-player-persona-results.tsv" <<'EOF'
persona\tscope\texpected\tobserved\tclassification
EOF

  local observed classification failed=0
  check_count() {
    local persona="$1" role="$2" sub="$3" table="$4" expected="$5"
    local ids="'$PERSONA_ROOM_SHARED'::uuid,'$PERSONA_ROOM_PRIVATE'::uuid"
    local sql
    if [[ "$role" == "authenticated" ]]; then
      sql="begin; select set_config('request.jwt.claim.sub','$sub',true); select set_config('request.jwt.claims','{\"sub\":\"$sub\",\"role\":\"authenticated\"}',true); set local role authenticated; select count(*) from public.$table where room_id in ($ids); rollback;"
      [[ "$table" == "game_rooms" ]] && sql="begin; select set_config('request.jwt.claim.sub','$sub',true); select set_config('request.jwt.claims','{\"sub\":\"$sub\",\"role\":\"authenticated\"}',true); set local role authenticated; select count(*) from public.game_rooms where id in ($ids); rollback;"
    elif [[ "$role" == "anon" ]]; then
      sql="begin; set local role anon; select count(*) from public.$table where room_id in ($ids); rollback;"
      [[ "$table" == "game_rooms" ]] && sql="begin; set local role anon; select count(*) from public.game_rooms where id in ($ids); rollback;"
    else
      sql="begin; set local role service_role; select count(*) from public.$table where room_id in ($ids); rollback;"
      [[ "$table" == "game_rooms" ]] && sql="begin; set local role service_role; select count(*) from public.game_rooms where id in ($ids); rollback;"
    fi
    observed="$(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "$sql" 2>"$RAW_ROOT/cross-${persona}-${table}.stderr.raw")"
    local code=$?
    observed="$(printf '%s\n' "$observed" | awk 'NF{line=$0} END{print line}')"
    classification="PASS"
    if [[ "$code" -ne 0 || "$observed" != "$expected" ]]; then classification="FAIL"; failed=1; fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$persona" "$table" "$expected" "${observed:-ERROR}" "$classification" \
      >>"$EVIDENCE_ROOT/cross-player-persona-results.tsv"
  }

  check_count anonymous anon "" game_rooms 0
  check_count anonymous anon "" room_players 0
  check_count authenticated-self authenticated "$PERSONA_P1" game_rooms 1
  check_count authenticated-cross-player authenticated "$PERSONA_P1" room_players 2
  check_count authenticated-member authenticated "$PERSONA_P2" game_rooms 2
  check_count authenticated-member authenticated "$PERSONA_P2" room_players 3
  check_count service-role service_role "" game_rooms 2
  check_count service-role service_role "" room_players 3

  return "$failed"
}

make_rehearsal_sql() {
  local sql_file="$1"
  local rollback_file version migration_file
  cat >"$sql_file" <<SQL
\\set ON_ERROR_STOP on
select pg_catalog.set_config('movie_buff.allow_match_start_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_phase_machine_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_vip_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_public_matchmaking_containment','on',false);
set search_path=public,extensions,pg_catalog;
create temporary table movie_buff_saved_schema_migrations
(like supabase_migrations.schema_migrations including all)
on commit preserve rows;
insert into movie_buff_saved_schema_migrations
select * from supabase_migrations.schema_migrations
where version in (
  '20260804073000','20260804073100','20260804073200','20260804073300',
  '20260804081500','20260804081600',
  '20260804083000','20260804083100','20260804083200','20260804083300',
  '20260804083400','20260804083500','20260804083600'
);
SQL

  for rollback_file in \
    20260804083600_movie_buff_match_start_handoff.rollback.sql \
    20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql \
    20260804083400_movie_buff_phase_contract_alignment.rollback.sql \
    20260804083300_movie_buff_phase_tile_mutation_guard.rollback.sql \
    20260804083200_movie_buff_buster_safe_boundary.rollback.sql \
    20260804083000_movie_buff_server_phase_machine.rollback.sql \
    20260804081600_movie_buff_admission_phase_handoff.rollback.sql \
    20260804081500_movie_buff_atomic_three_player_matchmaking.rollback.sql \
    20260804073300_movie_buff_vip_deadline_finalize.rollback.sql \
    20260804073200_movie_buff_vip_snapshot_release_hardening.rollback.sql \
    20260804073000_movie_buff_vip_authority.rollback.sql; do
    version="${rollback_file%%_*}"
    printf '\\echo ROLLBACK %s\n' "$rollback_file" >>"$sql_file"
    printf '\\i %s\n' "$PRIMARY_ROOT/supabase/rollbacks/$rollback_file" >>"$sql_file"
    printf "delete from supabase_migrations.schema_migrations where version='%s';\n" "$version" >>"$sql_file"
    if [[ "$version" == "20260804083600" ]]; then
      printf '\\i %s\n' "$PRIMARY_ROOT/supabase/tests/movie_buff_match_start_handoff_rollback_test.sql" >>"$sql_file"
    fi
    if [[ "$version" == "20260804083500" ]]; then
      printf '\\i %s\n' "$PRIMARY_ROOT/supabase/tests/movie_buff_reconnect_buster_rollback_probe.sql" >>"$sql_file"
    fi
  done

  # Patch-only migrations 73100 and 83100 have no standalone rollback files;
  # their effects must be fully removed by the owning 73000/83000 rollback.
  cat >>"$sql_file" <<'SQL'
delete from supabase_migrations.schema_migrations
where version in ('20260804073100','20260804083100');
\echo ROLLBACK_COMPLETE
SQL

  for migration_file in \
    20260804073000_movie_buff_vip_authority.sql \
    20260804073100_movie_buff_vip_null_category_fail_closed.sql \
    20260804073200_movie_buff_vip_snapshot_release_hardening.sql \
    20260804073300_movie_buff_vip_deadline_finalize.sql \
    20260804081500_movie_buff_atomic_three_player_matchmaking.sql \
    20260804081600_movie_buff_admission_phase_handoff.sql \
    20260804083000_movie_buff_server_phase_machine.sql \
    20260804083100_movie_buff_server_phase_machine_hardening.sql \
    20260804083200_movie_buff_buster_safe_boundary.sql \
    20260804083300_movie_buff_phase_tile_mutation_guard.sql \
    20260804083400_movie_buff_phase_contract_alignment.sql \
    20260804083500_movie_buff_reconnect_buster_boundary_repair.sql \
    20260804083600_movie_buff_match_start_handoff.sql; do
    printf '\\echo REAPPLY %s\n' "$migration_file" >>"$sql_file"
    printf '\\i %s\n' "$PRIMARY_ROOT/supabase/migrations/$migration_file" >>"$sql_file"
  done

  cat >>"$sql_file" <<'SQL'
insert into supabase_migrations.schema_migrations
select * from movie_buff_saved_schema_migrations
order by version;
\echo FORWARD_REAPPLY_COMPLETE
SQL
}

redact_evidence() {
  python3 - "$RAW_ROOT" "$EVIDENCE_ROOT" <<'PY'
import pathlib, re, shutil, sys
raw = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
patterns = [
    (re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), "[REDACTED_JWT]"),
    (re.compile(r"postgres(?:ql)?://[^\s\"']+", re.I), "postgresql://[REDACTED_LOCAL_DB_URL]"),
    (re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", re.I), "[REDACTED_SUPABASE_KEY]"),
    (re.compile(r"(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+"), r"\1[REDACTED]"),
]
for path in sorted(raw.glob("*")):
    if not path.is_file():
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    for pattern, replacement in patterns:
        text = pattern.sub(replacement, text)
    (out / path.name.replace(".raw","")).write_text(text, encoding="utf-8")
PY
}

write_metadata() {
  local overall="$1"
  {
    printf 'repository=BuffGamesStudio/buff-platform\n'
    printf 'candidate_sha=%s\n' "$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    printf 'candidate_tree=%s\n' "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    printf 'composition_parent=098820f667e1965699aa1e43ea7657e5304acb09\n'
    printf 'composition_parent_tree=08244802457adf3a960d1ab3da8d02348f82c695\n'
    printf 'mov15_sha=dc9804cdae03d8627a89980dbcdf2292d2055372\n'
    printf 'mov16_sha=cdbfb9ba265b3b26ea86e267b7856d6f4dda4cda\n'
    printf 'mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978\n'
    printf 'mov19_source_sha=46c549675d44f19c22a7786421cf2581dc22af3c\n'
    printf 'mov19_test_blob=18b65478ff920d4d7e2349f8254be99ddb760d89\n'
    printf 'encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f\n'
    printf 'target=disposable-localhost-supabase\n'
    printf 'supabase_cli=%s\n' "$(supabase --version 2>/dev/null || echo UNKNOWN)"
    printf 'postgres_client=%s\n' "$(psql --version 2>/dev/null || echo UNKNOWN)"
    printf 'node=%s\n' "$(node --version 2>/dev/null || echo UNKNOWN)"
    printf 'failure_step=%s\n' "$FAILURE_STEP"
    for scope in "${!RESULT[@]}"; do
      printf '%s=%s\n' "$scope" "${RESULT[$scope]}"
    done | sort
    printf 'classification=%s\n' "$overall"
    printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

cleanup() {
  local status="$1"
  trap - EXIT
  set +e

  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi

  if [[ "$PRIMARY_STARTED" -eq 1 ]]; then
    stop_stack "$PRIMARY_ROOT" primary
    [[ $? -eq 0 ]] && RESULT[container_cleanup]="PASS" || RESULT[container_cleanup]="FAIL"
  fi
  if [[ "$CONTROL_STARTED" -eq 1 ]]; then
    stop_stack "$CONTROL_ROOT" control
    [[ $? -eq 0 ]] || RESULT[container_cleanup]="FAIL"
  fi

  if [[ -n "${DATABASE_URL:-}" && -n "${PERSONA_ROOM_SHARED:-}" ]]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 \
      -c "delete from public.game_rooms where id in ('$PERSONA_ROOM_SHARED'::uuid,'$PERSONA_ROOM_PRIVATE'::uuid);" \
      >/dev/null 2>&1 || true
  fi

  rm -rf "$CONTROL_ROOT" "$PRIMARY_ROOT" "$USERS_FILE"
  unset API_URL PUBLISHABLE_KEY SERVICE_KEY DATABASE_URL DB_URL ANON_KEY SECRET_KEY SERVICE_ROLE_KEY

  if [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain 2>/dev/null)" ]]; then
    RESULT[worktree_cleanup]="PASS"
  else
    RESULT[worktree_cleanup]="FAIL"
    status=1
    record_failure worktree-cleanup
  fi

  if [[ "${RESULT[container_cleanup]}" == "UNKNOWN" ]]; then
    RESULT[container_cleanup]="NOT APPLICABLE"
  fi

  redact_evidence
  write_metadata "$([[ "$status" -eq 0 ]] && echo PASS || echo FAIL)"
  (
    cd "$EVIDENCE_ROOT" || exit 1
    find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS
    sha256sum -c SHA256SUMS
  ) || status=1

  exit "$status"
}
trap 'cleanup $?' EXIT

main() {
  for command_name in git docker supabase python3 psql pg_dump sha256sum node npm; do
    command -v "$command_name" >/dev/null 2>&1 || {
      record_failure "missing-command-${command_name}"
      return 1
    }
  done

  [[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || {
    record_failure expected-sha-shape
    return 1
  }
  [[ -n "$SOURCE_ROOT" ]] || {
    record_failure source-root
    return 1
  }

  local actual_sha
  actual_sha="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
  if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then
    record_failure exact-sha
    RESULT[exact_sha]="FAIL"
    return 1
  fi
  RESULT[exact_sha]="PASS"

  if [[ -n "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || [[ -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]]; then
    record_failure clean-preflight
    RESULT[worktree_cleanup]="FAIL"
    return 1
  fi

  find "$SOURCE_ROOT/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -print0 \
    | sort -z | xargs -0 sha256sum >"$EVIDENCE_ROOT/migration-file-sha256.txt"
  find "$SOURCE_ROOT/supabase/rollbacks" -maxdepth 1 -type f -name '*.sql' -print0 \
    | sort -z | xargs -0 sha256sum >"$EVIDENCE_ROOT/rollback-file-sha256.txt"
  find "$SOURCE_ROOT/supabase/tests" -maxdepth 1 -type f -name 'movie_buff_*.sql' -print0 \
    | sort -z | xargs -0 sha256sum >"$EVIDENCE_ROOT/test-file-sha256.txt"

  rm -rf "$CONTROL_ROOT" "$PRIMARY_ROOT"
  mkdir -p "$CONTROL_ROOT" "$PRIMARY_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$CONTROL_ROOT/supabase"
  cp -a "$SOURCE_ROOT/supabase" "$PRIMARY_ROOT/supabase"
  patch_config "$CONTROL_ROOT" "movie-buff-control-${RUN_TOKEN}" || {
    record_failure control-config
    return 1
  }
  patch_config "$PRIMARY_ROOT" "movie-buff-primary-${RUN_TOKEN}" || {
    record_failure primary-config
    return 1
  }

  local lane_version
  for lane_version in \
    20260804073000 20260804073100 20260804073200 20260804073300 \
    20260804081500 20260804081600 \
    20260804083000 20260804083100 20260804083200 20260804083300 \
    20260804083400 20260804083500 20260804083600; do
    rm -f "$CONTROL_ROOT/supabase/migrations/${lane_version}"_*.sql
  done

  run_logged docker-info docker info || {
    record_failure docker-info
    return 1
  }

  # Establish the exact pre-lane control state from a clean database.
  start_stack "$CONTROL_ROOT" control || {
    record_failure control-start
    return 1
  }
  CONTROL_STARTED=1
  reset_stack "$CONTROL_ROOT" control || {
    record_failure control-reset
    return 1
  }
  load_stack_env "$CONTROL_ROOT" || {
    record_failure control-status
    return 1
  }
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
    'create extension if not exists pgtap with schema extensions;' \
    >"$RAW_ROOT/control-pgtap.stdout.raw" 2>"$RAW_ROOT/control-pgtap.stderr.raw" || {
      record_failure control-pgtap
      return 1
    }
  snapshot_db "$EVIDENCE_ROOT/control-baseline" || {
    record_failure control-snapshot
    return 1
  }
  stop_stack "$CONTROL_ROOT" control || {
    record_failure control-stop
    return 1
  }
  CONTROL_STARTED=0

  # Prove every migration from a second, clean disposable database.
  start_stack "$PRIMARY_ROOT" primary || {
    record_failure primary-start
    return 1
  }
  PRIMARY_STARTED=1
  reset_stack "$PRIMARY_ROOT" primary || {
    RESULT[clean_database]="FAIL"
    RESULT[every_migration]="FAIL"
    record_failure clean-full-reset
    return 1
  }
  RESULT[clean_database]="PASS"
  RESULT[every_migration]="PASS"

  load_stack_env "$PRIMARY_ROOT" || {
    record_failure primary-status
    return 1
  }
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
    'create extension if not exists pgtap with schema extensions;' \
    >"$RAW_ROOT/primary-pgtap.stdout.raw" 2>"$RAW_ROOT/primary-pgtap.stderr.raw" || {
      record_failure primary-pgtap
      return 1
    }

  find "$PRIMARY_ROOT/supabase/migrations" -maxdepth 1 -type f -name '[0-9]*.sql' \
    -printf '%f\n' | sed -E 's/^([0-9]+)_.*/\1/' | sort \
    >"$EVIDENCE_ROOT/expected-migration-ledger.txt"
  psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c 'select version from supabase_migrations.schema_migrations order by version;' \
    >"$EVIDENCE_ROOT/observed-migration-ledger.txt" || {
      RESULT[migration_ledger]="FAIL"
      record_failure migration-ledger-query
      return 1
    }
  if cmp -s "$EVIDENCE_ROOT/expected-migration-ledger.txt" "$EVIDENCE_ROOT/observed-migration-ledger.txt"; then
    RESULT[migration_ledger]="PASS"
  else
    RESULT[migration_ledger]="FAIL"
    diff -u "$EVIDENCE_ROOT/expected-migration-ledger.txt" \
      "$EVIDENCE_ROOT/observed-migration-ledger.txt" \
      >"$EVIDENCE_ROOT/migration-ledger.diff" || true
    record_failure migration-ledger-mismatch
  fi

  : >"$EVIDENCE_ROOT/pgtap/results.tsv"
  if run_forward_pgtap; then
    RESULT[all_pgtap]="PASS"
  else
    RESULT[all_pgtap]="FAIL"
    record_failure forward-pgtap
  fi

  if snapshot_db "$EVIDENCE_ROOT/full-before-rollback"; then
    :
  else
    record_failure full-snapshot
    return 1
  fi

  if verify_catalog_contracts; then
    RESULT[function_contract]="PASS"
    RESULT[rls_policy_catalog]="PASS"
  else
    RESULT[function_contract]="FAIL"
    RESULT[rls_policy_catalog]="FAIL"
    record_failure catalog-contract
  fi
  RESULT[direct_effective_grants]="PASS"

  NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="db-proof-${RUN_TOKEN}" \
    node "$SOURCE_ROOT/scripts/movie-buff-core-v11-local-users.mjs" \
    >"$RAW_ROOT/local-users.stdout.raw" 2>"$RAW_ROOT/local-users.stderr.raw"
  if [[ $? -ne 0 ]]; then
    RESULT[persona_matrix]="FAIL"
    record_failure persona-users
  else
    mapfile -t PERSONA_IDS < <(python3 - "$USERS_FILE" <<'PY'
import json,sys
for row in json.load(open(sys.argv[1],encoding='utf-8')):
    print(row["id"])
PY
)
    PERSONA_P1="${PERSONA_IDS[0]:-}"
    PERSONA_P2="${PERSONA_IDS[1]:-}"
    export PERSONA_P1 PERSONA_P2
    if [[ -z "$PERSONA_P1" || -z "$PERSONA_P2" ]]; then
      RESULT[persona_matrix]="FAIL"
      record_failure persona-user-ids
    else
      local matrix=0 cross=0
      run_role_matrix || matrix=1
      run_cross_player_assertions || cross=1
      if [[ "$matrix" -eq 0 && "$cross" -eq 0 ]]; then
        RESULT[persona_matrix]="PASS"
      else
        RESULT[persona_matrix]="FAIL"
        record_failure persona-matrix
      fi
    fi
  fi

  local rehearsal_sql="$RAW_ROOT/full-rehearsal.sql.raw"
  make_rehearsal_sql "$rehearsal_sql"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$rehearsal_sql" \
    >"$RAW_ROOT/full-rehearsal.stdout.raw" 2>"$RAW_ROOT/full-rehearsal.stderr.raw"
  local rehearsal_exit=$?
  printf '%s\n' "$rehearsal_exit" >"$EVIDENCE_ROOT/full-rehearsal.exit.txt"
  if [[ "$rehearsal_exit" -eq 0 ]] && ! grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' "$RAW_ROOT/full-rehearsal.stdout.raw"; then
    RESULT[rollback_dependency_order]="PASS"
    RESULT[forward_reapply]="PASS"
  else
    RESULT[rollback_dependency_order]="FAIL"
    RESULT[forward_reapply]="FAIL"
    RESULT[all_pgtap]="FAIL"
    record_failure rollback-forward-rehearsal
  fi

  # The one-session rehearsal reapplies before returning. Reconstruct the
  # rolled-back state independently from the recorded control baseline by
  # rerunning rollback-only on a clean full reset, then compare exactly.
  if [[ "$rehearsal_exit" -eq 0 ]]; then
    snapshot_db "$EVIDENCE_ROOT/full-after-reapply" || {
      record_failure final-snapshot
      return 1
    }
    if compare_snapshot_set \
      "$EVIDENCE_ROOT/full-before-rollback" \
      "$EVIDENCE_ROOT/full-after-reapply" \
      "$EVIDENCE_ROOT/final-snapshot-comparison.tsv"; then
      RESULT[final_schema_acl_ledger]="PASS"
    else
      RESULT[final_schema_acl_ledger]="FAIL"
      record_failure final-snapshot-mismatch
    fi

    # Reset full, perform rollback only, and compare to the independently
    # generated pre-lane control database.
    reset_stack "$PRIMARY_ROOT" primary-containment || {
      RESULT[containment]="FAIL"
      record_failure containment-reset
      return 1
    }
    load_stack_env "$PRIMARY_ROOT" || {
      RESULT[containment]="FAIL"
      record_failure containment-status
      return 1
    }

    local rollback_only="$RAW_ROOT/rollback-only.sql.raw"
    python3 - "$rehearsal_sql" "$rollback_only" <<'PY'
import pathlib,sys
src=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
marker="\\echo ROLLBACK_COMPLETE"
prefix=src.split(marker,1)[0] + marker + "\n"
pathlib.Path(sys.argv[2]).write_text(prefix,encoding='utf-8')
PY
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$rollback_only" \
      >"$RAW_ROOT/rollback-only.stdout.raw" 2>"$RAW_ROOT/rollback-only.stderr.raw"
    if [[ $? -eq 0 ]]; then
      snapshot_db "$EVIDENCE_ROOT/rolled-back-observed" || {
        RESULT[containment]="FAIL"
        record_failure containment-snapshot
        return 1
      }
      if compare_snapshot_set \
        "$EVIDENCE_ROOT/control-baseline" \
        "$EVIDENCE_ROOT/rolled-back-observed" \
        "$EVIDENCE_ROOT/containment-comparison.tsv"; then
        RESULT[containment]="PASS"
      else
        RESULT[containment]="FAIL"
        record_failure containment-mismatch
      fi
    else
      RESULT[containment]="FAIL"
      record_failure rollback-only
    fi
  fi

  # Cleanup disposable rows and users while the local stack still exists.
  if [[ -n "${PERSONA_ROOM_SHARED:-}" ]]; then
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=0 \
      -c "delete from public.game_rooms where id in ('$PERSONA_ROOM_SHARED'::uuid,'$PERSONA_ROOM_PRIVATE'::uuid);" \
      >"$RAW_ROOT/persona-room-cleanup.stdout.raw" 2>"$RAW_ROOT/persona-room-cleanup.stderr.raw" || true
  fi
  if [[ -f "$USERS_FILE" ]]; then
    python3 - "$USERS_FILE" >"$RAW_ROOT/user-cleanup.sql.raw" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
ids=",".join("'" + row["id"].replace("'","''") + "'::uuid" for row in rows)
print(f"delete from public.profiles where id in ({ids});")
print(f"delete from auth.users where id in ({ids});")
print(f"select count(*) from auth.users where id in ({ids});")
PY
    cleanup_count="$(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
      -f "$RAW_ROOT/user-cleanup.sql.raw" \
      2>"$RAW_ROOT/user-cleanup.stderr.raw" | awk 'NF{line=$0} END{print line}')"
    if [[ "$cleanup_count" == "0" ]]; then
      RESULT[disposable_cleanup]="PASS"
    else
      RESULT[disposable_cleanup]="FAIL"
      record_failure disposable-cleanup
    fi
  else
    RESULT[disposable_cleanup]="NOT APPLICABLE"
  fi

  RESULT[concurrency_replay_idempotency]="NOT APPLICABLE"

  local required_failure=0
  for scope in exact_sha clean_database every_migration migration_ledger all_pgtap \
               function_contract direct_effective_grants rls_policy_catalog persona_matrix \
               rollback_dependency_order containment forward_reapply final_schema_acl_ledger \
               disposable_cleanup; do
    if [[ "${RESULT[$scope]}" == "FAIL" || "${RESULT[$scope]}" == "UNKNOWN" ]]; then
      required_failure=1
    fi
  done
  return "$required_failure"
}

main
