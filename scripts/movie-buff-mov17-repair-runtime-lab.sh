#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="db6d0a1c442cc06bd69e5aa7ae970fe8fd87bfde"
BASE_BLOB="1e1c075fdcd9c2964e7c868f92e53b2491ff9df3"
BASE_PATH="scripts/movie-buff-mov17-repair-runtime-lab.sh"
PATCHED_LAB="$(mktemp "${RUNNER_TEMP:-/tmp}/mov17-runtime-lab-v8-XXXXXX.sh")"
trap 'rm -f "$PATCHED_LAB"' EXIT

git -C "$SOURCE_ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD
test "$(git -C "$SOURCE_ROOT" rev-parse "$BASE_SHA:$BASE_PATH")" = "$BASE_BLOB"
git -C "$SOURCE_ROOT" show "$BASE_SHA:$BASE_PATH" >"$PATCHED_LAB"

python3 - "$PATCHED_LAB" <<'PY'
import pathlib,sys
path=pathlib.Path(sys.argv[1])
text=path.read_text(encoding='utf-8')
replacements={
  'window.deadline_at': 'vip_window.deadline_at',
  'as window\\n': 'as vip_window\\n',
  'window.round_id': 'vip_window.round_id',
  "event_type='buster_activated_on_board_entry'": "source='buster_activated_on_board_entry'",
}
for old,new in replacements.items():
  count=text.count(old)
  if count < 1:
    raise SystemExit(f'missing runtime evidence repair anchor: {old}')
  text=text.replace(old,new)
path.write_text(text,encoding='utf-8')
PY

bash -n "$PATCHED_LAB"
bash "$PATCHED_LAB" "$@"
