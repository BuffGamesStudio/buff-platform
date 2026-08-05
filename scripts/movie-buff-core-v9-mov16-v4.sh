#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-mov16-v4-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
BASE_WRAPPER="${SOURCE_ROOT}/scripts/movie-buff-core-v9-mov16-v3.sh"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-mov16-v4-stage"
TEMP_WRAPPER="${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-mov16-v4-stage-${RUN_TOKEN}.sh"
PATCH_REPORT="${EVIDENCE_ROOT}/v4-wrapper-patch.json"

cleanup() {
  rm -f "$TEMP_WRAPPER"
}
trap cleanup EXIT

[[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "invalid expected SHA" >&2; exit 2; }
[[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "invalid expected tree" >&2; exit 2; }
[[ -f "$BASE_WRAPPER" ]] || { echo "missing v3 base wrapper" >&2; exit 2; }
mkdir -p "$EVIDENCE_ROOT"

python3 - "$BASE_WRAPPER" "$TEMP_WRAPPER" "$PATCH_REPORT" <<'PY'
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
report = pathlib.Path(sys.argv[3])
text = source.read_text(encoding="utf-8")
original = text

line_replacements = {
    'text = text.replace("movie-buff-core-v9-mov16-authority-v2", "movie-buff-core-v9-mov16-authority-v3", 1)':
        'text = text.replace("movie-buff-core-v9-mov16-authority-v2", "movie-buff-core-v9-mov16-authority-v4", 1)',
    'text = text.replace("MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V2", "MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V3", 1)':
        'text = text.replace("MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V2", "MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V4", 1)',
    'text = text.replace("mov16-v2", "mov16-v3")': None,
}
for old_line, new_line in line_replacements.items():
    if text.count(old_line) != 1:
        raise SystemExit(f"expected v3 line exactly once: {old_line}")
    if new_line is not None:
        text = text.replace(old_line, new_line, 1)

injected = r"""
context_anchor = '''  return { roomId, matchId, roundId, participantIndexes };\n}\n\nasync function createDefinition(name, activationWindow = "answer") {\n'''
context_replacement = '''  return { roomId, matchId, roundId, participantIndexes };\n}\n\nasync function deleteContext(context) {\n  const { error } = await admin.from("game_rooms").delete().eq("id", context.roomId);\n  if (error) throw error;\n  createdRooms.delete(context.roomId);\n}\n\nasync function createDefinition(name, activationWindow = "answer") {\n'''
if text.count(context_anchor) != 1:
    raise SystemExit("deleteContext insertion anchor mismatch")
text = text.replace(context_anchor, context_replacement, 1)

no_window_anchor = '''  record("release before VIP window is a safe idempotent no-op");\n\n  const windowRace = await createContext([0, 1], 2);\n'''
no_window_replacement = '''  record("release before VIP window is a safe idempotent no-op");\n  await deleteContext(noWindow);\n\n  const windowRace = await createContext([0, 1], 2);\n'''
if text.count(no_window_anchor) != 1:
    raise SystemExit("no-window cleanup anchor mismatch")
text = text.replace(no_window_anchor, no_window_replacement, 1)

invalid_anchor = '''  const invalidIdentityWindow = await createContext([0], 3);\n  const invalidOpen = await openWindow(invalidIdentityWindow, [0, 2], deadline);\n  assert.ok(invalidOpen.error);\n  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);\n'''
invalid_replacement = '''  const invalidIdentityWindow = await createContext([2], 3);\n  const invalidOpen = await openWindow(invalidIdentityWindow, [2, 3], deadline);\n  assert.ok(invalidOpen.error);\n  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);\n  await deleteContext(invalidIdentityWindow);\n'''
if text.count(invalid_anchor) != 1:
    raise SystemExit("invalid-identity isolation anchor mismatch")
text = text.replace(invalid_anchor, invalid_replacement, 1)

contradictory_anchor = '''  const contradictoryContext = await createContext([0], 4);\n  await openWindow(contradictoryContext, [0], new Date(Date.now() + 60_000));\n  const contradictoryResults = await Promise.all([\n    routeCall(0, "/api/movie-buff/vip/lock", {\n      roomId: contradictoryContext.roomId,\n      roundId: contradictoryContext.roundId,\n      vipId: vipA,\n      idempotencyKey: randomKey("choice-a"),\n    }),\n    routeCall(0, "/api/movie-buff/vip/lock", {\n      roomId: contradictoryContext.roomId,\n      roundId: contradictoryContext.roundId,\n      vipId: vipB,\n      idempotencyKey: randomKey("choice-b"),\n    }),\n  ]);\n'''
contradictory_replacement = '''  const contradictoryContext = await createContext([2], 4);\n  await openWindow(contradictoryContext, [2], new Date(Date.now() + 60_000));\n  await grant(2, vipA, 2);\n  await grant(2, vipB, 2);\n  const contradictoryResults = await Promise.all([\n    routeCall(2, "/api/movie-buff/vip/lock", {\n      roomId: contradictoryContext.roomId,\n      roundId: contradictoryContext.roundId,\n      vipId: vipA,\n      idempotencyKey: randomKey("choice-a"),\n    }),\n    routeCall(2, "/api/movie-buff/vip/lock", {\n      roomId: contradictoryContext.roomId,\n      roundId: contradictoryContext.roundId,\n      vipId: vipB,\n      idempotencyKey: randomKey("choice-b"),\n    }),\n  ]);\n'''
if text.count(contradictory_anchor) != 1:
    raise SystemExit("contradictory-context isolation anchor mismatch")
text = text.replace(contradictory_anchor, contradictory_replacement, 1)

contradictory_cleanup_anchor = '''  record("identical and contradictory lock races converge safely");\n\n  const firstRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");\n'''
contradictory_cleanup_replacement = '''  record("identical and contradictory lock races converge safely");\n  await deleteContext(contradictoryContext);\n\n  const firstRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");\n'''
if text.count(contradictory_cleanup_anchor) != 1:
    raise SystemExit("contradictory-context cleanup anchor mismatch")
text = text.replace(contradictory_cleanup_anchor, contradictory_cleanup_replacement, 1)

window_cleanup_anchor = '''  assert.equal(closedView.view.status, "closed");\n  assert.equal(closedView.view.advanceReady, true);\n\n  const activationContext = await createContext([0], 5);\n'''
window_cleanup_replacement = '''  assert.equal(closedView.view.status, "closed");\n  assert.equal(closedView.view.advanceReady, true);\n  await deleteContext(windowRace);\n\n  const activationContext = await createContext([0], 5);\n'''
if text.count(window_cleanup_anchor) != 1:
    raise SystemExit("window-race cleanup anchor mismatch")
text = text.replace(window_cleanup_anchor, window_cleanup_replacement, 1)

"""

needle = 'text = text.replace("mov16-v2", "mov16-v3")'
v3_patch = (
    "inner_injected = " + repr(injected) + "\n"
    + "inner_anchor = \"old_catch=\"\n"
    + "if text.count(inner_anchor) != 1:\n"
    + "    raise SystemExit('inner isolation insertion anchor mismatch')\n"
    + "text = text.replace(inner_anchor, inner_injected + '\\n' + inner_anchor, 1)\n"
    + 'text = text.replace("mov16-v2", "mov16-v4")'
)
text = text.replace(needle, v3_patch, 1)
text = text.replace("mov16-v3-evidence", "mov16-v4-evidence")
text = text.replace("-mov16-v3", "-mov16-v4")
text = text.replace("v3-wrapper-patch.json", "v4-inner-wrapper-patch.json")
text = text.replace("UUID-validated direct VALUES fixture insertion", "UUID-validated direct VALUES insertion plus one-active-room fixture isolation")

target.write_text(text, encoding="utf-8")
target.chmod(0o700)
report.write_text(json.dumps({
    "classification": "PASS",
    "baseWrapper": str(source.relative_to(pathlib.Path.cwd())),
    "baseWrapperSha256": hashlib.sha256(original.encode()).hexdigest(),
    "patchedWrapperSha256": hashlib.sha256(text.encode()).hexdigest(),
    "changes": [
        "preserve UUID-safe direct localhost PostgreSQL match_players fixture insertion",
        "delete completed disposable contexts before persona reuse",
        "use independent personas for simultaneous context assertions",
        "preserve product one-active-room enforcement",
    ],
    "productGrantChange": False,
    "productSourceChange": False,
}, indent=2) + "\n", encoding="utf-8")
PY

bash -n "$TEMP_WRAPPER"
exec bash "$TEMP_WRAPPER" "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
