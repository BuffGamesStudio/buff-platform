#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/mov17-buster-leave-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/mov17-buster-leave-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
FAILURE_STEP=""
OVERALL=0

mkdir -p "${EVIDENCE_ROOT}" "${RAW_ROOT}"

redact_file() {
  local source="$1" destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
text=source.read_text(encoding="utf-8",errors="replace") if source.exists() else ""
patterns=[
 (r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+","[REDACTED_JWT]"),
 (r"postgres(?:ql)?://[^\s]+","postgresql://[REDACTED_LOCAL_DB_URL]"),
 (r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+","[REDACTED_SUPABASE_KEY]"),
 (r"(?i)(password=)[^\s]+",r"\1[REDACTED]"),
]
for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
destination.write_text(text,encoding="utf-8")
PY
}

run_step() {
  local name="$1"; shift
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

cleanup() {
  set +e
  if [[ -d "${WORK_ROOT}/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "${WORK_ROOT}" && supabase stop --no-backup) \
      >"${RAW_ROOT}/cleanup.stdout.raw" 2>"${RAW_ROOT}/cleanup.stderr.raw"
    cleanup_exit=$?
    printf '%s\n' "${cleanup_exit}" >"${EVIDENCE_ROOT}/cleanup.exit.txt"
    redact_file "${RAW_ROOT}/cleanup.stdout.raw" "${EVIDENCE_ROOT}/cleanup.stdout.txt"
    redact_file "${RAW_ROOT}/cleanup.stderr.raw" "${EVIDENCE_ROOT}/cleanup.stderr.txt"
    [[ "${cleanup_exit}" -eq 0 ]] || OVERALL=1
  fi
  rm -rf "${WORK_ROOT}"

  {
    echo "lane=MOV-17-repair-increment-B"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "source_sha=$(git -C "${SOURCE_ROOT}" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=${EXPECTED_SHA}"
    echo "target=disposable-localhost"
    echo "migration=20260804083700_movie_buff_active_leave_and_buster_boundary"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=$([[ "${OVERALL}" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "browser_behavior=UNKNOWN"
    echo "combined_mov15_mov16_mov17_race=UNKNOWN"
    echo "hosted_state=UNKNOWN"
    echo "production_state=UNTOUCHED"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${EVIDENCE_ROOT}/metadata.txt"

  (
    cd "${EVIDENCE_ROOT}" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z | xargs -0 sha256sum >sha256.txt
    sha256sum -c sha256.txt
  ) || OVERALL=1
  exit "${OVERALL}"
}
trap cleanup EXIT

main() {
  [[ "${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]] || { fail expected-sha; return; }
  [[ -n "${SOURCE_ROOT}" ]] || { fail source-root; return; }
  for command_name in git docker supabase psql python3 sha256sum; do
    command -v "${command_name}" >/dev/null 2>&1 || { fail "missing-${command_name}"; return; }
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
  python3 - "${WORK_ROOT}/supabase/config.toml" "mov17-buster-leave-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); project=sys.argv[2]; text=p.read_text(encoding="utf-8")
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit("ephemeral config rewrite failed")
p.write_text(text,encoding="utf-8")
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return; }

  run_step docker-info docker info || { fail docker-info; return; }
  (cd "${WORK_ROOT}" && run_step supabase-start supabase start \
    -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { fail supabase-start; return; }
  (cd "${WORK_ROOT}" && run_step db-reset supabase db reset --local) \
    || { fail db-reset; return; }

  status_env="$(cd "${WORK_ROOT}" && supabase status -o env 2>/dev/null)"
  [[ $? -eq 0 ]] || { fail supabase-status; return; }
  eval "${status_env}"
  database_url="${DB_URL:-}"
  [[ -n "${database_url}" ]] || { fail database-url; return; }

  run_step migration-ledger psql "${database_url}" -X -v ON_ERROR_STOP=1 -Atc \
    "select version from supabase_migrations.schema_migrations where version='20260804083700';" \
    || { fail migration-ledger; return; }
  grep -qx '20260804083700' "${EVIDENCE_ROOT}/migration-ledger.stdout.txt" \
    || { fail migration-ledger-missing; return; }

  (cd "${WORK_ROOT}" && run_step pgtap-initial supabase test db \
    supabase/tests/movie_buff_active_leave_and_buster_boundary_test.sql --local) \
    || { fail pgtap-initial; return; }

  run_step rollback-apply psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/rollbacks/20260804083700_movie_buff_active_leave_and_buster_boundary.rollback.sql" \
    || { fail rollback-apply; return; }
  (cd "${WORK_ROOT}" && run_step rollback-probe supabase test db \
    supabase/tests/movie_buff_active_leave_and_buster_boundary_rollback_test.sql --local) \
    || { fail rollback-probe; return; }

  run_step forward-reapply psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/migrations/20260804083700_movie_buff_active_leave_and_buster_boundary.sql" \
    || { fail forward-reapply; return; }
  (cd "${WORK_ROOT}" && run_step pgtap-forward supabase test db \
    supabase/tests/movie_buff_active_leave_and_buster_boundary_test.sql --local) \
    || { fail pgtap-forward; return; }

  git -C "${SOURCE_ROOT}" diff --check || { fail git-diff-check; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] \
    || { fail dirty-postflight; return; }
}

main
