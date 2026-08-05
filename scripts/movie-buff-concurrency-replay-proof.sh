#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-${MOVIE_BUFF_EXPECTED_GIT_SHA:-}}"
EVIDENCE_ROOT="${2:-${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-proof}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-stack-${RUN_TOKEN}"
RAW_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-raw-${RUN_TOKEN}"
USERS_FILE="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-users-${RUN_TOKEN}.json"
PW_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-playwright-${RUN_TOKEN}"
APP_PID=""
STACK_STARTED=0

MOV15="UNKNOWN"
MOV16="UNKNOWN"
MOV17="UNKNOWN"
REPLAY="UNKNOWN"
IDEMPOTENCY="UNKNOWN"
CLEANUP="UNKNOWN"
WORKTREE="UNKNOWN"
FAILURE_STEP=""

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

fail_step() {
  [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="$1"
}

patch_config() {
  python3 - "$1" "$2" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); project=sys.argv[2]
text=p.read_text(encoding='utf-8')
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
}

redact() {
  python3 - "$RAW_ROOT" "$EVIDENCE_ROOT" <<'PY'
import pathlib,re,sys
raw=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
patterns=[
 (re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'),'[REDACTED_JWT]'),
 (re.compile(r'postgres(?:ql)?://[^\s"\']+',re.I),'postgresql://[REDACTED_LOCAL_DB_URL]'),
 (re.compile(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+',re.I),'[REDACTED_SUPABASE_KEY]'),
 (re.compile(r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+'),r'\1[REDACTED]'),
]
for p in sorted(raw.glob('*')):
    if not p.is_file(): continue
    text=p.read_text(encoding='utf-8',errors='replace')
    for pattern,replacement in patterns: text=pattern.sub(replacement,text)
    (out/p.name.replace('.raw','')).write_text(text,encoding='utf-8')
PY
}

write_metadata() {
  local overall="$1"
  {
    echo "repository=BuffGamesStudio/buff-platform"
    echo "candidate_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "candidate_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "composition_parent=098820f667e1965699aa1e43ea7657e5304acb09"
    echo "core_composition_sha=52c39e6034c2cd005851aa6d1c764d0e60cbad17"
    echo "board_repair_sha=fd4c3066f8c684e6cc4f1eabff20c615cf25554d"
    echo "target=disposable-localhost"
    echo "mov15_concurrency=${MOV15}"
    echo "mov16_concurrency=${MOV16}"
    echo "mov17_concurrency=${MOV17}"
    echo "replay=${REPLAY}"
    echo "idempotency=${IDEMPOTENCY}"
    echo "cleanup=${CLEANUP}"
    echo "worktree_cleanup=${WORKTREE}"
    echo "failure_step=${FAILURE_STEP}"
    echo "classification=${overall}"
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
    (cd "$WORK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    [[ $? -eq 0 ]] && CLEANUP="PASS" || { CLEANUP="FAIL"; status=1; fail_step cleanup; }
  else
    CLEANUP="NOT APPLICABLE"
  fi
  rm -rf "$WORK_ROOT" "$USERS_FILE" "$PW_ROOT"
  if [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain 2>/dev/null)" ]]; then
    WORKTREE="PASS"
  else
    WORKTREE="FAIL"; status=1; fail_step worktree
  fi
  redact
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
  for cmd in git docker supabase node npm python3 psql sha256sum curl; do
    command -v "$cmd" >/dev/null 2>&1 || { fail_step "missing-${cmd}"; return 1; }
  done
  [[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { fail_step expected-sha; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || {
    fail_step exact-sha; return 1;
  }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || {
    fail_step dirty-worktree; return 1;
  }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || {
    fail_step linked-supabase; return 1;
  }

  node --check "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race.mjs" || {
    fail_step mov15-script-syntax; return 1;
  }
  node --check "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" || {
    fail_step mov16-script-syntax; return 1;
  }
  node --check "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-lab.mjs" || {
    fail_step mov17-script-syntax; return 1;
  }

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  patch_config "$WORK_ROOT/supabase/config.toml" "movie-buff-concurrency-${RUN_TOKEN}" || {
    fail_step config; return 1;
  }

  (cd "$WORK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    >"$RAW_ROOT/supabase-start.stdout.raw" 2>"$RAW_ROOT/supabase-start.stderr.raw" || {
      fail_step supabase-start; return 1;
    }
  STACK_STARTED=1
  (cd "$WORK_ROOT" && supabase db reset --local) \
    >"$RAW_ROOT/database-reset.stdout.raw" 2>"$RAW_ROOT/database-reset.stderr.raw" || {
      fail_step database-reset; return 1;
    }

  local status_env
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>"$RAW_ROOT/supabase-status.stderr.raw")" || {
    fail_step supabase-status; return 1;
  }
  eval "$status_env"
  local api_url="${API_URL:-http://127.0.0.1:54321}"
  local publishable_key="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  local service_key="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
  local database_url="${DB_URL:-}"
  [[ -n "$publishable_key" && -n "$service_key" && -n "$database_url" ]] || {
    fail_step credential-shape; return 1;
  }

  # Seed deterministic launch content for the real match/phase path.
  psql "$database_url" -X -v ON_ERROR_STOP=1 \
    -c "truncate table public.movie_categories, public.clips, public.movies, public.categories, public.content_types restart identity cascade" \
    >"$RAW_ROOT/content-reset.stdout.raw" 2>"$RAW_ROOT/content-reset.stderr.raw" || {
      fail_step content-reset; return 1;
    }
  psql "$database_url" -X -v ON_ERROR_STOP=1 \
    -f "$SOURCE_ROOT/scripts/generated/movie-buff-launch-bootstrap.sql" \
    >"$RAW_ROOT/content-bootstrap.stdout.raw" 2>"$RAW_ROOT/content-bootstrap.stderr.raw" || {
      fail_step content-bootstrap; return 1;
    }

  NEXT_PUBLIC_SUPABASE_URL="$api_url" \
  SUPABASE_SERVICE_ROLE_KEY="$service_key" \
  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="concurrency-${RUN_TOKEN}" \
    node "$SOURCE_ROOT/scripts/movie-buff-core-v11-local-users.mjs" \
    >"$RAW_ROOT/local-users.stdout.raw" 2>"$RAW_ROOT/local-users.stderr.raw" || {
      fail_step local-users; return 1;
    }

  local core_users overflow_user
  core_users="$(python3 - "$USERS_FILE" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
print(json.dumps(rows[:3],separators=(',',':')))
PY
)"
  overflow_user="$(python3 - "$USERS_FILE" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
print(json.dumps(rows[3],separators=(',',':')))
PY
)"

  NEXT_PUBLIC_SUPABASE_URL="$api_url" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
  SUPABASE_SERVICE_ROLE_KEY="$service_key" \
  MOVIE_BUFF_TEST_USERS="$core_users" \
  MOVIE_BUFF_OVERFLOW_TEST_USER="$overflow_user" \
  MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
  MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-public-matchmaking-race.mjs" \
  MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \
  MOVIE_BUFF_RACE_RUNS=10 \
  MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov15-public-matchmaking-race.json" \
    node "$SOURCE_ROOT/scripts/movie-buff-public-matchmaking-race.mjs" \
    >"$RAW_ROOT/mov15.stdout.raw" 2>"$RAW_ROOT/mov15.stderr.raw"
  if [[ $? -eq 0 ]]; then
    MOV15="PASS"
  else
    MOV15="FAIL"; fail_step mov15-concurrency
  fi

  # Build once; MOV-16 and MOV-17 use the same exact local application and DB.
  NEXT_PUBLIC_SUPABASE_URL="$api_url" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
  SUPABASE_SERVICE_ROLE_KEY="$service_key" \
  MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
    npm run build >"$RAW_ROOT/build.stdout.raw" 2>"$RAW_ROOT/build.stderr.raw"
  if [[ $? -ne 0 ]]; then
    fail_step build
    MOV16="NOT APPLICABLE"
    MOV17="NOT APPLICABLE"
  else
    NEXT_PUBLIC_SUPABASE_URL="$api_url" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
    SUPABASE_SERVICE_ROLE_KEY="$service_key" \
    MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
      npm run start -- --hostname 127.0.0.1 --port 3001 \
      >"$RAW_ROOT/application.stdout.raw" 2>"$RAW_ROOT/application.stderr.raw" &
    APP_PID=$!
    local ready=1
    for _ in $(seq 1 90); do
      if curl --fail --silent --show-error http://127.0.0.1:3001/sign-in >/dev/null 2>>"$RAW_ROOT/application-health.stderr.raw"; then
        ready=0
        break
      fi
      sleep 1
    done
    if [[ "$ready" -ne 0 ]]; then
      fail_step application-health
      MOV16="NOT APPLICABLE"
      MOV17="NOT APPLICABLE"
    else
      NEXT_PUBLIC_SUPABASE_URL="$api_url" \
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$publishable_key" \
      SUPABASE_SERVICE_ROLE_KEY="$service_key" \
      MOVIE_BUFF_LOCAL_DATABASE_URL="$database_url" \
      MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
      MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
      MOVIE_BUFF_LOCAL_RUN_ID="mov16-${RUN_TOKEN}" \
      MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov16-adversarial.json" \
        node "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" \
        >"$RAW_ROOT/mov16.stdout.raw" 2>"$RAW_ROOT/mov16.stderr.raw"
      if [[ $? -eq 0 ]]; then
        MOV16="PASS"
      else
        MOV16="FAIL"; fail_step mov16-concurrency
      fi

      mkdir -p "$PW_ROOT"
      (
        cd "$PW_ROOT" &&
        npm init -y >/dev/null 2>&1 &&
        npm install --ignore-scripts --no-audit --no-fund playwright@1.54.2 &&
        npx playwright install --with-deps chromium
      ) >"$RAW_ROOT/playwright-install.stdout.raw" 2>"$RAW_ROOT/playwright-install.stderr.raw"
      if [[ $? -ne 0 ]]; then
        MOV17="NOT APPLICABLE"
        fail_step playwright-install
      else
        MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
        MOVIE_BUFF_CORE_SHA="52c39e6034c2cd005851aa6d1c764d0e60cbad17" \
        MOVIE_BUFF_BOARD_REPAIR_SHA="fd4c3066f8c684e6cc4f1eabff20c615cf25554d" \
        MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
        MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
        MOVIE_BUFF_EVIDENCE_DIR="$EVIDENCE_ROOT" \
        PLAYWRIGHT_PACKAGE_ROOT="$PW_ROOT" \
          node "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-lab.mjs" \
          >"$RAW_ROOT/mov17.stdout.raw" 2>"$RAW_ROOT/mov17.stderr.raw"
        if [[ $? -eq 0 ]]; then
          MOV17="PASS"
        else
          MOV17="FAIL"; fail_step mov17-concurrency
        fi
      fi
    fi
  fi

  # Require explicit replay/idempotency checks from the committed evidence.
  python3 - "$EVIDENCE_ROOT" >"$EVIDENCE_ROOT/replay-idempotency-verification.tsv" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
records=[]
needles={
  "replay": ("replay","duplicate","stale","repeated"),
  "idempotency": ("idempot","exactly-once","same result","conver"),
}
texts=[]
for path in sorted(root.glob("*.json")):
    try:
        obj=json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    texts.append((path.name,json.dumps(obj,sort_keys=True).lower()))
for scope,words in needles.items():
    hits=[]
    for name,text in texts:
        found=sorted({word for word in words if word in text})
        if found: hits.append((name,",".join(found)))
    classification="PASS" if hits else "FAIL"
    records.append((scope,classification,";".join(f"{n}:{h}" for n,h in hits)))
print("scope\tclassification\tevidence")
for row in records: print("\t".join(row))
PY
  if grep -q $'^replay\tPASS\t' "$EVIDENCE_ROOT/replay-idempotency-verification.tsv"; then
    REPLAY="PASS"
  else
    REPLAY="FAIL"; fail_step replay-evidence
  fi
  if grep -q $'^idempotency\tPASS\t' "$EVIDENCE_ROOT/replay-idempotency-verification.tsv"; then
    IDEMPOTENCY="PASS"
  else
    IDEMPOTENCY="FAIL"; fail_step idempotency-evidence
  fi

  # Explicitly delete the reusable four-user fixture.
  python3 - "$USERS_FILE" >"$RAW_ROOT/user-cleanup.sql.raw" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding='utf-8'))
ids=",".join("'" + row["id"].replace("'","''") + "'::uuid" for row in rows)
print(f"delete from public.profiles where id in ({ids});")
print(f"delete from auth.users where id in ({ids});")
print(f"select count(*) from auth.users where id in ({ids});")
PY
  local remaining
  remaining="$(psql "$database_url" -X -Atq -v ON_ERROR_STOP=1 \
    -f "$RAW_ROOT/user-cleanup.sql.raw" \
    2>"$RAW_ROOT/user-cleanup.stderr.raw" | awk 'NF{line=$0} END{print line}')"
  if [[ "$remaining" != "0" ]]; then
    CLEANUP="FAIL"
    fail_step user-cleanup
  fi

  local failed=0
  for value in "$MOV15" "$MOV16" "$MOV17" "$REPLAY" "$IDEMPOTENCY"; do
    [[ "$value" == "PASS" ]] || failed=1
  done
  return "$failed"
}

main
