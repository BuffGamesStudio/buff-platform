#!/usr/bin/env bash
# Exact-head synchronization marker for the combined and supplemental laboratories.
set -uo pipefail

EXPECTED_SHA="${1:-}"
COMPOSITION_SHA="${2:-}"
COMPOSITION_TREE="${3:-}"
EVIDENCE_DIR="${4:-${RUNNER_TEMP:-/tmp}/movie-buff-combined-race-matrix}"
STACK_ROOT="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-combined-race-stack}"
PROOF_ROOT="${6:-${RUNNER_TEMP:-/tmp}/movie-buff-combined-race-worktree}"
USERS_FILE="${7:-${RUNNER_TEMP:-/tmp}/movie-buff-combined-race-users.json}"
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
    APP_PID=""
  fi
  local cleanup_exit=125
  if [[ -d "$STACK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$STACK_ROOT" && supabase stop --no-backup) >"$RAW_DIR/cleanup.log" 2>&1
    cleanup_exit=$?
  fi
  record_exit cleanup "$cleanup_exit"
  [[ "$cleanup_exit" -eq 0 ]] || fail_step cleanup
  rm -f "$USERS_FILE"
  if [[ "$WORKTREE_ADDED" -eq 1 ]]; then
    git -C "$SOURCE_ROOT" worktree remove --force "$PROOF_ROOT" >"$RAW_DIR/worktree-remove.log" 2>&1
    local worktree_exit=$?
    record_exit worktree-remove "$worktree_exit"
    [[ "$worktree_exit" -eq 0 ]] || fail_step worktree-remove
    WORKTREE_ADDED=0
  fi
  unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
}
trap cleanup EXIT

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-expected-sha; return; }
  [[ "$COMPOSITION_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-sha; return; }
  [[ "$COMPOSITION_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-tree; return; }
  [[ -n "$SOURCE_ROOT" ]] || { fail_step missing-source-root; return; }
  for tool in git node npm docker supabase psql python3 curl sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { fail_step "missing-tool-$tool"; return; }
  done

  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail_step wrong-remote; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail_step wrong-sha; return; }
  [[ "${GITHUB_REF_NAME:-}" == "validation/movie-buff-combined-race-matrix-v1" ]] || { fail_step wrong-branch; return; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$COMPOSITION_SHA" HEAD || { fail_step composition-not-ancestor; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$COMPOSITION_SHA^{tree}")" == "$COMPOSITION_TREE" ]] || { fail_step wrong-composition-tree; return; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail_step dirty-preflight; return; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail_step linked-project; return; }
  [[ "$EVIDENCE_DIR" != "$SOURCE_ROOT" && "$EVIDENCE_DIR" != "$SOURCE_ROOT"/* ]] || { fail_step evidence-inside-repository; return; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail_step unsupported-supabase; return; }

  git -C "$SOURCE_ROOT" worktree add --detach "$PROOF_ROOT" "$EXPECTED_SHA" >"$RAW_DIR/worktree-add.log" 2>&1
  local code=$?
  record_exit worktree-add "$code"
  if [[ "$code" -ne 0 ]]; then fail_step worktree-add; return; fi
  WORKTREE_ADDED=1
  ln -s "$SOURCE_ROOT/node_modules" "$PROOF_ROOT/node_modules"

  python3 -B "$PROOF_ROOT/scripts/movie-buff-core-v10-patch-mov17-owner-fixtures.py" "$PROOF_ROOT" >"$RAW_DIR/fixture-patch.log" 2>&1
  code=$?
  record_exit fixture-patch "$code"
  if [[ "$code" -ne 0 ]]; then fail_step fixture-patch; return; fi

  for script in \
    movie-buff-public-matchmaking-race.mjs \
    movie-buff-three-client-phase-evidence-runner.mjs \
    movie-buff-combined-race-residual.mjs; do
    node --check "$PROOF_ROOT/scripts/$script" >"$RAW_DIR/${script%.mjs}-parse.log" 2>&1
    code=$?
    record_exit "${script%.mjs}-parse" "$code"
    if [[ "$code" -ne 0 ]]; then fail_step "${script%.mjs}-parse"; return; fi
  done

  git -C "$PROOF_ROOT" diff --check >"$RAW_DIR/derived-diff-check.log" 2>&1
  code=$?
  record_exit derived-diff-check "$code"
  if [[ "$code" -ne 0 ]]; then fail_step derived-diff-check; return; fi
  git -C "$PROOF_ROOT" diff -- \
    scripts/movie-buff-three-client-phase-proof.mjs \
    scripts/movie-buff-reconnect-race-proof.mjs \
    >"$EVIDENCE_DIR/derived-owner-fixture.patch"

  cp -a "$PROOF_ROOT/supabase" "$STACK_ROOT/supabase"
  python3 - "$STACK_ROOT/supabase/config.toml" "combined-race-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  code=$?; record_exit ephemeral-config "$code"
  if [[ "$code" -ne 0 ]]; then fail_step ephemeral-config; return; fi

  (cd "$STACK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) >"$RAW_DIR/supabase-start.log" 2>&1
  code=$?; record_exit supabase-start "$code"
  if [[ "$code" -ne 0 ]]; then fail_step supabase-start; return; fi
  (cd "$STACK_ROOT" && supabase db reset --local) >"$RAW_DIR/db-reset.log" 2>&1
  code=$?; record_exit db-reset "$code"
  if [[ "$code" -ne 0 ]]; then fail_step db-reset; return; fi

  export PGPASSWORD=postgres
  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -f "$PROOF_ROOT/scripts/movie-buff-public-matchmaking-race-helper.sql" \
    >"$RAW_DIR/matchmaking-helper.log" 2>&1
  code=$?; record_exit matchmaking-helper "$code"
  if [[ "$code" -ne 0 ]]; then fail_step matchmaking-helper; return; fi

  local status_env
  status_env="$(cd "$STACK_ROOT" && supabase status -o env 2>"$RAW_DIR/status.stderr.log")"
  code=$?; record_exit status "$code"
  if [[ "$code" -ne 0 ]]; then fail_step status; return; fi
  eval "$status_env"
  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:55321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_APP_URL="$APP_URL"
  export MOVIE_BUFF_LOCAL_DATABASE_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"
  [[ "$NEXT_PUBLIC_SUPABASE_URL" =~ ^http://(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-supabase; return; }
  [[ "$MOVIE_BUFF_LOCAL_DATABASE_URL" =~ ^postgres(ql)?://[^@]+@(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-database; return; }

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="combined-race-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
    node "$PROOF_ROOT/scripts/movie-buff-core-v6-local-users.mjs" >"$RAW_DIR/local-users.log" 2>&1
  code=$?; record_exit local-users "$code"
  if [[ "$code" -ne 0 ]]; then fail_step local-users; return; fi

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
  if [[ "$healthy" -ne 0 ]]; then fail_step application-health; return; fi

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
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/mov15-admission-races.json" \
      node scripts/movie-buff-public-matchmaking-race.mjs
  ) >"$RAW_DIR/mov15.stdout.log" 2>"$RAW_DIR/mov15.stderr.log"
  code=$?; record_exit mov15-admission "$code"
  [[ "$code" -eq 0 ]] || fail_step mov15-admission

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-three-client-phase-evidence-runner.mjs" \
    MOVIE_BUFF_PHASE_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/mov17-three-client-phase.json" \
    MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT="$EVIDENCE_DIR/mov17-reconnect-race.json" \
    MOVIE_BUFF_EVIDENCE_MANIFEST="$EVIDENCE_DIR/mov17-three-client-phase.manifest.json" \
    MOVIE_BUFF_LOCAL_DB_HOST=127.0.0.1 \
    MOVIE_BUFF_LOCAL_DB_PORT=55322 \
    MOVIE_BUFF_LOCAL_DB_NAME=postgres \
    MOVIE_BUFF_LOCAL_DB_USER=postgres \
    MOVIE_BUFF_LOCAL_DB_PASSWORD=postgres \
      node scripts/movie-buff-three-client-phase-evidence-runner.mjs
  ) >"$RAW_DIR/mov17.stdout.log" 2>"$RAW_DIR/mov17.stderr.log"
  code=$?; record_exit mov17-phase-reconnect "$code"
  [[ "$code" -eq 0 ]] || fail_step mov17-phase-reconnect

  (
    cd "$PROOF_ROOT"
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_PHASE_TEST_USERS="$core_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/residual-races.json" \
      node scripts/movie-buff-combined-race-residual.mjs
  ) >"$RAW_DIR/residual.stdout.log" 2>"$RAW_DIR/residual.stderr.log"
  code=$?; record_exit residual-races "$code"
  [[ "$code" -eq 0 ]] || fail_step residual-races
}

main
cleanup
trap - EXIT
unset PGPASSWORD

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

python3 - "$EVIDENCE_DIR" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
def load(name):
  p=root/name
  if not p.exists(): return None
  return json.loads(p.read_text())
admission=load('mov15-admission-races.json')
phase=load('mov17-three-client-phase.json')
reconnect=load('mov17-reconnect-race.json')
residual=load('residual-races.json')
residual_by={x['name']:x for x in (residual or {}).get('checks',[])}
def from_all(source, label, detail):
  return {'name':label,'classification':'PASS' if source and source.get('classification')=='PASS' else 'FAIL','evidence':detail}
checks=[
  from_all(admission,'three compatible callers converge into one room','mov15-admission-races.json'),
  from_all(admission,'no 2 + 1 room split','mov15-admission-races.json / 25 simultaneous races'),
  from_all(admission,'no partial-room start','mov15-admission-races.json'),
  from_all(admission,'fourth-player and late-third behavior','mov15-admission-races.json'),
  from_all(admission,'duplicate admission idempotency','mov15-admission-races.json'),
  from_all(admission,'lock contention','mov15-admission-races.json'),
  from_all(phase,'private VIP selection','mov17-three-client-phase.json'),
  {'name':'private VIP deadline finalization','classification':residual_by.get('private VIP deadline finalization',{}).get('classification','FAIL'),'evidence':'residual-races.json'},
  from_all(reconnect,'reconnect before expiry','mov17-reconnect-race.json'),
  from_all(reconnect,'reconnect after expiry','mov17-reconnect-race.json'),
  from_all(reconnect,'reconnect racing with expiry finalization','mov17-reconnect-race.json'),
  {'name':'duplicate expiry workers','classification':residual_by.get('duplicate reconnect-expiry workers',{}).get('classification','FAIL'),'evidence':'residual-races.json'},
  {'name':'exactly-once phase transitions','classification':'PASS' if residual_by.get('exactly-once round_intro to vip_lock transition',{}).get('classification')=='PASS' and residual_by.get('exactly-once vip_lock to board_select transition',{}).get('classification')=='PASS' else 'FAIL','evidence':'residual-races.json'},
  {'name':'Buster inactivity during VIP','classification':residual_by.get('Buster inactivity during VIP',{}).get('classification','FAIL'),'evidence':'residual-races.json'},
  {'name':'Buster activation only at the safe boundary','classification':residual_by.get('Buster activation only at board-safe boundary',{}).get('classification','FAIL'),'evidence':'residual-races.json'},
  from_all(phase,'selector timeout and rotation','mov17-three-client-phase.json'),
  {'name':'exactly-once leave penalties','classification':residual_by.get('exactly-once leave penalties',{}).get('classification','FAIL'),'evidence':'residual-races.json'},
]
summary={'schemaVersion':1,'classification':'PASS' if all(x['classification']=='PASS' for x in checks) else 'FAIL','checks':checks}
(root/'combined-matrix.json').write_text(json.dumps(summary,indent=2)+'\n')
PY

classification=PASS
[[ "$OVERALL" -eq 0 ]] || classification=FAIL
{
  echo "classification=$classification"
  echo "failure_step=$FAILURE_STEP"
  echo "repository=BuffGamesStudio/buff-platform"
  echo "source_branch=${GITHUB_REF_NAME:-unknown}"
  echo "source_sha=$EXPECTED_SHA"
  echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})"
  echo "functional_composition_sha=$COMPOSITION_SHA"
  echo "functional_composition_tree=$COMPOSITION_TREE"
  echo "mov15_sha=dc9804cdae03d8627a89980dbcdf2292d2055372"
  echo "mov16_sha=cdbfb9ba265b3b26ea86e267b7856d6f4dda4cda"
  echo "mov17_sha=c04cd53995c55608a6a9b4bfa2d7fbfe488d90c7"
  echo "encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
  echo "target=disposable-localhost"
  echo "fixture_authority=local-database-owner"
  echo "production_grants_changed=NO"
  echo "supabase_cli=$(supabase --version)"
  echo "node=$(node --version)"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$EVIDENCE_DIR/metadata.txt"

if grep -RIlE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(secret|publishable)_[A-Za-z0-9_-]+|postgres(ql)?://[^/[:space:]]+:[^@[:space:]]+@' "$EVIDENCE_DIR" >"$EVIDENCE_DIR/secret-scan.log" 2>&1; then
  echo FAIL >>"$EVIDENCE_DIR/secret-scan.log"
  OVERALL=1
else
  echo PASS >"$EVIDENCE_DIR/secret-scan.log"
fi
(cd "$EVIDENCE_DIR" && find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt) || OVERALL=1
git -C "$SOURCE_ROOT" diff --check || OVERALL=1
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || OVERALL=1
exit "$OVERALL"
