#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
COMPOSITION_SHA="${2:-}"
COMPOSITION_TREE="${3:-}"
EVIDENCE_DIR="${4:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-browser-evidence}"
USERS_FILE="${5:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-browser-users.json}"
PLAYWRIGHT_ROOT="${6:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-browser-playwright}"
WORK_ROOT="${7:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-browser-stack}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
APP_URL="http://127.0.0.1:3001"
APP_PID=""
OVERALL=0
FAILURE_STEP=""

mkdir -p "$EVIDENCE_DIR"
record_exit(){ printf '%s\n' "$2" >"$EVIDENCE_DIR/$1.exit"; }
fail_step(){ FAILURE_STEP="$1"; OVERALL=1; }
require_tool(){ command -v "$1" >/dev/null 2>&1 || { fail_step "missing-tool-$1"; return 1; }; }

cleanup(){
  set +e
  if [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
    APP_PID=""
  fi
  local cleanup_exit=125
  if [[ -d "$WORK_ROOT/supabase" ]] && command -v supabase >/dev/null 2>&1; then
    (cd "$WORK_ROOT" && supabase stop --no-backup) >"$EVIDENCE_DIR/cleanup.log" 2>&1
    cleanup_exit=$?
  fi
  record_exit cleanup "$cleanup_exit"
  if [[ "$cleanup_exit" -ne 0 ]]; then
    OVERALL=1
    [[ -n "$FAILURE_STEP" ]] || FAILURE_STEP="cleanup"
  fi
  rm -rf "$WORK_ROOT" "$USERS_FILE" "$PLAYWRIGHT_ROOT"
  unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY PGPASSWORD
}
trap cleanup EXIT

main(){
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-expected-sha; return; }
  [[ "$COMPOSITION_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-sha; return; }
  [[ "$COMPOSITION_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail_step invalid-composition-tree; return; }
  [[ -n "$SOURCE_ROOT" ]] || { fail_step missing-source-root; return; }
  for tool in git node npm docker supabase psql python3 curl sha256sum; do require_tool "$tool" || return; done
  [[ "$(git -C "$SOURCE_ROOT" remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail_step wrong-remote; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail_step wrong-sha; return; }
  [[ "$(git -C "$SOURCE_ROOT" rev-parse "$COMPOSITION_SHA^{tree}")" == "$COMPOSITION_TREE" ]] || { fail_step wrong-composition-tree; return; }
  git -C "$SOURCE_ROOT" merge-base --is-ancestor "$COMPOSITION_SHA" HEAD || { fail_step composition-not-ancestor; return; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "validation/movie-buff-core-v9-browser" ]] || { fail_step wrong-branch; return; }
  [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || { fail_step dirty-preflight; return; }
  [[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]] || { fail_step linked-project; return; }
  [[ "$EVIDENCE_DIR" != "$SOURCE_ROOT" && "$EVIDENCE_DIR" != "$SOURCE_ROOT"/* ]] || { fail_step evidence-inside-repository; return; }
  [[ "$(node --version)" =~ ^v22\. ]] || { fail_step unsupported-node; return; }
  [[ "$(supabase --version)" == "2.111.0" ]] || { fail_step unsupported-supabase; return; }
  [[ -f "$SOURCE_ROOT/scripts/generated/movie-buff-launch-bootstrap.sql" ]] || { fail_step missing-bootstrap; return; }

  {
    echo "laboratory=movie-buff-core-v9-seeded-three-browser"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "harness_sha=$EXPECTED_SHA"
    echo "harness_tree=$(git -C "$SOURCE_ROOT" rev-parse HEAD^{tree})"
    echo "composition_sha=$COMPOSITION_SHA"
    echo "composition_tree=$COMPOSITION_TREE"
    echo "core_sha=3207712d0fa33c93107a9264a15d6db19f534ba0"
    echo "core_tree=7ae1f9a926f0c58e539dc55582f0f079677acedb"
    echo "auth_sha=89cb58be26ab24883e70a73ae41ceeb637e21ec7"
    echo "auth_tree=1a7683103059472002be0a8845e2f86028ec5799"
    echo "mov15_sha=dc9804cdae03d8627a89980dbcdf2292d2055372"
    echo "mov16_sha=cdbfb9ba265b3b26ea86e267b7856d6f4dda4cda"
    echo "mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
    echo "encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f"
    echo "target_kind=disposable-localhost"
    echo "application_target=$APP_URL"
    echo "classification=UNKNOWN"
    echo "browser_behavior=UNKNOWN"
    echo "hosted_state=NOT APPLICABLE"
    echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_DIR/metadata.txt"
  git -C "$SOURCE_ROOT" diff --name-only "$COMPOSITION_SHA"..HEAD >"$EVIDENCE_DIR/validation-owned-paths.txt"
  node --version >"$EVIDENCE_DIR/node-version.txt"
  npm --version >"$EVIDENCE_DIR/npm-version.txt"
  supabase --version >"$EVIDENCE_DIR/supabase-version.txt"
  docker --version >"$EVIDENCE_DIR/docker-version.txt"
  psql --version >"$EVIDENCE_DIR/psql-version.txt"
  sha256sum "$SOURCE_ROOT/scripts/generated/movie-buff-launch-bootstrap.sql" >"$EVIDENCE_DIR/bootstrap-source.sha256"

  rm -rf "$WORK_ROOT"; mkdir -p "$WORK_ROOT"
  cp -a "$SOURCE_ROOT/supabase" "$WORK_ROOT/supabase"
  python3 - "$WORK_ROOT/supabase/config.toml" "core-v9-browser-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8'); project=sys.argv[2]
text,n=re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$',f'project_id = "{project}"',text,count=1)
text,m=re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)',r'\1false\2',text,count=1)
if n != 1 or m != 1: raise SystemExit('isolated local config rewrite failed')
p.write_text(text,encoding='utf-8')
PY
  local code=$?; record_exit ephemeral-config "$code"
  [[ "$code" -eq 0 ]] || { fail_step ephemeral-config; return; }

  (cd "$WORK_ROOT" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) >"$EVIDENCE_DIR/supabase-start.log" 2>&1
  code=$?; record_exit supabase-start "$code"
  [[ "$code" -eq 0 ]] || { fail_step supabase-start; return; }
  (cd "$WORK_ROOT" && supabase db reset --local) >"$EVIDENCE_DIR/database-reset.log" 2>&1
  code=$?; record_exit database-reset "$code"
  [[ "$code" -eq 0 ]] || { fail_step database-reset; return; }

  export PGPASSWORD=postgres
  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "truncate table public.clips, public.movies restart identity cascade" \
    >"$EVIDENCE_DIR/content-reset.log" 2>&1
  code=$?; record_exit content-reset "$code"
  [[ "$code" -eq 0 ]] || { fail_step content-reset; return; }

  python3 - "$SOURCE_ROOT/scripts/generated/movie-buff-launch-bootstrap.sql" "$WORK_ROOT/playable-content.sql" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
blocks=[]
for table in ('movies','clips'):
    match=re.search(rf'insert\s+into\s+public\.{table}\s*\([\s\S]*?;(?=\s*(?:insert|commit;|$))',source,re.I)
    if not match: raise SystemExit(f'missing {table} insert block')
    blocks.append(match.group(0).strip())
pathlib.Path(sys.argv[2]).write_text('begin;\n\n'+'\n\n'.join(blocks)+'\n\ncommit;\n',encoding='utf-8')
PY
  code=$?; record_exit content-extract "$code"
  [[ "$code" -eq 0 ]] || { fail_step content-extract; return; }
  sha256sum "$WORK_ROOT/playable-content.sql" >"$EVIDENCE_DIR/playable-content.sha256"
  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -f "$WORK_ROOT/playable-content.sql" >"$EVIDENCE_DIR/content-bootstrap.log" 2>&1
  code=$?; record_exit content-bootstrap "$code"
  [[ "$code" -eq 0 ]] || { fail_step content-bootstrap; return; }

  psql -h 127.0.0.1 -p 55322 -U postgres -d postgres -Atc \
    "select json_build_object('movies',(select count(*) from public.movies),'clips',(select count(*) from public.clips),'active_video_clips',(select count(*) from public.clips where is_active and clip_type='video'),'local_media_clips',(select count(*) from public.clips where is_active and clip_type='video' and media_url like '/media/movie-buff/public-domain/%'))" \
    >"$EVIDENCE_DIR/content-counts.json" 2>"$EVIDENCE_DIR/content-counts.error"
  code=$?; record_exit content-counts "$code"
  [[ "$code" -eq 0 ]] || { fail_step content-counts; return; }
  python3 - "$EVIDENCE_DIR/content-counts.json" <<'PY'
import json,pathlib,sys
v=json.loads(pathlib.Path(sys.argv[1]).read_text())
if v.get('movies',0)<1 or v.get('active_video_clips',0)<3 or v.get('local_media_clips',0)<3:
    raise SystemExit('playable local launch content remains insufficient')
PY
  code=$?; record_exit content-readiness "$code"
  [[ "$code" -eq 0 ]] || { fail_step content-readiness; return; }

  local status_env
  status_env="$(cd "$WORK_ROOT" && supabase status -o env 2>"$EVIDENCE_DIR/supabase-status.error")"
  code=$?; record_exit supabase-status "$code"
  [[ "$code" -eq 0 ]] || { fail_step supabase-status; return; }
  eval "$status_env"
  export NEXT_PUBLIC_SUPABASE_URL="${API_URL:-http://127.0.0.1:55321}"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
  export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
  export MOVIE_BUFF_APP_URL="$APP_URL"
  [[ "$NEXT_PUBLIC_SUPABASE_URL" =~ ^http://(127\.0\.0\.1|localhost|\[::1\]): ]] || { fail_step non-local-supabase; return; }

  MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
  MOVIE_BUFF_LOCAL_RUN_ID="core-v9-browser-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" \
    node "$SOURCE_ROOT/scripts/movie-buff-core-v6-local-users.mjs" \
    >"$EVIDENCE_DIR/local-users-setup.log" 2>&1
  code=$?; record_exit local-users-setup "$code"
  [[ "$code" -eq 0 ]] || { fail_step local-users-setup; return; }

  (cd "$SOURCE_ROOT" && \
    NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    npm run dev -- --hostname 127.0.0.1 --port 3001) \
    >"$EVIDENCE_DIR/application.log" 2>&1 &
  APP_PID=$!
  local app_health=1
  for _ in $(seq 1 120); do
    curl -fsS "$APP_URL/sign-in" >/dev/null 2>&1
    app_health=$?
    [[ "$app_health" -eq 0 ]] && break
    kill -0 "$APP_PID" >/dev/null 2>&1 || break
    sleep 1
  done
  record_exit application-health "$app_health"
  [[ "$app_health" -eq 0 ]] || { fail_step application-health; return; }

  mkdir -p "$PLAYWRIGHT_ROOT"
  (
    cd "$PLAYWRIGHT_ROOT"
    npm init -y >/dev/null 2>&1
    npm install --ignore-scripts --no-audit --no-fund playwright@1.54.2
    npx playwright install --with-deps chromium
  ) >"$EVIDENCE_DIR/playwright-install.log" 2>&1
  code=$?; record_exit playwright-install "$code"
  [[ "$code" -eq 0 ]] || { fail_step playwright-install; return; }

  (cd "$SOURCE_ROOT" && \
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \
    MOVIE_BUFF_COMPOSITION_SHA="$COMPOSITION_SHA" \
    MOVIE_BUFF_APP_URL="$APP_URL" \
    MOVIE_BUFF_LOCAL_USERS_OUTPUT="$USERS_FILE" \
    MOVIE_BUFF_EVIDENCE_DIR="$EVIDENCE_DIR" \
    PLAYWRIGHT_PACKAGE_ROOT="$PLAYWRIGHT_ROOT" \
      node scripts/movie-buff-core-v6-three-browser.mjs) \
    >"$EVIDENCE_DIR/three-browser.log" 2>&1
  code=$?; record_exit three-browser "$code"
  [[ "$code" -eq 0 ]] || { fail_step three-browser; return; }
}

main
cleanup
trap - EXIT
classification=PASS
[[ "$OVERALL" -eq 0 ]] || classification=FAIL
{
  echo "failure_step=$FAILURE_STEP"
  echo "classification=$classification"
  echo "browser_behavior=$classification"
  echo "exit_code=$OVERALL"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >>"$EVIDENCE_DIR/metadata.txt"

while IFS= read -r -d '' file; do
  python3 -B "$SOURCE_ROOT/scripts/movie-buff-redact-evidence.py" "$file" "$file.redacted"
  code=$?
  if [[ "$code" -eq 0 ]]; then mv "$file.redacted" "$file"; else rm -f "$file.redacted"; OVERALL=1; fi
done < <(find "$EVIDENCE_DIR" -type f \( -name '*.log' -o -name '*.txt' -o -name '*.json' -o -name '*.exit' -o -name '*.error' \) -print0)

if grep -RIlE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@|sb_secret_[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|[Bb]earer[[:space:]]+[A-Za-z0-9._-]{20,}' "$EVIDENCE_DIR" >"$EVIDENCE_DIR/secret-scan.txt"; then
  OVERALL=1
else
  printf 'tested_secret_patterns=PASS\n' >"$EVIDENCE_DIR/secret-scan.txt"
fi
(
  cd "$EVIDENCE_DIR"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
  sha256sum -c sha256.txt
)
code=$?; [[ "$code" -eq 0 ]] || OVERALL=1

git -C "$SOURCE_ROOT" diff --check || OVERALL=1
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || OVERALL=1
if [[ "$OVERALL" -eq 0 ]]; then
  printf 'MOVIE_BUFF_CORE_V9_BROWSER=PASS\n'
else
  printf 'MOVIE_BUFF_CORE_V9_BROWSER=FAIL\n'
fi
exit "$OVERALL"
