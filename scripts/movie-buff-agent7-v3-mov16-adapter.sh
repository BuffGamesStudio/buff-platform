#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_BRANCH:?}"
: "${PRODUCT_SHA:?}"
: "${PRODUCT_TREE:?}"
: "${GITHUB_SHA:?}"
: "${GITHUB_RUN_ID:?}"
: "${GITHUB_RUN_ATTEMPT:?}"

readonly GUARD="scripts/movie-buff-mov16-evidence-guard.mjs"
readonly CONTROLLER="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly PATCH="${RUNNER_TEMP}/movie-buff-mov16-composition-adapter.patch"
readonly ADAPTER_HASH="${RUNNER_TEMP}/movie-buff-mov16-composition-adapter.sha256.txt"
readonly EVIDENCE="${RUNNER_TEMP}/movie-buff-mov16-exact-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}/evidence"
readonly CURRENT_MOV17_SHA="f17234debfb8942e1998306a12dc33301c1c5440"
readonly CURRENT_ENCODING_SHA="d1f7ca58b534cbccd3071743d542f5788c0e9173"

restore() {
  set +e
  git update-index --no-assume-unchanged "${GUARD}" "${CONTROLLER}" >/dev/null 2>&1
  git checkout -- "${GUARD}" "${CONTROLLER}" next-env.d.ts >/dev/null 2>&1
}
trap restore EXIT

test "$(git branch --show-current)" = "${EXPECTED_BRANCH}"
test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"
test "$(git show -s --format=%T "${PRODUCT_SHA}")" = "${PRODUCT_TREE}"
git merge-base --is-ancestor "${PRODUCT_SHA}" "${GITHUB_SHA}"
test -z "$(git status --porcelain --untracked-files=all)"

python3 - "${GUARD}" "${CONTROLLER}" <<'PY'
from pathlib import Path
import sys

guard = Path(sys.argv[1])
controller = Path(sys.argv[2])

guard_text = guard.read_text(encoding="utf-8")
old_branch = 'const EXPECTED_BRANCH = "copilot/MOV-16-vip-authority";'
new_branch = 'const EXPECTED_BRANCH = "validation/MOV-17-encoding-twin-v2";'
if guard_text.count(old_branch) != 1:
    raise SystemExit("MOV-16 branch identity anchor mismatch")
guard.write_text(guard_text.replace(old_branch, new_branch), encoding="utf-8")

controller_text = controller.read_text(encoding="utf-8")
old_encoding = '''    if not current.startswith(b"\\xef\\xbb\\xbf") or current[3:] != repaired:
        raise SystemExit(f"encoding repair mismatch for {rel}")
'''
new_encoding = '''    if current != repaired and (
        not current.startswith(b"\\xef\\xbb\\xbf") or current[3:] != repaired
    ):
        raise SystemExit(f"encoding repair mismatch for {rel}")
'''
if controller_text.count(old_encoding) != 1:
    raise SystemExit("MOV-16 encoding composition anchor mismatch")
controller.write_text(controller_text.replace(old_encoding, new_encoding), encoding="utf-8")
PY

git diff -- "${GUARD}" "${CONTROLLER}" >"${PATCH}"
sha256sum "${GUARD}" "${CONTROLLER}" "${PATCH}" >"${ADAPTER_HASH}"
git update-index --assume-unchanged "${GUARD}" "${CONTROLLER}"
test -z "$(git status --porcelain --untracked-files=all)"

set +e
EXPECTED_BRANCH="${EXPECTED_BRANCH}" \
ENCODING_SHA="${CURRENT_ENCODING_SHA}" \
MOV17_SHA="${CURRENT_MOV17_SHA}" \
MOVIE_BUFF_EXPECTED_GIT_SHA="${GITHUB_SHA}" \
  bash scripts/movie-buff-mov16-linux-exact-validation-v2.sh
result=$?
set -e

mkdir -p "${EVIDENCE}"
cp "${PATCH}" "${EVIDENCE}/agent7-composition-adapter.patch"
cp "${ADAPTER_HASH}" "${EVIDENCE}/agent7-composition-adapter.sha256.txt"
printf '%s\n' "${result}" >"${EVIDENCE}/agent7-adapted-wrapper.exit.txt"
printf 'mov17_sha=%s\nencoding_sha=%s\n' "${CURRENT_MOV17_SHA}" "${CURRENT_ENCODING_SHA}" >"${EVIDENCE}/agent7-composition-heads.txt"

restore
trap - EXIT
git diff --check
test -z "$(git status --porcelain --untracked-files=all)"

(
  cd "${EVIDENCE}"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
)
exit "${result}"
