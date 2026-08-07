#!/usr/bin/env bash
set -Eeuo pipefail

EXPECTED_SOURCE_SHA="${1:?expected source SHA required}"
EXPECTED_SOURCE_TREE="${2:?expected source tree required}"
PRODUCT_SHA="${3:?product SHA required}"
PRODUCT_TREE="${4:?product tree required}"
EVIDENCE_ROOT="${5:?evidence root required}"
MODE="${6:-full}"
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${RANDOM}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-security-clearance-v2-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}.raw"
DB_URL=""
CLASSIFICATION="FAIL"
FAILURE_STEP=""

BASELINE_FILES=(
  supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql
  supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql
  supabase/migrations/20260805160500_public_rls_auto_enable_event_trigger_contract.sql
  supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql
  supabase/tests/movie_buff_current_security_finalizer_test.sql
  supabase/tests/movie_buff_agent6_persona_behavior_test.sql
  supabase/tests/movie_buff_agent6_policy_helper_security_test.sql
)
CLEARANCE_FILES=(
  supabase/migrations/20260806214500_movie_buff_staging_security_independent_clearance.sql
  supabase/rollbacks/20260806214500_movie_buff_staging_security_independent_clearance.rollback.sql
  supabase/tests/movie_buff_staging_security_independent_clearance_test.sql
  scripts/movie-buff-staging-security-clearance-v2.sh
  .github/workflows/movie-buff-staging-security-clearance.yml
)

mkdir -p "${EVIDENCE_ROOT}" "${RAW_ROOT}"

redact() {
  python3 - "$1" "$2" <<'PY'
import pathlib,re,sys
src,dst=map(pathlib.Path,sys.argv[1:3])
text=src.read_text(encoding='utf-8',errors='replace') if src.exists() else ''
for pattern,replacement in [
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s\"\']+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)((?:password|passwd|pwd|apikey|authorization)\s*[=:]\s*)[^\s,;]+',r'\1[REDACTED]')
]: text=re.sub(pattern,replacement,text)
dst.parent.mkdir(parents=True,exist_ok=True)
dst.write_text(text,encoding='utf-8')
PY
}

run_step() {
  local name="$1"; shift
  set +e
  "$@" >"${RAW_ROOT}/${name}.stdout.raw" 2>"${RAW_ROOT}/${name}.stderr.raw"
  local code=$?
  set -e
  printf '%s\n' "${code}" >"${EVIDENCE_ROOT}/${name}.exit.txt"
  redact "${RAW_ROOT}/${name}.stdout.raw" "${EVIDENCE_ROOT}/${name}.stdout.txt"
  redact "${RAW_ROOT}/${name}.stderr.raw" "${EVIDENCE_ROOT}/${name}.stderr.txt"
  rm -f "${RAW_ROOT}/${name}.stdout.raw" "${RAW_ROOT}/${name}.stderr.raw"
  return "${code}"
}

fail() { FAILURE_STEP="$1"; return 1; }

catalog_digest() {
  psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc "$(cat <<'SQL'
with function_state as (
  select p.oid::regprocedure::text identity, pg_get_userbyid(p.proowner) owner,
         p.proconfig::text config, p.proacl::text acl,
         md5(pg_get_functiondef(p.oid)) def_md5
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.oid::regprocedure::text in (
    'get_movie_buff_round_completion(uuid,uuid,timestamp with time zone,integer)',
    'get_movie_buff_round_player_time_left(uuid,uuid,timestamp with time zone,integer)',
    'is_movie_buff_round_player_finished(uuid,uuid,timestamp with time zone,integer)',
    'mark_movie_buff_round_media_ready(uuid)','is_buff_content_manager()'
  )
), table_state as (
  select c.relname name,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl,
    coalesce((select string_agg(p.polname||':'||p.polpermissive::text||':'||
      coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'|' order by p.polname)
      from pg_policy p where p.polrelid=c.oid),'') policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (
    'movie_buff_active_leave_penalty_ledger','movie_buff_active_leave_policies',
    'movie_buff_active_leave_quotes','movie_buff_board_events',
    'movie_buff_match_abandonment_events','movie_buff_match_participant_seats',
    'movie_buff_match_phase_actions','movie_buff_match_phase_events',
    'movie_buff_match_phase_state','movie_buff_vip_consumptions',
    'movie_buff_vip_definitions','movie_buff_vip_inventory',
    'movie_buff_vip_round_locks','movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  )
), combined as (
 select 'f:'||identity||':'||owner||':'||config||':'||coalesce(acl,'')||':'||def_md5 item from function_state
 union all
 select 't:'||name||':'||relrowsecurity::text||':'||relforcerowsecurity::text||':'||coalesce(acl,'')||':'||policies from table_state
)
select md5(string_agg(item,E'\n' order by item))||E'\t'||count(*) from combined;
SQL
)"
}

cleanup() {
  set +e
  if [[ -d "${WORK_ROOT}/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "${WORK_ROOT}" && supabase stop --no-backup) >"${RAW_ROOT}/cleanup.stdout.raw" 2>"${RAW_ROOT}/cleanup.stderr.raw"
    printf '%s\n' "$?" >"${EVIDENCE_ROOT}/cleanup.exit.txt"
    redact "${RAW_ROOT}/cleanup.stdout.raw" "${EVIDENCE_ROOT}/cleanup.stdout.txt"
    redact "${RAW_ROOT}/cleanup.stderr.raw" "${EVIDENCE_ROOT}/cleanup.stderr.txt"
  fi
  git -C "${SOURCE_ROOT}" worktree remove --force "${WORK_ROOT}" >/dev/null 2>&1 || true
  rm -rf "${RAW_ROOT}"
  unset DB_URL PGPASSWORD
  {
    echo "classification=${CLASSIFICATION}"
    echo "failure_step=${FAILURE_STEP}"
    echo "source_sha=${EXPECTED_SOURCE_SHA}"
    echo "source_tree=${EXPECTED_SOURCE_TREE}"
    echo "product_sha=${PRODUCT_SHA}"
    echo "product_tree=${PRODUCT_TREE}"
    echo "target=disposable-unlinked-localhost"
    echo "isolated_staging=UNTOUCHED_BY_DIGITAL_TWIN"
    echo "production=UNTOUCHED"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${EVIDENCE_ROOT}/metadata.txt"
  python3 - "${EVIDENCE_ROOT}" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]); findings=[]
patterns=[re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),
 re.compile(r'postgres(?:ql)?://(?!\[REDACTED_LOCAL_DB_URL\])\S+'),
 re.compile(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+')]
for path in root.rglob('*'):
 if path.is_file() and path.name!='sha256.txt':
  text=path.read_text(encoding='utf-8',errors='replace')
  for p in patterns:
   if p.search(text): findings.append(f'{path.name}:{p.pattern}')
(root/'secret-scan.txt').write_text('PASS\n' if not findings else 'FAIL\n'+'\n'.join(findings)+'\n',encoding='utf-8')
if findings: raise SystemExit(1)
PY
  (cd "${EVIDENCE_ROOT}" && find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt) >/dev/null || true
}
trap cleanup EXIT

main() {
  [[ "${MODE}" = full || "${MODE}" = preflight ]] || fail invalid-mode
  [[ "${EXPECTED_SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail source-sha-format
  [[ "${EXPECTED_SOURCE_TREE}" =~ ^[0-9a-f]{40}$ ]] || fail source-tree-format
  [[ "${PRODUCT_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail product-sha-format
  [[ "${PRODUCT_TREE}" =~ ^[0-9a-f]{40}$ ]] || fail product-tree-format
  for tool in git python3 sha256sum cmp grep; do command -v "${tool}" >/dev/null || fail "missing-${tool}"; done
  [[ "$(git -C "${SOURCE_ROOT}" remote get-url origin)" = https://github.com/BuffGamesStudio/buff-platform ]] || fail wrong-remote
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" = "${EXPECTED_SOURCE_SHA}" ]] || fail exact-source-sha
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree})" = "${EXPECTED_SOURCE_TREE}" ]] || fail exact-source-tree
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || fail dirty-source
  [[ ! -f "${SOURCE_ROOT}/supabase/.temp/project-ref" ]] || fail linked-source
  for path in "${BASELINE_FILES[@]}" "${CLEARANCE_FILES[@]}"; do [[ -f "${SOURCE_ROOT}/${path}" ]] || fail "missing-${path//\//-}"; done

  python3 - "${EVIDENCE_ROOT}/source-manifest.tsv" "${SOURCE_ROOT}" "${EXPECTED_SOURCE_SHA}" "${EXPECTED_SOURCE_TREE}" "${PRODUCT_SHA}" "${PRODUCT_TREE}" "${BASELINE_FILES[@]}" "${CLEARANCE_FILES[@]}" <<'PY'
import hashlib,pathlib,sys
out,root=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]); ids=sys.argv[3:7]
rows=['source_sha\tsource_tree\tproduct_sha\tproduct_tree\tpath\tbytes\tsha256']
for raw in sys.argv[7:]:
 data=(root/raw).read_bytes(); rows.append('\t'.join([*ids,raw,str(len(data)),hashlib.sha256(data).hexdigest()]))
out.write_text('\n'.join(rows)+'\n',encoding='utf-8')
PY
  [[ "${MODE}" = preflight ]] && { CLASSIFICATION=PASS; return; }

  for tool in docker supabase psql; do command -v "${tool}" >/dev/null || fail "missing-${tool}"; done
  run_step docker-info docker info || fail docker-info
  run_step product-fetch git -C "${SOURCE_ROOT}" fetch --no-tags --depth=1 origin "${PRODUCT_SHA}" || fail product-fetch
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse "${PRODUCT_SHA}^{tree}")" = "${PRODUCT_TREE}" ]] || fail product-tree
  run_step worktree-add git -C "${SOURCE_ROOT}" worktree add --detach "${WORK_ROOT}" "${PRODUCT_SHA}" || fail worktree-add
  [[ ! -f "${WORK_ROOT}/supabase/.temp/project-ref" ]] || fail linked-product

  for path in "${BASELINE_FILES[@]}"; do mkdir -p "${WORK_ROOT}/$(dirname "${path}")"; cp "${SOURCE_ROOT}/${path}" "${WORK_ROOT}/${path}"; done
  mkdir -p "${WORK_ROOT}/.clearance" "${WORK_ROOT}/supabase/tests"
  cp "${SOURCE_ROOT}/supabase/migrations/20260806214500_movie_buff_staging_security_independent_clearance.sql" "${WORK_ROOT}/.clearance/forward.sql"
  cp "${SOURCE_ROOT}/supabase/rollbacks/20260806214500_movie_buff_staging_security_independent_clearance.rollback.sql" "${WORK_ROOT}/.clearance/rollback.sql"
  cp "${SOURCE_ROOT}/supabase/tests/movie_buff_staging_security_independent_clearance_test.sql" "${WORK_ROOT}/supabase/tests/"
  python3 - "${WORK_ROOT}/supabase/config.toml" "clearance-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text(encoding='utf-8')
s,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{sys.argv[2]}"',s,count=1)
s,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',s,count=1)
if n!=1 or m!=1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(s,encoding='utf-8')
PY
  (cd "${WORK_ROOT}" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || fail supabase-start
  (cd "${WORK_ROOT}" && run_step db-reset supabase db reset --local) || fail db-reset
  local env_text
  env_text="$(cd "${WORK_ROOT}" && supabase status -o env 2>/dev/null)" || fail supabase-status
  eval "${env_text}"
  DB_URL="${DB_URL:-}"
  python3 - "${DB_URL}" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlparse(sys.argv[1])
if u.scheme not in ('postgres','postgresql') or u.hostname not in ('127.0.0.1','localhost','::1'): raise SystemExit('non-local target refused')
PY

  (cd "${WORK_ROOT}" && run_step baseline-functions supabase test db supabase/tests/movie_buff_current_security_finalizer_test.sql --local) || fail baseline-functions
  (cd "${WORK_ROOT}" && run_step baseline-policies supabase test db supabase/tests/movie_buff_agent6_policy_helper_security_test.sql --local) || fail baseline-policies
  (cd "${WORK_ROOT}" && run_step baseline-personas supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) || fail baseline-personas
  run_step forward psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/forward.sql" || fail forward
  (cd "${WORK_ROOT}" && run_step clearance-test supabase test db supabase/tests/movie_buff_staging_security_independent_clearance_test.sql --local) || fail clearance-test
  catalog_digest >"${EVIDENCE_ROOT}/catalog-before.tsv" || fail catalog-before
  run_step rollback psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/rollback.sql" || fail rollback
  run_step reapply psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/forward.sql" || fail reapply
  (cd "${WORK_ROOT}" && run_step clearance-test-reapply supabase test db supabase/tests/movie_buff_staging_security_independent_clearance_test.sql --local) || fail clearance-test-reapply
  catalog_digest >"${EVIDENCE_ROOT}/catalog-after.tsv" || fail catalog-after
  cmp -s "${EVIDENCE_ROOT}/catalog-before.tsv" "${EVIDENCE_ROOT}/catalog-after.tsv" || fail catalog-equality
  printf 'PASS\n' >"${EVIDENCE_ROOT}/catalog-equality.txt"
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || fail dirty-postflight
  CLASSIFICATION=PASS
}

if ! main; then
  [[ -n "${FAILURE_STEP}" ]] || FAILURE_STEP=unclassified
  exit 1
fi
