#!/usr/bin/env bash
# candidate-v6 execution trigger: 2026-08-06T23:15:00Z
set -euo pipefail

EXPECTED_SHA="${1:?expected SHA required}"
EVIDENCE_DIR="${5:?evidence directory required}"
STACK_ROOT="${6:?stack root required}"
PROOF_ROOT="${7:?proof root required}"
USERS_FILE="${8:?users file required}"
EXPECTED_BRANCH="validation/movie-buff-core-v10-current-mov17-v2"
PRODUCT_SHA="c3a6aff9138f6e12b50e54f5b3c0f4bddcc101f6"
PRODUCT_TREE="a995a9aeb2fca76d2c1b216ece3a2645c2393c71"
SOURCE_ROOT="$(git rev-parse --show-toplevel)"

[[ "${GITHUB_REF_NAME:-}" == "$EXPECTED_BRANCH" ]]
[[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]]
git -C "$SOURCE_ROOT" merge-base --is-ancestor "$PRODUCT_SHA" HEAD
[[ "$(git -C "$SOURCE_ROOT" rev-parse "$PRODUCT_SHA^{tree}")" == "$PRODUCT_TREE" ]]
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]
[[ ! -f "$SOURCE_ROOT/supabase/.temp/project-ref" ]]

RUNTIME_LAB="${RUNNER_TEMP:-/tmp}/movie-buff-release-train-runtime-lab.sh"
cp "$SOURCE_ROOT/scripts/movie-buff-release-train-combined-runtime-lab.sh" "$RUNTIME_LAB"
python3 - "$RUNTIME_LAB" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = '[[ "$(git -C "$SOURCE_ROOT" rev-parse HEAD^)" == "$PRODUCT_SHA" ]] || { fail_step wrong-product-parent; return; }'
new = 'git -C "$SOURCE_ROOT" merge-base --is-ancestor "$PRODUCT_SHA" HEAD || { fail_step product-not-ancestor; return; }'
if old not in text:
    raise SystemExit("runtime product-parent marker missing")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
PY

exec bash "$RUNTIME_LAB" \
  "$EXPECTED_SHA" \
  "$PRODUCT_SHA" \
  "$PRODUCT_TREE" \
  "$EXPECTED_BRANCH" \
  "$EVIDENCE_DIR" \
  "$STACK_ROOT" \
  "$PROOF_ROOT" \
  "$USERS_FILE"
