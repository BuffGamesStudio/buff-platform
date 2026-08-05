#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/movie-buff-buster-leave-local}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
LOCAL_PROJECT_ID="movie-buff-buster-leave-${RUN_TOKEN}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/${LOCAL_PROJECT_ID}"
RAW_ROOT="${WORK_ROOT}/raw"
FAILURE_STEP=""
STACK_START="UNKNOWN"
MIGRATION_APPLY="UNKNOWN"
INITIAL_SECURITY_TESTS="UNKNOWN"
INITIAL_RUNTIME_BEHAVIOR="UNKNOWN"
ROLLBACK_APPLY="UNKNOWN"
ROLLBACK_TESTS="UNKNOWN"
FORWARD_REAPPLY="UNKNOWN"
FORWARD_SECURITY_TESTS="UNKNOWN"
FORWARD_RUNTIME_BEHAVIOR="UNKNOWN"
CLEANUP="UNKNOWN"
DATABASE_URL=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact_file() {
  local source="$1"
  local destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib,re,sys
src=pathlib.Path(sys.argv[1]); dst=pathlib.Path(sys.argv[2])
text=src.read_text(encoding="utf-8",errors="replace") if src.exists() else ""
patterns=[
 (r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+","[REDACTED_JWT]"),
 (r"postgres(?:ql)?://[^\s]+","postgresql://[REDACTED_LOCAL_DB_URL]"),
 (r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+","[REDACTED_SUPABASE_KEY]"),
 (r"(?i)(password=)[^\s]+",r"\1[REDACTED]"),
]
for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
dst.write_text(text,encoding="utf-8")
PY
}

run_step() {
  local name="$1"; shift
  local stdout_raw="$RAW_ROOT/${name}.stdout.raw"
  local stderr_raw="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$stdout_raw" 2>"$stderr_raw"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact_file "$stdout_raw" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact_file "$stderr_raw" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$stdout_raw" "$stderr_raw"
  return "$code"
}

write_metadata() {
  local classification="$1"
  {
    printf 'lane=MOV-17-successor\n'
    printf 'source_sha=%s\n' "$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || printf UNKNOWN)"
    printf 'source_tree=%s\n' "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || printf UNKNOWN)"
    printf 'expected_sha=%s\n' "$EXPECTED_SHA"
    printf 'target_kind=disposable-local-supabase\n'
    printf 'local_project_id=%s\n' "$LOCAL_PROJECT_ID"
    printf 'supabase_cli_version=%s\n' "$(supabase --version 2>/dev/null || printf UNKNOWN)"
    printf 'stack_start=%s\n' "$STACK_START"
    printf 'migration_apply=%s\n' "$MIGRATION_APPLY"
    printf 'initial_security_tests=%s\n' "$INITIAL_SECURITY_TESTS"
    printf 'initial_runtime_behavior=%s\n' "$INITIAL_RUNTIME_BEHAVIOR"
    printf 'rollback_apply=%s\n' "$ROLLBACK_APPLY"
    printf 'rollback_tests=%s\n' "$ROLLBACK_TESTS"
    printf 'forward_reapply=%s\n' "$FORWARD_REAPPLY"
    printf 'forward_security_tests=%s\n' "$FORWARD_SECURITY_TESTS"
    printf 'forward_runtime_behavior=%s\n' "$FORWARD_RUNTIME_BEHAVIOR"
    printf 'concurrent_multi_client_race=UNKNOWN\n'
    printf 'browser_behavior=UNKNOWN\n'
    printf 'hosted_state=UNTOUCHED\n'
    printf 'failure_step=%s\n' "$FAILURE_STEP"
    printf 'cleanup=%s\n' "$CLEANUP"
    printf 'classification=%s\n' "$classification"
    printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

hash_evidence() {
  (
    cd "$EVIDENCE_ROOT" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z | xargs -0 sha256sum >sha256.txt
    sha256sum -c sha256.txt
  )
}

cleanup_and_exit() {
  local status="$1"
  trap - EXIT
  set +e
  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact_file "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact_file "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ "$cleanup_code" -eq 0 ]]; then CLEANUP="PASS"; else CLEANUP="FAIL"; status=1; fi
  else
    CLEANUP="NOT_APPLICABLE"
  fi
  rm -rf "$WORK_ROOT"
  unset PGPASSWORD
  if [[ "$status" -eq 0 ]]; then write_metadata PASS; else write_metadata FAIL; fi
  hash_evidence || status=1
  exit "$status"
}
trap 'cleanup_and_exit $?' EXIT

main() {
  if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then FAILURE_STEP="expected-sha"; return 1; fi
  if [[ -z "$SOURCE_ROOT" ]]; then FAILURE_STEP="source-root"; return 1; fi
  for command_name in git docker supabase python3 psql sha256sum; do
    command -v "$command_name" >/dev/null 2>&1 || { FAILURE_STEP="missing-${command_name}"; return 1; }
  done
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] \
    || { FAILURE_STEP="exact-sha"; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] \
    || { FAILURE_STEP="dirty-preflight"; return 1; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] \
    || { FAILURE_STEP="linked-project"; return 1; }

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT" "$RAW_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "$LOCAL_PROJECT_ID" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding="utf-8"); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit("isolated config rewrite failed")
p.write_text(text,encoding="utf-8")
PY
  [[ $? -eq 0 ]] || { FAILURE_STEP="config"; return 1; }

  run_step docker-info docker info || { FAILURE_STEP="docker-info"; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { STACK_START="FAIL"; FAILURE_STEP="supabase-start"; return 1; }
  STACK_START="PASS"
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) \
    || { MIGRATION_APPLY="FAIL"; FAILURE_STEP="db-reset"; return 1; }
  MIGRATION_APPLY="PASS"

  local status_env
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>"$RAW_ROOT/status.stderr.raw")"
  [[ $? -eq 0 ]] || { FAILURE_STEP="status"; return 1; }
  eval "$status_env"
  DATABASE_URL="${DB_URL:-}"
  [[ -n "$DATABASE_URL" ]] || { FAILURE_STEP="database-url"; return 1; }

  run_step migration-ledger psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
    "select version from supabase_migrations.schema_migrations where version in ('20260805194400','20260805194500') order by version;" \
    || { MIGRATION_APPLY="FAIL"; FAILURE_STEP="migration-ledger"; return 1; }
  grep -qx '20260805194400' "$EVIDENCE_ROOT/migration-ledger.stdout.txt" \
    || { MIGRATION_APPLY="FAIL"; FAILURE_STEP="missing-preflight-ledger"; return 1; }
  grep -qx '20260805194500' "$EVIDENCE_ROOT/migration-ledger.stdout.txt" \
    || { MIGRATION_APPLY="FAIL"; FAILURE_STEP="missing-forward-ledger"; return 1; }

  (cd "$WORK_ROOT" && run_step server-pgtap-initial supabase test db \
    supabase/tests/movie_buff_server_phase_machine_test.sql --local) \
    || { INITIAL_SECURITY_TESTS="FAIL"; FAILURE_STEP="server-pgtap-initial"; return 1; }
  (cd "$WORK_ROOT" && run_step leave-pgtap-initial supabase test db \
    supabase/tests/movie_buff_buster_leave_authority_repair_test.sql --local) \
    || { INITIAL_SECURITY_TESTS="FAIL"; FAILURE_STEP="leave-pgtap-initial"; return 1; }
  INITIAL_SECURITY_TESTS="PASS"

  run_step leave-runtime-initial psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/tests/movie_buff_buster_leave_authority_runtime_test.sql" \
    || { INITIAL_RUNTIME_BEHAVIOR="FAIL"; FAILURE_STEP="leave-runtime-initial"; return 1; }
  INITIAL_RUNTIME_BEHAVIOR="PASS"

  run_step leave-rollback-apply psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/rollbacks/20260805194500_movie_buff_buster_leave_authority_repair.rollback.sql" \
    || { ROLLBACK_APPLY="FAIL"; FAILURE_STEP="leave-rollback-apply"; return 1; }
  ROLLBACK_APPLY="PASS"
  (cd "$WORK_ROOT" && run_step leave-rollback-pgtap supabase test db \
    supabase/tests/movie_buff_buster_leave_authority_rollback_test.sql --local) \
    || { ROLLBACK_TESTS="FAIL"; FAILURE_STEP="leave-rollback-pgtap"; return 1; }
  ROLLBACK_TESTS="PASS"

  run_step leave-forward-reapply psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/migrations/20260805194500_movie_buff_buster_leave_authority_repair.sql" \
    || { FORWARD_REAPPLY="FAIL"; FAILURE_STEP="leave-forward-reapply"; return 1; }
  FORWARD_REAPPLY="PASS"
  (cd "$WORK_ROOT" && run_step server-pgtap-forward supabase test db \
    supabase/tests/movie_buff_server_phase_machine_test.sql --local) \
    || { FORWARD_SECURITY_TESTS="FAIL"; FAILURE_STEP="server-pgtap-forward"; return 1; }
  (cd "$WORK_ROOT" && run_step leave-pgtap-forward supabase test db \
    supabase/tests/movie_buff_buster_leave_authority_repair_test.sql --local) \
    || { FORWARD_SECURITY_TESTS="FAIL"; FAILURE_STEP="leave-pgtap-forward"; return 1; }
  FORWARD_SECURITY_TESTS="PASS"

  run_step leave-runtime-forward psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/tests/movie_buff_buster_leave_authority_runtime_test.sql" \
    || { FORWARD_RUNTIME_BEHAVIOR="FAIL"; FAILURE_STEP="leave-runtime-forward"; return 1; }
  FORWARD_RUNTIME_BEHAVIOR="PASS"

  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] \
    || { FAILURE_STEP="dirty-postflight"; return 1; }
  return 0
}

main
exit $?
