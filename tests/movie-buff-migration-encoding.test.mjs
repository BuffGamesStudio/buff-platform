import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const validator = path.join(repositoryRoot, "scripts/movie-buff-migration-encoding-check.mjs");
const comparator = path.join(repositoryRoot, "scripts/movie-buff-migration-bom-only-check.mjs");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

function runValidator(root) {
  return run(process.execPath, [validator, root], {
    cwd: repositoryRoot,
    env: { ...process.env, MOVIE_BUFF_REPOSITORY_ROOT: repositoryRoot },
  });
}

function withFixture(name, bytes, assertion) {
  const fixtureRoot = fs.mkdtempSync(path.join(repositoryRoot, `.mov14-${name}-`));
  const relativeRoot = path.relative(repositoryRoot, fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, "fixture.sql"), bytes);
  try {
    assertion(relativeRoot);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function git(repo, args) {
  const result = run("git", args, { cwd: repo });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createComparatorRepo({ baselineBytes, currentBytes, includeCurrent = true }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mov14-git-fixture-"));
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "mov14@example.invalid"]);
  git(repo, ["config", "user.name", "MOV-14 Test"]);
  fs.mkdirSync(path.join(repo, "supabase", "migrations"), { recursive: true });
  const file = "supabase/migrations/fixture.sql";
  fs.writeFileSync(path.join(repo, file), baselineBytes);
  git(repo, ["add", file]);
  git(repo, ["commit", "-m", "baseline"]);
  const baseline = git(repo, ["rev-parse", "HEAD"]);
  if (includeCurrent) {
    fs.writeFileSync(path.join(repo, file), currentBytes);
    git(repo, ["add", file]);
    git(repo, ["commit", "-m", "current"]);
  } else {
    fs.rmSync(path.join(repo, file));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-m", "remove current file"]);
  }
  const current = git(repo, ["rev-parse", "HEAD"]);
  return { repo, file, baseline, current };
}

function runComparator(repo, baseline, current, file = "supabase/migrations/fixture.sql", extraEnv = {}) {
  return run(process.execPath, [comparator, baseline, file], {
    cwd: repo,
    env: {
      ...process.env,
      MOVIE_BUFF_REPOSITORY_ROOT: repo,
      MOVIE_BUFF_CURRENT_REF: current,
      ...extraEnv,
    },
  });
}

test("repository SQL artifacts are nonempty valid UTF-8 without BOM or NUL", () => {
  const outputPath = path.join(os.tmpdir(), `movie-buff-migration-encoding-${process.pid}.json`);
  const result = run(process.execPath, [validator, "supabase/migrations", "supabase/rollbacks", "supabase/tests"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MOVIE_BUFF_REPOSITORY_ROOT: repositoryRoot,
      MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT: outputPath,
    },
  });
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
  withFixture("bom", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("select 1;\n")]), (root) => {
    const result = runValidator(root);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).failures[0].reasons, ["UTF8_BOM"]);
  });
});

test("validator rejects invalid UTF-8", () => {
  withFixture("invalid", Buffer.from([0xc3, 0x28]), (root) => {
    const result = runValidator(root);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).failures[0].reasons.includes("INVALID_UTF8"));
  });
});

test("validator rejects NUL bytes", () => {
  withFixture("nul", Buffer.from("select\u0000 1;\n"), (root) => {
    const result = runValidator(root);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).failures[0].reasons.includes("NUL_BYTE"));
  });
});

test("validator rejects empty SQL files", () => {
  withFixture("empty", Buffer.alloc(0), (root) => {
    const result = runValidator(root);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).failures[0].reasons.includes("EMPTY_FILE"));
  });
});

test("comparator proves exact removal of one leading BOM using Git blobs", () => {
  const sql = Buffer.from("select 1;\r\n-- exact whitespace\r\n", "utf8");
  const fixture = createComparatorRepo({
    baselineBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sql]),
    currentBytes: sql,
  });
  try {
    const result = runComparator(fixture.repo, fixture.baseline, fixture.current, fixture.file);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.classification, "PASS");
    assert.equal(report.baselineSha.length, 40);
    assert.equal(report.currentSha.length, 40);
    assert.equal(report.results[0].exactBytesAfterBomRemoval, true);
    assert.equal(report.results[0].expectedAfterBomRemovalSha256, report.results[0].currentSha256);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("comparator rejects semantic, whitespace, or line-ending mutation", () => {
  const baselineSql = Buffer.from("select 1;\r\n", "utf8");
  const fixture = createComparatorRepo({
    baselineBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), baselineSql]),
    currentBytes: Buffer.from("select 2;\n", "utf8"),
  });
  try {
    const result = runComparator(fixture.repo, fixture.baseline, fixture.current, fixture.file);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).results[0].exactBytesAfterBomRemoval, false);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("comparator rejects baseline without BOM and current still containing BOM", () => {
  for (const [baselineBytes, currentBytes] of [
    [Buffer.from("select 1;\n"), Buffer.from("select 1;\n")],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("select 1;\n")]), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("select 1;\n")])],
  ]) {
    const fixture = createComparatorRepo({ baselineBytes, currentBytes });
    try {
      const result = runComparator(fixture.repo, fixture.baseline, fixture.current, fixture.file);
      assert.equal(result.status, 1);
    } finally {
      fs.rmSync(fixture.repo, { recursive: true, force: true });
    }
  }
});

test("comparator rejects missing refs, wrong refs, missing files, and paths outside repository", () => {
  const sql = Buffer.from("select 1;\n");
  const fixture = createComparatorRepo({
    baselineBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sql]),
    currentBytes: sql,
  });
  try {
    assert.notEqual(run(process.execPath, [comparator], { cwd: fixture.repo, env: { ...process.env, MOVIE_BUFF_REPOSITORY_ROOT: fixture.repo } }).status, 0);
    assert.notEqual(runComparator(fixture.repo, "deadbeef", fixture.current, fixture.file).status, 0);
    assert.notEqual(runComparator(fixture.repo, fixture.baseline, "deadbeef", fixture.file).status, 0);
    assert.notEqual(runComparator(fixture.repo, fixture.baseline, fixture.current, "supabase/migrations/missing.sql").status, 0);
    assert.notEqual(runComparator(fixture.repo, fixture.baseline, fixture.current, "../outside.sql").status, 0);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("comparator rejects invalid UTF-8, NUL, empty SQL, and dirty checkout", () => {
  const cases = [Buffer.from([0xc3, 0x28]), Buffer.from("select\u0000 1;\n"), Buffer.alloc(0)];
  for (const currentBytes of cases) {
    const fixture = createComparatorRepo({
      baselineBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), currentBytes]),
      currentBytes,
    });
    try {
      const result = runComparator(fixture.repo, fixture.baseline, fixture.current, fixture.file);
      assert.equal(result.status, 1);
    } finally {
      fs.rmSync(fixture.repo, { recursive: true, force: true });
    }
  }

  const sql = Buffer.from("select 1;\n");
  const dirty = createComparatorRepo({
    baselineBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), sql]),
    currentBytes: sql,
  });
  try {
    fs.writeFileSync(path.join(dirty.repo, "dirty.txt"), "dirty\n");
    const result = runComparator(dirty.repo, dirty.baseline, dirty.current, dirty.file);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worktree is dirty/i);
  } finally {
    fs.rmSync(dirty.repo, { recursive: true, force: true });
  }
});
