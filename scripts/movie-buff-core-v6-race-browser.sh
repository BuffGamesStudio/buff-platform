#!/usr/bin/env bash
set -uo pipefail

MODE="${1:-}"
EXPECTED_SHA="${2:-}"
EXPECTED_TREE="${3:-}"
EVIDENCE_ROOT="${4:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-${MODE}-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
BRANCH="validation/movie-buff-core-v6"
RAW_COMPOSITION="61a7ab96904323e1cb6dfae0e54e900d12a83db0"
RAW_TREE="167191fe2a143bae2f197218949fbe5b2195726a"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${MODE}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
USERS_FILE="${WORK_ROOT}/users.json"
PLAYWRIGHT_ROOT="${WORK_ROOT}/playwright"
PROJECT_ID="movie-buff-core-v6-${RUN_TOKEN}"
APP_URL="http://127.0.0.1:3001"
CLASSIFICATION="UNKNOWN"
FAILURE_STEP=""
CLEANUP="UNKNOWN"
APP_PID=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact() {
  local input="$1" output="$2"
  python3 - "$input" "$output" <<'PY'
import pathlib,re,sys
src=pathlib.Path(sys.argv[1]); text=src.read_text(encoding='utf-8',errors='replace') if src.exists() else ''
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]'),
 (r'(?i)(password["=: ]+)[^",\s]+',r'\1[REDACTED]'),
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
  {
    echo "lane=movie-buff-core-v6-${MODE}"
    echo "classification=${CLASSIFICATION}"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "remote=$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || echo UNKNOWN)"
    echo "source_branch=${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-UNKNOWN}}"
    echo "source_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=${EXPECTED_SHA}"
    echo "expected_tree=${EXPECTED_TREE}"
    echo "raw_composition_sha=${RAW_COMPOSITION}"
    echo "raw_composition_tree=${RAW_TREE}"
    echo "mov15_sha=295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d"
    echo "mov15_tree=fb92eb3331cd1aac2e918603f449aadbd177935c"
    echo "mov16_sha=8eab77a63042911417d6ef16d52ab9b308fc8f0d"
    echo "mov16_tree=a4aa7c9962389b9894c8a90afe69fdb276313953"
    echo "mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
    echo "mov17_tree=8264d2e30b0c75a8bebaa1ad938df6a635f7d991"
    echo "encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
    echo "encoding_tree=d97528616454b9e93c6be9a44705d008a901ac66"
    echo "integration_sha=bf316a15a2120e32d8a32e479df2ae439081f9a1"
    echo "target_kind=ephemeral-localhost"
    echo "application_target=${APP_URL}"
    echo "supabase_target=http://127.0.0.1:55321"
    echo "supabase_cli=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "docker=$(docker --version 2>/dev/null || echo UNKNOWN)"
    echo "node=$(node --version 2>/dev/null || echo UNKNOWN)"
    echo "npm=$(npm --version 2>/dev/null || echo UNKNOWN)"
    echo "cleanup=${CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    if [[ "$MODE" == race ]]; then
      echo "matchmaking_race=${CLASSIFICATION}"
      echo "vip_adversarial=${CLASSIFICATION}"
      echo "vip_finalization_race=${CLASSIFICATION}"
      echo "phase_and_reconnect_race=${CLASSIFICATION}"
      echo "browser_behavior=UNKNOWN"
    else
      echo "matchmaking_race=UNKNOWN"
      echo "vip_adversarial=UNKNOWN"
      echo "vip_finalization_race=UNKNOWN"
      echo "phase_and_reconnect_race=UNKNOWN"
      echo "browser_behavior=${CLASSIFICATION}"
    fi
    echo "hosted_state=UNKNOWN"
    echo "physical_windows_cursor_equivalence=UNKNOWN"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

finish() {
  local status="$1"
  trap - EXIT
  set +e
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1
    wait "$APP_PID" >/dev/null 2>&1
  fi
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
  rm -f "$USERS_FILE"
  if [[ -n "$SOURCE_ROOT" && -n "$(git -C "$SOURCE_ROOT" status --porcelain 2>/dev/null)" ]]; then
    status=1
    [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="dirty-postflight"
  fi
  if [[ "$status" -eq 0 ]]; then CLASSIFICATION="PASS"; else CLASSIFICATION="FAIL"; fi
  write_metadata
  find "$EVIDENCE_ROOT" -type f \( -name '*.txt' -o -name '*.log' -o -name '*.json' -o -name '*.html' -o -name '*.error' \) -print0 |
    while IFS= read -r -d '' file; do
      redact "$file" "$file.redacted"
      mv "$file.redacted" "$file"
    done
  if grep -RIE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(secret|publishable)_[A-Za-z0-9_-]+|authorization:[[:space:]]*bearer[[:space:]]+[A-Za-z0-9._-]+' "$EVIDENCE_ROOT" --include='*.txt' --include='*.log' --include='*.json' --include='*.html' --include='*.error' >/dev/null 2>&1; then
    CLASSIFICATION="FAIL"; FAILURE_STEP="secret-pattern-scan"; status=1; write_metadata
  fi
  (cd "$EVIDENCE_ROOT" && find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt) || {
    CLASSIFICATION="FAIL"; FAILURE_STEP="evidence-hash"; status=1; write_metadata
    (cd "$EVIDENCE_ROOT" && find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt) || true
  }
  rm -rf "$WORK_ROOT"
  unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
  printf 'MOVIE_BUFF_CORE_%s=%s\n' "$(printf '%s' "$MODE" | tr '[:lower:]' '[:upper:]')" "$CLASSIFICATION"
  exit "$status"
}
trap 'finish $?' EXIT

fail() { FAILURE_STEP="$1"; return 1; }
require() { command -v "$1" >/dev/null 2>&1 || fail "missing-tool-$1"; }

main() {
  [[ "$MODE" == race || "$MODE" == browser ]] || { fail invalid-mode; return 1; }
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-sha; return 1; }
  [[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-tree; return 1; }
  [[ -n "$SOURCE_ROOT" ]] || { fail missing-source-root; return 1; }
  for tool in git node npm docker supabase python3 psql curl jq sha256sum; do require "$tool" || return 1; done
  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail wrong-remote; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail wrong-sha; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})" == "$EXPECTED_TREE" ]] || { fail wrong-tree; return 1; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "$BRANCH" ]] || { fail wrong-branch; return 1; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$RAW_COMPOSITION" HEAD || { fail raw-not-ancestor; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$RAW_COMPOSITION^{tree}")" == "$RAW_TREE" ]] || { fail raw-tree-mismatch; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail dirty-preflight; return 1; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail linked-project; return 1; }
  [[ "$EVIDENCE_ROOT" != "$SOURCE_ROOT" && "$EVIDENCE_ROOT" != "$SOURCE_ROOT"/* ]] || { fail evidence-inside-repository; return 1; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail unsupported-supabase-version; return 1; }

  rm -rf "$WORK_ROOT"; mkdir -p "$WORK_ROOT" "$RAW_ROOT" "$EVIDENCE_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "$PROJECT_ID" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return 1; }

  run_step npm-ci npm ci --ignore-scripts --no-audit --no-fund || { fail npm-ci; return 1; }
  run_step docker-info docker info || { fail docker-info; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || { fail supabase-start; return 1; }
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) || { fail db-reset; return 1; }

  local status_env status_code
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>/dev/null)"; status_code=$?
  printf '%s\n' "$status_code" >"$EVIDENCE_ROOT/status-env.exit.txt"
  [[ "$status_code" -eq 0 ]] || { fail status-env; return 1; }
  eval "$status_env"
  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:55321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_APP_URL="$APP_URL"
  export PGPASSWORD=postgres
  [[ -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" && -n "$SUPABASE_SERVICE_ROLE_KEY" ]] || { fail missing-local-keys; return 1; }
  [[ "$(node -e 'console.log(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname)')" =~ ^(127\.0\.0\.1|localhost|::1)$ ]] || { fail non-local-supabase; return 1; }
  [[ "$(node -e 'console.log(new URL(process.env.MOVIE_BUFF_APP_URL).hostname)')" =~ ^(127\.0\.0\.1|localhost|::1)$ ]] || { fail non-local-app; return 1; }

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" MOVIE_BUFF_LOCAL_RUN_ID="$RUN_TOKEN" \
    run_step local-users node "$SOURCE_ROOT/scripts/movie-buff-core-v6-local-users.mjs" || { fail local-users; return 1; }

  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    npm run dev -- --hostname 127.0.0.1 --port 3001 >"$RAW_ROOT/application.stdout.raw" 2>"$RAW_ROOT/application.stderr.raw" &
  APP_PID=$!
  local healthy=0
  for _ in $(seq 1 120); do
    if curl -fsS "$APP_URL/sign-in" >/dev/null 2>&1; then healthy=1; break; fi
    if ! kill -0 "$APP_PID" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  redact "$RAW_ROOT/application.stdout.raw" "$EVIDENCE_ROOT/application.stdout.txt"
  redact "$RAW_ROOT/application.stderr.raw" "$EVIDENCE_ROOT/application.stderr.txt"
  [[ "$healthy" -eq 1 ]] || { fail application-health; return 1; }
  printf '0\n' >"$EVIDENCE_ROOT/application-health.exit.txt"

  local users_json core_users overflow_user
  users_json="$(cat "$USERS_FILE")"
  core_users="$(jq -c '.[0:3]' "$USERS_FILE")"
  overflow_user="$(jq -c '.[3]' "$USERS_FILE")"

  if [[ "$MODE" == race ]]; then
    run_step matchmaking-helper psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race-helper.sql" || { fail matchmaking-helper; return 1; }

    MOVIE_BUFF_ALLOW_LOCAL_DESTRUCTIVE_TESTS=YES_I_UNDERSTAND_LOCAL_ONLY \
    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_EXACT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-public-matchmaking-evidence-runner.mjs" \
    MOVIE_BUFF_TEST_USERS="$core_users" \
    MOVIE_BUFF_OVERFLOW_TEST_USER="$overflow_user" \
    MOVIE_BUFF_RACE_RUNS=10 \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov15-public-matchmaking.json" \
    MOVIE_BUFF_EVIDENCE_MANIFEST="$EVIDENCE_ROOT/mov15-public-matchmaking.manifest.json" \
      run_step mov15-race node "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-evidence-runner.mjs" || { fail mov15-race; return 1; }

    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-vip-authority-adversarial.mjs" \
    MOVIE_BUFF_VIP_TEST_USERS="$users_json" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov16-vip-authority.json" \
      run_step mov16-vip-authority node "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial.mjs" || { fail mov16-vip-authority; return 1; }

    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-vip-finalize-adversarial.mjs" \
    MOVIE_BUFF_VIP_TEST_USERS="$users_json" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov16-vip-finalize.json" \
      run_step mov16-vip-finalize node "$SOURCE_ROOT/scripts/movie-buff-vip-finalize-adversarial.mjs" || { fail mov16-vip-finalize; return 1; }

    MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-three-client-phase-evidence-runner.mjs" \
    MOVIE_BUFF_PHASE_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov17-three-client-phase.json" \
    MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov17-reconnect-race.json" \
    MOVIE_BUFF_EVIDENCE_MANIFEST="$EVIDENCE_ROOT/mov17-three-client-phase.manifest.json" \
      run_step mov17-phase-reconnect node "$SOURCE_ROOT/scripts/movie-buff-three-client-phase-evidence-runner.mjs" || { fail mov17-phase-reconnect; return 1; }
  else
    mkdir -p "$PLAYWRIGHT_ROOT"
    (cd "$PLAYWRIGHT_ROOT" && run_step playwright-init npm init -y) || { fail playwright-init; return 1; }
    (cd "$PLAYWRIGHT_ROOT" && run_step playwright-package npm install --ignore-scripts --no-audit --no-fund playwright@1.54.2) || { fail playwright-package; return 1; }
    (cd "$PLAYWRIGHT_ROOT" && run_step playwright-browser npx playwright install --with-deps chromium) || { fail playwright-browser; return 1; }
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_COMPOSITION_SHA="$RAW_COMPOSITION" \
    MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
    MOVIE_BUFF_EVIDENCE_DIR="$EVIDENCE_ROOT" \
    PLAYWRIGHT_PACKAGE_ROOT="$PLAYWRIGHT_ROOT" \
      run_step three-browser node "$SOURCE_ROOT/scripts/movie-buff-core-v6-three-browser.mjs" || { fail three-browser; return 1; }
  fi

  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail dirty-postflight; return 1; }
  return 0
}

main
