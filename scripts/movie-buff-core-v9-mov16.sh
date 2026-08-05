#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-mov16-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
EXPECTED_BRANCH="validation/movie-buff-core-v9"
RAW_COMPOSITION_SHA="7582d07b0d8d80c8e5ecea4fedb079667a488d76"
RAW_COMPOSITION_TREE="44f331ac926172d9d824c9ea40e2f83301e7a0bf"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-mov16"
WORK_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-${RUN_TOKEN}"
RAW_ROOT="${WORK_ROOT}/raw"
USERS_FILE="${WORK_ROOT}/users.json"
APP_URL="http://127.0.0.1:3001"
CLASSIFICATION="UNKNOWN"
FAILURE_STEP=""
CLEANUP="UNKNOWN"
APP_PID=""
FIXTURE_GRANT_APPLIED=0

mkdir -p "$EVIDENCE_ROOT" "$RAW_ROOT"

redact() {
  local input="$1" output="$2"
  python3 - "$input" "$output" <<'PY'
import pathlib,re,sys
src=pathlib.Path(sys.argv[1])
text=src.read_text(encoding="utf-8",errors="replace") if src.exists() else ""
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]'),
 (r'(?i)(password["=: ]+)[^",\s]+',r'\1[REDACTED]'),
]
for pattern,replacement in patterns:
    text=re.sub(pattern,replacement,text)
pathlib.Path(sys.argv[2]).write_text(text,encoding="utf-8")
PY
}

run_step() {
  local name="$1"; shift
  local out="$RAW_ROOT/${name}.stdout.raw"
  local err="$RAW_ROOT/${name}.stderr.raw"
  "$@" >"$out" 2>"$err"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact "$out" "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact "$err" "$EVIDENCE_ROOT/${name}.stderr.txt"
  rm -f "$out" "$err"
  return "$code"
}

query_fixture_privilege() {
  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atqc \
    "select has_table_privilege('service_role','public.match_players','INSERT');"
}

write_metadata() {
  {
    echo "lane=movie-buff-core-v9-mov16"
    echo "classification=${CLASSIFICATION}"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "remote=$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || echo UNKNOWN)"
    echo "source_branch=${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-UNKNOWN}}"
    echo "source_sha=$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=${EXPECTED_SHA}"
    echo "expected_tree=${EXPECTED_TREE}"
    echo "raw_composition_sha=${RAW_COMPOSITION_SHA}"
    echo "raw_composition_tree=${RAW_COMPOSITION_TREE}"
    echo "integration_sha=bf316a15a2120e32d8a32e479df2ae439081f9a1"
    echo "mov15_sha=dc9804cdae03d8627a89980dbcdf2292d2055372"
    echo "mov16_sha=cdbfb9ba265b3b26ea86e267b7856d6f4dda4cda"
    echo "mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
    echo "encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
    echo "lobby_auth_sha=89cb58be26ab24883e70a73ae41ceeb637e21ec7"
    echo "target_kind=ephemeral-localhost"
    echo "application_target=${APP_URL}"
    echo "supabase_target=http://127.0.0.1:55321"
    echo "fixture_privilege=temporary INSERT on public.match_players for service_role"
    echo "fixture_privilege_product_classification=NOT APPLICABLE"
    echo "cleanup=${CLEANUP}"
    echo "failure_step=${FAILURE_STEP}"
    echo "vip_authority=$([ "$CLASSIFICATION" = PASS ] && echo PASS || echo FAIL)"
    echo "vip_deadline_finalize=$([ "$CLASSIFICATION" = PASS ] && echo PASS || echo FAIL)"
    echo "hosted_state=UNKNOWN"
    echo "browser_behavior=UNKNOWN"
    echo "physical_windows_cursor_equivalence=UNKNOWN"
    echo "supabase_cli=$(supabase --version 2>/dev/null || echo UNKNOWN)"
    echo "node=$(node --version 2>/dev/null || echo UNKNOWN)"
    echo "npm=$(npm --version 2>/dev/null || echo UNKNOWN)"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
}

finish() {
  local status="$1"
  trap - EXIT
  set +e

  if [[ "$FIXTURE_GRANT_APPLIED" -eq 1 ]]; then
    psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "revoke insert on table public.match_players from service_role;" \
      >"$RAW_ROOT/fixture-revoke.stdout.raw" 2>"$RAW_ROOT/fixture-revoke.stderr.raw"
    local revoke_code=$?
    printf '%s\n' "$revoke_code" >"$EVIDENCE_ROOT/fixture-revoke.exit.txt"
    redact "$RAW_ROOT/fixture-revoke.stdout.raw" "$EVIDENCE_ROOT/fixture-revoke.stdout.txt"
    redact "$RAW_ROOT/fixture-revoke.stderr.raw" "$EVIDENCE_ROOT/fixture-revoke.stderr.txt"
    if [[ "$revoke_code" -ne 0 ]]; then
      status=1
      [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="fixture-revoke"
    else
      local after
      after="$(query_fixture_privilege 2>"$RAW_ROOT/privilege-after.stderr.raw")"
      printf '%s\n' "$after" >"$EVIDENCE_ROOT/privilege-after.txt"
      redact "$RAW_ROOT/privilege-after.stderr.raw" "$EVIDENCE_ROOT/privilege-after.stderr.txt"
      if [[ "$after" != "f" ]]; then
        status=1
        [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="fixture-privilege-not-restored"
      fi
    fi
  fi

  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1
    wait "$APP_PID" >/dev/null 2>&1
  fi

  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) \
      >"$RAW_ROOT/cleanup.stdout.raw" 2>"$RAW_ROOT/cleanup.stderr.raw"
    local cleanup_code=$?
    printf '%s\n' "$cleanup_code" >"$EVIDENCE_ROOT/cleanup.exit.txt"
    redact "$RAW_ROOT/cleanup.stdout.raw" "$EVIDENCE_ROOT/cleanup.stdout.txt"
    redact "$RAW_ROOT/cleanup.stderr.raw" "$EVIDENCE_ROOT/cleanup.stderr.txt"
    if [[ "$cleanup_code" -eq 0 ]]; then
      CLEANUP="PASS"
    else
      CLEANUP="FAIL"
      status=1
      [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="cleanup"
    fi
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

  find "$EVIDENCE_ROOT" -type f \
    \( -name '*.txt' -o -name '*.log' -o -name '*.json' -o -name '*.html' -o -name '*.error' \) \
    -print0 | while IFS= read -r -d '' file; do
      redact "$file" "$file.redacted"
      mv "$file.redacted" "$file"
    done

  if grep -RIE \
    'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_(secret|publishable)_[A-Za-z0-9_-]+|authorization:[[:space:]]*bearer[[:space:]]+[A-Za-z0-9._-]+' \
    "$EVIDENCE_ROOT" --include='*.txt' --include='*.log' --include='*.json' --include='*.html' --include='*.error' \
    >/dev/null 2>&1; then
    CLASSIFICATION="FAIL"
    FAILURE_STEP="secret-pattern-scan"
    status=1
    write_metadata
  fi

  (cd "$EVIDENCE_ROOT" && \
    find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && \
    sha256sum -c sha256.txt) || {
      CLASSIFICATION="FAIL"
      FAILURE_STEP="evidence-hash"
      status=1
      write_metadata
      (cd "$EVIDENCE_ROOT" && \
        find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt) || true
    }

  rm -rf "$WORK_ROOT"
  unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
  printf 'MOVIE_BUFF_CORE_V9_MOV16=%s\n' "$CLASSIFICATION"
  exit "$status"
}
trap 'finish $?' EXIT

fail() {
  FAILURE_STEP="$1"
  return 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing-tool-$1"
}

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-sha; return 1; }
  [[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-tree; return 1; }
  [[ -n "$SOURCE_ROOT" ]] || { fail missing-source-root; return 1; }

  for tool in git node npm docker supabase python3 psql curl jq sha256sum; do
    require "$tool" || return 1
  done

  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail wrong-remote; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail wrong-sha; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})" == "$EXPECTED_TREE" ]] || { fail wrong-tree; return 1; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "$EXPECTED_BRANCH" ]] || { fail wrong-branch; return 1; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$RAW_COMPOSITION_SHA" HEAD || { fail raw-not-ancestor; return 1; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$RAW_COMPOSITION_SHA^{tree}")" == "$RAW_COMPOSITION_TREE" ]] || { fail raw-tree-mismatch; return 1; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail dirty-preflight; return 1; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail linked-project; return 1; }
  [[ "$EVIDENCE_ROOT" != "$SOURCE_ROOT" && "$EVIDENCE_ROOT" != "$SOURCE_ROOT"/* ]] || { fail evidence-inside-repository; return 1; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail unsupported-supabase-version; return 1; }

  rm -rf "$WORK_ROOT"
  mkdir -p "$WORK_ROOT" "$RAW_ROOT" "$EVIDENCE_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"

  python3 - "$WORK_ROOT/supabase/config.toml" "movie-buff-core-v9-${RUN_TOKEN}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1])
text=p.read_text(encoding="utf-8")
project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1:
    raise SystemExit("ephemeral config rewrite failed")
p.write_text(text,encoding="utf-8")
PY
  [[ $? -eq 0 ]] || { fail ephemeral-config; return 1; }

  run_step npm-ci npm ci --ignore-scripts --no-audit --no-fund || { fail npm-ci; return 1; }
  run_step docker-info docker info || { fail docker-info; return 1; }
  (cd "$WORK_ROOT" && run_step supabase-start supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) || { fail supabase-start; return 1; }
  (cd "$WORK_ROOT" && run_step db-reset supabase db reset --local) || { fail db-reset; return 1; }

  local status_env status_code
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>"$RAW_ROOT/status-env.stderr.raw")"
  status_code=$?
  printf '%s\n' "$status_code" >"$EVIDENCE_ROOT/status-env.exit.txt"
  redact "$RAW_ROOT/status-env.stderr.raw" "$EVIDENCE_ROOT/status-env.stderr.txt"
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

  local before
  before="$(query_fixture_privilege 2>"$RAW_ROOT/privilege-before.stderr.raw")"
  printf '%s\n' "$before" >"$EVIDENCE_ROOT/privilege-before.txt"
  redact "$RAW_ROOT/privilege-before.stderr.raw" "$EVIDENCE_ROOT/privilege-before.stderr.txt"
  [[ "$before" == "f" ]] || { fail unexpected-product-privilege; return 1; }

  run_step fixture-grant psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "grant insert on table public.match_players to service_role;" || { fail fixture-grant; return 1; }
  FIXTURE_GRANT_APPLIED=1

  local during
  during="$(query_fixture_privilege 2>"$RAW_ROOT/privilege-during.stderr.raw")"
  printf '%s\n' "$during" >"$EVIDENCE_ROOT/privilege-during.txt"
  redact "$RAW_ROOT/privilege-during.stderr.raw" "$EVIDENCE_ROOT/privilege-during.stderr.txt"
  [[ "$during" == "t" ]] || { fail fixture-grant-not-effective; return 1; }

  cat >"$EVIDENCE_ROOT/fixture-accommodation.txt" <<'TXT'
The checked-in product schema intentionally does not grant service_role INSERT on public.match_players.
This disposable-local laboratory temporarily grants only INSERT so the existing adversarial scripts can
create test fixtures. The grant is revoked and verified absent before cleanup. This accommodation is
NOT APPLICABLE to product privilege classification and must not be used as hosted or release evidence.
TXT

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" MOVIE_BUFF_LOCAL_RUN_ID="$RUN_TOKEN" \
    run_step local-users node "$SOURCE_ROOT/scripts/movie-buff-core-v6-local-users.mjs" || { fail local-users; return 1; }

  NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    npm run dev -- --hostname 127.0.0.1 --port 3001 \
    >"$RAW_ROOT/application.stdout.raw" 2>"$RAW_ROOT/application.stderr.raw" &
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

  local users_json
  users_json="$(cat "$USERS_FILE")"

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

  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail dirty-postflight; return 1; }
  return 0
}

main
