#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SOURCE_PATH = "scripts/movie-buff-mov16-deadline-release-race.mjs";
const EXPECTED_SOURCE_BLOB = "7522a6ca2f6248cf484e09580aac35ff2e78f5d8";
const DERIVED_PATH = path.resolve(
  "scripts",
  `.movie-buff-mov16-deadline-release-race-v2-${process.pid}.mjs`,
);

const sourceBlob = execFileSync(
  "git",
  ["rev-parse", `HEAD:${SOURCE_PATH}`],
  { encoding: "utf8" },
).trim();
assert.equal(
  sourceBlob,
  EXPECTED_SOURCE_BLOB,
  "unexpected MOV-16 deadline/release harness blob",
);

let source = fs.readFileSync(SOURCE_PATH, "utf8");
const substitutions = [
  {
    old: `  createdRooms.push(roomId);\n  return { roomId, matchId, roundId, playerIds };\n}\n\nfunction createDefinitionAndInventory`,
    next: `  createdRooms.push(roomId);\n  return { roomId, matchId, roundId, playerIds };\n}\n\nfunction disposeContext(context) {\n  ownerSql(\`delete from public.game_rooms where id=\${quote(context.roomId)}::uuid;\`);\n  const index = createdRooms.indexOf(context.roomId);\n  if (index >= 0) createdRooms.splice(index, 1);\n}\n\nfunction createDefinitionAndInventory`,
  },
  {
    old: `  record("duplicate required-human snapshot fails closed");\n\n  const deadlineContext`,
    next: `  record("duplicate required-human snapshot fails closed");\n  disposeContext(duplicateContext);\n\n  const deadlineContext`,
  },
  {
    old: `  record("eight concurrent finalizers converge on deterministic null passes without inventory consumption");\n\n  const releasedContext`,
    next: `  record("eight concurrent finalizers converge on deterministic null passes without inventory consumption");\n  disposeContext(deadlineContext);\n\n  const releasedContext`,
  },
  {
    old: `  record("released participant is excluded from deadline obligations and receives no pass");\n\n  const raceContext`,
    next: `  record("released participant is excluded from deadline obligations and receives no pass");\n  disposeContext(releasedContext);\n\n  const raceContext`,
  },
];

for (const { old, next } of substitutions) {
  assert.equal(
    source.split(old).length - 1,
    1,
    "expected exactly one disposable fixture substitution",
  );
  source = source.replace(old, next);
}

fs.writeFileSync(DERIVED_PATH, source, "utf8");
try {
  const syntax = spawnSync(
    process.execPath,
    ["--check", DERIVED_PATH],
    { encoding: "utf8" },
  );
  if (syntax.status !== 0) {
    process.stderr.write(syntax.stderr || syntax.stdout || "derived syntax failed\n");
    process.exitCode = syntax.status ?? 1;
  } else {
    const result = spawnSync(
      process.execPath,
      [DERIVED_PATH],
      { env: process.env, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  fs.rmSync(DERIVED_PATH, { force: true });
}
