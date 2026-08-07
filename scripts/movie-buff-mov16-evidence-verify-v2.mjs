#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const evidenceRoot = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.existsSync(evidenceRoot)) {
  throw new Error("Pass an existing MOV-16 evidence directory.");
}

const ORIGINAL_GUARD_PATH = "scripts/movie-buff-mov16-evidence-guard.mjs";
const EXPECTED_ORIGINAL_GUARD_BLOB = "676c1a21f868a0463e286d314816d3c66e8350f2";
const actualGuardBlob = execFileSync(
  "git",
  ["rev-parse", `HEAD:${ORIGINAL_GUARD_PATH}`],
  { encoding: "utf8" },
).trim();
assert.equal(
  actualGuardBlob,
  EXPECTED_ORIGINAL_GUARD_BLOB,
  "unexpected original MOV-16 evidence guard blob",
);

const requiredFiles = [
  "child-exits.json",
  "cleanup.exit",
  "source-sha.txt",
  "sha256.txt",
];
for (const name of requiredFiles) {
  assert.ok(fs.existsSync(path.join(evidenceRoot, name)), `missing ${name}`);
}

const childExits = JSON.parse(
  fs.readFileSync(path.join(evidenceRoot, "child-exits.json"), "utf8"),
);
assert.ok(Array.isArray(childExits) && childExits.length > 0);
assert.deepEqual(
  childExits.filter((entry) => entry.exitCode !== 0),
  [],
  "a child validation process returned nonzero",
);
assert.equal(
  Number(fs.readFileSync(path.join(evidenceRoot, "cleanup.exit"), "utf8").trim()),
  0,
  "disposable cleanup failed",
);

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const evidenceSha = fs
  .readFileSync(path.join(evidenceRoot, "source-sha.txt"), "utf8")
  .trim();
assert.equal(evidenceSha, checkoutSha, "evidence SHA does not match checkout");

function listFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const evidenceFiles = listFiles(evidenceRoot).filter(
  (file) => path.basename(file) !== "sha256.txt",
);
const manifestEntries = fs
  .readFileSync(path.join(evidenceRoot, "sha256.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, `malformed manifest entry: ${line}`);
    return { digest: match[1], relative: match[2] };
  });
assert.equal(
  manifestEntries.length,
  evidenceFiles.length,
  "manifest file count differs from evidence file count",
);
for (const { digest, relative } of manifestEntries) {
  const full = path.join(evidenceRoot, relative.replace(/^\.\//, ""));
  assert.ok(fs.existsSync(full), `manifest path is missing: ${relative}`);
  assert.equal(sha256(full), digest, `digest mismatch: ${relative}`);
}

const secretPatterns = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/g,
  /postgres(?:ql)?:\/\/[^@\s"']+@[^\s"']+/gi,
];
const allowedRedactions = [
  "postgresql://[REDACTED_LOCAL_CREDENTIALS]@127.0.0.1",
  "postgres://[REDACTED_LOCAL_CREDENTIALS]@127.0.0.1",
];
for (const file of evidenceFiles) {
  let text = fs.readFileSync(file, "utf8");
  for (const allowed of allowedRedactions) {
    text = text.replaceAll(allowed, "[SAFE_REDACTED_LOCAL_DATABASE]");
  }
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    assert.equal(
      pattern.test(text),
      false,
      `secret-shaped evidence remained in ${path.relative(evidenceRoot, file)}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      classification: "PASS",
      sourceSha: checkoutSha,
      verifiedFiles: evidenceFiles.length,
      childProcesses: childExits.length,
      cleanupExit: 0,
      originalGuardBlob: actualGuardBlob,
      redactionAllowlist: allowedRedactions,
    },
    null,
    2,
  ),
);
