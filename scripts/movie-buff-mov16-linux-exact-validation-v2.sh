#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SCRIPT="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly EXPECTED_SOURCE_BLOB="a04985abe5e4ed83eab3ce8805824220f0321a3e"
readonly DERIVED_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-linux-exact-validation-v2-derived.sh"
readonly RUN_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-exact-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

actual_blob="$(git rev-parse "HEAD:${SOURCE_SCRIPT}")"
if [[ "${actual_blob}" != "${EXPECTED_SOURCE_BLOB}" ]]; then
  printf 'Unexpected MOV-16 controller blob: %s\n' "${actual_blob}" >&2
  exit 1
fi

mkdir -p "${RUN_ROOT}"
if [[ ! -e "${RUN_ROOT}/node_modules" ]]; then
  ln -s "${GITHUB_WORKSPACE:-$(pwd)}/node_modules" "${RUN_ROOT}/node_modules"
fi

python3 - "${SOURCE_SCRIPT}" "${DERIVED_SCRIPT}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
substitutions = [
    (
'''if "p_required_player_ids" not in source:
    raise SystemExit("MOV-17 does not supply the exact required-human identity snapshot")
''',
'''for token in [
    "public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])",
    "v_required_ids",
    "array_agg(seat.original_player_id order by seat.seat_index)",
]:
    if token not in source:
        raise SystemExit(f"MOV-17 required-human snapshot contract is missing {token}")
'''
    ),
    (
'''  echo "branch=$(git branch --show-current)"
''',
'''  echo "branch=${EXPECTED_BRANCH}"
'''
    ),
    (
'''    node scripts/movie-buff-mov16-deadline-release-race.mjs \\
''',
'''    node scripts/movie-buff-mov16-deadline-release-race-v2.mjs \\
'''
    ),
    (
'''    node "${HARNESS}" >"${RAW}/adversarial-${suffix}.log" 2>&1
''',
'''    node scripts/movie-buff-mov16-adversarial-v3-wrapper.mjs "${HARNESS}" >"${RAW}/adversarial-${suffix}.log" 2>&1
'''
    ),
    (
'''if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-before.txt"
  record_exit "snapshot-before" $?
fi
''',
'''if require_ready; then
  sha256sum \
    supabase/rollbacks/20260804073100_movie_buff_vip_null_category_fail_closed.rollback.sql \
    >"${RAW}/mov16-73100-rollback-sha256.txt"
  record_exit "mov16-73100-rollback-sha256" $?
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-before-73100-rollback.txt"
  record_exit "snapshot-before-73100-rollback" $?
fi

if require_ready; then
  psql "${database_url}" -X -Atq -v ON_ERROR_STOP=1 -c "
    select pg_catalog.pg_get_functiondef(
      'public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)'::pg_catalog.regprocedure
    );
  " >"${RAW}/helper-before-73100-rollback.sql" \
    2>"${RAW}/helper-before-73100-rollback.error"
  record_exit "helper-before-73100-rollback" $?
fi

if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f supabase/rollbacks/20260804073100_movie_buff_vip_null_category_fail_closed.rollback.sql \
    >"${RAW}/rollback-73100.log" 2>&1
  record_exit "rollback-73100" $?
fi

if require_ready; then
  psql "${database_url}" -X -Atq -v ON_ERROR_STOP=1 -c "
    select case
      when pg_catalog.count(*) = 1
       and pg_catalog.bool_and(r.rolname = 'postgres')
       and pg_catalog.bool_and(p.prosecdef)
       and pg_catalog.bool_and(
         p.proconfig = array['search_path=pg_catalog']::text[]
       )
       and pg_catalog.bool_and(
         not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
       )
       and pg_catalog.bool_and(
         not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )
       and pg_catalog.bool_and(
         not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
       )
       and pg_catalog.bool_and(
         not exists (
           select 1
           from pg_catalog.aclexplode(
             pg_catalog.coalesce(
               p.proacl,
               pg_catalog.acldefault('f', p.proowner)
             )
           ) as acl
           where acl.grantee = 0
             and acl.privilege_type = 'EXECUTE'
         )
       )
       and pg_catalog.bool_and(
         pg_catalog.strpos(
           pg_catalog.pg_get_functiondef(p.oid),
           'v_match.category_id is null'
         ) = 0
       )
       and pg_catalog.bool_and(
         pg_catalog.strpos(
           pg_catalog.pg_get_functiondef(p.oid),
           'and not (v_match.category_id = any(v_definition.allowed_category_ids)) then'
         ) > 0
       )
      then 'PASS'
      else 'FAIL'
    end
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    join pg_catalog.pg_roles as r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.oid =
        'public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)'::pg_catalog.regprocedure;
  " >"${RAW}/rollback-73100-probe.txt" \
    2>"${RAW}/rollback-73100-probe.error"
  code=$?
  if [[ "${code}" -eq 0 && "$(cat "${RAW}/rollback-73100-probe.txt")" == "PASS" ]]; then
    record_exit "rollback-73100-probe" 0
  else
    record_exit "rollback-73100-probe" 1
  fi
fi

if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql \
    >"${RAW}/reapply-73100.log" 2>&1
  record_exit "reapply-73100" $?
fi

if require_ready; then
  psql "${database_url}" -X -Atq -v ON_ERROR_STOP=1 -c "
    select pg_catalog.pg_get_functiondef(
      'public.movie_buff_vip_ineligibility_reason(uuid,uuid,uuid,uuid,uuid,timestamptz)'::pg_catalog.regprocedure
    );
  " >"${RAW}/helper-after-73100-reapply.sql" \
    2>"${RAW}/helper-after-73100-reapply.error"
  code=$?
  if [[ "${code}" -eq 0 ]]; then
    diff -u \
      "${RAW}/helper-before-73100-rollback.sql" \
      "${RAW}/helper-after-73100-reapply.sql" \
      >"${RAW}/helper-73100-reapply-diff.log" 2>&1
    code=$?
  fi
  record_exit "helper-73100-reapply-equality" "${code}"
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-after-73100-reapply.txt"
  code=$?
  if [[ "${code}" -eq 0 ]]; then
    diff -u \
      "${RAW}/vip-data-before-73100-rollback.txt" \
      "${RAW}/vip-data-after-73100-reapply.txt" \
      >"${RAW}/rollback-73100-data-diff.log" 2>&1
    code=$?
  fi
  record_exit "rollback-73100-data-equality" "${code}"
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-before.txt"
  record_exit "snapshot-before" $?
fi
'''
    ),
    (
'''if require_ready; then
  run_pgtap "pgtap-after-reapply"
fi
''',
'''if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -v room_id="${room_id}" -v definition_id="${definition_id}" <<'SQL' \
    >"${RAW}/sentinel-data-pre-pgtap-cleanup.log" 2>&1
begin;
delete from public.game_rooms where id=:'room_id'::uuid;
delete from public.movie_buff_vip_inventory where vip_id=:'definition_id'::uuid;
delete from public.movie_buff_vip_definitions where id=:'definition_id'::uuid;
commit;
SQL
  record_exit "sentinel-data-pre-pgtap-cleanup" $?
fi

if require_ready; then
  run_pgtap "pgtap-after-reapply"
fi
'''
    ),
    (
'''node scripts/movie-buff-mov16-evidence-guard.mjs --verify-evidence "${EVIDENCE}" \\
''',
'''node scripts/movie-buff-mov16-evidence-verify-v2.mjs "${EVIDENCE}" \\
'''
    ),
]
for old, new in substitutions:
    if source.count(old) != 1:
        raise SystemExit("Expected exactly one controller substitution: " + repr(old[:80]))
    source = source.replace(old, new)
pathlib.Path(sys.argv[2]).write_text(source, encoding="utf-8")
PY

bash -n "${DERIVED_SCRIPT}"
exec bash "${DERIVED_SCRIPT}"
