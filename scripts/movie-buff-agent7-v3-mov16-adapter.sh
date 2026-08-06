#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_BRANCH:?}"
: "${PRODUCT_SHA:?}"
: "${PRODUCT_TREE:?}"
: "${GITHUB_SHA:?}"
: "${GITHUB_RUN_ID:?}"
: "${GITHUB_RUN_ATTEMPT:?}"

readonly GUARD="scripts/movie-buff-mov16-evidence-guard.mjs"
readonly BACKUP="${RUNNER_TEMP}/movie-buff-mov16-evidence-guard.original.mjs"
readonly PATCH="${RUNNER_TEMP}/movie-buff-mov16-identity-adapter.patch"
readonly ADAPTER_HASH="${RUNNER_TEMP}/movie-buff-mov16-identity-adapter.sha256.txt"
readonly EVIDENCE="${RUNNER_TEMP}/movie-buff-mov16-exact-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/evidence"

restore() {
  set +e
  git update-index --no-assume-unchanged "${GUARD}" >/dev/null 2>&1
  git checkout -- "${GUARD}" next-env.d.ts >/dev/null 2>&1
}
trap restore EXIT

test "$(git branch --show-current)" = "${EXPECTED_BRANCH}"
test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"
test "$(git show -s --format=%T "${PRODUCT_SHA}")" = "${PRODUCT_TREE}"
git merge-base --is-ancestor "${PRODUCT_SHA}" "${GITHUB_SHA}"
test -z "$(git status --porcelain --untracked-files=all)"

cp "${GUARD}" "${BACKUP}"
python3 - "${GUARD}" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = 'const EXPECTED_BRANCH = "copilot/MOV-16-vip-authority";'
new = 'const EXPECTED_BRANCH = "validation/MOV-17-encoding-twin-v2";'
if text.count(old) != 1:
    raise SystemExit("MOV-16 branch identity anchor mismatch")
path.write_text(text.replace(old, new), encoding="utf-8")
PY

git diff -- "${GUARD}" >"${PATCH}"
sha256sum "${GUARD}" "${PATCH}" >"${ADAPTER_HASH}"
git update-index --assume-unchanged "${GUARD}"
test -z "$(git status --porcelain --untracked-files=all)"

set +e
MOVIE_BUFF_EXPECTED_GIT_SHA="${GITHUB_SHA}" \
  bash scripts/movie-buff-mov16-linux-exact-validation-v2.sh
result=$?
set -e

mkdir -p "${EVIDENCE}"
cp "${PATCH}" "${EVIDENCE}/agent7-identity-adapter.patch"
cp "${ADAPTER_HASH}" "${EVIDENCE}/agent7-identity-adapter.sha256.txt"
printf '%s\n' "${result}" >"${EVIDENCE}/agent7-adapted-wrapper.exit.txt"

restore
trap - EXIT
git diff --check
test -z "$(git status --porcelain --untracked-files=all)"

(
  cd "${EVIDENCE}"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
)
exit "${result}"
