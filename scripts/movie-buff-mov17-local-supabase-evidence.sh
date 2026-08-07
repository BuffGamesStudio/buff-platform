#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/mov17-local-supabase-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
LOCAL_PROJECT_ID="mov17-local-${RUN_TOKEN}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/${LOCAL_PROJECT_ID}"
RAW_ROOT="${WORK_ROOT}/raw"

STACK_START="UNKNOWN"
MIGRATION_APPLY="UNKNOWN"
SERVER_PGTAP_INITIAL="UNKNOWN"
MATCH_START_PGTAP_INITIAL="UNKNOWN"
MATCH_START_ROLLBACK_APPLY="UNKNOWN"
MATCH_START_ROLLBACK_PROBE="UNKNOWN"
MATCH_START_FORWARD_REAPPLY="UNKNOWN"
MATCH_START_PGTAP_FORWARD="UNKNOWN"
RECONNECT_ROLLBACK_APPLY="UNKNOWN"
RECONNECT_ROLLBACK_PROBE="UNKNOWN"
RECONNECT_FORWARD_REAPPLY="UNKNOWN"
ACTIVE_LEAVE_FORWARD_REAPPLY="UNKNOWN"
ACTIVE_LEAVE_PGTAP_FORWARD="UNKNOWN"
BOARD_BOUNDARY_FORWARD_REAPPLY="UNKNOWN"
BOARD_BOUNDARY_PGTAP_FORWARD="UNKNOWN"
ANSWER_PREFLIGHT_PGTAP_FORWARD="UNKNOWN"
SERVER_PGTAP_FORWARD="UNKNOWN"
CLEANUP="UNKNOWN"
FAILURE_STEP=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

write_classification() {
  local value="$1"
  printf 'MOV17_LOCAL_SUPABASE=%s\n' "$value"
}

redact_file() {
  local source="$1"
  local destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib
import re
import sys

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else ""
text = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]", text)
text = re.sub(r"postgres(?:ql)?://[^\s]+", "postgresql://[REDACTED_LOCAL_DB_URL]", text)
text = re.sub(
    r"(?im)^((?:anon|service_role|jwt|s3 access|s3 secret|secret|publishable)[^:=\n]*[:=])\s*\S+.*$",
    r"\1 [REDACTED]",
    text,
)
text = re.sub(r"(?i)(password=)[^\s]+", r"\1[REDACTED]", text)
destination.write_text(text, encoding="utf-8")
PY
}

run_step() {
  local name="$1"
  shift
  local raw_stdout="$RAW_ROOT/${name}.stdout.raw"
  local raw_stderr="$RAW_ROOT/${name}.stderr.raw"
  local safe_stdout="$EVIDENCE_ROOT/${name}.stdout.txt"
  local safe_stderr="$EVIDENCE_ROOT/${name}.stderr.txt"
  local exit_file="$EVIDENCE_ROOT/${name}.exit.txt"

  "$@" >"$raw_stdout" 2>"$raw_stderr"
  local code=$?
  printf '%s\n' "$code" >"$exit_file"
  redact_file "$raw_stdout" "$safe_stdout"
  redact_file "$raw_stderr" "$safe_stderr"
  rm -f "$raw_stdout" "$raw_stderr"
  return "$code"
}

assert_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf 'Required command is missing: %s\n' "$name" >&2
    return 1
  fi
}

write_metadata() {
  local overall="$1"
  local actual_sha
  actual_sha="$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || printf 'UNKNOWN')"
  {
    printf 'lane=MOV-17\n'
    printf 'source_sha=%s\n' "$actual_sha"
    printf 'expected_sha=%s\n' "$EXPECTED_SHA"
    printf 'local_project_id=%s\n' "$LOCAL_PROJECT_ID"
    printf 'target_kind=disposable-local-supabase\n'
    printf 'supabase_cli_version=%s\n' "$(supabase --version 2>/dev/null || printf 'UNKNOWN')"
    printf 'docker_version=%s\n' "$(docker --version 2>/dev/null || printf 'UNKNOWN')"
    printf 'psql_version=%s\n' "$(psql --version 2>/dev/null || printf 'UNKNOWN')"
    printf 'stack_start=%s\n' "$STACK_START"
    printf 'migration_apply=%s\n' "$MIGRATION_APPLY"
    printf 'server_pgtap_initial=%s\n' "$SERVER_PGTAP_INITIAL"
    printf 'match_start_pgtap_initial=%s\n' "$MATCH_START_PGTAP_INITIAL"
    printf 'match_start_rollback_apply=%s\n' "$MATCH_START_ROLLBACK_APPLY"
    printf 'match_start_rollback_probe=%s\n' "$MATCH_START_ROLLBACK_PROBE"
    printf 'match_start_forward_reapply=%s\n' "$MATCH_START_FORWARD_REAPPLY"
    printf 'match_start_pgtap_forward=%s\n' "$MATCH_START_PGTAP_FORWARD"
    printf 'reconnect_rollback_apply=%s\n' "$RECONNECT_ROLLBACK_APPLY"
    printf 'reconnect_rollback_probe=%s\n' "$RECONNECT_ROLLBACK_PROBE"
    printf 'reconnect_forward_reapply=%s\n' "$RECONNECT_FORWARD_REAPPLY"
    printf 'active_leave_forward_reapply=%s\n' "$ACTIVE_LEAVE_FORWARD_REAPPLY"
    printf 'active_leave_pgtap_forward=%s\n' "$ACTIVE_LEAVE_PGTAP_FORWARD"
    printf 'board_boundary_forward_reapply=%s\n' "$BOARD_BOUNDARY_FORWARD_REAPPLY"
    printf 'board_boundary_pgtap_forward=%s\n' "$BOARD_BOUNDARY_PGTAP_FORWARD"
    printf 'answer_preflight_pgtap_forward=%s\n' "$ANSWER_PREFLIGHT_PGTAP_FORWARD"
    printf 'server_pgtap_forward=%s\n' "$SERVER_PGTAP_FORWARD"
    printf 'cleanup=%s\n' "$CLEANUP"
    printf 'three_client_race=UNKNOWN\n'
    printf 'browser_behavior=UNKNOWN\n'
    printf 'mov15_mov16_integration=UNKNOWN\n'
    printf 'hosted_state=UNKNOWN\n'
    printf 'production_readiness=UNKNOWN\n'
    printf 'failure_step=%s\n' "$FAILURE_STEP"
    printf 'classification=%s\n' "$overall"
    printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

hash_evidence() {
  (
    cd "$EVIDENCE_ROOT" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z \
      | xargs -0 sha256sum \
      > sha256.txt
    sha256sum -c sha256.txt
  )
}

cleanup_and_exit() {
  local status="$1"
  trap - EXIT
  set +e

  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (
      cd "$WORK_ROOT" || exit 1
      supabase stop --no-backup
    ) >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact_file "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact_file "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ "$cleanup_code" -eq 0 ]]; then
      CLEANUP="PASS"
    else
      CLEANUP="FAIL"
      status=1
      if [[ -z "$FAILURE_STEP" ]]; then FAILURE_STEP="cleanup"; fi
    fi
  else
    CLEANUP="NOT APPLICABLE"
  fi

  rm -rf "$WORK_ROOT"
  unset PGPASSWORD

  if [[ "$status" -eq 0 ]]; then
    write_metadata PASS
    hash_evidence || status=1
  else
    write_metadata FAIL
    hash_evidence || true
  fi

  if [[ "$status" -eq 0 ]]; then
    write_classification PASS
  else
    write_classification FAIL
  fi
  exit "$status"
}

trap 'cleanup_and_exit $?' EXIT

main() {
  if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
    FAILURE_STEP="validate-expected-sha"
    return 1
  fi
  if [[ -z "$SOURCE_ROOT" ]]; then
    FAILURE_STEP="resolve-source-root"
    return 1
  fi

  for command_name in git docker supabase python3 psql sha256sum; do
    if ! assert_command "$command_name"; then
      FAILURE_STEP="required-command-${command_name}"
      return 1
    fi
  done

  local actual_sha
  actual_sha="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
  if [[ "$actual_sha" != "$EXPECTED_SHA" ]]; then
    printf 'Exact SHA mismatch. Expected %s; observed %s\n' "$EXPECTED_SHA" "$actual_sha" >&2
    FAILURE_STEP="exact-sha"
    return 1
  fi
  if [[ -n "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]; then
    printf 'Source checkout is not clean before local Supabase validation.\n' >&2
    FAILURE_STEP="clean-worktree-preflight"
    return 1
  fi
  if find "$SOURCE_ROOT/supabase" -path '*/.temp/project-ref' -type f -print -quit | grep -q .; then
    printf 'Refusing a linked Supabase worktree.\n' >&2
    FAILURE_STEP="linked-project-ref"
    return 1
  fi

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT" "$RAW_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"

  python3 - "$WORK_ROOT/supabase/config.toml" "$LOCAL_PROJECT_ID" <<'PY'
import pathlib
import re
import sys

config_path = pathlib.Path(sys.argv[1])
project_id = sys.argv[2]
text = config_path.read_text(encoding="utf-8")
text, project_count = re.subn(
    r'(?m)^project_id\s*=\s*"[^"]+"\s*$',
    f'project_id = "{project_id}"',
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
    raise SystemExit("Unable to create isolated local Supabase config")
config_path.write_text(text, encoding="utf-8")
PY
  if [[ $? -ne 0 ]]; then
    FAILURE_STEP="ephemeral-config"
    return 1
  fi

  if grep -R --line-number --fixed-strings 'project_ref' "$WORK_ROOT/supabase/.temp" >/dev/null 2>&1; then
    FAILURE_STEP="ephemeral-linked-project-ref"
    return 1
  fi

  if ! run_step docker-info docker info; then
    FAILURE_STEP="docker-info"
    return 1
  fi

  if ! (
    cd "$WORK_ROOT" &&
      run_step supabase-start supabase start \
        -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
  ); then
    STACK_START="FAIL"
    FAILURE_STEP="supabase-start"
    return 1
  fi
  STACK_START="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step db-reset supabase db reset --local
  ); then
    MIGRATION_APPLY="FAIL"
    FAILURE_STEP="db-reset"
    return 1
  fi
  MIGRATION_APPLY="PASS"

  export PGPASSWORD=postgres
  if ! run_step migration-ledger psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -Atc \
    "select version from supabase_migrations.schema_migrations where version in ('20260804083500','20260804083600','20260804083700','20260804083710','20260804083720') order by version;"; then
    MIGRATION_APPLY="FAIL"
    FAILURE_STEP="migration-ledger"
    return 1
  fi
  for required_version in 20260804083500 20260804083600 20260804083700 20260804083710 20260804083720; do
    if ! grep -qx "$required_version" "$EVIDENCE_ROOT/migration-ledger.stdout.txt"; then
      MIGRATION_APPLY="FAIL"
      FAILURE_STEP="migration-ledger-missing-${required_version}"
      return 1
    fi
  done

  if ! (
    cd "$WORK_ROOT" &&
      run_step server-pgtap-initial supabase test db \
        supabase/tests/movie_buff_server_phase_machine_test.sql --local
  ); then
    SERVER_PGTAP_INITIAL="FAIL"
    FAILURE_STEP="server-pgtap-initial"
    return 1
  fi
  SERVER_PGTAP_INITIAL="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step match-start-pgtap-initial supabase test db \
        supabase/tests/movie_buff_match_start_handoff_test.sql --local
  ); then
    MATCH_START_PGTAP_INITIAL="FAIL"
    FAILURE_STEP="match-start-pgtap-initial"
    return 1
  fi
  MATCH_START_PGTAP_INITIAL="PASS"

  if ! run_step match-start-rollback-apply \
    env "PGOPTIONS=-c movie_buff.allow_match_start_containment=on" \
    psql -h 127.0.0.1 -p 55322 -U postgres -d postgres \
      -v ON_ERROR_STOP=1 \
      -f "$WORK_ROOT/supabase/rollbacks/20260804083600_movie_buff_match_start_handoff.rollback.sql"; then
    MATCH_START_ROLLBACK_APPLY="FAIL"
    FAILURE_STEP="match-start-rollback-apply"
    return 1
  fi
  MATCH_START_ROLLBACK_APPLY="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step match-start-rollback-probe supabase test db \
        supabase/tests/movie_buff_match_start_handoff_rollback_test.sql --local
  ); then
    MATCH_START_ROLLBACK_PROBE="FAIL"
    FAILURE_STEP="match-start-rollback-probe"
    return 1
  fi
  MATCH_START_ROLLBACK_PROBE="PASS"

  if ! run_step match-start-forward-reapply psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/migrations/20260804083600_movie_buff_match_start_handoff.sql"; then
    MATCH_START_FORWARD_REAPPLY="FAIL"
    FAILURE_STEP="match-start-forward-reapply"
    return 1
  fi
  MATCH_START_FORWARD_REAPPLY="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step match-start-pgtap-forward supabase test db \
        supabase/tests/movie_buff_match_start_handoff_test.sql --local
  ); then
    MATCH_START_PGTAP_FORWARD="FAIL"
    FAILURE_STEP="match-start-pgtap-forward"
    return 1
  fi
  MATCH_START_PGTAP_FORWARD="PASS"

  if ! run_step reconnect-rollback-apply psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql"; then
    RECONNECT_ROLLBACK_APPLY="FAIL"
    FAILURE_STEP="reconnect-rollback-apply"
    return 1
  fi
  RECONNECT_ROLLBACK_APPLY="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step reconnect-rollback-probe supabase test db \
        supabase/tests/movie_buff_reconnect_buster_rollback_probe.sql --local
  ); then
    RECONNECT_ROLLBACK_PROBE="FAIL"
    FAILURE_STEP="reconnect-rollback-probe"
    return 1
  fi
  RECONNECT_ROLLBACK_PROBE="PASS"

  if ! run_step reconnect-forward-reapply psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/migrations/20260804083500_movie_buff_reconnect_buster_boundary_repair.sql"; then
    RECONNECT_FORWARD_REAPPLY="FAIL"
    FAILURE_STEP="reconnect-forward-reapply"
    return 1
  fi
  RECONNECT_FORWARD_REAPPLY="PASS"

  if ! run_step active-leave-forward-reapply psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/migrations/20260804083700_movie_buff_active_leave_and_buster_boundary.sql"; then
    ACTIVE_LEAVE_FORWARD_REAPPLY="FAIL"
    FAILURE_STEP="active-leave-forward-reapply"
    return 1
  fi
  ACTIVE_LEAVE_FORWARD_REAPPLY="PASS"

  if ! run_step board-boundary-forward-reapply psql \
    -h 127.0.0.1 -p 55322 -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/supabase/migrations/20260804083710_movie_buff_buster_board_boundary_only.sql"; then
    BOARD_BOUNDARY_FORWARD_REAPPLY="FAIL"
    FAILURE_STEP="board-boundary-forward-reapply"
    return 1
  fi
  BOARD_BOUNDARY_FORWARD_REAPPLY="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step active-leave-pgtap-forward supabase test db \
        supabase/tests/movie_buff_active_leave_and_buster_boundary_test.sql --local
  ); then
    ACTIVE_LEAVE_PGTAP_FORWARD="FAIL"
    FAILURE_STEP="active-leave-pgtap-forward"
    return 1
  fi
  ACTIVE_LEAVE_PGTAP_FORWARD="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step board-boundary-pgtap-forward supabase test db \
        supabase/tests/movie_buff_buster_board_boundary_only_test.sql --local
  ); then
    BOARD_BOUNDARY_PGTAP_FORWARD="FAIL"
    FAILURE_STEP="board-boundary-pgtap-forward"
    return 1
  fi
  BOARD_BOUNDARY_PGTAP_FORWARD="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step answer-preflight-pgtap-forward supabase test db \
        supabase/tests/movie_buff_answer_phase_preflight_test.sql --local
  ); then
    ANSWER_PREFLIGHT_PGTAP_FORWARD="FAIL"
    FAILURE_STEP="answer-preflight-pgtap-forward"
    return 1
  fi
  ANSWER_PREFLIGHT_PGTAP_FORWARD="PASS"

  if ! (
    cd "$WORK_ROOT" &&
      run_step server-pgtap-forward supabase test db \
        supabase/tests/movie_buff_server_phase_machine_test.sql --local
  ); then
    SERVER_PGTAP_FORWARD="FAIL"
    FAILURE_STEP="server-pgtap-forward"
    return 1
  fi
  SERVER_PGTAP_FORWARD="PASS"

  if [[ -n "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]; then
    FAILURE_STEP="clean-worktree-postflight"
    return 1
  fi

  return 0
}

main
exit $?