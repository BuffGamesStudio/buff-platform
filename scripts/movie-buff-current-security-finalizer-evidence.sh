#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/movie-buff-current-security-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-current-security-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
OVERALL=0
FAILURE_STEP=""

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
  unset PGPASSWORD DB_URL

  {
    echo "lane=movie-buff-current-security-finalizer"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "source_sha=$(git -C "${SOURCE_ROOT}" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=${EXPECTED_SHA}"
    echo "target=disposable-localhost"
    echo "forward_migrations=20260805155000,20260805160000,20260805161000"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=$([[ "${OVERALL}" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "persona_behavior=catalog-contract-only"
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
  python3 - "${WORK_ROOT}/supabase/config.toml" "movie-buff-security-${RUN_TOKEN}" <<'PY'
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
    "select version from supabase_migrations.schema_migrations where version in ('20260805155000','20260805160000','20260805161000') order by version;" \
    || { fail migration-ledger; return; }
  for version in 20260805155000 20260805160000 20260805161000; do
    grep -qx "${version}" "${EVIDENCE_ROOT}/migration-ledger.stdout.txt" \
      || { fail "migration-ledger-missing-${version}"; return; }
  done

  (cd "${WORK_ROOT}" && run_step pgtap-forward-initial supabase test db \
    supabase/tests/movie_buff_current_security_finalizer_test.sql --local) \
    || { fail pgtap-forward-initial; return; }

  run_step rollback-auto-rls psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/rollbacks/20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql" \
    || { fail rollback-auto-rls; return; }
  run_step rollback-six-table psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql" \
    || { fail rollback-six-table; return; }
  run_step rollback-functions psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/rollbacks/20260805155000_movie_buff_function_security_finalizer.rollback.sql" \
    || { fail rollback-functions; return; }

  (cd "${WORK_ROOT}" && run_step pgtap-rollback supabase test db \
    supabase/tests/movie_buff_current_security_finalizer_rollback_test.sql --local) \
    || { fail pgtap-rollback; return; }

  run_step reapply-functions psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql" \
    || { fail reapply-functions; return; }
  run_step reapply-six-table psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql" \
    || { fail reapply-six-table; return; }
  run_step reapply-auto-rls psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f "${WORK_ROOT}/supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql" \
    || { fail reapply-auto-rls; return; }

  (cd "${WORK_ROOT}" && run_step pgtap-forward-reapply supabase test db \
    supabase/tests/movie_buff_current_security_finalizer_test.sql --local) \
    || { fail pgtap-forward-reapply; return; }

  run_step readonly-capture psql "${database_url}" -X -v ON_ERROR_STOP=1 -Atc \
    "select jsonb_build_object('forced_rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('match_round_player_hints','match_round_player_playback','movie_buff_boards','movie_buff_board_categories','movie_buff_board_tiles','movie_buff_board_events') and c.relrowsecurity and c.relforcerowsecurity),'policy_count',(select count(*) from pg_policies where schemaname='public' and tablename in ('match_round_player_hints','match_round_player_playback','movie_buff_boards','movie_buff_board_categories','movie_buff_board_tiles','movie_buff_board_events')),'anon_movie_buff_rpc_count',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%movie_buff%' and has_function_privilege('anon',p.oid,'EXECUTE')),'rls_auto_anon_execute',has_function_privilege('anon','public.rls_auto_enable()','EXECUTE'));" \
    || { fail readonly-capture; return; }

  git -C "${SOURCE_ROOT}" diff --check || { fail git-diff-check; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] \
    || { fail dirty-postflight; return; }
}

main
