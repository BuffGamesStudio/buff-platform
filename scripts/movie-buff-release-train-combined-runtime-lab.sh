#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
PRODUCT_SHA="${2:-}"
PRODUCT_TREE="${3:-}"
EXPECTED_BRANCH="${4:-validation/movie-buff-release-train-runtime-20260806}"
EVIDENCE_DIR="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-release-train-runtime}"
STACK_ROOT="${6:-${RUNNER_TEMP:-/tmp}/movie-buff-release-train-stack}"
PROOF_ROOT="${7:-${RUNNER_TEMP:-/tmp}/movie-buff-release-train-worktree}"
USERS_FILE="${8:-${RUNNER_TEMP:-/tmp}/movie-buff-release-train-users.json}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RAW_DIR="${EVIDENCE_DIR}-raw"
APP_URL="http://127.0.0.1:3001"
APP_PID=""
WORKTREE_ADDED=0
OVERALL=0
FAILURE_STEP=""

mkdir -p "$EVIDENCE_DIR" "$RAW_DIR" "$STACK_ROOT"
record_exit() { printf '%s\n' "$2" >"$RAW_DIR/$1.exit"; }
fail_step() { OVERALL=1; [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="$1"; }

cleanup() {
  set +e
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
  local cleanup_exit=0
  if [[ -d "$STACK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$STACK_ROOT" && supabase stop --no-backup) >"$RAW_DIR/cleanup.log" 2>&1
    cleanup_exit=$?
  fi
  record_exit cleanup "$cleanup_exit"
  [[ "$cleanup_exit" -eq 0 ]] || fail_step cleanup
  rm -f "$USERS_FILE"
  if [[ "$WORKTREE_ADDED" -eq 1 ]]; then
    git -C "$SOURCE_ROOT" worktree remove --force "$PROOF_ROOT" >"$RAW_DIR/worktree-remove.log" 2>&1
    local code=$?
    record_exit worktree-remove "$code"
    [[ "$code" -eq 0 ]] || fail_step worktree-remove
  fi
  unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
}
trap cleanup EXIT

run_pgtest() {
  local path="$1"
  local name
  name="$(basename "$path" .sql)"
  psql "$MOVIE_BUFF_LOCAL_DATABASE_URL" -X --set=ON_ERROR_STOP=1 -f "$path" \
    >"$RAW_DIR/${name}.tap" 2>"$RAW_DIR/${name}.stderr"
  local code=$?
  if grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' "$RAW_DIR/${name}.tap"; then code=1; fi
  record_exit "$name" "$code"
  [[ "$code" -eq 0 ]] || fail_step "$name"
}

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-controller-sha; return; }
  [[ "$PRODUCT_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-product-sha; return; }
  [[ "$PRODUCT_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-product-tree; return; }
  [[ -n "$SOURCE_ROOT" ]] || { fail_step missing-source-root; return; }

  for tool in git node npm docker supabase psql python3 curl sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { fail_step "missing-tool-$tool"; return; }
  done
  case "$(git -C "$SOURCE_ROOT" remote get-url origin)" in
    https://github.com/BuffGamesStudio/buff-platform|https://github.com/BuffGamesStudio/buff-platform.git) ;;
    *) fail_step wrong-remote; return ;;
  esac
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail_step wrong-controller-sha; return; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "$EXPECTED_BRANCH" ]] || { fail_step wrong-branch; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^)" == "$PRODUCT_SHA" ]] || { fail_step wrong-product-parent; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$PRODUCT_SHA^{tree}")" == "$PRODUCT_TREE" ]] || { fail_step wrong-product-tree; return; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail_step dirty-preflight; return; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail_step linked-supabase-project; return; }
  [[ "$EVIDENCE_DIR" != "$SOURCE_ROOT" && "$EVIDENCE_DIR" != "$SOURCE_ROOT"/* ]] || { fail_step evidence-inside-repository; return; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail_step unsupported-supabase-version; return; }

  git -C "$SOURCE_ROOT" worktree add --detach "$PROOF_ROOT" "$EXPECTED_SHA" >"$RAW_DIR/worktree-add.log" 2>&1
  local code=$?; record_exit worktree-add "$code"
  [[ "$code" -eq 0 ]] || { fail_step worktree-add; return; }
  WORKTREE_ADDED=1

  (cd "$PROOF_ROOT" && npm ci --ignore-scripts --no-audit --no-fund) >"$RAW_DIR/npm-ci.log" 2>&1
  code=$?; record_exit npm-ci "$code"
  [[ "$code" -eq 0 ]] || { fail_step npm-ci; return; }

  python3 -B "$PROOF_ROOT/scripts/movie-buff-release-train-patch-owner-fixtures.py" "$PROOF_ROOT" \
    >"$RAW_DIR/fixture-derivation.log" 2>&1
  code=$?; record_exit fixture-derivation "$code"
  [[ "$code" -eq 0 ]] || { fail_step fixture-derivation; return; }

  for script in \
    movie-buff-public-matchmaking-race.mjs \
    movie-buff-vip-authority-adversarial.mjs \
    movie-buff-three-client-phase-evidence-runner.mjs \
    movie-buff-release-train-canonical-leave-race.mjs; do
    node --check "$PROOF_ROOT/scripts/$script" >"$RAW_DIR/${script%.mjs}-parse.log" 2>&1
    code=$?; record_exit "${script%.mjs}-parse" "$code"
    [[ "$code" -eq 0 ]] || { fail_step "${script%.mjs}-parse"; return; }
  done

  cp -a "$PROOF_ROOT/supabase" "$STACK_ROOT/supabase"
  python3 - "$STACK_ROOT/supabase/config.toml" "release-runtime-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding="utf-8"); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit("ephemeral config rewrite failed")
p.write_text(text,encoding="utf-8")
PY
  code=$?; record_exit ephemeral-config "$code"
  [[ "$code" -eq 0 ]] || { fail_step ephemeral-config; return; }

  (cd "$STACK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    >"$RAW_DIR/supabase-start.log" 2>&1
  code=$?; record_exit supabase-start "$code"
  [[ "$code" -eq 0 ]] || { fail_step supabase-start; return; }

  (cd "$STACK_ROOT" && supabase db reset --local) >"$RAW_DIR/db-reset.log" 2>&1
  code=$?; record_exit db-reset "$code"
  [[ "$code" -eq 0 ]] || { fail_step db-reset; return; }

  local status_env
  status_env="$(cd "$STACK_ROOT" && supabase status -o env 2>"$RAW_DIR/status.stderr")"
  code=$?; record_exit status "$code"
  [[ "$code" -eq 0 ]] || { fail_step status; return; }
  eval "$status_env"

  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_LOCAL_DATABASE_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
  export MOVIE_BUFF_APP_URL="$APP_URL"
  for value in "$NEXT_PUBLIC_SUPABASE_URL" "$MOVIE_BUFF_LOCAL_DATABASE_URL" "$MOVIE_BUFF_APP_URL"; do
    [[ "$value" =~ (127\.0\.0\.1|localhost|\[::1\]) ]] || { fail_step non-local-target; return; }
  done

  psql "$MOVIE_BUFF_LOCAL_DATABASE_URL" -X --set=ON_ERROR_STOP=1 \
    -f "$PROOF_ROOT/scripts/movie-buff-public-matchmaking-race-helper.sql" \
    >"$RAW_DIR/matchmaking-helper.log" 2>&1
  code=$?; record_exit matchmaking-helper "$code"
  [[ "$code" -eq 0 ]] || { fail_step matchmaking-helper; return; }

  for test_path in \
    "$PROOF_ROOT/supabase/tests/movie_buff_public_matchmaking_test.sql" \
    "$PROOF_ROOT/supabase/tests/movie_buff_vip_authority_test.sql" \
    "$PROOF_ROOT/supabase/tests/movie_buff_vip_deadline_finalize_test.sql" \
    "$PROOF_ROOT/supabase/tests/movie_buff_server_phase_machine_test.sql" \
    "$PROOF_ROOT/supabase/tests/movie_buff_active_leave_and_buster_boundary_test.sql"; do
    run_pgtest "$test_path"
  done
  [[ "$OVERALL" -eq 0 ]] || return

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="release-runtime-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
    node "$PROOF_ROOT/scripts/movie-buff-core-v6-local-users.mjs" >"$RAW_DIR/local-users.log" 2>&1
  code=$?; record_exit local-users "$code"
  [[ "$code" -eq 0 ]] || { fail_step local-users; return; }

  (
    cd "$PROOF_ROOT"
    NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
      npm run dev -- --hostname 127.0.0.1 --port 3001
  ) >"$RAW_DIR/application.log" 2>&1 &
  APP_PID=$!
  local healthy=1
  for _ in $(seq 1 120); do
    if curl -fsS "$APP_URL/sign-in" >/dev/null 2>&1; then healthy=0; break; fi
    kill -0 "$APP_PID" >/dev/null 2>&1 || break
    sleep 1
  done
  record_exit application-health "$healthy"
  [[ "$healthy" -eq 0 ]] || { fail_step application-health; return; }

  local core_users overflow_user
  core_users="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps(d[:3],separators=(",",":")))' "$USERS_FILE")"
  overflow_user="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps(d[3],separators=(",",":")))' "$USERS_FILE")"

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-public-matchmaking-race.mjs" \
    MOVIE_BUFF_TEST_USERS="$core_users" \
    MOVIE_BUFF_OVERFLOW_TEST_USER="$overflow_user" \
    MOVIE_BUFF_RACE_RUNS=25 \
    MOVIE_BUFF_LOCK_HOLD_MS=1400 \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/admission.json" \
      node scripts/movie-buff-public-matchmaking-race.mjs
  ) >"$RAW_DIR/admission.stdout" 2>"$RAW_DIR/admission.stderr"
  code=$?; record_exit admission "$code"; [[ "$code" -eq 0 ]] || fail_step admission

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-vip-authority-adversarial.mjs" \
    MOVIE_BUFF_VIP_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/vip.json" \
      node scripts/movie-buff-vip-authority-adversarial.mjs
  ) >"$RAW_DIR/vip.stdout" 2>"$RAW_DIR/vip.stderr"
  code=$?; record_exit vip "$code"; [[ "$code" -eq 0 ]] || fail_step vip

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-three-client-phase-evidence-runner.mjs" \
    MOVIE_BUFF_PHASE_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/phase.json" \
    MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT="$EVIDENCE_DIR/reconnect.json" \
    MOVIE_BUFF_EVIDENCE_MANIFEST="$EVIDENCE_DIR/phase.manifest.json" \
    MOVIE_BUFF_LOCAL_DATABASE_URL="$MOVIE_BUFF_LOCAL_DATABASE_URL" \
      node scripts/movie-buff-three-client-phase-evidence-runner.mjs
  ) >"$RAW_DIR/phase.stdout" 2>"$RAW_DIR/phase.stderr"
  code=$?; record_exit phase-reconnect "$code"; [[ "$code" -eq 0 ]] || fail_step phase-reconnect

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_PHASE_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/leave.json" \
    MOVIE_BUFF_LOCAL_DATABASE_URL="$MOVIE_BUFF_LOCAL_DATABASE_URL" \
      node scripts/movie-buff-release-train-canonical-leave-race.mjs
  ) >"$RAW_DIR/leave.stdout" 2>"$RAW_DIR/leave.stderr"
  code=$?; record_exit leave "$code"; [[ "$code" -eq 0 ]] || fail_step leave
}

main
cleanup
trap - EXIT

python3 - "$RAW_DIR" "$EVIDENCE_DIR" <<'PY'
import pathlib,re,sys
raw=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]'),
 (r'(?i)(password["=: ]+)[^",\s]+',r'\1[REDACTED]'),
]
for item in raw.iterdir():
 if not item.is_file(): continue
 text=item.read_text(encoding='utf-8',errors='replace')
 for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
 (out/item.name).write_text(text,encoding='utf-8')
PY

python3 - "$EVIDENCE_DIR" "$EXPECTED_SHA" "$PRODUCT_SHA" "$PRODUCT_TREE" "$FAILURE_STEP" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
controller,product,tree,failure=sys.argv[2:]
def load(name):
 p=root/name
 if not p.exists(): return None
 try: return json.loads(p.read_text())
 except Exception: return None
def passed(name):
 d=load(name)
 return bool(d and d.get("classification")=="PASS")
admission=passed("admission.json")
vip=passed("vip.json")
phase=passed("phase.json")
reconnect=passed("reconnect.json")
leave=passed("leave.json")
tests=[
 ("three compatible callers converge into one room",admission,"admission.json"),
 ("no 2 plus 1 room split",admission,"admission.json"),
 ("no partial room start",admission,"admission.json"),
 ("fourth player and late third behavior",admission,"admission.json"),
 ("duplicate admission idempotency",admission,"admission.json"),
 ("lock contention convergence",admission,"admission.json"),
 ("private VIP required-human snapshot",vip,"vip.json"),
 ("private VIP deadline finalization",vip,"vip.json"),
 ("reconnect before and after expiry",reconnect,"reconnect.json"),
 ("reconnect racing expiry finalization",reconnect,"reconnect.json"),
 ("duplicate reconnect-expiry workers",reconnect,"reconnect.json"),
 ("duplicate expiry workers",reconnect,"reconnect.json"),
 ("exactly-once phase transitions",phase,"phase.json"),
 ("Buster inactivity during VIP",reconnect and phase,"phase.json + reconnect.json"),
 ("Buster activation only at board-safe boundary",reconnect and phase,"phase.json + reconnect.json"),
 ("selector timeout and rotation",phase,"phase.json"),
 ("exactly-once leave penalties",leave,"leave.json"),
]
checks=[{"name":n,"classification":"PASS" if ok else "FAIL","source":src} for n,ok,src in tests]
summary={
 "schemaVersion":1,
 "classification":"PASS" if all(x["classification"]=="PASS" for x in checks) and not failure else "FAIL",
 "controllerSha":controller,
 "productSha":product,
 "productTree":tree,
 "target":"disposable-localhost",
 "checks":checks,
 "failureStep":failure or None,
 "renderedBrowserScope":"UNKNOWN",
}
(root/"combined-summary.json").write_text(json.dumps(summary,indent=2)+"\n")
if summary["classification"]!="PASS": raise SystemExit(1)
PY
aggregate=$?
[[ "$aggregate" -eq 0 ]] || OVERALL=1

{
  echo "controller_sha=$EXPECTED_SHA"
  echo "controller_tree=$(git -C "$SOURCE_ROOT" rev-parse "$EXPECTED_SHA^{tree}")"
  echo "product_sha=$PRODUCT_SHA"
  echo "product_tree=$PRODUCT_TREE"
  echo "branch=$EXPECTED_BRANCH"
  echo "repository=BuffGamesStudio/buff-platform"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "supabase=$(supabase --version)"
  echo "docker=$(docker --version)"
  echo "database_target=disposable-localhost"
  echo "rendered_browser_scope=UNKNOWN"
  echo "failure_step=${FAILURE_STEP:-none}"
  echo "classification=$([[ "$OVERALL" -eq 0 ]] && echo PASS || echo FAIL)"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$EVIDENCE_DIR/metadata.txt"

(
  cd "$EVIDENCE_DIR"
  find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
  sha256sum -c sha256.txt
)
hash_code=$?
[[ "$hash_code" -eq 0 ]] || OVERALL=1

git -C "$SOURCE_ROOT" diff --check >/dev/null 2>&1 || OVERALL=1
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || OVERALL=1

if [[ "$OVERALL" -eq 0 ]]; then
  echo "MOVIE_BUFF_RELEASE_TRAIN_COMBINED_RUNTIME=PASS"
  exit 0
fi
echo "MOVIE_BUFF_RELEASE_TRAIN_COMBINED_RUNTIME=FAIL"
exit 1
