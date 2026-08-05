#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="db6d0a1c442cc06bd69e5aa7ae970fe8fd87bfde"
BASE_BLOB="1e1c075fdcd9c2964e7c868f92e53b2491ff9df3"
BASE_PATH="scripts/movie-buff-mov17-repair-runtime-lab.sh"
PATCHED_LAB="$(mktemp "${RUNNER_TEMP:-/tmp}/mov17-runtime-lab-v9-XXXXXX.sh")"
trap 'rm -f "$PATCHED_LAB"' EXIT

git -C "$SOURCE_ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD
test "$(git -C "$SOURCE_ROOT" rev-parse "$BASE_SHA:$BASE_PATH")" = "$BASE_BLOB"
git -C "$SOURCE_ROOT" show "$BASE_SHA:$BASE_PATH" >"$PATCHED_LAB"

python3 - "$PATCHED_LAB" <<'PY'
import pathlib,sys
path=pathlib.Path(sys.argv[1])
text=path.read_text(encoding='utf-8')

for old,new in {
  'window.deadline_at': 'vip_window.deadline_at',
  'as window\\n': 'as vip_window\\n',
  'window.round_id': 'vip_window.round_id',
}.items():
  count=text.count(old)
  if count < 1:
    raise SystemExit(f'missing reserved-alias repair anchor: {old}')
  text=text.replace(old,new)

anchor="source=source.replace(old_phase_deadline,new_phase_deadline,1)\n"
insertion=anchor+'''old_event_query = "event_type='buster_activated_on_board_entry'"
new_event_query = "source='buster_activated_on_board_entry'"
if old_event_query not in source:
  raise SystemExit('Buster event evidence anchor not found')
source=source.replace(old_event_query,new_event_query,1)
'''
if text.count(anchor) != 1:
  raise SystemExit(f'embedded event-transform insertion anchor count: {text.count(anchor)}')
text=text.replace(anchor,insertion,1)
path.write_text(text,encoding='utf-8')
PY

bash -n "$PATCHED_LAB"
bash "$PATCHED_LAB" "$@"
