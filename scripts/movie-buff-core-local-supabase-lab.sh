#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EXPECTED_TREE="${2:-${MOVIE_BUFF_EXPECTED_GIT_TREE:-}}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-db-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-core-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
PROJECT_ID="movie-buff-core-${RUN_TOKEN}"
FAILURE_STEP=""
CLEANUP="UNKNOWN"

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

classify() { printf 'MOVIE_BUFF_CORE_DATABASE=%s\n' "$1"; }

redact() {
  local input="$1" output="$2"
  python3 - "$input" "$output" <<'PY'
import pathlib, re, sys
source = pathlib.Path(sys.argv[1])
text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else ""
patterns = [
    (r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]"),
    (r"postgres(?:ql)?://[^\s]+", "postgresql://[REDACTED_LOCAL_DB_URL]"),
    (r"(?i)(password=)[^\s]+", r"\1[REDACTED]"),
    (r"sb_secret_[A-Za-z0-9_-]+", "[REDACTED_SECRET_KEY]"),
    (r"sb_publishable_[A-Za-z0-9_-]+", "[REDACTED_PUBLISHABLE_KEY]"),
    (r"(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+", r"\1[REDACTED]"),
]
for pattern, replacement in patterns:
    text = re.sub(pattern, replacement, text)
pathlib.Path(sys.argv[2]).write_text(text, encoding="utf-8")
PY
}

run_step() {
  local name="$1"; shift
  local raw_out="$RAW_ROOT/${name}.stdout.raw" raw_err="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$raw_out" 2>"$raw_err"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact "$raw_out" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact "$raw_err" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$raw_out" "$raw_err"
  return "$code"
}

write_metadata() {
  local classification="$1"
  {
    echo "lane=movie-buff-core-v2"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "remote=$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || echo UNKNOWN)"
    echo "source_branch=${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-UNKNOWN}}"
    echo "source_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=$EXPECTED_SHA"
    echo "expected_tree=$EXPECTED_TREE"
    echo "raw_composition_sha=1825e452fa5e3caa24f5a99ac27e974d14b3ab66"
    echo "raw_composition_tree=75d61e32ab0aceeff142ce76e9328d9eed7f2888"
    echo "component_mov15_sha=4906147038a5a2deda5c13fdafc6f07b66ae100b"
    echo "component_mov15_tree=aab4b0256683ec77a4d9e3373fd84f60ba682e88"
    echo "component_mov16_sha=95c292ead66fc83cf13d7154bd3cf691610f549d"
    echo "component_mov16_tree=04267651da0b9caa741d95bcea01a096b5086a31"
    echo "component_mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
    echo "component_mov17_tree=8264d2e30b0c75a8bebaa1ad938df6a635f7d991"
    echo "component_encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
    echo "component_encoding_tree=d97528616454b9e93c6be9a44705d008a901ac66"
    echo "integration_base_sha=bf316a15a2120e32d8a32e479df2ae439081f9a1"
    echo "target_kind=disposable-local-supabase"
    echo "application_target=http://127.0.0.1:3000"
    echo "database_target=postgresql://127.0.0.1:55322/postgres"
    echo "supabase_cli_version=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "docker_version=$(docker --version 2>/dev/null || echo UNKNOWN)"
    echo "psql_version=$(psql --version 2>/dev/null || echo UNKNOWN)"
    echo "cleanup=$CLEANUP"
    echo "failure_step=$FAILURE_STEP"
    echo "browser_behavior=UNKNOWN"
    echo "hosted_state=UNKNOWN"
    echo "physical_windows_cursor_equivalence=UNKNOWN"
    echo "classification=$classification"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

hash_evidence() {
  (cd "$EVIDENCE_ROOT" && find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt)
}

cleanup_and_exit() {
  local status="$1"
  trap - EXIT
  set +e
  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local code=$?
    printf '%s\n' "$code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ "$code" -eq 0 ]]; then CLEANUP="PASS"; else CLEANUP="FAIL"; status=1; [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="cleanup"; fi
  else
    CLEANUP="NOT APPLICABLE"
  fi
  rm -rf "$WORK_ROOT"
  unset PGPASSWORD
  if [[ "$status" -eq 0 ]]; then
    write_metadata PASS
    if ! hash_evidence; then
      status=1
      FAILURE_STEP="evidence-hash"
      write_metadata FAIL
      hash_evidence || true
    fi
  else
    write_metadata FAIL
    hash_evidence || true
  fi
  if [[ "$status" -eq 0 ]]; then classify PASS; else classify FAIL; fi
  exit "$status"
}
trap 'cleanup_and_exit $?' EXIT

require_command() { command -v "$1" >/dev/null 2>&1 || { echo "Missing tool: $1" >&2; FAILURE_STEP="missing-tool-$1"; return 1; }; }

pgtap() {
  local name="$1" file="$2"
  (cd "$WORK_ROOT" && run_step "$name" supabase test db "$file" --local)
}

psql_file() {
  local name="$1" file="$2" options="${3:-}"
  if [[ -n "$options" ]]; then
    run_step "$name" env "PGOPTIONS=$options" psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$file"
  else
    run_step "$name" psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$file"
  fi
}

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { FAILURE_STEP="invalid-expected-sha"; return 1; }
  [[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { FAILURE_STEP="invalid-expected-tree"; return 1; }
  [[ -n "$SOURCE_ROOT" ]] || { FAILURE_STEP="missing-source-root"; return 1; }
  for tool in git docker supabase python3 psql sha256sum; do require_command "$tool" || return 1; done
  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { FAILURE_STEP="wrong-remote"; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { FAILURE_STEP="wrong-sha"; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})" == "$EXPECTED_TREE" ]] || { FAILURE_STEP="wrong-tree"; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { FAILURE_STEP="dirty-preflight"; return 1; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "validation/movie-buff-core-v2" ]] || { FAILURE_STEP="wrong-branch"; return 1; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { FAILURE_STEP="linked-project"; return 1; }
  [[ "$EVIDENCE_ROOT" != "$SOURCE_ROOT" && "$EVIDENCE_ROOT" != "$SOURCE_ROOT"/* ]] || { FAILURE_STEP="evidence-inside-repository"; return 1; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { FAILURE_STEP="unsupported-supabase-version"; return 1; }

  rm -rf "$WORK_ROOT"; mkdir -p "$WORK_ROOT" "$RAW_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "$PROJECT_ID" <<'PY'
import pathlib, re, sys
p=pathlib.Path(sys.argv[1]); t=p.read_text(encoding='utf-8'); project=sys.argv[2]
t,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',t,count=1)
t,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',t,count=1)
if n!=1 or m!=1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(t,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { FAILURE_STEP="ephemeral-config"; return 1; }

  run_step docker-info docker info || { FAILURE_STEP="docker-info"; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || { FAILURE_STEP="supabase-start"; return 1; }
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) || { FAILURE_STEP="db-reset"; return 1; }
  export PGPASSWORD=postgres

  run_step migration-ledger psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atc "select version from supabase_migrations.schema_migrations where version in ('20260804073000','20260804073100','20260804073200','20260804073300','20260804081500','20260804081600','20260804083000','20260804083100','20260804083200','20260804083300','20260804083400','20260804083500','20260804083600') order by version" || { FAILURE_STEP="migration-ledger"; return 1; }
  for version in 20260804073000 20260804073100 20260804073200 20260804073300 20260804081500 20260804081600 20260804083000 20260804083100 20260804083200 20260804083300 20260804083400 20260804083500 20260804083600; do grep -qx "$version" "$EVIDENCE_ROOT/migration-ledger.stdout.txt" || { FAILURE_STEP="missing-ledger-$version"; return 1; }; done

  local tests=(
    movie_buff_public_matchmaking_test.sql
    movie_buff_vip_authority_test.sql
    movie_buff_vip_deadline_finalize_test.sql
    movie_buff_vip_snapshot_release_test.sql
    movie_buff_server_phase_machine_test.sql
    movie_buff_phase_contract_alignment_test.sql
    movie_buff_match_start_handoff_test.sql
  )
  for test_file in "${tests[@]}"; do pgtap "initial-${test_file%.sql}" "supabase/tests/$test_file" || { FAILURE_STEP="initial-$test_file"; return 1; }; done

  psql_file mov15-handoff-rollback "$WORK_ROOT/supabase/rollbacks/20260804081600_movie_buff_admission_phase_handoff.rollback.sql" "-c movie_buff.allow_admission_handoff_containment=on" || { FAILURE_STEP="mov15-handoff-rollback"; return 1; }
  run_step mov15-handoff-probe psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atc "select has_function_privilege('authenticated','public.start_movie_buff_match(uuid)','EXECUTE'),has_function_privilege('service_role','public.start_movie_buff_match(uuid)','EXECUTE')" || { FAILURE_STEP="mov15-handoff-probe"; return 1; }
  grep -qx 'f|t' "$EVIDENCE_ROOT/mov15-handoff-probe.stdout.txt" || { FAILURE_STEP="mov15-handoff-probe-result"; return 1; }
  psql_file mov15-handoff-reapply "$WORK_ROOT/supabase/migrations/20260804081600_movie_buff_admission_phase_handoff.sql" || { FAILURE_STEP="mov15-handoff-reapply"; return 1; }

  psql_file vip-deadline-rollback "$WORK_ROOT/supabase/rollbacks/20260804073300_movie_buff_vip_deadline_finalize.rollback.sql" || { FAILURE_STEP="vip-deadline-rollback"; return 1; }
  psql_file vip-deadline-reapply "$WORK_ROOT/supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql" || { FAILURE_STEP="vip-deadline-reapply"; return 1; }
  pgtap vip-deadline-forward supabase/tests/movie_buff_vip_deadline_finalize_test.sql || { FAILURE_STEP="vip-deadline-forward"; return 1; }

  psql_file vip-snapshot-rollback "$WORK_ROOT/supabase/rollbacks/20260804073200_movie_buff_vip_snapshot_release_hardening.rollback.sql" || { FAILURE_STEP="vip-snapshot-rollback"; return 1; }
  psql_file vip-snapshot-reapply "$WORK_ROOT/supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql" || { FAILURE_STEP="vip-snapshot-reapply"; return 1; }
  pgtap vip-snapshot-forward supabase/tests/movie_buff_vip_snapshot_release_test.sql || { FAILURE_STEP="vip-snapshot-forward"; return 1; }

  psql_file vip-authority-rollback "$WORK_ROOT/supabase/rollbacks/20260804073000_movie_buff_vip_authority.rollback.sql" "-c movie_buff.allow_destructive_vip_rollback=on" || { FAILURE_STEP="vip-authority-rollback"; return 1; }
  for migration in 20260804073000_movie_buff_vip_authority.sql 20260804073100_movie_buff_vip_null_category_fail_closed.sql 20260804073200_movie_buff_vip_snapshot_release_hardening.sql 20260804073300_movie_buff_vip_deadline_finalize.sql; do psql_file "vip-reapply-${migration%.sql}" "$WORK_ROOT/supabase/migrations/$migration" || { FAILURE_STEP="vip-reapply-$migration"; return 1; }; done
  pgtap vip-authority-forward supabase/tests/movie_buff_vip_authority_test.sql || { FAILURE_STEP="vip-authority-forward"; return 1; }

  psql_file match-start-rollback "$WORK_ROOT/supabase/rollbacks/20260804083600_movie_buff_match_start_handoff.rollback.sql" "-c movie_buff.allow_match_start_containment=on" || { FAILURE_STEP="match-start-rollback"; return 1; }
  pgtap match-start-rollback-probe supabase/tests/movie_buff_match_start_handoff_rollback_test.sql || { FAILURE_STEP="match-start-rollback-probe"; return 1; }
  psql_file match-start-reapply "$WORK_ROOT/supabase/migrations/20260804083600_movie_buff_match_start_handoff.sql" || { FAILURE_STEP="match-start-reapply"; return 1; }

  psql_file reconnect-rollback "$WORK_ROOT/supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql" || { FAILURE_STEP="reconnect-rollback"; return 1; }
  pgtap reconnect-rollback-probe supabase/tests/movie_buff_reconnect_buster_rollback_probe.sql || { FAILURE_STEP="reconnect-rollback-probe"; return 1; }
  psql_file reconnect-reapply "$WORK_ROOT/supabase/migrations/20260804083500_movie_buff_reconnect_buster_boundary_repair.sql" || { FAILURE_STEP="reconnect-reapply"; return 1; }

  for test_file in "${tests[@]}"; do pgtap "final-${test_file%.sql}" "supabase/tests/$test_file" || { FAILURE_STEP="final-$test_file"; return 1; }; done
  run_step final-security-contract psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig,array[]::text[]) @> array['search_path=pg_catalog'] and p.proname like '%movie_buff%'" || { FAILURE_STEP="final-security-contract"; return 1; }
  grep -qx '0' "$EVIDENCE_ROOT/final-security-contract.stdout.txt" || { FAILURE_STEP="mutable-search-path-remains"; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { FAILURE_STEP="dirty-postflight"; return 1; }
  return 0
}

main
exit $?