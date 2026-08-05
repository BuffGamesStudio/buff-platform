#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:?expected SHA is required}"
EVIDENCE_ROOT="${2:?evidence root is required}"
EXPECTED_BRANCH="${MOVIE_BUFF_COMPOSITION_BRANCH:-validation/movie-buff-mov15-mov16-mov17-pr12-exact-v1}"
INTEGRATION_BASE_SHA="bf316a15a2120e32d8a32e479df2ae439081f9a1"
RAW_COMPOSITION_SHA="b4f8e2196a8a0423e7340ac97bd5592d58a966db"
RAW_COMPOSITION_TREE="68715cde77454c8c1057f9480373208cec88ba32"
COMPONENT_MOV15_SHA="0ecf8de86d2ea1a28c1496ed044a5092a7d3ffcb"
COMPONENT_MOV15_TREE="bd9e34f67d011c5a8adfe17f7c8c75dadfbb8182"
COMPONENT_MOV16_SHA="95c292ead66fc83cf13d7154bd3cf691610f549d"
COMPONENT_MOV16_TREE="f8a8a9f316f5319566dad8c9aa01c2ce73f67e21"
COMPONENT_MOV17_SHA="6d7e9aabe5b07796a3a17fdf6c11df091dd1f978"
COMPONENT_MOV17_TREE="8264d2e30b0c75a8bebaa1ad938df6a635f7d991"
COMPONENT_ENCODING_SHA="bf5e6d6f251f6840d17eed2fc68e0d580295437f"
COMPONENT_ENCODING_TREE="d97528616454b9e93c6be9a44705d008a901ac66"

mkdir -p "$EVIDENCE_ROOT"

actual_sha="$(git rev-parse HEAD)"
actual_tree="$(git rev-parse 'HEAD^{tree}')"
actual_branch="${GITHUB_REF_NAME:-$(git branch --show-current)}"

if [[ "$EXPECTED_SHA" != "$actual_sha" ]]; then
  printf 'SHA mismatch: expected %s, observed %s\n' "$EXPECTED_SHA" "$actual_sha" >&2
  exit 1
fi
if [[ "$actual_branch" != "$EXPECTED_BRANCH" ]]; then
  printf 'Branch mismatch: expected %s, observed %s\n' "$EXPECTED_BRANCH" "$actual_branch" >&2
  exit 1
fi
if [[ "$(git remote get-url origin)" != "https://github.com/BuffGamesStudio/buff-platform" ]]; then
  printf 'Repository remote mismatch.\n' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Checkout is not clean before validation.\n' >&2
  exit 1
fi

node --check scripts/movie-buff-public-matchmaking-race.mjs
node --check scripts/movie-buff-public-matchmaking-evidence-runner.mjs
node --check scripts/movie-buff-vip-authority-adversarial.mjs
node --check scripts/movie-buff-vip-authority-personas.mjs
node --check scripts/movie-buff-vip-finalize-adversarial.mjs
node --check scripts/movie-buff-three-client-phase-proof.mjs
node --check scripts/movie-buff-three-client-phase-evidence-runner.mjs
node --check scripts/movie-buff-reconnect-race-proof.mjs
bash -n scripts/movie-buff-mov17-local-supabase-evidence.sh
python3 -B scripts/movie-buff-redact-evidence-test.py \
  > "$EVIDENCE_ROOT/redactor-test.stdout.txt" \
  2> "$EVIDENCE_ROOT/redactor-test.stderr.txt"

node --test \
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
  tests/movie-buff-migration-encoding.test.mjs \
  > "$EVIDENCE_ROOT/contracts.tap" \
  2> "$EVIDENCE_ROOT/contracts.stderr.txt"

npx --no-install tsc --noEmit \
  > "$EVIDENCE_ROOT/typescript.stdout.txt" \
  2> "$EVIDENCE_ROOT/typescript.stderr.txt"

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-build-publishable-key \
SUPABASE_SERVICE_ROLE_KEY=local-build-service-role-key \
npm run build \
  > "$EVIDENCE_ROOT/build.stdout.txt" \
  2> "$EVIDENCE_ROOT/build.stderr.txt"

MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT="$EVIDENCE_ROOT/encoding-report.json" \
node scripts/movie-buff-migration-encoding-check.mjs \
  supabase/migrations supabase/rollbacks supabase/tests \
  > "$EVIDENCE_ROOT/encoding-scan.stdout.txt" \
  2> "$EVIDENCE_ROOT/encoding-scan.stderr.txt"

git fetch --no-tags --depth=1 origin "$INTEGRATION_BASE_SHA" \
  > "$EVIDENCE_ROOT/baseline-fetch.stdout.txt" \
  2> "$EVIDENCE_ROOT/baseline-fetch.stderr.txt"

MOVIE_BUFF_BOM_ONLY_OUTPUT="$EVIDENCE_ROOT/bom-only-report.json" \
node scripts/movie-buff-migration-bom-only-check.mjs "$INTEGRATION_BASE_SHA" \
  > "$EVIDENCE_ROOT/bom-only.stdout.txt" \
  2> "$EVIDENCE_ROOT/bom-only.stderr.txt"

git diff --check
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Checkout is not clean after validation.\n' >&2
  exit 1
fi

{
  printf 'lane=MOV-15-MOV-16-MOV-17-PR12-composition\n'
  printf 'repository=BuffGamesStudio/buff-platform\n'
  printf 'remote=%s\n' "$(git remote get-url origin)"
  printf 'source_sha=%s\n' "$actual_sha"
  printf 'source_tree=%s\n' "$actual_tree"
  printf 'source_ref=%s\n' "$actual_branch"
  printf 'raw_composition_sha=%s\n' "$RAW_COMPOSITION_SHA"
  printf 'raw_composition_tree=%s\n' "$RAW_COMPOSITION_TREE"
  printf 'component_mov15_sha=%s\n' "$COMPONENT_MOV15_SHA"
  printf 'component_mov15_tree=%s\n' "$COMPONENT_MOV15_TREE"
  printf 'component_mov16_sha=%s\n' "$COMPONENT_MOV16_SHA"
  printf 'component_mov16_tree=%s\n' "$COMPONENT_MOV16_TREE"
  printf 'component_mov17_sha=%s\n' "$COMPONENT_MOV17_SHA"
  printf 'component_mov17_tree=%s\n' "$COMPONENT_MOV17_TREE"
  printf 'component_encoding_sha=%s\n' "$COMPONENT_ENCODING_SHA"
  printf 'component_encoding_tree=%s\n' "$COMPONENT_ENCODING_TREE"
  printf 'integration_base_sha=%s\n' "$INTEGRATION_BASE_SHA"
  printf 'runner_os=%s\n' "${RUNNER_OS:-Linux}"
  printf 'node_version=%s\n' "$(node --version)"
  printf 'npm_version=%s\n' "$(npm --version)"
  printf 'target_kind=repository-static-build-and-byte-validation\n'
  printf 'database_behavior=UNKNOWN\n'
  printf 'browser_behavior=UNKNOWN\n'
  printf 'hosted_state=UNKNOWN\n'
  printf 'physical_windows_cursor_equivalence=UNKNOWN\n'
  printf 'workflow_run_id=%s\n' "${GITHUB_RUN_ID:-local}"
  printf 'workflow_run_attempt=%s\n' "${GITHUB_RUN_ATTEMPT:-1}"
  printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$EVIDENCE_ROOT/metadata.txt"

(
  cd "$EVIDENCE_ROOT"
  find . -maxdepth 1 -type f ! -name sha256.txt -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    > sha256.txt
  sha256sum -c sha256.txt
)
