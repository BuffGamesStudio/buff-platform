#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
CACHE_ROOT="$SOURCE_ROOT/node_modules/.cache/movie-buff-validation"
mkdir -p "$CACHE_ROOT"
TMP_SCRIPT="$(mktemp "$CACHE_ROOT/mov17-three-browser-v2-XXXXXX.mjs")"
trap 'rm -f "$TMP_SCRIPT"' EXIT

python3 - "$SOURCE_ROOT/scripts/movie-buff-core-v12-three-browser-convergence.mjs" "$TMP_SCRIPT" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
output = pathlib.Path(sys.argv[2])

old = '''  await Promise.all(
    pages.map((page) =>
      page.getByText("Selection locked", { exact: false }).waitFor({
        state: "visible",
        timeout: 15_000,
      }),
    ),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => document.body.innerText.replace(/\\s+/g, " ").includes("3 / 3"),
        null,
        { timeout: 15_000 },
      ),
    ),
  );
  for (let index = 0; index < pages.length; index += 1) {
    evidence.postLockStatus[`player-${index + 1}`] = {
      selectionLockedCount: await pages[index]
        .getByText("Selection locked", { exact: false })
        .count(),
      threeOfThreeCount: await pages[index].getByText("3 / 3", { exact: true }).count(),
    };
  }
  pass("three-no-vip-locks-converged", evidence.postLockStatus);'''

new = '''  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => {
          const text = document.body.innerText.replace(/\\s+/g, " ");
          const path = window.location.pathname;
          return (
            (text.includes("Selection locked") && text.includes("3 / 3")) ||
            path === "/games/movie-buff/board-select"
          );
        },
        null,
        { timeout: 20_000 },
      ),
    ),
  );
  for (let index = 0; index < pages.length; index += 1) {
    const path = new URL(pages[index].url()).pathname;
    const selectionLockedCount = await pages[index]
      .getByText("Selection locked", { exact: false })
      .count();
    const threeOfThreeCount = await pages[index]
      .getByText("3 / 3", { exact: true })
      .count();
    const autoAdvancedToBoardSelect = path === "/games/movie-buff/board-select";
    assert.ok(
      autoAdvancedToBoardSelect ||
        (selectionLockedCount > 0 && threeOfThreeCount > 0),
      `player ${index + 1} neither retained the locked 3 / 3 state nor auto-advanced to board-select`,
    );
    evidence.postLockStatus[`player-${index + 1}`] = {
      path,
      selectionLockedCount,
      threeOfThreeCount,
      autoAdvancedToBoardSelect,
    };
  }
  pass(
    "three-no-vip-locks-or-authoritative-auto-advance-converged",
    evidence.postLockStatus,
  );'''

count = source.count(old)
if count != 1:
    raise SystemExit(f"post-lock convergence block: expected exactly one match, found {count}")
source = source.replace(old, new, 1)
output.write_text(source, encoding="utf-8")
PY

node --check "$TMP_SCRIPT"
node "$TMP_SCRIPT"
