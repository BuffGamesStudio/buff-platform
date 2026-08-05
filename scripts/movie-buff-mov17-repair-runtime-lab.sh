#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
COMPOSITION_SHA="${2:-}"
COMPOSITION_TREE="${3:-}"
EVIDENCE_DIR="${4:-${RUNNER_TEMP:-/tmp}/mov17-repair-runtime}"
STACK_ROOT="${5:-${RUNNER_TEMP:-/tmp}/mov17-repair-runtime-stack}"
USERS_FILE="${6:-${RUNNER_TEMP:-/tmp}/mov17-repair-runtime-users.json}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
RAW_DIR="${EVIDENCE_DIR}-raw"
OVERALL=0
FAILURE_STEP=""
STACK_STARTED=0

mkdir -p "$EVIDENCE_DIR" "$RAW_DIR" "$STACK_ROOT"
record_exit() { printf '%s\n' "$2" >"$RAW_DIR/$1.exit"; }
fail_step() { OVERALL=1; [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="$1"; }

cleanup() {
  set +e
  local code=0
  if [[ "$STACK_STARTED" -eq 1 ]]; then
    (cd "$STACK_ROOT" && supabase stop --no-backup) >"$RAW_DIR/cleanup.stdout.log" 2>"$RAW_DIR/cleanup.stderr.log"
    code=$?
  fi
  record_exit cleanup "$code"
  [[ "$code" -eq 0 ]] || fail_step cleanup
  rm -f "$USERS_FILE"
  unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY MOVIE_BUFF_LOCAL_DATABASE_URL PGPASSWORD
}
trap cleanup EXIT

main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-expected-sha; return; }
  [[ "$COMPOSITION_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-sha; return; }
  [[ "$COMPOSITION_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-tree; return; }
  [[ -n "$SOURCE_ROOT" ]] || { fail_step missing-source-root; return; }
  for tool in git node npm docker supabase psql python3 sha256sum; do
    command -v "$tool" >/dev/null 2>&1 || { fail_step "missing-tool-$tool"; return; }
  done
  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail_step wrong-remote; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail_step wrong-sha; return; }
  [[ "${GITHUB_REF_NAME:-}" == "validation/movie-buff-mov17-repair-runtime-20260805" ]] || { fail_step wrong-branch; return; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$COMPOSITION_SHA" HEAD || { fail_step composition-not-ancestor; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$COMPOSITION_SHA^{tree}")" == "$COMPOSITION_TREE" ]] || { fail_step wrong-composition-tree; return; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail_step dirty-preflight; return; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail_step linked-project; return; }
  [[ "$EVIDENCE_DIR" != "$SOURCE_ROOT" && "$EVIDENCE_DIR" != "$SOURCE_ROOT"/* ]] || { fail_step evidence-inside-repository; return; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail_step unsupported-supabase; return; }

  node --check "$SOURCE_ROOT/scripts/movie-buff-mov17-repair-runtime.mjs" >"$RAW_DIR/runtime-parse.stdout.log" 2>"$RAW_DIR/runtime-parse.stderr.log"
  local code=$?; record_exit runtime-parse "$code"
  if [[ "$code" -ne 0 ]]; then fail_step runtime-parse; return; fi

  cp -a "$SOURCE_ROOT/supabase" "$STACK_ROOT/supabase"
  python3 - "$STACK_ROOT/supabase/config.toml" "mov17-runtime-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('ephemeral config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  code=$?; record_exit ephemeral-config "$code"
  if [[ "$code" -ne 0 ]]; then fail_step ephemeral-config; return; fi

  (cd "$STACK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) >"$RAW_DIR/supabase-start.stdout.log" 2>"$RAW_DIR/supabase-start.stderr.log"
  code=$?; record_exit supabase-start "$code"
  if [[ "$code" -ne 0 ]]; then fail_step supabase-start; return; fi
  STACK_STARTED=1

  (cd "$STACK_ROOT" && supabase db reset --local) >"$RAW_DIR/db-reset.stdout.log" 2>"$RAW_DIR/db-reset.stderr.log"
  code=$?; record_exit db-reset "$code"
  if [[ "$code" -ne 0 ]]; then fail_step db-reset; return; fi

  local status_env
  status_env="$(cd "$STACK_ROOT" && supabase status -o env 2>"$RAW_DIR/status.stderr.log")"
  code=$?; record_exit status "$code"
  if [[ "$code" -ne 0 ]]; then fail_step status; return; fi
  eval "$status_env"
  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:54321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_LOCAL_DATABASE_URL="${DB_URL:-}"
  [[ "$NEXT_PUBLIC_SUPABASE_URL" =~ ^http://(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-supabase; return; }
  [[ "$MOVIE_BUFF_LOCAL_DATABASE_URL" =~ ^postgres(ql)?://[^@]+@(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-database; return; }

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="mov17-runtime-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
    node "$SOURCE_ROOT/scripts/movie-buff-core-v6-local-users.mjs" >"$RAW_DIR/local-users.stdout.log" 2>"$RAW_DIR/local-users.stderr.log"
  code=$?; record_exit local-users "$code"
  if [[ "$code" -ne 0 ]]; then fail_step local-users; return; fi

  local test_users
  test_users="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert len(d)>=4; print(json.dumps(d[:4],separators=(",",":")))' "$USERS_FILE")"
  code=$?; record_exit user-shape "$code"
  if [[ "$code" -ne 0 ]]; then fail_step user-shape; return; fi

  (
    cd "$SOURCE_ROOT"
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_TEST_USERS="$test_users" \
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_DIR/runtime.json" \
      node scripts/movie-buff-mov17-repair-runtime.mjs
  ) >"$RAW_DIR/runtime.stdout.log" 2>"$RAW_DIR/runtime.stderr.log"
  code=$?; record_exit runtime "$code"
  if [[ "$code" -ne 0 ]]; then fail_step runtime; return; fi
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
  echo "target=disposable-localhost"
  echo "production_policy_amount_configured=NO"
  echo "browser_behavior=UNKNOWN"
  echo "hosted_state=UNKNOWN"
  echo "production_state=UNTOUCHED"
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
