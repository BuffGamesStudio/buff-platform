#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-proof-v2}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-v2-${RUN_TOKEN}"
RAW_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-v2-raw-${RUN_TOKEN}"
USERS_FILE="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-v2-users-${RUN_TOKEN}.json"
PW_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-v2-playwright-${RUN_TOKEN}"
APP_PID=""
STACK_STARTED=0

MOV15="UNKNOWN"
MOV16="UNKNOWN"
MOV17="UNKNOWN"
REPLAY="UNKNOWN"
IDEMPOTENCY="UNKNOWN"
DISPOSABLE_CLEANUP="UNKNOWN"
CONTAINER_CLEANUP="UNKNOWN"
WORKTREE_CLEANUP="UNKNOWN"
FAILURE_STEP=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

record_failure() {
  [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="$1"
}

patch_config() {
  python3 - "$1" "$2" <<'PY'
import pathlib,re,sys
path=pathlib.Path(sys.argv[1]); project=sys.argv[2]
text=path.read_text(encoding='utf-8')
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
path.write_text(text,encoding='utf-8')
PY
}

load_stack_env() {
  local status_env
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>"$RAW_ROOT/supabase-status.stderr.raw")" || return 1
  eval "$status_env"
  API_URL_VALUE="${API_URL:-http://127.0.0.1:54321}"
  PUBLISHABLE_KEY_VALUE="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  SERVICE_KEY_VALUE="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
  DATABASE_URL_VALUE="${DB_URL:-}"
  [[ -n "$PUBLISHABLE_KEY_VALUE" && -n "$SERVICE_KEY_VALUE" && -n "$DATABASE_URL_VALUE" ]]
}

reset_and_seed() {
  local label="$1"
  (cd "$WORK_ROOT" && supabase db reset --local) \
    >"$RAW_ROOT/${label}-database-reset.stdout.raw" \
    2>"$RAW_ROOT/${label}-database-reset.stderr.raw" || return 1
  load_stack_env || return 1
  psql "$DATABASE_URL_VALUE" -X -v ON_ERROR_STOP=1 \
    -c "truncate table public.movie_categories, public.clips, public.movies, public.categories, public.content_types restart identity cascade" \
    >"$RAW_ROOT/${label}-content-reset.stdout.raw" \
    2>"$RAW_ROOT/${label}-content-reset.stderr.raw" || return 1
  psql "$DATABASE_URL_VALUE" -X -v ON_ERROR_STOP=1 \
    -f "$SOURCE_ROOT/scripts/generated/movie-buff-launch-bootstrap.sql" \
    >"$RAW_ROOT/${label}-content-bootstrap.stdout.raw" \
    2>"$RAW_ROOT/${label}-content-bootstrap.stderr.raw" || return 1
}

create_local_users() {
  local label="$1"
  rm -f "$USERS_FILE"
  NEXT_PUBLIC_SUPABASE_URL="$API_URL_VALUE" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY_VALUE" \
  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="${label}-${RUN_TOKEN}" \
    node "$SOURCE_ROOT/scripts/movie-buff-core-v11-local-users.mjs" \
    >"$RAW_ROOT/${label}-users.stdout.raw" \
    2>"$RAW_ROOT/${label}-users.stderr.raw"
}

redact_raw() {
  python3 - "$RAW_ROOT" "$EVIDENCE_ROOT" <<'PY'
import pathlib,re,sys
raw=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
patterns=[
 (re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),'[REDACTED_JWT]'),
 (re.compile(r'postgres(?:ql)?://[^\s"\']+',re.I),'postgresql://[REDACTED_LOCAL_DB_URL]'),
 (re.compile(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+',re.I),'[REDACTED_SUPABASE_KEY]'),
 (re.compile(r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+'),r'\1[REDACTED]'),
]
for path in sorted(raw.glob('*')):
    if not path.is_file(): continue
    text=path.read_text(encoding='utf-8',errors='replace')
    for pattern,replacement in patterns: text=pattern.sub(replacement,text)
    (out/path.name.replace('.raw','')).write_text(text,encoding='utf-8')
PY
}

write_metadata() {
  local classification="$1"
  {
    echo "repository=BuffGamesStudio/buff-platform"
    echo "candidate_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "candidate_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "composition_parent=098820f667e1965699aa1e43ea7657e5304acb09"
    echo "composition_parent_tree=08244802457adf3a960d1ab3da8d02348f82c695"
    echo "board_repair_sha=fd4c3066f8c684e6cc4f1eabff20c615cf25554d"
    echo "target=disposable-localhost"
    echo "mov15_concurrency=${MOV15}"
    echo "mov16_concurrency=${MOV16}"
    echo "mov17_concurrency=${MOV17}"
    echo "replay=${REPLAY}"
    echo "idempotency=${IDEMPOTENCY}"
    echo "disposable_cleanup=${DISPOSABLE_CLEANUP}"
    echo "container_cleanup=${CONTAINER_CLEANUP}"
    echo "worktree_cleanup=${WORKTREE_CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=${classification}"
    echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

cleanup() {
  local status="$1"
  trap - EXIT
  set +e

  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi

  if [[ "$STACK_STARTED" -eq 1 ]]; then
    (cd "$WORK_ROOT" && supabase db reset --local) \
      >"$RAW_ROOT/final-disposable-reset.stdout.raw" \
      2>"$RAW_ROOT/final-disposable-reset.stderr.raw"
    if [[ $? -eq 0 ]]; then
      DISPOSABLE_CLEANUP="PASS"
    else
      DISPOSABLE_CLEANUP="FAIL"
      status=1
      record_failure final-disposable-reset
    fi

    (cd "$WORK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/container-cleanup.stdout.raw" \
      2>"$RAW_ROOT/container-cleanup.stderr.raw"
    if [[ $? -eq 0 ]]; then
      CONTAINER_CLEANUP="PASS"
    else
      CONTAINER_CLEANUP="FAIL"
      status=1
      record_failure container-cleanup
    fi
  else
    DISPOSABLE_CLEANUP="NOT APPLICABLE"
    CONTAINER_CLEANUP="NOT APPLICABLE"
  fi

  rm -rf "$WORK_ROOT" "$USERS_FILE" "$PW_ROOT"
  if [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain 2>/dev/null)" ]]; then
    WORKTREE_CLEANUP="PASS"
  else
    WORKTREE_CLEANUP="FAIL"
    status=1
    record_failure worktree-cleanup
  fi

  redact_raw
  write_metadata "$([[ "$status" -eq 0 ]] && echo PASS || echo FAIL)"
  (
    cd "$EVIDENCE_ROOT" || exit 1
    find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS
    sha256sum -c SHA256SUMS
  ) || status=1
  exit "$status"
}
trap 'cleanup $?' EXIT

main() {
  for command_name in git docker supabase node npm python3 psql sha256sum curl; do
    command -v "$command_name" >/dev/null 2>&1 || {
      record_failure "missing-${command_name}"
      return 1
    }
  done
  [[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || {
    record_failure expected-sha
    return 1
  }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || {
    record_failure exact-sha
    return 1
  }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || {
    record_failure dirty-worktree
    return 1
  }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || {
    record_failure linked-supabase
    return 1
  }

  node --check "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race.mjs" || return 1
  node --check "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" || return 1
  node --check "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-lab.mjs" || return 1
  test -f "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race-helper.sql" || return 1

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  patch_config "$WORK_ROOT/supabase/config.toml" "movie-buff-concurrency-v2-${RUN_TOKEN}" || {
    record_failure config
    return 1
  }

  (cd "$WORK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    >"$RAW_ROOT/supabase-start.stdout.raw" \
    2>"$RAW_ROOT/supabase-start.stderr.raw" || {
      record_failure supabase-start
      return 1
    }
  STACK_STARTED=1

  # MOV-15 gets its own clean database and exact committed lock helper.
  reset_and_seed mov15 || {
    record_failure mov15-reset-seed
    return 1
  }
  psql "$DATABASE_URL_VALUE" -X -v ON_ERROR_STOP=1 \
    -f "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race-helper.sql" \
    >"$RAW_ROOT/mov15-helper.stdout.raw" \
    2>"$RAW_ROOT/mov15-helper.stderr.raw" || {
      MOV15="FAIL"
      record_failure mov15-helper
    }
  psql "$DATABASE_URL_VALUE" -X -v ON_ERROR_STOP=1 \
    -c "notify pgrst, 'reload schema';" \
    >"$RAW_ROOT/mov15-schema-reload.stdout.raw" \
    2>"$RAW_ROOT/mov15-schema-reload.stderr.raw" || true
  sleep 2

  if [[ "$MOV15" != "FAIL" ]]; then
    create_local_users mov15 || {
      MOV15="FAIL"
      record_failure mov15-users
    }
  fi

  if [[ "$MOV15" != "FAIL" ]]; then
    local mov15_users mov15_overflow
    mov15_users="$(python3 - "$USERS_FILE" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
print(json.dumps(rows[:3],separators=(',',':')))
PY
)"
    mov15_overflow="$(python3 - "$USERS_FILE" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
print(json.dumps(rows[3],separators=(',',':')))
PY
)"
    NEXT_PUBLIC_SUPABASE_URL="$API_URL_VALUE" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY_VALUE" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY_VALUE" \
    MOVIE_BUFF_TEST_USERS="$mov15_users" \
    MOVIE_BUFF_OVERFLOW_TEST_USER="$mov15_overflow" \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-public-matchmaking-race.mjs" \
    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
    MOVIE_BUFF_RACE_RUNS=10 \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov15-public-matchmaking-race.json" \
      node "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race.mjs" \
      >"$RAW_ROOT/mov15.stdout.raw" \
      2>"$RAW_ROOT/mov15.stderr.raw"
    if [[ $? -eq 0 ]]; then
      MOV15="PASS"
    else
      MOV15="FAIL"
      record_failure mov15-concurrency
    fi
  fi

  # Build once; MOV-16 and MOV-17 run on separately reset databases.
  NEXT_PUBLIC_SUPABASE_URL="$API_URL_VALUE" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY_VALUE" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY_VALUE" \
  MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
    npm run build >"$RAW_ROOT/build.stdout.raw" 2>"$RAW_ROOT/build.stderr.raw"
  if [[ $? -ne 0 ]]; then
    MOV16="NOT APPLICABLE"
    MOV17="NOT APPLICABLE"
    record_failure build
  else
    NEXT_PUBLIC_SUPABASE_URL="$API_URL_VALUE" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY_VALUE" \
    SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY_VALUE" \
    MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
      npm run start -- --hostname 127.0.0.1 --port 3001 \
      >"$RAW_ROOT/application.stdout.raw" \
      2>"$RAW_ROOT/application.stderr.raw" &
    APP_PID=$!
    local app_ready=1
    for _ in $(seq 1 90); do
      if curl --fail --silent --show-error http://127.0.0.1:3001/sign-in >/dev/null \
        2>>"$RAW_ROOT/application-health.stderr.raw"; then
        app_ready=0
        break
      fi
      sleep 1
    done

    if [[ "$app_ready" -ne 0 ]]; then
      MOV16="NOT APPLICABLE"
      MOV17="NOT APPLICABLE"
      record_failure application-health
    else
      # MOV-16 starts from a clean database so MOV-15 memberships cannot leak.
      reset_and_seed mov16 || {
        MOV16="FAIL"
        record_failure mov16-reset-seed
      }
      sleep 2
      if [[ "$MOV16" != "FAIL" ]]; then
        NEXT_PUBLIC_SUPABASE_URL="$API_URL_VALUE" \
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY_VALUE" \
        SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY_VALUE" \
        MOVIE_BUFF_LOCAL_DATABASE_URL="$DATABASE_URL_VALUE" \
        MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
        MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
        MOVIE_BUFF_LOCAL_RUN_ID="mov16-${RUN_TOKEN}" \
        MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov16-adversarial.json" \
          node "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" \
          >"$RAW_ROOT/mov16.stdout.raw" \
          2>"$RAW_ROOT/mov16.stderr.raw"
        if [[ $? -eq 0 ]]; then
          MOV16="PASS"
        else
          MOV16="FAIL"
          record_failure mov16-concurrency
        fi
      fi

      # MOV-17 also starts from a clean database and fresh four-user fixture.
      reset_and_seed mov17 || {
        MOV17="FAIL"
        record_failure mov17-reset-seed
      }
      sleep 2
      if [[ "$MOV17" != "FAIL" ]]; then
        create_local_users mov17 || {
          MOV17="FAIL"
          record_failure mov17-users
        }
      fi

      if [[ "$MOV17" != "FAIL" ]]; then
        mkdir -p "$PW_ROOT"
        (
          cd "$PW_ROOT" &&
          npm init -y >/dev/null 2>&1 &&
          npm install --ignore-scripts --no-audit --no-fund playwright@1.54.2 &&
          npx playwright install --with-deps chromium
        ) >"$RAW_ROOT/playwright-install.stdout.raw" \
          2>"$RAW_ROOT/playwright-install.stderr.raw"
        if [[ $? -ne 0 ]]; then
          MOV17="NOT APPLICABLE"
          record_failure playwright-install
        else
          MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
          MOVIE_BUFF_CORE_SHA="098820f667e1965699aa1e43ea7657e5304acb09" \
          MOVIE_BUFF_BOARD_REPAIR_SHA="fd4c3066f8c684e6cc4f1eabff20c615cf25554d" \
          MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
          MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
          MOVIE_BUFF_EVIDENCE_DIR="$EVIDENCE_ROOT" \
          PLAYWRIGHT_PACKAGE_ROOT="$PW_ROOT" \
            node "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-lab.mjs" \
            >"$RAW_ROOT/mov17.stdout.raw" \
            2>"$RAW_ROOT/mov17.stderr.raw"
          if [[ $? -eq 0 ]]; then
            MOV17="PASS"
          else
            MOV17="FAIL"
            record_failure mov17-concurrency
          fi
        fi
      fi
    fi
  fi

  python3 - "$EVIDENCE_ROOT" >"$EVIDENCE_ROOT/replay-idempotency-verification.tsv" <<'PY'
import json,pathlib,re,sys
root=pathlib.Path(sys.argv[1])
checks=[]
for path in sorted(root.glob('*.json')):
    try: obj=json.loads(path.read_text(encoding='utf-8'))
    except Exception: continue
    for check in obj.get('checks',[]):
        if check.get('classification') == 'PASS':
            checks.append((path.name,str(check.get('name','')).lower()))
replay_words=re.compile(r'(replay|duplicate|stale|reconnect|retry)')
idempotency_words=re.compile(r'(idempot|exactly.once|same.player|single.effect|converge)')
replay=[f'{name}:{label}' for name,label in checks if replay_words.search(label)]
idempotency=[f'{name}:{label}' for name,label in checks if idempotency_words.search(label)]
print('scope\tclassification\tevidence')
print('replay\t%s\t%s' % ('PASS' if replay else 'FAIL',';'.join(replay)))
print('idempotency\t%s\t%s' % ('PASS' if idempotency else 'FAIL',';'.join(idempotency)))
PY
  if grep -q $'^replay\tPASS\t' "$EVIDENCE_ROOT/replay-idempotency-verification.tsv"; then
    REPLAY="PASS"
  else
    REPLAY="FAIL"
    record_failure replay-evidence
  fi
  if grep -q $'^idempotency\tPASS\t' "$EVIDENCE_ROOT/replay-idempotency-verification.tsv"; then
    IDEMPOTENCY="PASS"
  else
    IDEMPOTENCY="FAIL"
    record_failure idempotency-evidence
  fi

  local failed=0
  for classification in "$MOV15" "$MOV16" "$MOV17" "$REPLAY" "$IDEMPOTENCY"; do
    [[ "$classification" == "PASS" ]] || failed=1
  done
  return "$failed"
}

main
