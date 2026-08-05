#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
TMP_SCRIPT="$(mktemp "${RUNNER_TEMP:-/tmp}/movie-buff-concurrency-v3-XXXXXX.sh")"
trap 'rm -f "$TMP_SCRIPT"' EXIT

python3 - "$SOURCE_ROOT/scripts/movie-buff-concurrency-replay-proof-v2.sh" "$TMP_SCRIPT" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
output = pathlib.Path(sys.argv[2])

replacements = [
    (
        '        node "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" \\\n',
        '        bash "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v3-wrapper.sh" \\\n',
        "MOV-16 command",
    ),
    (
        '            node "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-lab.mjs" \\\n',
        '            bash "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-convergence-v2-wrapper.sh" \\\n',
        "MOV-17 command",
    ),
]

for old, new, label in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    source = source.replace(old, new, 1)

output.write_text(source, encoding="utf-8")
PY

bash -n "$TMP_SCRIPT"
bash "$TMP_SCRIPT" "$@"
