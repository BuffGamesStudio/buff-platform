#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
COMPOSITION_SHA="${2:-}"
COMPOSITION_TREE="${3:-}"
MOV17_SOURCE_SHA="${4:-}"
EVIDENCE_DIR="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v10-mov17-runtime}"
STACK_ROOT="${6:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v10-mov17-stack}"
PROOF_ROOT="${7:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v10-mov17-worktree}"
USERS_FILE="${8:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v10-mov17-users.json}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
APP_URL="http://127.0.0.1:3001"
RAW_DIR="${EVIDENCE_DIR}-raw"
APP_PID=""
WORKTREE_ADDED=0
OVERALL=0
FAILURE_STEP=""

mkdir -p "$EVIDENCE_DIR" "$RAW_DIR" "$STACK_ROOT"
record_exit() { printf '%s\n' "$2" >"$RAW_DIR/$1.exit"; }
fail_step() {
  OVERALL=1
  [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="$1"
}
require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    fail_step "missing-tool-$1"
    return 1
  }
}

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
  if [[ "$cleanup_exit" -ne 0 ]]; then
    fail_step cleanup
  fi

  rm -f "$USERS_FILE"
  if [[ "$WORKTREE_ADDED" -eq 1 ]]; then
    git -C "$SOURCE_ROOT" worktree remove --force "$PROOF_ROOT" >"$RAW_DIR/worktree-remove.log" 2>&1
    local worktree_exit=$?
    record_exit worktree-remove "$worktree_exit"
    if [[ "$worktree_exit" -ne 0 ]]; then
      fail_step worktree-remove
    fi
    WORKTREE_ADDED=0
  fi
  unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
}
trap cleanup EXIT

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-expected-sha; return; }
  [[ "$COMPOSITION_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-sha; return; }
  [[ "$COMPOSITION_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-tree; return; }
  [[ "$MOV17_SOURCE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-mov17-sha; return; }
  [[ -n "$SOURCE_ROOT" ]] || { fail_step missing-source-root; return; }
  for tool in git node npm docker supabase psql python3 curl sha256sum; do
    require_tool "$tool" || return
  done

  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail_step wrong-remote; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail_step wrong-sha; return; }
  [[ "${GITHUB_REF_NAME:-}" == "validation/movie-buff-core-v10-current-mov17-v2" ]] || { fail_step wrong-branch; return; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$COMPOSITION_SHA" HEAD || { fail_step composition-not-ancestor; return; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$MOV17_SOURCE_SHA" HEAD || { fail_step mov17-not-ancestor; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$COMPOSITION_SHA^{tree}")" == "$COMPOSITION_TREE" ]] || { fail_step wrong-composition-tree; return; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail_step dirty-preflight; return; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail_step linked-project; return; }
  [[ "$EVIDENCE_DIR" != "$SOURCE_ROOT" && "$EVIDENCE_DIR" != "$SOURCE_ROOT"/* ]] || { fail_step evidence-inside-repository; return; }
  [[ "$(node --version)" =~ ^v22\. ]] || { fail_step unsupported-node; return; }
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

  node --check "$PROOF_ROOT/scripts/movie-buff-three-client-phase-proof.mjs" >"$RAW_DIR/phase-parse.log" 2>&1
  code=$?
  record_exit phase-parse "$code"
  if [[ "$code" -ne 0 ]]; then fail_step phase-parse; return; fi
  node --check "$PROOF_ROOT/scripts/movie-buff-reconnect-race-proof.mjs" >"$RAW_DIR/reconnect-parse.log" 2>&1
  code=$?
  record_exit reconnect-parse "$code"
  if [[ "$code" -ne 0 ]]; then fail_step reconnect-parse; return; fi
  git -C "$PROOF_ROOT" diff --check >"$RAW_DIR/derived-diff-check.log" 2>&1
  code=$?
  record_exit derived-diff-check "$code"
  if [[ "$code" -ne 0 ]]; then fail_step derived-diff-check; return; fi
  git -C "$PROOF_ROOT" diff -- \
    scripts/movie-buff-three-client-phase-proof.mjs \
    scripts/movie-buff-reconnect-race-proof.mjs \
    >"$EVIDENCE_DIR/derived-owner-fixture.patch"
  sha256sum \
    "$PROOF_ROOT/scripts/movie-buff-three-client-phase-proof.mjs" \
    "$PROOF_ROOT/scripts/movie-buff-reconnect-race-proof.mjs" \
    >"$EVIDENCE_DIR/derived-proof-sources.sha256"

  cp -a "$PROOF_ROOT/supabase" "$STACK_ROOT/supabase"
  python3 - "$STACK_ROOT/supabase/config.toml" "mov17-v10-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  code=$?
  record_exit ephemeral-config "$code"
  if [[ "$code" -ne 0 ]]; then fail_step ephemeral-config; return; fi

  (cd "$STACK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) >"$RAW_DIR/supabase-start.log" 2>&1
  code=$?
  record_exit supabase-start "$code"
  if [[ "$code" -ne 0 ]]; then fail_step supabase-start; return; fi
  (cd "$STACK_ROOT" && supabase db reset --local) >"$RAW_DIR/db-reset.log" 2>&1
  code=$?
  record_exit db-reset "$code"
  if [[ "$code" -ne 0 ]]; then fail_step db-reset; return; fi

  export PGPASSWORD=postgres
  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 -At <<'SQL' >"$RAW_DIR/digest-schema-probe.log" 2>&1
DO $$
DECLARE
  definition text;
BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'extensions.digest(bytea,text) unavailable';
  END IF;
  SELECT pg_get_functiondef('public.select_movie_buff_match_tile(uuid,uuid,bigint,text)'::regprocedure)
    INTO definition;
  IF position('extensions.digest' IN definition) = 0 THEN
    RAISE EXCEPTION 'selector RPC does not use extensions.digest';
  END IF;
  IF position('public.digest' IN definition) > 0 THEN
    RAISE EXCEPTION 'selector RPC retains invalid historical digest reference';
  END IF;
END;
$$;
SELECT 'digest_schema=PASS';
SQL
  code=$?
  record_exit digest-schema-probe "$code"
  if [[ "$code" -ne 0 ]]; then fail_step digest-schema-probe; return; fi

  local status_env
  status_env="$(cd "$STACK_ROOT" && supabase status -o env 2>"$RAW_DIR/status.stderr.log")"
  code=$?
  record_exit status "$code"
  if [[ "$code" -ne 0 ]]; then fail_step status; return; fi
  eval "$status_env"
  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:55321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_APP_URL="$APP_URL"
  [[ "$NEXT_PUBLIC_SUPABASE_URL" =~ ^http://(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-supabase; return; }

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="mov17-v10-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
    node "$PROOF_ROOT/scripts/movie-buff-core-v6-local-users.mjs" >"$RAW_DIR/local-users.log" 2>&1
  code=$?
  record_exit local-users "$code"
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
    curl -fsS "$APP_URL/sign-in" >/dev/null 2>&1
    code=$?
    if [[ "$code" -eq 0 ]]; then healthy=0; break; fi
    kill -0 "$APP_PID" >/dev/null 2>&1 || break
    sleep 1
  done
  record_exit application-health "$healthy"
  if [[ "$healthy" -ne 0 ]]; then fail_step application-health; return; fi

  local core_users
  core_users="$(python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))[:3],separators=(",",":")))' "$USERS_FILE")"
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
  code=$?
  record_exit mov17-runtime "$code"
  if [[ "$code" -ne 0 ]]; then fail_step mov17-runtime; return; fi
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

classification=PASS
[[ "$OVERALL" -eq 0 ]] || classification=FAIL
{
  echo "classification=$classification"
  echo "failure_step=$FAILURE_STEP"
  echo "repository=BuffGamesStudio/buff-platform"
  echo "source_branch=${GITHUB_REF_NAME:-unknown}"
  echo "source_sha=$EXPECTED_SHA"
  echo "source_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})"
  echo "raw_composition_sha=$COMPOSITION_SHA"
  echo "raw_composition_tree=$COMPOSITION_TREE"
  echo "mov17_source_sha=$MOV17_SOURCE_SHA"
  echo "target=disposable-localhost"
  echo "fixture_authority=local-database-owner"
  echo "production_grants_changed=NO"
  echo "supabase_cli=$(supabase --version)"
  echo "node=$(node --version)"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$EVIDENCE_DIR/metadata.txt"

if grep -RIlE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@|sb_secret_[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|[Bb]earer[[:space:]]+[A-Za-z0-9._-]{20,}' "$EVIDENCE_DIR" >"$EVIDENCE_DIR/secret-scan.txt"; then
  fail_step secret-scan
else
  printf 'tested_secret_patterns=PASS\n' >"$EVIDENCE_DIR/secret-scan.txt"
fi
(
  cd "$EVIDENCE_DIR"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
  sha256sum -c sha256.txt
)
code=$?
if [[ "$code" -ne 0 ]]; then fail_step sha256-manifest; fi

git -C "$SOURCE_ROOT" diff --check || fail_step source-diff-check
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || fail_step source-dirty-postflight

if [[ "$OVERALL" -eq 0 ]]; then
  printf 'MOVIE_BUFF_CORE_V10_MOV17_RUNTIME=PASS\n'
else
  printf 'MOVIE_BUFF_CORE_V10_MOV17_RUNTIME=FAIL\n'
fi
exit "$OVERALL"
