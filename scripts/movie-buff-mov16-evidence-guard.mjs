#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_MIGRATIONS = [
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/g,
  /postgres(?:ql)?:\/\/[^@\s"']+@[^\s"']+/gi,
];
const EXPECTED_REPOSITORY = "BuffGamesStudio/buff-platform";
const EXPECTED_BRANCH = "copilot/MOV-16-vip-authority";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseLocalUrl(value, label, protocols) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("MALFORMED_ENV", `${label} is not a valid URL.`);
  }
  if (!protocols.includes(parsed.protocol) || !LOCAL_HOSTS.has(parsed.hostname)) {
    fail("HOSTED_TARGET", `${label} must be an approved localhost target.`);
  }
  return parsed;
}

function validateState(state) {
  if (!state.cwdOk) fail("WRONG_DIRECTORY", "Repository root markers are missing.");
  if (state.repository !== EXPECTED_REPOSITORY) {
    fail("WRONG_REPOSITORY", "Unexpected repository identity.");
  }
  if (state.branch !== EXPECTED_BRANCH || !/^[0-9a-f]{40}$/.test(state.sha)) {
    fail("WRONG_IDENTITY", "Branch or full commit SHA is not exact.");
  }
  if (state.expectedSha !== state.sha) {
    fail("EVIDENCE_SHA_MISMATCH", "Expected evidence SHA does not match checkout.");
  }
  if (state.dirty) fail("DIRTY_CHECKOUT", "Checkout is not clean.");
  if (!state.migrationsPresent) fail("MISSING_MIGRATION", "Required MOV-16 migration is missing.");
  for (const tool of ["git", "node", "psql", "supabase", "docker"]) {
    if (!state.tools?.[tool]) fail("MISSING_TOOL", `${tool} is unavailable.`);
  }
  if (state.linkedProject) fail("LINKED_TARGET", "Linked Supabase project marker is forbidden.");
  parseLocalUrl(state.supabaseUrl, "Supabase URL", ["http:", "https:"]);
  parseLocalUrl(state.databaseUrl, "database URL", ["postgres:", "postgresql:"]);
  parseLocalUrl(state.appUrl, "application URL", ["http:", "https:"]);
  if (!/^local-mock-[A-Za-z0-9_-]{8,}$/.test(state.serviceRoleMock ?? "")) {
    fail("MISSING_SERVICE_ROLE_MOCK", "A non-secret local service-role mock marker is required.");
  }
  if ((state.childExits ?? []).some((entry) => entry.exitCode !== 0)) {
    fail("CHILD_EXIT", "A child process returned nonzero.");
  }
  if (state.cleanupExit !== 0) fail("CLEANUP_FAILURE", "Disposable cleanup failed.");
  if (state.secretLeak) fail("SECRET_LEAK", "Evidence contains a secret-shaped value.");
  if (!state.manifestMatches) fail("EVIDENCE_SHA_MISMATCH", "Evidence digest verification failed.");
  return true;
}

function toolExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function currentState() {
  const cwdOk =
    fs.existsSync("AGENTS.md") &&
    fs.existsSync("package.json") &&
    fs.existsSync(".git");
  const remote = git("remote", "get-url", "origin");
  const repository = remote
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/^git@github\.com:/, "")
    .replace(/\.git$/, "");
  const sha = git("rev-parse", "HEAD");
  return {
    cwdOk,
    repository,
    branch: process.env.GITHUB_REF_NAME ?? git("branch", "--show-current"),
    sha,
    expectedSha: process.env.MOVIE_BUFF_EXPECTED_GIT_SHA ?? "",
    dirty: git("status", "--porcelain").length > 0,
    migrationsPresent: REQUIRED_MIGRATIONS.every((file) => fs.existsSync(file)),
    tools: {
      git: toolExists("git"),
      node: toolExists("node"),
      psql: toolExists("psql"),
      supabase: toolExists("supabase"),
      docker: toolExists("docker"),
    },
    linkedProject: fs.existsSync("supabase/.temp/project-ref"),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    databaseUrl: process.env.MOVIE_BUFF_LOCAL_DATABASE_URL ?? "",
    appUrl: process.env.MOVIE_BUFF_APP_URL ?? "",
    serviceRoleMock: process.env.MOVIE_BUFF_SERVICE_ROLE_MOCK ?? "",
    childExits: [],
    cleanupExit: 0,
    secretLeak: false,
    manifestMatches: true,
  };
}

function safeReadText(file) {
  return fs.readFileSync(file, "utf8");
}

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

function verifyEvidence(root) {
  const exitFile = path.join(root, "child-exits.json");
  const cleanupFile = path.join(root, "cleanup.exit");
  const expectedShaFile = path.join(root, "source-sha.txt");
  const manifestFile = path.join(root, "sha256.txt");
  for (const file of [exitFile, cleanupFile, expectedShaFile, manifestFile]) {
    if (!fs.existsSync(file)) fail("EVIDENCE_MISSING", `Missing ${path.basename(file)}.`);
  }
  const childExits = JSON.parse(safeReadText(exitFile));
  const cleanupExit = Number(safeReadText(cleanupFile).trim());
  const expectedSha = safeReadText(expectedShaFile).trim();
  const checkoutSha = git("rev-parse", "HEAD");
  const evidenceFiles = listFiles(root).filter((file) => path.basename(file) !== "sha256.txt");
  let secretLeak = false;
  for (const file of evidenceFiles) {
    const text = fs.readFileSync(file, "utf8");
    if (SECRET_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    })) {
      secretLeak = true;
      break;
    }
  }
  const manifestEntries = safeReadText(manifestFile)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      if (!match) fail("EVIDENCE_SHA_MISMATCH", "Malformed SHA-256 manifest.");
      return { digest: match[1], relative: match[2] };
    });
  const manifestMatches =
    manifestEntries.length === evidenceFiles.length &&
    manifestEntries.every(({ digest, relative }) => {
      const full = path.join(root, relative.replace(/^\.\//, ""));
      return fs.existsSync(full) && sha256(full) === digest;
    });
  return validateState({
    cwdOk: true,
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: checkoutSha,
    expectedSha,
    dirty: false,
    migrationsPresent: true,
    tools: { git: true, node: true, psql: true, supabase: true, docker: true },
    linkedProject: false,
    supabaseUrl: "http://127.0.0.1:54321",
    databaseUrl: "postgresql://127.0.0.1:54322/postgres",
    appUrl: "http://127.0.0.1:3001",
    serviceRoleMock: "local-mock-evidence-only",
    childExits,
    cleanupExit,
    secretLeak,
    manifestMatches,
  });
}

function runSelfTest() {
  const baseline = {
    cwdOk: true,
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: "a".repeat(40),
    expectedSha: "a".repeat(40),
    dirty: false,
    migrationsPresent: true,
    tools: { git: true, node: true, psql: true, supabase: true, docker: true },
    linkedProject: false,
    supabaseUrl: "http://127.0.0.1:54321",
    databaseUrl: "postgresql://127.0.0.1:54322/postgres",
    appUrl: "http://127.0.0.1:3001",
    serviceRoleMock: "local-mock-not-a-secret",
    childExits: [{ name: "proof", exitCode: 0 }],
    cleanupExit: 0,
    secretLeak: false,
    manifestMatches: true,
  };
  assert.equal(validateState(structuredClone(baseline)), true);
  const cases = [
    ["wrong directory", "WRONG_DIRECTORY", (s) => { s.cwdOk = false; }],
    ["wrong branch", "WRONG_IDENTITY", (s) => { s.branch = "main"; }],
    ["wrong SHA", "WRONG_IDENTITY", (s) => { s.sha = "short"; }],
    ["dirty checkout", "DIRTY_CHECKOUT", (s) => { s.dirty = true; }],
    ["missing migration", "MISSING_MIGRATION", (s) => { s.migrationsPresent = false; }],
    ["missing psql", "MISSING_TOOL", (s) => { s.tools.psql = false; }],
    ["missing Supabase CLI", "MISSING_TOOL", (s) => { s.tools.supabase = false; }],
    ["missing Docker", "MISSING_TOOL", (s) => { s.tools.docker = false; }],
    ["linked target", "LINKED_TARGET", (s) => { s.linkedProject = true; }],
    ["hosted target", "HOSTED_TARGET", (s) => { s.supabaseUrl = "https://example.supabase.co"; }],
    ["malformed environment", "MALFORMED_ENV", (s) => { s.databaseUrl = "not-a-url"; }],
    ["missing service-role mock", "MISSING_SERVICE_ROLE_MOCK", (s) => { s.serviceRoleMock = ""; }],
    ["nonzero child exit", "CHILD_EXIT", (s) => { s.childExits = [{ name: "proof", exitCode: 9 }]; }],
    ["cleanup failure", "CLEANUP_FAILURE", (s) => { s.cleanupExit = 1; }],
    ["secret leakage", "SECRET_LEAK", (s) => { s.secretLeak = true; }],
    ["evidence SHA mismatch", "EVIDENCE_SHA_MISMATCH", (s) => { s.expectedSha = "b".repeat(40); }],
    ["manifest digest mismatch", "EVIDENCE_SHA_MISMATCH", (s) => { s.manifestMatches = false; }],
  ];
  const results = [];
  for (const [name, expectedCode, mutate] of cases) {
    const state = structuredClone(baseline);
    mutate(state);
    let observed = null;
    try {
      validateState(state);
    } catch (error) {
      observed = error.code;
    }
    assert.equal(observed, expectedCode, `${name} did not fail closed`);
    results.push({ name, classification: "PASS", expectedCode });
  }
  return results;
}

const [mode, target] = process.argv.slice(2);
let result;
if (mode === "--self-test") {
  result = { classification: "PASS", checks: runSelfTest() };
} else if (mode === "--preflight") {
  validateState(currentState());
  result = { classification: "PASS", branch: EXPECTED_BRANCH, sourceSha: git("rev-parse", "HEAD") };
} else if (mode === "--verify-evidence") {
  if (!target) fail("USAGE", "--verify-evidence requires an evidence directory.");
  verifyEvidence(path.resolve(target));
  result = { classification: "PASS", evidenceDirectory: path.resolve(target) };
} else {
  fail("USAGE", "Use --self-test, --preflight, or --verify-evidence.");
}
console.log(JSON.stringify(result, null, 2));
