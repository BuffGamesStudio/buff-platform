#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SOURCE_SHA="${1:-}"
EXPECTED_SOURCE_TREE="${2:-}"
PRODUCT_SHA="${3:-}"
PRODUCT_TREE="${4:-}"
EVIDENCE_ROOT="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-staging-security-clearance-evidence}"
MODE="${6:-full}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${RANDOM}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-staging-security-clearance-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}.raw"
OVERALL=0
FAILURE_STEP=""
DB_URL=""

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
  scripts/movie-buff-staging-security-clearance.sh
  .github/workflows/movie-buff-staging-security-clearance.yml
)

mkdir -p "${EVIDENCE_ROOT}" "${RAW_ROOT}"

redact_file() {
  local source="$1" destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib, re, sys
source, destination = map(pathlib.Path, sys.argv[1:3])
text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else ""
patterns = [
    (r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED_JWT]"),
    (r"postgres(?:ql)?://[^\s\"']+", "postgresql://[REDACTED_LOCAL_DB_URL]"),
    (r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[REDACTED_SUPABASE_KEY]"),
    (r"(?i)((?:password|passwd|pwd)\s*[=:]\s*)[^\s,;]+", r"\1[REDACTED]"),
    (r"(?i)((?:authorization|apikey)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+", r"\1[REDACTED]"),
]
for pattern, replacement in patterns:
    text = re.sub(pattern, replacement, text)
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(text, encoding="utf-8")
PY
}

run_step() {
  local name="$1"; shift
  "$@" >"${RAW_ROOT}/${name}.stdout.raw" 2>"${RAW_ROOT}/${name}.stderr.raw"
  local code=$?
  printf '%s\n' "${code}" >"${EVIDENCE_ROOT}/${name}.exit.txt"
  redact_file "${RAW_ROOT}/${name}.stdout.raw" "${EVIDENCE_ROOT}/${name}.stdout.txt"
  redact_file "${RAW_ROOT}/${name}.stderr.raw" "${EVIDENCE_ROOT}/${name}.stderr.txt"
  rm -f "${RAW_ROOT}/${name}.stdout.raw" "${RAW_ROOT}/${name}.stderr.raw"
  return "${code}"
}

fail() {
  FAILURE_STEP="$1"
  OVERALL=1
  return 1
}

write_source_manifest() {
  python3 - "${EVIDENCE_ROOT}/source-manifest.tsv" "${SOURCE_ROOT}" \
    "${EXPECTED_SOURCE_SHA}" "${EXPECTED_SOURCE_TREE}" "${PRODUCT_SHA}" "${PRODUCT_TREE}" \
    "${BASELINE_FILES[@]}" "${CLEARANCE_FILES[@]}" <<'PY'
import hashlib, pathlib, sys
out, root = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
source_sha, source_tree, product_sha, product_tree = sys.argv[3:7]
rows = ["source_sha\tsource_tree\tproduct_sha\tproduct_tree\tpath\tbytes\tsha256"]
for raw in sys.argv[7:]:
    data = (root / raw).read_bytes()
    rows.append("\t".join([
        source_sha, source_tree, product_sha, product_tree,
        raw, str(len(data)), hashlib.sha256(data).hexdigest()
    ]))
out.write_text("\n".join(rows) + "\n", encoding="utf-8")
PY
}

write_catalog() {
  local name="$1"
  run_step "${name}" psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc "$(cat <<'SQL'
select jsonb_build_object(
  'browser_security_definer_functions',(
    select jsonb_agg(jsonb_build_object(
      'identity',p.oid::regprocedure::text,
      'owner',pg_get_userbyid(p.proowner),
      'config',p.proconfig,
      'public_execute',has_function_privilege('public',p.oid,'execute'),
      'anon_execute',has_function_privilege('anon',p.oid,'execute'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'execute'),
      'definition_md5',md5(pg_get_functiondef(p.oid))
    ) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'execute')
  ),
  'internal_tables',(
    select jsonb_agg(jsonb_build_object(
      'table',c.relname,
      'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,
      'force_rls',c.relforcerowsecurity,
      'acl',c.relacl,
      'policies',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'name',pol.polname,
          'permissive',pol.polpermissive,
          'using',pg_get_expr(pol.polqual,pol.polrelid),
          'check',pg_get_expr(pol.polwithcheck,pol.polrelid)
        ) order by pol.polname),'[]'::jsonb)
        from pg_policy pol where pol.polrelid=c.oid
      )
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'movie_buff_abandonment_ledger','movie_buff_board_events',
      'movie_buff_match_participant_seats','movie_buff_match_playbacks',
      'movie_buff_match_rounds','movie_buff_match_state',
      'movie_buff_penalty_config','movie_buff_phase_idempotency',
      'movie_buff_round_player_answers','movie_buff_round_player_media',
      'movie_buff_round_results','movie_buff_rounds',
      'movie_buff_selection_idempotency','movie_buff_vip_round_required_players',
      'movie_buff_vip_round_windows'
    )
  )
)::text;
SQL
)"
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
  if [[ -n "${SOURCE_ROOT}" && -d "${WORK_ROOT}" ]]; then
    git -C "${SOURCE_ROOT}" worktree remove --force "${WORK_ROOT}" >/dev/null 2>&1 || OVERALL=1
  fi
  rm -rf "${RAW_ROOT}"
  unset DB_URL PGPASSWORD

  {
    echo "lane=staging-security-independent-clearance"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "source_branch=security/movie-buff-staging-independent-clearance-v1"
    echo "source_sha=$(git -C "${SOURCE_ROOT}" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_source_sha=${EXPECTED_SOURCE_SHA}"
    echo "expected_source_tree=${EXPECTED_SOURCE_TREE}"
    echo "product_sha=${PRODUCT_SHA}"
    echo "product_tree=${PRODUCT_TREE}"
    echo "target=disposable-unlinked-localhost"
    echo "mode=${MODE}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=$([[ "${OVERALL}" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "isolated_staging=UNTOUCHED_BY_LOCAL_LAB"
    echo "production=UNTOUCHED"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${EVIDENCE_ROOT}/metadata.txt"

  python3 - "${EVIDENCE_ROOT}" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
patterns = [
    re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
    re.compile(r"postgres(?:ql)?://(?!\[REDACTED_LOCAL_DB_URL\])\S+"),
    re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+"),
    re.compile(r"(?i)(?:password|passwd|pwd)\s*[=:]\s*(?!\[REDACTED\])\S+"),
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
    find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
    sha256sum -c sha256.txt
    ! grep -Eq '(^|[[:space:]])/' sha256.txt
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
  [[ "${MODE}" = "full" || "${MODE}" = "preflight" ]] || { fail invalid-mode; return; }

  for command_name in git python3 sha256sum cmp grep; do
    command -v "${command_name}" >/dev/null 2>&1 || { fail "missing-${command_name}"; return; }
  done

  [[ "$(git -C "${SOURCE_ROOT}" remote get-url origin)" = "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail wrong-remote; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD)" = "${EXPECTED_SOURCE_SHA}" ]] || { fail exact-source-sha; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse HEAD^{tree})" = "${EXPECTED_SOURCE_TREE}" ]] || { fail exact-source-tree; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || { fail dirty-source; return; }
  [[ ! -f "${SOURCE_ROOT}/supabase/.temp/project-ref" ]] || { fail linked-source-supabase; return; }

  for path in "${BASELINE_FILES[@]}" "${CLEARANCE_FILES[@]}"; do
    [[ -f "${SOURCE_ROOT}/${path}" ]] || { fail "missing-${path//\//-}"; return; }
  done
  write_source_manifest || { fail source-manifest; return; }

  if [[ "${MODE}" = "preflight" ]]; then
    return 0
  fi

  for command_name in docker supabase psql; do
    command -v "${command_name}" >/dev/null 2>&1 || { fail "missing-${command_name}"; return; }
  done

  run_step product-fetch git -C "${SOURCE_ROOT}" fetch --no-tags --depth=1 origin "${PRODUCT_SHA}" || { fail product-fetch; return; }
  [[ "$(git -C "${SOURCE_ROOT}" rev-parse "${PRODUCT_SHA}^{tree}")" = "${PRODUCT_TREE}" ]] || { fail product-tree-mismatch; return; }

  rm -rf "${WORK_ROOT}"
  run_step worktree-add git -C "${SOURCE_ROOT}" worktree add --detach "${WORK_ROOT}" "${PRODUCT_SHA}" || { fail product-worktree; return; }
  [[ "$(git -C "${WORK_ROOT}" rev-parse HEAD)" = "${PRODUCT_SHA}" ]] || { fail worktree-product-sha; return; }
  [[ "$(git -C "${WORK_ROOT}" rev-parse HEAD^{tree})" = "${PRODUCT_TREE}" ]] || { fail worktree-product-tree; return; }
  [[ ! -f "${WORK_ROOT}/supabase/.temp/project-ref" ]] || { fail linked-product-supabase; return; }

  for path in "${BASELINE_FILES[@]}"; do
    mkdir -p "${WORK_ROOT}/$(dirname "${path}")"
    cp "${SOURCE_ROOT}/${path}" "${WORK_ROOT}/${path}"
    cmp -s "${SOURCE_ROOT}/${path}" "${WORK_ROOT}/${path}" || { fail "overlay-mismatch-${path//\//-}"; return; }
  done

  mkdir -p "${WORK_ROOT}/.clearance" "${WORK_ROOT}/supabase/tests"
  cp "${SOURCE_ROOT}/supabase/migrations/20260806214500_movie_buff_staging_security_independent_clearance.sql" "${WORK_ROOT}/.clearance/forward.sql"
  cp "${SOURCE_ROOT}/supabase/rollbacks/20260806214500_movie_buff_staging_security_independent_clearance.rollback.sql" "${WORK_ROOT}/.clearance/rollback.sql"
  cp "${SOURCE_ROOT}/supabase/tests/movie_buff_staging_security_independent_clearance_test.sql" "${WORK_ROOT}/supabase/tests/movie_buff_staging_security_independent_clearance_test.sql"

  python3 - "${WORK_ROOT}/supabase/config.toml" "clearance-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1]); text=path.read_text(encoding='utf-8')
text,pc=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{sys.argv[2]}"',text,count=1)
text,sc=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if pc != 1 or sc != 1: raise SystemExit('ephemeral config rewrite failed')
path.write_text(text,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return; }

  run_step docker-info docker info || { fail docker-info; return; }
  (cd "${WORK_ROOT}" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || { fail supabase-start; return; }
  (cd "${WORK_ROOT}" && run_step db-reset supabase db reset --local) || { fail db-reset; return; }

  status_env="$(cd "${WORK_ROOT}" && supabase status -o env 2>/dev/null)" || { fail supabase-status; return; }
  eval "${status_env}"
  DB_URL="${DB_URL:-}"
  [[ -n "${DB_URL}" ]] || { fail database-url; return; }
  python3 - "${DB_URL}" <<'PY'
import sys,urllib.parse
url=urllib.parse.urlparse(sys.argv[1])
if url.scheme not in ('postgres','postgresql') or url.hostname not in ('127.0.0.1','localhost','::1'):
    raise SystemExit('non-local database target refused')
PY
  [[ $? -eq 0 ]] || { fail non-local-database-refused; return; }

  (cd "${WORK_ROOT}" && run_step baseline-functions supabase test db supabase/tests/movie_buff_current_security_finalizer_test.sql --local) || { fail baseline-functions; return; }
  (cd "${WORK_ROOT}" && run_step baseline-policies supabase test db supabase/tests/movie_buff_agent6_policy_helper_security_test.sql --local) || { fail baseline-policies; return; }
  (cd "${WORK_ROOT}" && run_step baseline-personas supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) || { fail baseline-personas; return; }

  run_step clearance-forward psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/forward.sql" || { fail clearance-forward; return; }
  (cd "${WORK_ROOT}" && run_step clearance-test-initial supabase test db supabase/tests/movie_buff_staging_security_independent_clearance_test.sql --local) || { fail clearance-test-initial; return; }
  (cd "${WORK_ROOT}" && run_step compatibility-personas-initial supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) || { fail compatibility-personas-initial; return; }
  write_catalog catalog-before || { fail catalog-before; return; }

  run_step clearance-rollback psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/rollback.sql" || { fail clearance-rollback; return; }
  run_step rollback-probe psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -Atc "$(cat <<'SQL'
do $probe$
begin
  if not has_function_privilege('authenticated','public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)'::regprocedure,'execute')
     or not has_function_privilege('authenticated','public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)'::regprocedure,'execute')
     or not has_function_privilege('authenticated','public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)'::regprocedure,'execute') then
    raise exception 'helper rollback ACL mismatch';
  end if;
  if position('movie_buff_phase_require_access(p_room_id)' in pg_get_functiondef('public.mark_movie_buff_round_media_ready(uuid)'::regprocedure)) > 0 then
    raise exception 'media-ready rollback definition mismatch';
  end if;
  if (select proconfig from pg_proc where oid='public.is_buff_content_manager()'::regprocedure)
       is distinct from array['search_path=public']::text[] then
    raise exception 'content-manager rollback search_path mismatch';
  end if;
  if exists (
    select 1 from pg_policy where polname='movie_buff_internal_browser_deny'
      and polrelid in (
        select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname like 'movie_buff%'
      )
  ) then
    raise exception 'internal policy rollback mismatch';
  end if;
end;
$probe$;
select 'PASS';
SQL
)" || { fail rollback-probe; return; }

  run_step clearance-reapply psql "${DB_URL}" -X -v ON_ERROR_STOP=1 -f "${WORK_ROOT}/.clearance/forward.sql" || { fail clearance-reapply; return; }
  (cd "${WORK_ROOT}" && run_step clearance-test-reapply supabase test db supabase/tests/movie_buff_staging_security_independent_clearance_test.sql --local) || { fail clearance-test-reapply; return; }
  (cd "${WORK_ROOT}" && run_step compatibility-personas-reapply supabase test db supabase/tests/movie_buff_agent6_persona_behavior_test.sql --local) || { fail compatibility-personas-reapply; return; }
  write_catalog catalog-after || { fail catalog-after; return; }
  cmp -s "${EVIDENCE_ROOT}/catalog-before.stdout.txt" "${EVIDENCE_ROOT}/catalog-after.stdout.txt" || { fail catalog-reapply-mismatch; return; }
  printf 'PASS\n' >"${EVIDENCE_ROOT}/catalog-reapply-compare.txt"

  git -C "${SOURCE_ROOT}" diff --check || { fail git-diff-check; return; }
  [[ -z "$(git -C "${SOURCE_ROOT}" status --porcelain)" ]] || { fail dirty-postflight; return; }
}

main
