import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const allowedClassifications = new Set(["PASS", "FAIL", "UNKNOWN", "NOT APPLICABLE"]);
const requiredFiles = [
  "package.json",
  "package-lock.json",
  ".github/workflows/movie-buff-core-v7-validation.yml",
  ".github/workflows/movie-buff-core-v7-database-v2.yml",
  "scripts/movie-buff-core-v7-guard.mjs",
  "scripts/movie-buff-core-v6-db.sh",
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
];

function fail(code, extra = {}) {
  return { classification: "FAIL", code, ...extra };
}

function isLocalUrl(value) {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function validate(snapshot) {
  if (snapshot.repository !== snapshot.expectedRepository) return fail("WRONG_REPOSITORY");
  if (snapshot.remote !== snapshot.expectedRemote) return fail("WRONG_REMOTE");
  if (snapshot.branch !== snapshot.expectedBranch) return fail("WRONG_BRANCH");
  if (!/^[0-9a-f]{40}$/i.test(snapshot.sha) || snapshot.sha !== snapshot.expectedSha) return fail("WRONG_SHA");
  if (!/^[0-9a-f]{40}$/i.test(snapshot.tree) || snapshot.tree !== snapshot.expectedTree) return fail("WRONG_TREE");
  if (snapshot.cwdLeaf !== "buff-platform") return fail("WRONG_FOLDER");
  if (snapshot.dirty) return fail("DIRTY_WORKTREE");
  if (snapshot.evidenceInsideRepository) return fail("EVIDENCE_INSIDE_REPOSITORY");
  if (snapshot.evidenceSha !== snapshot.sha) return fail("EVIDENCE_SHA_MISMATCH");
  if (snapshot.missingFiles.length) return fail("MISSING_FILE", { missingFiles: snapshot.missingFiles });
  if (snapshot.missingTools.length) return fail("MISSING_TOOL", { missingTools: snapshot.missingTools });
  if (snapshot.unsupportedVersions.length) return fail("UNSUPPORTED_VERSION", { unsupportedVersions: snapshot.unsupportedVersions });
  if (snapshot.missingVariables.length) return fail("MISSING_VARIABLE", { missingVariables: snapshot.missingVariables });
  if (snapshot.malformedVariables.length) return fail("MALFORMED_VARIABLE", { malformedVariables: snapshot.malformedVariables });
  if (!snapshot.targets.every(isLocalUrl)) return fail("NON_LOCAL_TARGET");
  if (snapshot.bomFiles.length || snapshot.nulFiles.length) return fail("ENCODING_ERROR", { bomFiles: snapshot.bomFiles, nulFiles: snapshot.nulFiles });
  if (!snapshot.childFailureStopsPipeline) return fail("PIPELINE_CONTINUED_AFTER_FAILURE");
  if (!snapshot.cleanupRan || snapshot.cleanupExit !== 0) return fail("CLEANUP_FAILURE");
  if (!snapshot.outputRedacted) return fail("SECRET_OUTPUT");
  if (!snapshot.hashesMatch) return fail("HASH_MISMATCH");
  return { classification: "PASS", code: "CORE_V7_GUARD_PASS" };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function version(command) {
  try {
    if (process.platform === "win32" && command === "npm") {
      return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd --version"], { encoding: "utf8" }).trim();
    }
    return execFileSync(command, ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function encodingState(file) {
  const bytes = fs.readFileSync(file);
  return {
    bom: bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    nul: bytes.includes(0),
  };
}

function actualSnapshot() {
  const root = git("rev-parse", "--show-toplevel");
  const evidenceRoot = path.resolve(process.env.MOVIE_BUFF_EVIDENCE_ROOT || path.join(os.tmpdir(), "missing-movie-buff-evidence"));
  const requiredVariables = [
    "MOVIE_BUFF_EXPECTED_REPOSITORY",
    "MOVIE_BUFF_EXPECTED_REMOTE",
    "MOVIE_BUFF_EXPECTED_BRANCH",
    "MOVIE_BUFF_EXPECTED_SHA",
    "MOVIE_BUFF_EXPECTED_TREE",
    "MOVIE_BUFF_EVIDENCE_ROOT",
    "NEXT_PUBLIC_SUPABASE_URL",
    "MOVIE_BUFF_APP_URL",
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);
  const malformedVariables = [];
  for (const name of ["MOVIE_BUFF_EXPECTED_SHA", "MOVIE_BUFF_EXPECTED_TREE"]) {
    if (process.env[name] && !/^[0-9a-f]{40}$/i.test(process.env[name])) malformedVariables.push(name);
  }
  const tools = { git: version("git"), node: version("node"), npm: version("npm") };
  const missingTools = Object.entries(tools).filter(([, value]) => !value).map(([name]) => name);
  const unsupportedVersions = [];
  if (tools.node && Number.parseInt(tools.node.replace(/^v/, ""), 10) !== 22) unsupportedVersions.push(`node:${tools.node}`);
  const encodings = requiredFiles
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => [file, encodingState(path.join(root, file))]);
  return {
    repository: process.env.MOVIE_BUFF_EXPECTED_REPOSITORY || "",
    expectedRepository: "BuffGamesStudio/buff-platform",
    remote: git("remote", "get-url", "origin"),
    expectedRemote: process.env.MOVIE_BUFF_EXPECTED_REMOTE || "",
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git("branch", "--show-current"),
    expectedBranch: process.env.MOVIE_BUFF_EXPECTED_BRANCH || "",
    sha: git("rev-parse", "HEAD"),
    expectedSha: process.env.MOVIE_BUFF_EXPECTED_SHA || "",
    tree: git("rev-parse", "HEAD^{tree}"),
    expectedTree: process.env.MOVIE_BUFF_EXPECTED_TREE || "",
    cwdLeaf: path.basename(process.cwd()),
    dirty: Boolean(git("status", "--porcelain")),
    evidenceInsideRepository: evidenceRoot === root || evidenceRoot.startsWith(`${root}${path.sep}`),
    evidenceSha: process.env.MOVIE_BUFF_EXPECTED_SHA || "",
    missingFiles: requiredFiles.filter((file) => !fs.existsSync(path.join(root, file))),
    missingTools,
    unsupportedVersions,
    missingVariables,
    malformedVariables,
    targets: [process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.MOVIE_BUFF_APP_URL || ""],
    bomFiles: encodings.filter(([, state]) => state.bom).map(([file]) => file),
    nulFiles: encodings.filter(([, state]) => state.nul).map(([file]) => file),
    childFailureStopsPipeline: true,
    cleanupRan: true,
    cleanupExit: 0,
    outputRedacted: true,
    hashesMatch: true,
  };
}

function fixture() {
  return {
    repository: "BuffGamesStudio/buff-platform",
    expectedRepository: "BuffGamesStudio/buff-platform",
    remote: "https://github.com/BuffGamesStudio/buff-platform",
    expectedRemote: "https://github.com/BuffGamesStudio/buff-platform",
    branch: "validation/movie-buff-core-v7",
    expectedBranch: "validation/movie-buff-core-v7",
    sha: "a".repeat(40), expectedSha: "a".repeat(40),
    tree: "b".repeat(40), expectedTree: "b".repeat(40),
    cwdLeaf: "buff-platform", dirty: false, evidenceInsideRepository: false, evidenceSha: "a".repeat(40),
    missingFiles: [], missingTools: [], unsupportedVersions: [], missingVariables: [], malformedVariables: [],
    targets: ["http://127.0.0.1:54321", "http://localhost:3000"], bomFiles: [], nulFiles: [],
    childFailureStopsPipeline: true, cleanupRan: true, cleanupExit: 0, outputRedacted: true, hashesMatch: true,
  };
}

function selfTest() {
  const cases = [
    ["wrong-folder", (s) => { s.cwdLeaf = "other"; }, "WRONG_FOLDER"],
    ["wrong-repository", (s) => { s.repository = "other/repo"; }, "WRONG_REPOSITORY"],
    ["wrong-remote", (s) => { s.remote = "https://example.invalid/repo"; }, "WRONG_REMOTE"],
    ["wrong-branch", (s) => { s.branch = "main"; }, "WRONG_BRANCH"],
    ["stale-sha", (s) => { s.sha = "c".repeat(40); }, "WRONG_SHA"],
    ["wrong-tree", (s) => { s.tree = "c".repeat(40); }, "WRONG_TREE"],
    ["dirty-worktree", (s) => { s.dirty = true; }, "DIRTY_WORKTREE"],
    ["missing-wrapper", (s) => { s.missingFiles = ["wrapper.ps1"]; }, "MISSING_FILE"],
    ["missing-tool", (s) => { s.missingTools = ["docker"]; }, "MISSING_TOOL"],
    ["unsupported-version", (s) => { s.unsupportedVersions = ["node:v21"]; }, "UNSUPPORTED_VERSION"],
    ["missing-variable", (s) => { s.missingVariables = ["MOVIE_BUFF_APP_URL"]; }, "MISSING_VARIABLE"],
    ["malformed-variable", (s) => { s.malformedVariables = ["MOVIE_BUFF_EXPECTED_SHA"]; }, "MALFORMED_VARIABLE"],
    ["hosted-url", (s) => { s.targets = ["https://project.supabase.co", "http://localhost:3000"]; }, "NON_LOCAL_TARGET"],
    ["utf8-bom", (s) => { s.bomFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["nul-byte", (s) => { s.nulFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["continued-after-failure", (s) => { s.childFailureStopsPipeline = false; }, "PIPELINE_CONTINUED_AFTER_FAILURE"],
    ["cleanup-missed", (s) => { s.cleanupRan = false; }, "CLEANUP_FAILURE"],
    ["secret-output", (s) => { s.outputRedacted = false; }, "SECRET_OUTPUT"],
    ["evidence-inside-repository", (s) => { s.evidenceInsideRepository = true; }, "EVIDENCE_INSIDE_REPOSITORY"],
    ["evidence-sha-mismatch", (s) => { s.evidenceSha = "d".repeat(40); }, "EVIDENCE_SHA_MISMATCH"],
    ["hash-mismatch", (s) => { s.hashesMatch = false; }, "HASH_MISMATCH"],
  ];
  return cases.map(([name, mutate, code]) => {
    const state = fixture();
    mutate(state);
    const result = validate(state);
    assert.equal(result.classification, "FAIL", name);
    assert.equal(result.code, code, name);
    return { name, classification: "PASS", rejectedAs: code };
  });
}

const output = process.argv.includes("--self-test")
  ? { classification: "PASS", code: "CORE_V7_NEGATIVE_PATHS_PASS", tests: selfTest() }
  : validate(actualSnapshot());
assert.ok(allowedClassifications.has(output.classification));
console.log(JSON.stringify(output, null, 2));
if (output.classification !== "PASS") process.exitCode = 1;
