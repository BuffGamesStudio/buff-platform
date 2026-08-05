import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const validator = path.join(
  repositoryRoot,
  "scripts/movie-buff-migration-encoding-check.mjs",
);

function runValidator(root, outputPath = null) {
  return spawnSync(process.execPath, [validator, root], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MOVIE_BUFF_REPOSITORY_ROOT: repositoryRoot,
      ...(outputPath
        ? { MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT: outputPath }
        : {}),
    },
  });
}

function withFixture(name, bytes, assertion) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mov14-${name}-`));
  const relativeRoot = path.relative(repositoryRoot, fixtureRoot);
  const sqlPath = path.join(fixtureRoot, "fixture.sql");
  fs.writeFileSync(sqlPath, bytes);
  try {
    assertion(relativeRoot);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("repository SQL artifacts are nonempty valid UTF-8 without BOM or NUL", () => {
  const outputPath = path.join(
    os.tmpdir(),
    `movie-buff-migration-encoding-${process.pid}.json`,
  );
  const result = spawnSync(
    process.execPath,
    [
      validator,
      "supabase/migrations",
      "supabase/rollbacks",
      "supabase/tests",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        MOVIE_BUFF_REPOSITORY_ROOT: repositoryRoot,
        MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT: outputPath,
      },
    },
  );

  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.classification, "PASS");
    assert.equal(report.failureCount, 0);
    assert.ok(report.fileCount > 0);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});

test("validator rejects a leading UTF-8 BOM", () => {
  withFixture(
    "bom",
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("select 1;\n", "utf8"),
    ]),
    (relativeRoot) => {
      const result = runValidator(relativeRoot);
      assert.equal(result.status, 1);
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.failures[0].reasons, ["UTF8_BOM"]);
    },
  );
});

test("validator rejects invalid UTF-8", () => {
  withFixture("invalid", Buffer.from([0xc3, 0x28]), (relativeRoot) => {
    const result = runValidator(relativeRoot);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(report.failures[0].reasons.includes("INVALID_UTF8"));
  });
});

test("validator rejects NUL bytes", () => {
  withFixture("nul", Buffer.from("select\u0000 1;\n", "utf8"), (relativeRoot) => {
    const result = runValidator(relativeRoot);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(report.failures[0].reasons.includes("NUL_BYTE"));
  });
});

test("validator rejects empty SQL files", () => {
  withFixture("empty", Buffer.alloc(0), (relativeRoot) => {
    const result = runValidator(relativeRoot);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(report.failures[0].reasons.includes("EMPTY_FILE"));
  });
});
