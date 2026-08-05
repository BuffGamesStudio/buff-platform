#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-db-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
PROJECT_ID="movie-buff-core-v6-${RUN_TOKEN}"
BRANCH="validation/movie-buff-core-v6"
RAW_COMPOSITION="91b8b65f85d53a950eae15544af39e2efd108c5c"
RAW_TREE="40d72195ced550771ad257054a6325c51f183a28"
CLASSIFICATION="UNKNOWN"
FAILURE_STEP=""
CLEANUP="UNKNOWN"

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact() {
  local input="$1" output="$2"
  python3 - "$input" "$output" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8',errors='replace') if p.exists() else ''
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'(?i)(password=)[^\s]+',r'\1[REDACTED]'),
 (r'sb_secret_[A-Za-z0-9_-]+','[REDACTED_SECRET_KEY]'),
 (r'sb_publishable_[A-Za-z0-9_-]+','[REDACTED_PUBLISHABLE_KEY]'),
 (r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]'),
]
for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
pathlib.Path(sys.argv[2]).write_text(text,encoding='utf-8')
PY
}

run_step() {
  local name="$1"; shift
  local out="$RAW_ROOT/${name}.stdout.raw" err="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$out" 2>"$err"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact "$out" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact "$err" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$out" "$err"
  return "$code"
}

write_metadata() {
  local classification="$1"
  {
    echo "lane=movie-buff-core-v6-database"
    echo "classification=$classification"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "remote=$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || echo UNKNOWN)"
    echo "source_branch=${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-UNKNOWN}}"
    echo "source_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=$EXPECTED_SHA"
    echo "expected_tree=$EXPECTED_TREE"
    echo "raw_composition_sha=$RAW_COMPOSITION"
    echo "raw_composition_tree=$RAW_TREE"
    echo "mov15_sha=4906147038a5a2deda5c13fdafc6f07b66ae100b"
    echo "mov15_tree=aab4b0256683ec77a4d9e3373fd84f60ba682e88"
    echo "mov16_sha=d50a2417b95b6a37548bba914584cef309d707a9"
    echo "mov16_tree=0a30efee906e28cbeeb76c6efd9232f07ede163d"
    echo "mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
    echo "mov17_tree=8264d2e30b0c75a8bebaa1ad938df6a635f7d991"
    echo "encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
    echo "encoding_tree=d97528616454b9e93c6be9a44705d008a901ac66"
    echo "integration_sha=bf316a15a2120e32d8a32e479df2ae439081f9a1"
    echo "target_kind=disposable-local-supabase"
    echo "api_target=http://127.0.0.1:55321"
    echo "database_target=postgresql://127.0.0.1:55322/postgres"
    echo "supabase_cli=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "docker=$(docker --version 2>/dev/null || echo UNKNOWN)"
    echo "psql=$(psql --version 2>/dev/null || echo UNKNOWN)"
    echo "cleanup=$CLEANUP"
    echo "failure_step=$FAILURE_STEP"
    echo "migration_apply=$classification"
    echo "pgtap=$classification"
    echo "vip_rollback_reapply=$classification"
    echo "admission_rollback_reapply=$classification"
    echo "phase_rollback_reapply=UNKNOWN"
    echo "race_behavior=UNKNOWN"
    echo "browser_behavior=UNKNOWN"
    echo "hosted_state=UNKNOWN"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

hash_evidence() {
  (cd "$EVIDENCE_ROOT" && find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt)
}

finish() {
  local status="$1"
  trap - EXIT
  set +e
  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ "$cleanup_code" -eq 0 ]]; then CLEANUP="PASS"; else CLEANUP="FAIL"; status=1; [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="cleanup"; fi
  else
    CLEANUP="NOT APPLICABLE"
  fi
  rm -rf "$WORK_ROOT"
  unset PGPASSWORD
  if [[ "$status" -eq 0 ]]; then CLASSIFICATION="PASS"; else CLASSIFICATION="FAIL"; fi
  write_metadata "$CLASSIFICATION"
  if ! hash_evidence; then
    CLASSIFICATION="FAIL"; FAILURE_STEP="evidence-hash"; status=1
    write_metadata "$CLASSIFICATION"; hash_evidence || true
  fi
  printf 'MOVIE_BUFF_CORE_DATABASE=%s\n' "$CLASSIFICATION"
  exit "$status"
}
trap 'finish $?' EXIT

fail() { FAILURE_STEP="$1"; return 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "missing-tool-$1"; }

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
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || fail invalid-expected-sha || return 1
  [[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || fail invalid-expected-tree || return 1
  [[ -n "$SOURCE_ROOT" ]] || fail missing-source-root || return 1
  for tool in git docker supabase python3 psql sha256sum; do require "$tool" || return 1; done
  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || fail wrong-remote || return 1
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || fail wrong-sha || return 1
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})" == "$EXPECTED_TREE" ]] || fail wrong-tree || return 1
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || fail dirty-preflight || return 1
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "$BRANCH" ]] || fail wrong-branch || return 1
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$RAW_COMPOSITION" HEAD || { fail raw-composition-not-ancestor; return 1; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || fail linked-project || return 1
  [[ "$EVIDENCE_ROOT" != "$SOURCE_ROOT" && "$EVIDENCE_ROOT" != "$SOURCE_ROOT"/* ]] || fail evidence-inside-repository || return 1
  [[ "$(supabase --version)" == "2.111.0" ]] || fail unsupported-supabase-version || return 1

  rm -rf "$WORK_ROOT"; mkdir -p "$WORK_ROOT" "$RAW_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "$PROJECT_ID" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); t=p.read_text(encoding='utf-8'); project=sys.argv[2]
t,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',t,count=1)
t,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',t,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(t,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return 1; }

  run_step docker-info docker info || { fail docker-info; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || { fail supabase-start; return 1; }
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) || { fail db-reset; return 1; }
  export PGPASSWORD=postgres

  run_step migration-ledger psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atc "select version from supabase_migrations.schema_migrations where version between '20260804073000' and '20260804083600' order by version" || { fail migration-ledger; return 1; }
  for version in 20260804073000 20260804073100 20260804073200 20260804073300 20260804081500 20260804081600 20260804083000 20260804083100 20260804083200 20260804083300 20260804083400 20260804083500 20260804083600; do
    grep -qx "$version" "$EVIDENCE_ROOT/migration-ledger.stdout.txt" || { fail "missing-ledger-$version"; return 1; }
  done

  local tests=(
    movie_buff_public_matchmaking_test.sql
    movie_buff_vip_authority_test.sql
    movie_buff_vip_deadline_finalize_test.sql
    movie_buff_vip_snapshot_release_test.sql
    movie_buff_server_phase_machine_test.sql
    movie_buff_phase_contract_alignment_test.sql
    movie_buff_match_start_handoff_test.sql
  )
  for file in "${tests[@]}"; do pgtap "initial-${file%.sql}" "supabase/tests/$file" || { fail "initial-$file"; return 1; }; done

  psql_file admission-rollback "$WORK_ROOT/supabase/rollbacks/20260804081600_movie_buff_admission_phase_handoff.rollback.sql" "-c movie_buff.allow_admission_handoff_containment=on" || { fail admission-rollback; return 1; }
  run_step admission-probe psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atc "select has_function_privilege('authenticated','public.start_movie_buff_match(uuid)','EXECUTE'),has_function_privilege('service_role','public.start_movie_buff_match(uuid)','EXECUTE')" || { fail admission-probe; return 1; }
  grep -qx 'f|t' "$EVIDENCE_ROOT/admission-probe.stdout.txt" || { fail admission-probe-result; return 1; }
  psql_file admission-reapply "$WORK_ROOT/supabase/migrations/20260804081600_movie_buff_admission_phase_handoff.sql" || { fail admission-reapply; return 1; }

  psql_file vip-deadline-rollback "$WORK_ROOT/supabase/rollbacks/20260804073300_movie_buff_vip_deadline_finalize.rollback.sql" || { fail vip-deadline-rollback; return 1; }
  psql_file vip-snapshot-rollback "$WORK_ROOT/supabase/rollbacks/20260804073200_movie_buff_vip_snapshot_release_hardening.rollback.sql" || { fail vip-snapshot-rollback; return 1; }
  psql_file vip-authority-rollback "$WORK_ROOT/supabase/rollbacks/20260804073000_movie_buff_vip_authority.rollback.sql" "-c movie_buff.allow_destructive_vip_rollback=on" || { fail vip-authority-rollback; return 1; }
  for migration in \
    20260804073000_movie_buff_vip_authority.sql \
    20260804073100_movie_buff_vip_null_category_fail_closed.sql \
    20260804073200_movie_buff_vip_snapshot_release_hardening.sql \
    20260804073300_movie_buff_vip_deadline_finalize.sql; do
    psql_file "reapply-${migration%.sql}" "$WORK_ROOT/supabase/migrations/$migration" || { fail "reapply-$migration"; return 1; }
  done

  pgtap forward-public-matchmaking supabase/tests/movie_buff_public_matchmaking_test.sql || { fail forward-public-matchmaking; return 1; }
  pgtap forward-vip-authority supabase/tests/movie_buff_vip_authority_test.sql || { fail forward-vip-authority; return 1; }
  pgtap forward-vip-deadline supabase/tests/movie_buff_vip_deadline_finalize_test.sql || { fail forward-vip-deadline; return 1; }
  pgtap forward-vip-snapshot supabase/tests/movie_buff_vip_snapshot_release_test.sql || { fail forward-vip-snapshot; return 1; }
  pgtap forward-match-start supabase/tests/movie_buff_match_start_handoff_test.sql || { fail forward-match-start; return 1; }

  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail dirty-postflight; return 1; }
  return 0
}

main
