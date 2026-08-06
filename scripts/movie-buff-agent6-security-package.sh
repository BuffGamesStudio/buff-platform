#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SOURCE_SHA="${1:-${MOVIE_BUFF_AGENT6_SOURCE_SHA:-}}"
EXPECTED_SOURCE_TREE="${2:-${MOVIE_BUFF_AGENT6_SOURCE_TREE:-}}"
PRODUCT_SHA="${3:-${MOVIE_BUFF_AGENT6_PRODUCT_SHA:-}}"
PRODUCT_TREE="${4:-${MOVIE_BUFF_AGENT6_PRODUCT_TREE:-}}"
EVIDENCE_ROOT="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-agent6-security-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-agent6-security-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}.raw"
OVERALL=0
FAILURE_STEP=""
DB_URL=""

SECURITY_FILES=(
  supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql
  supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql
  supabase/migrations/20260805160500_public_rls_auto_enable_event_trigger_contract.sql
  supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql
  supabase/rollbacks/20260805155000_movie_buff_function_security_finalizer.rollback.sql
  supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql
  supabase/rollbacks/20260805160500_public_rls_auto_enable_event_trigger_contract.rollback.sql
  supabase/rollbacks/20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql
  supabase/tests/movie_buff_current_security_finalizer_test.sql
  supabase/tests/movie_buff_current_security_finalizer_rollback_test.sql
  supabase/tests/movie_buff_agent6_persona_behavior_test.sql
)

mkdir -p "${EVIDENCE_ROOT}" "${RAW_ROOT}"

redact_file() {
  local source="$1" destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
text=source.read_text(encoding='utf-8',errors='replace') if source.exists() else ''
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s\"\']+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)((?:password|passwd|pwd)\s*[=:]\s*)[^\s,;]+',r'\1[REDACTED]'),
 (r'(?i)((?:authorization|apikey)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+',r'\1[REDACTED]'),
]
for pattern,replacement in patterns:
    text=re.sub(pattern,replacement,text)
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(text,encoding='utf-8')
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
  if [[ -n "${SOURCE_ROOT}" ]] && [[ -d "${WORK_ROOT}" ]]; then
    git -C "${SOURCE_ROOT}" worktree remove --force "${WORK_ROOT}" >/dev/null 2>&1 || OVERALL=1
  fi
  rm -rf "${RAW_ROOT}"
  unset DB_URL PGPASSWORD

  local actual_source_sha actual_source_tree
  actual_source_sha="$(git -C "${SOURCE_ROOT}" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
  actual_source_tree="$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
  {
    echo "lane=agent6-database-security"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "source_branch=security/movie-buff-rls-acl-staging"
    echo "source_sha=${actual_source_sha}"
    echo "source_tree=${actual_source_tree}"
    echo "expected_source_sha=${EXPECTED_SOURCE_SHA}"
    echo "expected_source_tree=${EXPECTED_SOURCE_TREE}"
    echo "product_sha=${PRODUCT_SHA}"
    echo "product_tree=${PRODUCT_TREE}"
    echo "target=disposable-unlinked-localhost"
    echo "forward_order=20260805155000,20260805160000,20260805160500,20260805161000"
    echo "rollback_order=20260805161000,20260805160500,20260805160000,20260805155000"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=$([[ "${OVERALL}" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "historical_hosted=UNKNOWN_ACCESS_DENIED"
    echo "isolated_staging=UNTOUCHED"
    echo "production=UNTOUCHED"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${EVIDENCE_ROOT}/metadata.txt"

  python3 - "${EVIDENCE_ROOT}" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1])
patterns=[
 re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),
 re.compile(r'postgres(?:ql)?://(?!\[REDACTED_LOCAL_DB_URL\])\S+'),
 re.compile(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+'),
 re.compile(r'(?i)(?:password|passwd|pwd)\s*[=:]\s*(?!\[REDACTED\])\S+'),
]
findings=[]
for path in root.rglob('*'):
    if path.is_file() and path.name != 'sha256.txt':
        text=path.read_text(encoding='utf-8',errors='replace')
        for pattern in patterns:
            if pattern.search(text): findings.append(f'{path.name}: {pattern.pattern}')
(root/'secret-scan.txt').write_text('PASS\n' if not findings else 'FAIL\n'+'\n'.join(findings)+'\n',encoding='utf-8')
if findings: raise SystemExit(1)
PY
  [[ $? -eq 0 ]] || OVERALL=1

  (
    cd "${EVIDENCE_ROOT}" || exit 1
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
      | sort -z | xargs -0 sha256sum >sha256.txt
    sha256sum -c sha256.txt
    if grep -Eq '(^|[[:space:]])/' sha256.txt; then
      echo 'absolute path found in manifest' >&2
      exit 1
    fi
  ) || OVERALL=1
  exit "${OVERALL}"
}
trap cleanup EXIT

main() {
  [[ "${EXPECTED_SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { fail expected-source-sha; return; }
  [[ "${EXPECTED_SOURCE_TREE}" =~ ^[0-9a-f]{40}$ ]] || { fail expected-source-tree; return; }
  [[ "${PRODUCT_SHA}" =~ ^[0-9a-f]{40}$ ]] || { fail product-sha; return; }
  [[ "${PRODUCT_TREE}" =~ ^[0-9a-f]{40}$ ]] || { fail product-tree; return; }
  [[ -n "${SOURCE_ROOT}" ]] || { fail source-root; return; }

  for command_name in git docker supabase psql python3 sha256sum cmp grep; do
    command -v "${command_name}" >/dev/null 2>&1 || { fail "missing-${command_name}"; return; }
  done

  [[ "$(git -C "${SOURCE_ROOT}" remote get-url origin)" = "https://github.com/BuffGamesStudio/buff-platform" ]] \
    || { fail wrong-remote; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" = "${EXPECTED_SOURCE_SHA}" ]] \
    || { fail exact-source-sha; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree})" = "${EXPECTED_SOURCE_TREE}" ]] \
    || { fail exact-source-tree; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] \
    || { fail dirty-source; return; }
  [[ ! -f "${SOURCE_ROOT}/supabase/.temp/project-ref" ]] \
    || { fail linked-source-supabase; return; }

  for path in "${SECURITY_FILES[@]}"; do
    [[ -f "${SOURCE_ROOT}/${path}" ]] || { fail "missing-${path//\//-}"; return; }
  done

  git -C "${SOURCE_ROOT}" fetch --no-tags --depth=1 origin "${PRODUCT_SHA}" \
    >"${RAW_ROOT}/product-fetch.stdout.raw" 2>"${RAW_ROOT}/product-fetch.stderr.raw"
  fetch_exit=$?
  printf '%s\n' "${fetch_exit}" >"${EVIDENCE_ROOT}/product-fetch.exit.txt"
  redact_file "${RAW_ROOT}/product-fetch.stdout.raw" "${EVIDENCE_ROOT}/product-fetch.stdout.txt"
  redact_file "${RAW_ROOT}/product-fetch.stderr.raw" "${EVIDENCE_ROOT}/product-fetch.stderr.txt"
  [[ "${fetch_exit}" -eq 0 ]] || { fail product-fetch; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse "${PRODUCT_SHA}^{tree}")" = "${PRODUCT_TREE}" ]] \
    || { fail product-tree-mismatch; return; }

  rm -rf "${WORK_ROOT}"
  git -C "${SOURCE_ROOT}" worktree add --detach "${WORK_ROOT}" "${PRODUCT_SHA}" \
    >"${RAW_ROOT}/worktree-add.stdout.raw" 2>"${RAW_ROOT}/worktree-add.stderr.raw"
  worktree_exit=$?
  printf '%s\n' "${worktree_exit}" >"${EVIDENCE_ROOT}/worktree-add.exit.txt"
  redact_file "${RAW_ROOT}/worktree-add.stdout.raw" "${EVIDENCE_ROOT}/worktree-add.stdout.txt"
  redact_file "${RAW_ROOT}/worktree-add.stderr.raw" "${EVIDENCE_ROOT}/worktree-add.stderr.txt"
  [[ "${worktree_exit}" -eq 0 ]] || { fail product-worktree; return; }
  [[ "$(git -C "${WORK_ROOT}" rev-parse HEAD)" = "${PRODUCT_SHA}" ]] || { fail worktree-product-sha; return; }
  [[ "$(git -C "${WORK_ROOT}" rev-parse HEAD^{tree})" = "${PRODUCT_TREE}" ]] || { fail worktree-product-tree; return; }
  [[ ! -f "${WORK_ROOT}/supabase/.temp/project-ref" ]] || { fail linked-product-supabase; return; }

  for path in "${SECURITY_FILES[@]}"; do
    mkdir -p "${WORK_ROOT}/$(dirname "${path}")"
    cp "${SOURCE_ROOT}/${path}" "${WORK_ROOT}/${path}"
    cmp -s "${SOURCE_ROOT}/${path}" "${WORK_ROOT}/${path}" \
      || { fail "overlay-mismatch-${path//\//-}"; return; }
  done

  python3 - "${EVIDENCE_ROOT}/agent6-source-manifest.tsv" "${SOURCE_ROOT}" "${EXPECTED_SOURCE_SHA}" "${EXPECTED_SOURCE_TREE}" "${PRODUCT_SHA}" "${PRODUCT_TREE}" "${SECURITY_FILES[@]}" <<'PY'
import hashlib,pathlib,sys
out=pathlib.Path(sys.argv[1]); root=pathlib.Path(sys.argv[2])
source_sha,source_tree,product_sha,product_tree=sys.argv[3:7]
rows=['source_sha\tsource_tree\tproduct_sha\tproduct_tree\tpath\tbytes\tsha256']
for raw in sys.argv[7:]:
    path=root/raw; data=path.read_bytes()
    rows.append('\t'.join([source_sha,source_tree,product_sha,product_tree,raw,str(len(data)),hashlib.sha256(data).hexdigest()]))
out.write_text('\n'.join(rows)+'\n',encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail source-manifest; return; }

  python3 - "${WORK_ROOT}/supabase/config.toml" "agent6-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return; }

  run_step docker-info docker info || { fail docker-info; return; }
  (cd "${WORK_ROOT}" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { fail supabase-start; return; }
  (cd "${WORK_ROOT}" && run_step db-reset supabase db reset --local) \
    || { fail db-reset; return; }

  status_env="$(cd "${WORK_ROOT}" && supabase status -o env 2>/dev/null)"
  [[ $? -eq 0 ]] || { fail supabase-status; return; }
  eval "${status_env}"
  DB_URL="${DB_URL:-}"
  [[ -n "${DB_URL}" ]] || { fail database-url; return; }
  python3 - "${DB_URL}" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
if u.scheme not in ('postgres','postgresql') or u.hostname not in ('127.0.0.1','localhost','::1'):
    raise SystemExit('non-local database target refused')
PY
  [[ $? -eq 0 ]] || { fail non-local-database-refused; return; }

  run_step migration-ledger psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc \
    "select version from supabase_migrations.schema_migrations where version in ('20260805155000','20260805160000','20260805160500','20260805161000') order by version;" \
    || { fail migration-ledger; return; }
  for version in 20260805155000 20260805160000 20260805160500 20260805161000; do
    grep -qx "${version}" "${EVIDENCE_ROOT}/migration-ledger.stdout.txt" \
      || { fail "migration-ledger-missing-${version}"; return; }
  done

  (cd "${WORK_ROOT}" && run_step pgtap-forward-initial supabase test db supabase/tests/movie_buff_current_security_finalizer_test.sql --local) \
    || { fail pgtap-forward-initial; return; }
  (cd "${WORK_ROOT}" && run_step personas-forward-initial supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) \
    || { fail personas-forward-initial; return; }

  CATALOG_SQL=$(cat <<'SQL'
select jsonb_build_object(
  'functions',(
    select jsonb_agg(jsonb_build_object(
      'identity',p.oid::regprocedure::text,
      'owner',pg_get_userbyid(p.proowner),
      'security_definer',p.prosecdef,
      'config',p.proconfig,
      'acl',p.proacl
    ) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '%movie_buff%' or p.proname in ('set_updated_at','normalize_movie_answer','handle_new_user','rls_auto_enable'))
  ),
  'tables',(
    select jsonb_agg(jsonb_build_object(
      'table',c.relname,'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl,
      'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',pol.polname,'cmd',pol.polcmd,'roles',pol.polroles,'using',pg_get_expr(pol.polqual,pol.polrelid),'check',pg_get_expr(pol.polwithcheck,pol.polrelid)) order by pol.polname),'[]'::jsonb) from pg_policy pol where pol.polrelid=c.oid)
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('match_round_player_hints','match_round_player_playback','movie_buff_boards','movie_buff_board_categories','movie_buff_board_tiles','movie_buff_board_events')
  ),
  'event_trigger',(
    select jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'owner',pg_get_userbyid(e.evtowner),'function',e.evtfoid::regprocedure::text,'tags',e.evttags) order by e.evtname)
    from pg_event_trigger e where e.evtname='ensure_rls'
  )
)::text;
SQL
)
  run_step catalog-before psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc "${CATALOG_SQL}" \
    || { fail catalog-before; return; }

  for version in 161000 160500 160000 155000; do
    case "${version}" in
      161000) path=20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql ;;
      160500) path=20260805160500_public_rls_auto_enable_event_trigger_contract.rollback.sql ;;
      160000) path=20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql ;;
      155000) path=20260805155000_movie_buff_function_security_finalizer.rollback.sql ;;
    esac
    run_step "rollback-${version}" psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/supabase/rollbacks/${path}" \
      || { fail "rollback-${version}"; return; }
  done

  (cd "${WORK_ROOT}" && run_step pgtap-rollback supabase test db supabase/tests/movie_buff_current_security_finalizer_rollback_test.sql --local) \
    || { fail pgtap-rollback; return; }

  for version in 155000 160000 160500 161000; do
    case "${version}" in
      155000) path=20260805155000_movie_buff_function_security_finalizer.sql ;;
      160000) path=20260805160000_movie_buff_six_table_rls_reconciliation.sql ;;
      160500) path=20260805160500_public_rls_auto_enable_event_trigger_contract.sql ;;
      161000) path=20260805161000_public_rls_auto_enable_acl_lockdown.sql ;;
    esac
    run_step "reapply-${version}" psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/supabase/migrations/${path}" \
      || { fail "reapply-${version}"; return; }
  done

  (cd "${WORK_ROOT}" && run_step pgtap-forward-reapply supabase test db supabase/tests/movie_buff_current_security_finalizer_test.sql --local) \
    || { fail pgtap-forward-reapply; return; }
  (cd "${WORK_ROOT}" && run_step personas-forward-reapply supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) \
    || { fail personas-forward-reapply; return; }

  run_step catalog-after psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc "${CATALOG_SQL}" \
    || { fail catalog-after; return; }
  cmp -s "${EVIDENCE_ROOT}/catalog-before.stdout.txt" "${EVIDENCE_ROOT}/catalog-after.stdout.txt" \
    || { fail catalog-reapply-mismatch; return; }
  printf 'PASS\n' >"${EVIDENCE_ROOT}/catalog-reapply-compare.txt"

  git -C "${SOURCE_ROOT}" diff --check || { fail git-diff-check; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || { fail dirty-postflight; return; }
}

main
