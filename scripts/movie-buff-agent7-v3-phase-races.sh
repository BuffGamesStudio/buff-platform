#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_BRANCH:?}"
: "${PRODUCT_SHA:?}"
: "${PRODUCT_TREE:?}"
: "${GITHUB_SHA:?}"

readonly DERIVED="${RUNNER_TEMP}/movie-buff-agent7-v3-phase-races-derived.sh"
readonly EVIDENCE="${RUNNER_TEMP}/movie-buff-agent7-v3-phase-races"

cp scripts/movie-buff-core-v6-race-browser.sh "${DERIVED}"
python3 - "${DERIVED}" <<'PY'
from pathlib import Path
import os
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
for pattern, replacement in [
    (r'(?m)^BRANCH="[^"]+"$', f'BRANCH="{os.environ["EXPECTED_BRANCH"]}"'),
    (r'(?m)^RAW_COMPOSITION="[0-9a-f]{40}"$', f'RAW_COMPOSITION="{os.environ["PRODUCT_SHA"]}"'),
    (r'(?m)^RAW_TREE="[0-9a-f]{40}"$', f'RAW_TREE="{os.environ["PRODUCT_TREE"]}"'),
]:
    text, count = re.subn(pattern, replacement, text, count=1)
    if count != 1:
        raise SystemExit(f"identity patch failed: {pattern}")

start_marker = '''    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \\
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \\
    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-vip-authority-adversarial.mjs"'''
end_marker = '''    MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES \\
'''
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("MOV-16 race block boundaries missing")
replacement = '''    cat >"$EVIDENCE_ROOT/mov16-races-delegated.json" <<'JSON'
{"classification":"NOT APPLICABLE","reason":"current MOV-16 races execute in the independent exact MOV-16 composition job"}
JSON
    printf '0\\n' >"$EVIDENCE_ROOT/mov16-races-delegated.exit.txt"

'''
path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
PY

chmod +x "${DERIVED}"
bash -n "${DERIVED}"
mkdir -p "${EVIDENCE}"
sha256sum "${DERIVED}" >"${EVIDENCE}/derived-wrapper.sha256.txt"

set +e
"${DERIVED}" race "${GITHUB_SHA}" "$(git rev-parse HEAD^{tree})" "${EVIDENCE}"
result=$?
set -e
printf '%s\n' "${result}" >"${EVIDENCE}/agent7-phase-wrapper.exit.txt"

(
  cd "${EVIDENCE}"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
)
exit "${result}"
