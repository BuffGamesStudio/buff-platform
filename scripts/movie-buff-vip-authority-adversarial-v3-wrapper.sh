#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
CACHE_ROOT="$SOURCE_ROOT/node_modules/.cache/movie-buff-validation"
mkdir -p "$CACHE_ROOT"
TMP_SCRIPT="$(mktemp "$CACHE_ROOT/mov16-adversarial-v3-XXXXXX.mjs")"
trap 'rm -f "$TMP_SCRIPT"' EXIT

python3 - "$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial-v2.mjs" "$TMP_SCRIPT" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
output = pathlib.Path(sys.argv[2])

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

source = replace_once(
    source,
    "\nfunction createDefinition(name, activationWindow = \"answer\") {",
    """
function destroyContext(context, checkpoint) {
  ownerSql(`delete from public.game_rooms where id=${quote(context.roomId)}::uuid;`);
  createdRooms.delete(context.roomId);
  evidence.cleanup.push({
    kind: \"room\",
    id: context.roomId,
    classification: \"PASS\",
    checkpoint,
  });
}

function createDefinition(name, activationWindow = \"answer\") {""",
    "insert destroyContext",
)

source = replace_once(
    source,
    '  record("release before window is safe and idempotent");',
    '  record("release before window is safe and idempotent");\n  destroyContext(noWindow, "release-before-window");',
    "dispose no-window context",
)

source = replace_once(
    source,
    """  const invalidContext = createContext([0], 3);
  const invalidOpen = await openWindow(invalidContext, [0, 2], deadline);
  assert.ok(invalidOpen.error);
  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);""",
    """  const invalidContext = createContext([2], 3);
  const invalidOpen = await openWindow(invalidContext, [2, 3], deadline);
  assert.ok(invalidOpen.error);
  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);
  destroyContext(invalidContext, "invalid-required-set");""",
    "isolate invalid-context persona",
)

source = replace_once(
    source,
    """  grantInventory(0, vipA, 3);
  grantInventory(0, vipB, 2);""",
    """  grantInventory(0, vipA, 3);
  grantInventory(0, vipB, 2);
  grantInventory(2, vipA, 3);
  grantInventory(2, vipB, 2);""",
    "grant isolated contradictory persona",
)

source = replace_once(
    source,
    """  const contradictoryContext = createContext([0], 4);
  await openWindow(contradictoryContext, [0], new Date(Date.now() + 90_000));
  const contradictory = await Promise.all([
    routeCall(0, \"/api/movie-buff/vip/lock\", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipA,
      idempotencyKey: randomKey(\"choice-a\"),
    }),
    routeCall(0, \"/api/movie-buff/vip/lock\", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipB,
      idempotencyKey: randomKey(\"choice-b\"),
    }),
  ]);""",
    """  const contradictoryContext = createContext([2], 4);
  await openWindow(contradictoryContext, [2], new Date(Date.now() + 90_000));
  const contradictory = await Promise.all([
    routeCall(2, \"/api/movie-buff/vip/lock\", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipA,
      idempotencyKey: randomKey(\"choice-a\"),
    }),
    routeCall(2, \"/api/movie-buff/vip/lock\", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipB,
      idempotencyKey: randomKey(\"choice-b\"),
    }),
  ]);""",
    "isolate contradictory lock context",
)

source = replace_once(
    source,
    '  record("identical and contradictory lock races converge safely");',
    '  record("identical and contradictory lock races converge safely");\n  destroyContext(contradictoryContext, "contradictory-lock-race");',
    "dispose contradictory context",
)

source = replace_once(
    source,
    '  record("release excludes departed identity and remaining player closes window");',
    '  record("release excludes departed identity and remaining player closes window");\n  destroyContext(windowRace, "release-and-close");',
    "dispose window-race context",
)

source = replace_once(
    source,
    "\ntry {\n  const password = `Local-${runId}-A9!`;",
    """
async function createUserWithRetry(attributes) {
  let lastError = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const result = await admin.auth.admin.createUser(attributes);
      if (!result.error && result.data?.user) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    try {
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listed.data?.users?.find(
        (user) => user.email?.toLowerCase() === attributes.email.toLowerCase(),
      );
      if (existing) return { data: { user: existing }, error: null };
      if (listed.error) lastError = listed.error;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 8) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  return { data: { user: null }, error: lastError ?? new Error("createUser retry exhausted") };
}

try {
  const password = `Local-${runId}-A9!`;""",
    "insert bounded local-auth retry",
)

source = replace_once(
    source,
    "    const { data, error } = await admin.auth.admin.createUser({",
    "    const { data, error } = await createUserWithRetry({",
    "use bounded local-auth retry",
)

output.write_text(source, encoding="utf-8")
PY

node --check "$TMP_SCRIPT"
node "$TMP_SCRIPT"
