#!/usr/bin/env bash
set -uo pipefail

PRODUCT_SHA="${1:?product SHA required}"
PRODUCT_TREE="${2:?product tree required}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/mov17-83100-rollback-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
LOCAL_PROJECT_ID="mov17-83100-${RUN_TOKEN}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/${LOCAL_PROJECT_ID}"
RAW_ROOT="${WORK_ROOT}/raw"
FAILURE_STEP=""
OVERALL="FAIL"
CLEANUP="UNKNOWN"

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact_file() {
  local source="$1"
  local destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
text=source.read_text(encoding='utf-8',errors='replace') if source.exists() else ''
text=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]',text)
text=re.sub(r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]',text)
text=re.sub(r'(?i)(password=)[^\s]+',r'\1[REDACTED]',text)
destination.write_text(text,encoding='utf-8')
PY
}

run_step() {
  local name="$1"; shift
  local raw_out="$RAW_ROOT/${name}.stdout.raw"
  local raw_err="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$raw_out" 2>"$raw_err"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact_file "$raw_out" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact_file "$raw_err" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$raw_out" "$raw_err"
  return "$code"
}

write_metadata() {
  {
    echo "lane=MOV-17"
    echo "scope=20260804083100-rollback-forward-reapply"
    echo "product_sha=${PRODUCT_SHA}"
    echo "product_tree=${PRODUCT_TREE}"
    echo "controller_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
    echo "controller_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})"
    echo "controller_branch=${GITHUB_REF_NAME:-UNKNOWN}"
    echo "supabase_cli_version=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "docker_version=$(docker --version 2>/dev/null || echo UNKNOWN)"
    echo "psql_version=$(psql --version 2>/dev/null || echo UNKNOWN)"
    echo "cleanup=${CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=${OVERALL}"
    echo "browser=UNKNOWN"
    echo "hosted=UNKNOWN"
    echo "production=UNKNOWN"
    echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

hash_evidence() {
  (
    cd "$EVIDENCE_ROOT" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z | xargs -0 sha256sum > sha256.txt
    sha256sum -c sha256.txt
  )
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -d "$WORK_ROOT/supabase" ]]; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact_file "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact_file "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ $cleanup_code -eq 0 ]]; then CLEANUP=PASS; else CLEANUP=FAIL; status=1; fi
  else
    CLEANUP="NOT APPLICABLE"
  fi
  rm -rf "$WORK_ROOT"
  if [[ $status -eq 0 ]]; then OVERALL=PASS; else OVERALL=FAIL; fi
  write_metadata
  hash_evidence || status=1
  exit "$status"
}
trap cleanup EXIT

fail() { FAILURE_STEP="$1"; return 1; }

main() {
  [[ "$PRODUCT_SHA" =~ ^[0-9a-f]{40}$ ]] || { fail product-sha; return 1; }
  [[ "$PRODUCT_TREE" =~ ^[0-9a-f]{40}$ ]] || { fail product-tree; return 1; }
  for command_name in git docker supabase python3 psql sha256sum node; do
    command -v "$command_name" >/dev/null 2>&1 || { fail "missing-${command_name}"; return 1; }
  done

  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$PRODUCT_SHA" HEAD \
    || { fail product-not-ancestor; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$PRODUCT_SHA^{tree}")" = "$PRODUCT_TREE" ]] \
    || { fail product-tree-mismatch; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$PRODUCT_SHA:src/lib/server/movieBuffPhaseRouteAuthorization.ts")" = "aa90d1504261cc48719f6bac82ac237925bec440" ]] \
    || { fail authorization-blob-mismatch; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$PRODUCT_SHA:supabase/rollbacks/20260804083100_movie_buff_server_phase_machine_hardening.rollback.sql")" = "1fcffae32a70b181952340e2a304516c4a070fa5" ]] \
    || { fail rollback-blob-mismatch; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)" ]] \
    || { fail dirty-preflight; return 1; }

  node --test tests/movie-buff-phase-hardening-rollback.test.mjs \
    >"$EVIDENCE_ROOT/source-contract.tap" 2>"$EVIDENCE_ROOT/source-contract.stderr.txt" \
    || { fail source-contract; return 1; }

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT" "$RAW_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "$LOCAL_PROJECT_ID" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8')
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{sys.argv[2]}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return 1; }

  run_step docker-info docker info || { fail docker-info; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { fail supabase-start; return 1; }
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) \
    || { fail db-reset; return 1; }

  export PGPASSWORD=postgres
  run_step migration-ledger psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 \
    -c "select version from supabase_migrations.schema_migrations where version between '20260804083100' and '20260804083700' order by version" \
    || { fail migration-ledger; return 1; }
  for version in 20260804083100 20260804083200 20260804083300 20260804083400 20260804083500 20260804083600 20260804083610 20260804083700; do
    grep -qx "$version" "$EVIDENCE_ROOT/migration-ledger.stdout.txt" \
      || { fail "migration-ledger-${version}"; return 1; }
  done

  (cd "$WORK_ROOT" && run_step server-pgtap-before supabase test db supabase/tests/movie_buff_server_phase_machine_test.sql --local) \
    || { fail server-pgtap-before; return 1; }

  local rollback_files=(
    20260804083700_movie_buff_active_leave_and_buster_boundary.rollback.sql
    20260804083610_movie_buff_phase_digest_schema_repair.rollback.sql
    20260804083600_movie_buff_match_start_handoff.rollback.sql
    20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql
    20260804083400_movie_buff_phase_contract_alignment.rollback.sql
    20260804083300_movie_buff_phase_tile_mutation_guard.rollback.sql
    20260804083200_movie_buff_buster_safe_boundary.rollback.sql
    20260804083100_movie_buff_server_phase_machine_hardening.rollback.sql
  )
  for file in "${rollback_files[@]}"; do
    local step="rollback-${file%%_*}"
    run_step "$step" env PGOPTIONS="-c movie_buff.allow_match_start_containment=on" \
      psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -f "$WORK_ROOT/supabase/rollbacks/$file" \
      || { fail "$step"; return 1; }
  done

  (cd "$WORK_ROOT" && run_step rollback-runtime-probe supabase test db supabase/tests/movie_buff_phase_hardening_rollback_runtime_probe.sql --local) \
    || { fail rollback-runtime-probe; return 1; }

  local migration_files=(
    20260804083100_movie_buff_server_phase_machine_hardening.sql
    20260804083200_movie_buff_buster_safe_boundary.sql
    20260804083300_movie_buff_phase_tile_mutation_guard.sql
    20260804083400_movie_buff_phase_contract_alignment.sql
    20260804083500_movie_buff_reconnect_buster_boundary_repair.sql
    20260804083600_movie_buff_match_start_handoff.sql
    20260804083610_movie_buff_phase_digest_schema_repair.sql
    20260804083700_movie_buff_active_leave_and_buster_boundary.sql
  )
  for file in "${migration_files[@]}"; do
    local step="reapply-${file%%_*}"
    run_step "$step" psql -h 127.0.0.1 -p 55322 -U postgres -d postgres \
      -v ON_ERROR_STOP=1 -f "$WORK_ROOT/supabase/migrations/$file" \
      || { fail "$step"; return 1; }
  done

  (cd "$WORK_ROOT" && run_step server-pgtap-after supabase test db supabase/tests/movie_buff_server_phase_machine_test.sql --local) \
    || { fail server-pgtap-after; return 1; }
  (cd "$WORK_ROOT" && run_step active-leave-pgtap-after supabase test db supabase/tests/movie_buff_active_leave_and_buster_boundary_test.sql --local) \
    || { fail active-leave-pgtap-after; return 1; }
  (cd "$WORK_ROOT" && run_step match-start-pgtap-after supabase test db supabase/tests/movie_buff_match_start_handoff_test.sql --local) \
    || { fail match-start-pgtap-after; return 1; }

  run_step final-catalog psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atq -v ON_ERROR_STOP=1 \
    -c "select json_build_object('guard',to_regprocedure('public.movie_buff_guard_authoritative_answer_phase()') is not null,'answer_trigger',exists(select 1 from pg_trigger where tgname='movie_buff_answers_require_authoritative_phase' and not tgisinternal),'legacy_authenticated',has_function_privilege('authenticated','public.advance_movie_buff_round(uuid)','EXECUTE'),'selector_authenticated',has_function_privilege('authenticated','public.select_movie_buff_match_tile(uuid,uuid,bigint,text)','EXECUTE'))" \
    || { fail final-catalog; return 1; }
  grep -q '"guard" : true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || grep -q '"guard":true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || { fail final-guard; return 1; }
  grep -q '"answer_trigger" : true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || grep -q '"answer_trigger":true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || { fail final-trigger; return 1; }
  grep -q '"legacy_authenticated" : false' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || grep -q '"legacy_authenticated":false' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || { fail final-legacy-acl; return 1; }
  grep -q '"selector_authenticated" : true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || grep -q '"selector_authenticated":true' "$EVIDENCE_ROOT/final-catalog.stdout.txt" \
    || { fail final-selector-acl; return 1; }

  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)" ]] \
    || { fail dirty-postflight; return 1; }
  return 0
}

main
