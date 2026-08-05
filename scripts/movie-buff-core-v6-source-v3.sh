#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-current2-source}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
BRANCH="validation/movie-buff-core-v6"
RAW_COMPOSITION="61a7ab96904323e1cb6dfae0e54e900d12a83db0"
RAW_TREE="167191fe2a143bae2f197218949fbe5b2195726a"
MOV15_SHA="295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d"
MOV15_TREE="fb92eb3331cd1aac2e918603f449aadbd177935c"
MOV16_SHA="8eab77a63042911417d6ef16d52ab9b308fc8f0d"
MOV16_TREE="a4aa7c9962389b9894c8a90afe69fdb276313953"
MOV17_SHA="6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
MOV17_TREE="8264d2e30b0c75a8bebaa1ad938df6a635f7d991"
ENCODING_SHA="bf5e6d6f251f6840d17eed2fc68e0d580295437f"
ENCODING_TREE="d97528616454b9e93c6be9a44705d008a901ac66"
INTEGRATION_SHA="bf316a15a2120e32d8a32e479df2ae439081f9a1"
CLASSIFICATION="UNKNOWN"
FAILURE_STEP=""

mkdir -p "$EVIDENCE_ROOT"

redact_file() {
  python3 - "$1" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); text=p.read_text(encoding='utf-8',errors='replace') if p.exists() else ''
patterns=[
 (r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT]'),
 (r'postgres(?:ql)?://[^\s]+','postgresql://[REDACTED_LOCAL_DB_URL]'),
 (r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+','[REDACTED_SUPABASE_KEY]'),
 (r'(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._-]+',r'\1[REDACTED]'),
]
for pattern,replacement in patterns: text=re.sub(pattern,replacement,text)
p.write_text(text,encoding='utf-8')
PY
}

run_step() {
  local name="$1"; shift
  "$@" >"$EVIDENCE_ROOT/${name}.stdout.txt" 2>"$EVIDENCE_ROOT/${name}.stderr.txt"
  local code=$?
  printf '%s\n' "$code" >"$EVIDENCE_ROOT/${name}.exit.txt"
  redact_file "$EVIDENCE_ROOT/${name}.stdout.txt"
  redact_file "$EVIDENCE_ROOT/${name}.stderr.txt"
  return "$code"
}

finish() {
  local status="$1"
  trap - EXIT
  set +e
  git diff --check >"$EVIDENCE_ROOT/git-diff-check.txt" 2>&1 || status=1
  if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then status=1; [[ -z "$FAILURE_STEP" ]] && FAILURE_STEP="dirty-postflight"; fi
  if [[ "$status" -eq 0 ]]; then CLASSIFICATION="PASS"; else CLASSIFICATION="FAIL"; fi
  {
    echo "lane=movie-buff-core-v6-current2-source"
    echo "classification=$CLASSIFICATION"
    echo "repository=BuffGamesStudio/buff-platform"
    echo "remote=$(git remote get-url origin 2>/dev/null || echo UNKNOWN)"
    echo "source_branch=${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-UNKNOWN}}"
    echo "source_sha=$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
    echo "source_tree=$(git rev-parse HEAD^{tree} 2>/dev/null || echo UNKNOWN)"
    echo "expected_sha=$EXPECTED_SHA"
    echo "expected_tree=$EXPECTED_TREE"
    echo "raw_composition_sha=$RAW_COMPOSITION"
    echo "raw_composition_tree=$RAW_TREE"
    echo "mov15_sha=$MOV15_SHA"
    echo "mov15_tree=$MOV15_TREE"
    echo "mov16_sha=$MOV16_SHA"
    echo "mov16_tree=$MOV16_TREE"
    echo "mov17_sha=$MOV17_SHA"
    echo "mov17_tree=$MOV17_TREE"
    echo "encoding_sha=$ENCODING_SHA"
    echo "encoding_tree=$ENCODING_TREE"
    echo "integration_sha=$INTEGRATION_SHA"
    echo "node=$(node --version 2>/dev/null || echo UNKNOWN)"
    echo "npm=$(npm --version 2>/dev/null || echo UNKNOWN)"
    echo "database_behavior=UNKNOWN"
    echo "race_behavior=UNKNOWN"
    echo "browser_behavior=UNKNOWN"
    echo "hosted_state=UNKNOWN"
    echo "physical_windows_cursor_equivalence=UNKNOWN"
    echo "failure_step=$FAILURE_STEP"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/metadata.txt"
  for file in "$EVIDENCE_ROOT"/*; do [[ -f "$file" && "$(basename "$file")" != sha256.txt ]] && redact_file "$file"; done
  (cd "$EVIDENCE_ROOT" && find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt && sha256sum -c sha256.txt) || status=1
  printf 'MOVIE_BUFF_CORE_SOURCE=%s\n' "$CLASSIFICATION"
  exit "$status"
}
trap 'finish $?' EXIT

fail() { FAILURE_STEP="$1"; return 1; }
main() {
  [[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-sha; return 1; }
  [[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { fail invalid-expected-tree; return 1; }
  [[ "$(git remote get-url origin)" == "https://github.com/BuffGamesStudio/buff-platform" ]] || { fail wrong-remote; return 1; }
  [[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { fail wrong-sha; return 1; }
  [[ "$(git rev-parse HEAD^{tree})" == "$EXPECTED_TREE" ]] || { fail wrong-tree; return 1; }
  [[ "${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}" == "$BRANCH" ]] || { fail wrong-branch; return 1; }
  git merge-base --is-ancestor "$RAW_COMPOSITION" HEAD || { fail raw-not-ancestor; return 1; }
  [[ "$(git rev-parse "$RAW_COMPOSITION^{tree}")" == "$RAW_TREE" ]] || { fail raw-tree-mismatch; return 1; }
  [[ -z "$(git status --porcelain)" ]] || { fail dirty-preflight; return 1; }
  [[ "$EVIDENCE_ROOT" != "$SOURCE_ROOT" && "$EVIDENCE_ROOT" != "$SOURCE_ROOT"/* ]] || { fail evidence-inside-repository; return 1; }

  git diff --name-only "$RAW_COMPOSITION"..HEAD >"$EVIDENCE_ROOT/validation-owned-paths.txt"
  while IFS= read -r file; do
    case "$file" in
      .github/workflows/movie-buff-core-v6-*.yml|scripts/movie-buff-core-v6-*) ;;
      *) echo "Unexpected validation-owned change: $file" >"$EVIDENCE_ROOT/ownership-error.txt"; fail unexpected-validation-change; return 1 ;;
    esac
  done <"$EVIDENCE_ROOT/validation-owned-paths.txt"

  export MOVIE_BUFF_EXPECTED_REPOSITORY="BuffGamesStudio/buff-platform"
  export MOVIE_BUFF_EXPECTED_SHA="$EXPECTED_SHA"
  export MOVIE_BUFF_EXPECTED_TREE="$EXPECTED_TREE"
  export MOVIE_BUFF_RAW_COMPOSITION_SHA="$RAW_COMPOSITION"
  export MOVIE_BUFF_EVIDENCE_ROOT="$EVIDENCE_ROOT"

  run_step guard-actual node scripts/movie-buff-core-v6-guard.mjs || { fail guard-actual; return 1; }
  run_step guard-negative node scripts/movie-buff-core-v6-guard.mjs --self-test || { fail guard-negative; return 1; }
  run_step npm-ci npm ci --ignore-scripts --no-audit --no-fund || { fail npm-ci; return 1; }
  run_step contracts node --test \
    tests/movie-buff-public-matchmaking-contract.test.mjs \
    tests/movie-buff-public-matchmaking-handoff.test.mjs \
    tests/movie-buff-vip-authority.test.mjs \
    tests/movie-buff-vip-finalize-contract.test.mjs \
    tests/movie-buff-vip-phase-policy.test.mjs \
    tests/movie-buff-server-phase-machine.test.mjs \
    tests/movie-buff-authoritative-phase-runtime.test.mjs \
    tests/movie-buff-buster-safe-boundary.test.mjs \
    tests/movie-buff-phase-tile-mutation-guard.test.mjs \
    tests/movie-buff-match-start-handoff.test.mjs \
    tests/movie-buff-migration-encoding.test.mjs || { fail contracts; return 1; }

  export MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT="$EVIDENCE_ROOT/encoding-report.json"
  export MOVIE_BUFF_BOM_ONLY_OUTPUT="$EVIDENCE_ROOT/bom-only-report.json"
  run_step encoding node scripts/movie-buff-migration-encoding-check.mjs supabase/migrations supabase/rollbacks supabase/tests || { fail encoding; return 1; }
  run_step bom-only node scripts/movie-buff-migration-bom-only-check.mjs "$INTEGRATION_SHA" || { fail bom-only; return 1; }
  run_step typescript npx --no-install tsc --noEmit || { fail typescript; return 1; }
  run_step build npm run build || { fail build; return 1; }
  return 0
}

main
