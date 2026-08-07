#!/usr/bin/env bash
set -uo pipefail

PRODUCT_SHA="${1:?product SHA required}"
PRODUCT_TREE="${2:?product tree required}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/mov17-race-evidence}"
CONTROLLER_ROOT="$(git rev-parse --show-toplevel)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
PRODUCT_ROOT="${RUNNER_TEMP:-/tmp}/mov17-product-${RUN_TOKEN}"
STACK_ROOT="${RUNNER_TEMP:-/tmp}/mov17-race-stack-${RUN_TOKEN}"
RAW_ROOT="${RUNNER_TEMP:-/tmp}/mov17-race-raw-${RUN_TOKEN}"
USERS_FILE="${RUNNER_TEMP:-/tmp}/mov17-race-users-${RUN_TOKEN}.json"
APP_PID=""
FAILURE_STEP=""
OVERALL="FAIL"
CLEANUP="UNKNOWN"

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact_file() {
  local source="$1" destination="$2"
  python3 - "$source" "$destination" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]); destination=pathlib.Path(sys.argv[2])
text=source.read_text(encoding='utf-8',errors='replace') if source.exists() else ''
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)(password=)[^\s]+',r'\1[REDACTED]'),
 (r'(?i)("password"\s*:\s*")[^"]+',r'\1[REDACTED]'),
]
for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
destination.write_text(text,encoding='utf-8')
PY
}

run_step() {
  local name="$1"; shift
  local raw_out="$RAW_ROOT/${name}.stdout.raw" raw_err="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$raw_out" 2>"$raw_err"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact_file "$raw_out" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact_file "$raw_err" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$raw_out" "$raw_err"
  return "$code"
}

fail() { FAILURE_STEP="$1"; return 1; }

write_metadata() {
  {
    echo "lane=MOV-17"
    echo "scope=three-client-phase-and-reconnect-races"
    echo "product_sha=${PRODUCT_SHA}"
    echo "product_tree=${PRODUCT_TREE}"
    echo "controller_sha=$(git -C "$CONTROLLER_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "controller_tree=$(git -C "$CONTROLLER_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "target=disposable-localhost"
    echo "profiles=three-disposable-local-users"
    echo "cleanup=${CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=${OVERALL}"
    echo "rendered_browser=UNKNOWN"
    echo "hosted=UNKNOWN"
    echo "production=UNTOUCHED"
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
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
  if [[ -d "$STACK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$STACK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact_file "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact_file "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    [[ $cleanup_code -eq 0 ]] || status=1
  fi
  git -C "$CONTROLLER_ROOT" worktree remove --force "$PRODUCT_ROOT" >/dev/null 2>&1 || true
  git -C "$CONTROLLER_ROOT" worktree prune >/dev/null 2>&1 || true
  rm -rf "$STACK_ROOT" "$RAW_ROOT" "$USERS_FILE"
  if [[ $status -eq 0 ]]; then CLEANUP=PASS; OVERALL=PASS; else CLEANUP=FAIL; OVERALL=FAIL; fi
  write_metadata
  hash_evidence || status=1
  exit "$status"
}
trap cleanup EXIT

main() {
  [[ "$PRODUCT_SHA" =~ ^[0-9a-f]{40}$ ]] || { fail product-sha; return 1; }
  [[ "$PRODUCT_TREE" =~ ^[0-9a-f]{40}$ ]] || { fail product-tree; return 1; }
  for command_name in git docker supabase node npm python3 sha256sum curl; do
    command -v "$command_name" >/dev/null 2>&1 || { fail "missing-${command_name}"; return 1; }
  done
  [[ "$(git -C "$CONTROLLER_ROOT" rev-parse "$PRODUCT_SHA^{tree}")" = "$PRODUCT_TREE" ]] \
    || { fail product-tree-mismatch; return 1; }
  [[ -z "$(git -C "$CONTROLLER_ROOT" status --porcelain --untracked-files=all)" ]] \
    || { fail dirty-controller-preflight; return 1; }

  rm -rf "$PRODUCT_ROOT" "$STACK_ROOT"
  git -C "$CONTROLLER_ROOT" worktree add --detach "$PRODUCT_ROOT" "$PRODUCT_SHA" \
    >"$EVIDENCE_ROOT/worktree.txt" 2>&1 \
    || { fail product-worktree; return 1; }
  [[ "$(git -C "$PRODUCT_ROOT" rev-parse HEAD)" = "$PRODUCT_SHA" ]] \
    || { fail product-head; return 1; }
  [[ "$(git -C "$PRODUCT_ROOT" rev-parse HEAD^{tree})" = "$PRODUCT_TREE" ]] \
    || { fail product-worktree-tree; return 1; }

  (cd "$PRODUCT_ROOT" && run_step npm-ci npm ci --ignore-scripts --no-audit --no-fund) \
    || { fail npm-ci; return 1; }

  mkdir -p "$STACK_ROOT"
  cp -a "$PRODUCT_ROOT/supabase" "$STACK_ROOT/supabase"
  python3 - "$STACK_ROOT/supabase/config.toml" "mov17-races-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8')
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{sys.argv[2]}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return 1; }

  run_step docker-info docker info || { fail docker-info; return 1; }
  (cd "$STACK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    || { fail supabase-start; return 1; }
  (cd "$STACK_ROOT" && run_step db-reset supabase db reset --local) \
    || { fail db-reset; return 1; }

  local status_env
  status_env="$(cd "$STACK_ROOT" && supabase status -o env 2>"$RAW_ROOT/supabase-status.stderr.raw")" \
    || { redact_file "$RAW_ROOT/supabase-status.stderr.raw" "$EVIDENCE_ROOT/supabase-status.stderr.txt"; fail supabase-status; return 1; }
  eval "$status_env"
  local api_url="${API_URL:-http://127.0.0.1:54321}"
  local publishable_key="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  local service_key="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
  [[ -n "$publishable_key" && -n "$service_key" ]] || { fail credential-shape; return 1; }

  (
    cd "$PRODUCT_ROOT" || exit 1
    NEXT_PUBLIC_SUPABASE_URL="$api_url" \
    SUPABASE_SERVICE_ROLE_KEY="$service_key" \
    MOV17_USERS_FILE="$USERS_FILE" \
    MOV17_RUN_TOKEN="$RUN_TOKEN" \
    node --input-type=module <<'NODE'
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const users=[];
for (let i=1;i<=3;i+=1){
  const email=`mov17-race-${process.env.MOV17_RUN_TOKEN}-${i}@example.invalid`;
  const password=`Mov17-${crypto.randomUUID()}-Aa1!`;
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:`MOV-17 Race Player ${i}`}});
  if(error||!data.user) throw error ?? new Error('user creation failed');
  const {error:profileError}=await admin.from('profiles').upsert({id:data.user.id,display_name:`MOV-17 Race Player ${i}`},{onConflict:'id'});
  if(profileError) throw profileError;
  users.push({email,password});
}
fs.writeFileSync(process.env.MOV17_USERS_FILE,JSON.stringify(users));
NODE
  ) >"$RAW_ROOT/create-users.stdout.raw" 2>"$RAW_ROOT/create-users.stderr.raw" \
    || { redact_file "$RAW_ROOT/create-users.stderr.raw" "$EVIDENCE_ROOT/create-users.stderr.txt"; fail create-users; return 1; }
  printf 'created_users=3\n' >"$EVIDENCE_ROOT/create-users.txt"

  local app_url="http://127.0.0.1:3001"
  (
    cd "$PRODUCT_ROOT" || exit 1
    NEXT_PUBLIC_SUPABASE_URL="$api_url" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$publishable_key" \
    SUPABASE_SERVICE_ROLE_KEY="$service_key" \
    NEXT_PUBLIC_APP_URL="$app_url" \
    MOVIE_BUFF_BUILD_SHA="$PRODUCT_SHA" \
    NEXT_PUBLIC_MOVIE_BUFF_BUILD_SHA="$PRODUCT_SHA" \
    VERCEL_GIT_COMMIT_SHA="$PRODUCT_SHA" \
    npm run build
  ) >"$RAW_ROOT/build.stdout.raw" 2>"$RAW_ROOT/build.stderr.raw"
  build_code=$?
  printf '%s\n' "$build_code" >"$EVIDENCE_ROOT/build.exit.txt"
  redact_file "$RAW_ROOT/build.stdout.raw" "$EVIDENCE_ROOT/build.stdout.txt"
  redact_file "$RAW_ROOT/build.stderr.raw" "$EVIDENCE_ROOT/build.stderr.txt"
  [[ $build_code -eq 0 ]] || { fail build; return 1; }

  (
    cd "$PRODUCT_ROOT" || exit 1
    NEXT_PUBLIC_SUPABASE_URL="$api_url" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$publishable_key" \
    SUPABASE_SERVICE_ROLE_KEY="$service_key" \
    NEXT_PUBLIC_APP_URL="$app_url" \
    MOVIE_BUFF_BUILD_SHA="$PRODUCT_SHA" \
    NEXT_PUBLIC_MOVIE_BUFF_BUILD_SHA="$PRODUCT_SHA" \
    VERCEL_GIT_COMMIT_SHA="$PRODUCT_SHA" \
    npm run start -- --hostname 127.0.0.1 --port 3001
  ) >"$RAW_ROOT/application.stdout.raw" 2>"$RAW_ROOT/application.stderr.raw" &
  APP_PID=$!
  healthy=1
  for _ in $(seq 1 120); do
    if curl --fail --silent "$app_url/sign-in" >/dev/null 2>&1; then healthy=0; break; fi
    sleep 1
  done
  printf '%s\n' "$healthy" >"$EVIDENCE_ROOT/application-health.exit.txt"
  [[ $healthy -eq 0 ]] || { fail application-health; return 1; }

  (
    cd "$PRODUCT_ROOT" || exit 1
    NEXT_PUBLIC_SUPABASE_URL="$api_url" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
    SUPABASE_SERVICE_ROLE_KEY="$service_key" \
    MOVIE_BUFF_APP_URL="$app_url" \
    MOVIE_BUFF_PHASE_TEST_USERS="$(cat "$USERS_FILE")" \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$PRODUCT_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-three-client-phase-evidence-runner.mjs" \
    MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/three-client-phase.json" \
    MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/reconnect-race.json" \
    MOVIE_BUFF_EVIDENCE_MANIFEST="$EVIDENCE_ROOT/race-manifest.json" \
    node scripts/movie-buff-three-client-phase-evidence-runner.mjs
  ) >"$RAW_ROOT/race-runner.stdout.raw" 2>"$RAW_ROOT/race-runner.stderr.raw"
  race_code=$?
  printf '%s\n' "$race_code" >"$EVIDENCE_ROOT/race-runner.exit.txt"
  redact_file "$RAW_ROOT/race-runner.stdout.raw" "$EVIDENCE_ROOT/race-runner.stdout.txt"
  redact_file "$RAW_ROOT/race-runner.stderr.raw" "$EVIDENCE_ROOT/race-runner.stderr.txt"
  [[ $race_code -eq 0 ]] || { fail race-runner; return 1; }

  python3 - "$EVIDENCE_ROOT/race-manifest.json" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); data=json.loads(p.read_text())
assert data['classification']=='PASS'
assert data['exactSha']==data['checkoutSha']
assert data['profileSnapshotCount']==3
assert data['profilesRestored'] is True
assert data['exitCode']==0
assert all(item['exitCode']==0 for item in data['childCommands'])
PY
  [[ $? -eq 0 ]] || { fail manifest-verification; return 1; }

  git -C "$PRODUCT_ROOT" checkout -- next-env.d.ts >/dev/null 2>&1 || true
  [[ -z "$(git -C "$PRODUCT_ROOT" status --porcelain --untracked-files=all)" ]] \
    || { git -C "$PRODUCT_ROOT" status --porcelain --untracked-files=all >"$EVIDENCE_ROOT/product-status.txt"; fail dirty-product-postflight; return 1; }
  [[ -z "$(git -C "$CONTROLLER_ROOT" status --porcelain --untracked-files=all)" ]] \
    || { fail dirty-controller-postflight; return 1; }
  return 0
}

main
