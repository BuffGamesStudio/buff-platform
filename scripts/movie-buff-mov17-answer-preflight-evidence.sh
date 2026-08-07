#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/mov17-answer-preflight-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/mov17-answer-preflight-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
FAILURE_STEP=""
OVERALL=0
STACK_START="UNKNOWN"
MIGRATION_APPLY="UNKNOWN"
INITIAL_PGTAP="UNKNOWN"
ROLLBACK_APPLY="UNKNOWN"
ROLLBACK_PROBE="UNKNOWN"
FORWARD_REAPPLY="UNKNOWN"
FINAL_PGTAP="UNKNOWN"
BOARD_REGRESSION="UNKNOWN"
SERVER_REGRESSION="UNKNOWN"
ACL_VERIFY="UNKNOWN"
CLEANUP="UNKNOWN"

mkdir -p "${EVIDENCE_ROOT}" "${RAW_ROOT}"

redact_file() {
  local source="$1" destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib
import re
import sys
source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else ""
patterns = [
    (r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]"),
    (r"postgres(?:ql)?://[^\s]+", "postgresql://[REDACTED_LOCAL_DB_URL]"),
    (r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[REDACTED_SUPABASE_KEY]"),
    (r"(?i)(password=)[^\s]+", r"\1[REDACTED]"),
]
for pattern, replacement in patterns:
    text = re.sub(pattern, replacement, text)
destination.write_text(text, encoding="utf-8")
PY
}

run_step() {
  local name="$1"
  shift
  local stdout_raw="${RAW_ROOT}/${name}.stdout.raw"
  local stderr_raw="${RAW_ROOT}/${name}.stderr.raw"
  "$@" >"${stdout_raw}" 2>"${stderr_raw}"
  local code=$?
  printf '%s\n' "${code}" >"${EVIDENCE_ROOT}/${name}.exit.txt"
  redact_file "${stdout_raw}" "${EVIDENCE_ROOT}/${name}.stdout.txt"
  redact_file "${stderr_raw}" "${EVIDENCE_ROOT}/${name}.stderr.txt"
  rm -f "${stdout_raw}" "${stderr_raw}"
  return "${code}"
}

fail() {
  FAILURE_STEP="$1"
  OVERALL=1
  return 1
}

write_metadata() {
  {
    echo "lane=MOV-17-answer-phase-preflight"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "source_sha=$(git -C "${SOURCE_ROOT}" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=${EXPECTED_SHA}"
    echo "target=disposable-localhost"
    echo "migration=20260804083720_movie_buff_answer_phase_preflight"
    echo "stack_start=${STACK_START}"
    echo "migration_apply=${MIGRATION_APPLY}"
    echo "initial_pgtap=${INITIAL_PGTAP}"
    echo "rollback_apply=${ROLLBACK_APPLY}"
    echo "rollback_probe=${ROLLBACK_PROBE}"
    echo "forward_reapply=${FORWARD_REAPPLY}"
    echo "final_pgtap=${FINAL_PGTAP}"
    echo "board_boundary_regression=${BOARD_REGRESSION}"
    echo "server_phase_regression=${SERVER_REGRESSION}"
    echo "acl_verify=${ACL_VERIFY}"
    echo "cleanup=${CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=$([[ "${OVERALL}" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "rendered_browser=UNKNOWN"
    echo "combined_mov15_mov16_mov17=UNKNOWN"
    echo "hosted_state=UNTOUCHED"
    echo "production_state=UNTOUCHED"
    echo "supabase_cli_version=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "docker_version=$(docker --version 2>/dev/null || echo UNKNOWN)"
    echo "psql_version=$(psql --version 2>/dev/null || echo UNKNOWN)"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${EVIDENCE_ROOT}/metadata.txt"
}

hash_evidence() {
  (
    cd "${EVIDENCE_ROOT}" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z | xargs -0 sha256sum >sha256.txt
    sha256sum -c sha256.txt
  )
}

cleanup() {
  set +e
  if [[ -d "${WORK_ROOT}/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "${WORK_ROOT}" && supabase stop --no-backup) \
      >"${RAW_ROOT}/cleanup.stdout.raw" 2>"${RAW_ROOT}/cleanup.stderr.raw"
    local cleanup_exit=$?
    printf '%s\n' "${cleanup_exit}" >"${EVIDENCE_ROOT}/cleanup.exit.txt"
    redact_file "${RAW_ROOT}/cleanup.stdout.raw" "${EVIDENCE_ROOT}/cleanup.stdout.txt"
    redact_file "${RAW_ROOT}/cleanup.stderr.raw" "${EVIDENCE_ROOT}/cleanup.stderr.txt"
    if [[ "${cleanup_exit}" -eq 0 ]]; then
      CLEANUP="PASS"
    else
      CLEANUP="FAIL"
      OVERALL=1
      [[ -n "${FAILURE_STEP}" ]] || FAILURE_STEP="cleanup"
    fi
  else
    CLEANUP="NOT APPLICABLE"
  fi
  rm -rf "${WORK_ROOT}"
  unset PGPASSWORD DB_URL ANON_KEY SERVICE_ROLE_KEY
  write_metadata
  hash_evidence || OVERALL=1
  exit "${OVERALL}"
}
trap cleanup EXIT

main() {
  [[ "${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]] || { fail expected-sha; return; }
  [[ -n "${SOURCE_ROOT}" ]] || { fail source-root; return; }
  for command_name in git docker supabase psql python3 sha256sum; do
    command -v "${command_name}" >/dev/null 2>&1 \
      || { fail "missing-${command_name}"; return; }
  done
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" = "${EXPECTED_SHA}" ]] \
    || { fail exact-sha; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] \
    || { fail dirty-source; return; }
  [[ ! -f "${SOURCE_ROOT}/supabase/.temp/project-ref" ]] \
    || { fail linked-supabase; return; }

  rm -rf "${WORK_ROOT}"
  mkdir -p "${WORK_ROOT}" "${RAW_ROOT}"
  cp -a "${SOURCE_ROOT}/supabase" "${WORK_ROOT}/supabase"
  python3 - "${WORK_ROOT}/supabase/config.toml" "mov17-answer-${RUN_TOKEN}" <<'PY'
import pathlib
import re
import sys
path = pathlib.Path(sys.argv[1])
project = sys.argv[2]
text = path.read_text(encoding="utf-8")
text, project_count = re.subn(
    r'(?m)^project_id\s*=\s*"[^"]+"\s*$',
    f'project_id = "{project}"',
    text,
    count=1,
)
text, seed_count = re.subn(
    r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',
    r'\1false\2',
    text,
    count=1,
)
if project_count != 1 or seed_count != 1:
    raise SystemExit("ephemeral config rewrite failed")
path.write_text(text, encoding="utf-8")
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return; }

  run_step docker-info docker info || { fail docker-info; return; }
  (cd "${WORK_ROOT}" && run_step supabase-start supabase start \
    -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { STACK_START="FAIL"; fail supabase-start; return; }
  STACK_START="PASS"

  (cd "${WORK_ROOT}" && run_step db-reset supabase db reset --local) \
    || { MIGRATION_APPLY="FAIL"; fail db-reset; return; }
  MIGRATION_APPLY="PASS"

  local status_env database_url
  status_env="$(cd "${WORK_ROOT}" && supabase status -o env 2>/dev/null)" \
    || { fail supabase-status; return; }
  eval "${status_env}"
  database_url="${DB_URL:-}"
  [[ -n "${database_url}" ]] || { fail database-url; return; }

  run_step migration-ledger psql "${database_url}" -X -v ON_ERROR_STOP=1 -Atc \
    "select version from supabase_migrations.schema_migrations where version in ('20260804083710','20260804083720') order by version;" \
    || { MIGRATION_APPLY="FAIL"; fail migration-ledger; return; }
  for version in 20260804083710 20260804083720; do
    grep -qx "${version}" "${EVIDENCE_ROOT}/migration-ledger.stdout.txt" \
      || { MIGRATION_APPLY="FAIL"; fail "migration-ledger-missing-${version}"; return; }
  done

  (cd "${WORK_ROOT}" && run_step answer-pgtap-initial supabase test db \
    supabase/tests/movie_buff_answer_phase_preflight_test.sql --local) \
    || { INITIAL_PGTAP="FAIL"; fail answer-pgtap-initial; return; }
  INITIAL_PGTAP="PASS"

  run_step answer-rollback-apply \
    env "PGOPTIONS=-c movie_buff.allow_answer_phase_preflight_rollback=on" \
    psql "${database_url}" -X -v ON_ERROR_STOP=1 \
      -f "${WORK_ROOT}/supabase/rollbacks/20260804083720_movie_buff_answer_phase_preflight.rollback.sql" \
    || { ROLLBACK_APPLY="FAIL"; fail answer-rollback-apply; return; }
  ROLLBACK_APPLY="PASS"

  (cd "${WORK_ROOT}" && run_step answer-rollback-probe supabase test db \
    supabase/tests/movie_buff_answer_phase_preflight_rollback_test.sql --local) \
    || { ROLLBACK_PROBE="FAIL"; fail answer-rollback-probe; return; }
  ROLLBACK_PROBE="PASS"

  run_step answer-forward-reapply psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/migrations/20260804083720_movie_buff_answer_phase_preflight.sql" \
    || { FORWARD_REAPPLY="FAIL"; fail answer-forward-reapply; return; }
  FORWARD_REAPPLY="PASS"

  (cd "${WORK_ROOT}" && run_step answer-pgtap-final supabase test db \
    supabase/tests/movie_buff_answer_phase_preflight_test.sql --local) \
    || { FINAL_PGTAP="FAIL"; fail answer-pgtap-final; return; }
  FINAL_PGTAP="PASS"

  (cd "${WORK_ROOT}" && run_step board-boundary-regression supabase test db \
    supabase/tests/movie_buff_buster_board_boundary_only_test.sql --local) \
    || { BOARD_REGRESSION="FAIL"; fail board-boundary-regression; return; }
  BOARD_REGRESSION="PASS"

  (cd "${WORK_ROOT}" && run_step server-phase-regression supabase test db \
    supabase/tests/movie_buff_server_phase_machine_test.sql --local) \
    || { SERVER_REGRESSION="FAIL"; fail server-phase-regression; return; }
  SERVER_REGRESSION="PASS"

  run_step final-acl psql "${database_url}" -X -v ON_ERROR_STOP=1 -Atc \
    "select p.proname, r.rolname, p.prosecdef, p.proconfig, has_function_privilege('anon',p.oid,'EXECUTE'), has_function_privilege('authenticated',p.oid,'EXECUTE'), has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid in ('public.submit_movie_buff_answer(uuid,text)'::regprocedure,'public.submit_movie_buff_answer_legacy_unchecked(uuid,text)'::regprocedure) order by p.proname;" \
    || { ACL_VERIFY="FAIL"; fail final-acl; return; }
  ACL_VERIFY="PASS"

  git -C "${SOURCE_ROOT}" diff --check || { fail git-diff-check; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] \
    || { fail dirty-postflight; return; }
}

main
