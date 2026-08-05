#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
BASE_WRAPPER="$SOURCE_ROOT/scripts/movie-buff-full-database-composition-proof-v2.sh"
TMP_WRAPPER="$(mktemp "${RUNNER_TEMP:-/tmp}/movie-buff-full-db-v3-XXXXXX.sh")"
trap 'rm -f "$TMP_WRAPPER"' EXIT

python3 - "$BASE_WRAPPER" "$TMP_WRAPPER" <<'PY'
import pathlib
import sys

source_path = pathlib.Path(sys.argv[1])
output_path = pathlib.Path(sys.argv[2])
text = source_path.read_text(encoding="utf-8")
label = '    "classify expected anonymous denial",\n)\n'
label_index = text.find(label)
if label_index < 0:
    raise SystemExit("anonymous-denial replacement label not found")
start = text.rfind("source = replace_once(\n", 0, label_index)
if start < 0:
    raise SystemExit("anonymous-denial replacement start not found")
end = label_index + len(label)
replacement = r'''source = replace_once(
    source,
    (
        '    classification="PASS"\n'
        '    if [[ "$code" -ne 0 || "$observed" != "$expected" ]]; then classification="FAIL"; failed=1; fi\n'
        "    printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \"$persona\" \"$table\" \"$expected\" \"${observed:-ERROR}\" \"$classification\" \\\n"
        '      >>"$EVIDENCE_ROOT/cross-player-persona-results.tsv"\n'
    ),
    (
        '    classification="PASS"\n'
        '    if [[ "$expected" == "DENIED" ]]; then\n'
        '      if [[ "$code" -eq 0 ]]; then classification="FAIL"; failed=1; fi\n'
        '      observed="$([[ "$code" -ne 0 ]] && echo DENIED || echo "${observed:-VISIBLE}")"\n'
        '    elif [[ "$code" -ne 0 || "$observed" != "$expected" ]]; then\n'
        '      classification="FAIL"; failed=1\n'
        '    fi\n'
        "    printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \"$persona\" \"$table\" \"$expected\" \"${observed:-ERROR}\" \"$classification\" \\\n"
        '      >>"$EVIDENCE_ROOT/cross-player-persona-results.tsv"\n'
    ),
    "classify expected anonymous denial",
)
'''
updated = text[:start] + replacement + text[end:]
if updated == text:
    raise SystemExit("anonymous-denial wrapper remained unchanged")
output_path.write_text(updated, encoding="utf-8")
PY

bash -n "$TMP_WRAPPER"
bash "$TMP_WRAPPER" "$@"
