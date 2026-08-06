#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error("Pass the reviewed MOV-16 adversarial harness path.");
}
const EXPECTED_SOURCE_BLOB = "fde92b7d6b2b4e8f0a0dcf09235b13c4f93a5574";
const DERIVED_PATH = path.resolve(
  "scripts",
  `.movie-buff-mov16-adversarial-v3-${process.pid}.mjs`,
);

const sourceBlob = execFileSync("git", ["hash-object", sourcePath], {
  encoding: "utf8",
}).trim();
assert.equal(
  sourceBlob,
  EXPECTED_SOURCE_BLOB,
  "unexpected reviewed MOV-16 adversarial harness blob",
);

let source = fs.readFileSync(sourcePath, "utf8");
function replaceOnce(oldValue, newValue, label) {
  assert.equal(
    source.split(oldValue).length - 1,
    1,
    `expected exactly one ${label} substitution`,
  );
  source = source.replace(oldValue, newValue);
}

replaceOnce(
  `  createdRooms.add(roomId);\n  return { roomId, matchId, roundId, participantIndexes };\n}\n\nfunction createDefinition`,
  `  createdRooms.add(roomId);\n  return { roomId, matchId, roundId, participantIndexes };\n}\n\nfunction disposeContext(context) {\n  ownerSql(\`delete from public.game_rooms where id=\${quote(context.roomId)}::uuid;\`);\n  createdRooms.delete(context.roomId);\n}\n\nfunction createDefinition`,
  "context disposal helper",
);
replaceOnce(
  `  record("release before window is safe and idempotent");\n\n  const windowRace`,
  `  record("release before window is safe and idempotent");\n  disposeContext(noWindow);\n\n  const windowRace`,
  "pre-window room disposal",
);
replaceOnce(
  `  const invalidContext = createContext([0], 3);\n  const invalidOpen = await openWindow(invalidContext, [0, 2], deadline);`,
  `  const invalidContext = createContext([2], 3);\n  const invalidOpen = await openWindow(invalidContext, [2, 3], deadline);`,
  "nonmember persona isolation",
);
replaceOnce(
  `  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);\n  const requiredIds`,
  `  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);\n  disposeContext(invalidContext);\n  const requiredIds`,
  "invalid context disposal",
);
replaceOnce(
  `  grantInventory(0, vipA, 3);\n  grantInventory(0, vipB, 2);`,
  `  grantInventory(0, vipA, 3);\n  grantInventory(0, vipB, 2);\n  grantInventory(2, vipA, 2);\n  grantInventory(2, vipB, 2);`,
  "isolated contradictory inventory",
);
replaceOnce(
  `  const contradictoryContext = createContext([0], 4);\n  await openWindow(contradictoryContext, [0], new Date(Date.now() + 90_000));`,
  `  const contradictoryContext = createContext([2], 4);\n  await openWindow(contradictoryContext, [2], new Date(Date.now() + 90_000));`,
  "contradictory persona isolation",
);

const contradictoryStart = source.indexOf(
  "  const contradictory = await Promise.all([",
);
const contradictoryEnd = source.indexOf(
  '  record("identical and contradictory lock races converge safely");',
  contradictoryStart,
);
assert.ok(contradictoryStart >= 0 && contradictoryEnd > contradictoryStart);
const contradictoryBlock = source.slice(contradictoryStart, contradictoryEnd);
assert.equal(
  contradictoryBlock.split("routeCall(0,").length - 1,
  2,
  "expected two contradictory persona route calls",
);
source =
  source.slice(0, contradictoryStart) +
  contradictoryBlock.replaceAll("routeCall(0,", "routeCall(2,") +
  source.slice(contradictoryEnd);
replaceOnce(
  `  record("identical and contradictory lock races converge safely");\n\n  const firstRelease`,
  `  record("identical and contradictory lock races converge safely");\n  disposeContext(contradictoryContext);\n\n  const firstRelease`,
  "contradictory context disposal",
);
replaceOnce(
  `  record("release excludes departed identity and remaining player closes window");\n\n  const activationContext`,
  `  record("release excludes departed identity and remaining player closes window");\n  disposeContext(windowRace);\n\n  const activationContext`,
  "window race disposal",
);

fs.writeFileSync(DERIVED_PATH, source, "utf8");
try {
  const syntax = spawnSync(process.execPath, ["--check", DERIVED_PATH], {
    encoding: "utf8",
  });
  if (syntax.status !== 0) {
    process.stderr.write(syntax.stderr || syntax.stdout || "derived syntax failed\n");
    process.exitCode = syntax.status ?? 1;
  } else {
    const result = spawnSync(process.execPath, [DERIVED_PATH], {
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  fs.rmSync(DERIVED_PATH, { force: true });
}
