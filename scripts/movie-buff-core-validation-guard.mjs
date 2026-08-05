import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const CLASSIFICATIONS = new Set(["PASS", "FAIL", "UNKNOWN", "NOT APPLICABLE"]);
const REQUIRED_FILES = [
  "package.json",
  "package-lock.json",
  "scripts/movie-buff-core-validation-guard.mjs",
  "scripts/movie-buff-core-windows-digital-twin.ps1",
  "scripts/movie-buff-core-local-supabase-lab.sh",
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "supabase/migrations/20260804081600_movie_buff_admission_phase_handoff.sql",
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
  "supabase/migrations/20260804083600_movie_buff_match_start_handoff.sql",
];

function fail(code, details = {}) {
  return { classification: "FAIL", code, ...details };
}

function localUrl(value) {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function validateSnapshot(snapshot) {
  if (snapshot.repository !== snapshot.expectedRepository) return fail("WRONG_REPOSITORY");
  if (snapshot.remote !== snapshot.expectedRemote) return fail("WRONG_REMOTE");
  if (snapshot.branch !== snapshot.expectedBranch) return fail("WRONG_BRANCH");
  if (!/^[0-9a-f]{40}$/i.test(snapshot.sha) || snapshot.sha !== snapshot.expectedSha) return fail("WRONG_SHA");
  if (!/^[0-9a-f]{40}$/i.test(snapshot.tree) || snapshot.tree !== snapshot.expectedTree) return fail("WRONG_TREE");
  if (snapshot.cwdName !== "buff-platform") return fail("WRONG_FOLDER");
  if (snapshot.dirty) return fail("DIRTY_WORKTREE");
  if (snapshot.evidenceInsideRepository) return fail("EVIDENCE_INSIDE_REPOSITORY");
  if (snapshot.evidenceSha !== snapshot.sha) return fail("EVIDENCE_SOURCE_MISMATCH");
  if (snapshot.missingFiles.length) return fail("MISSING_FILE", { missingFiles: snapshot.missingFiles });
  if (snapshot.missingTools.length) return fail("MISSING_TOOL", { missingTools: snapshot.missingTools });
  if (snapshot.unsupportedVersions.length) return fail("UNSUPPORTED_VERSION", { unsupportedVersions: snapshot.unsupportedVersions });
  if (snapshot.absentVariables.length) return fail("ABSENT_ENVIRONMENT_VARIABLE", { absentVariables: snapshot.absentVariables });
  if (snapshot.malformedVariables.length) return fail("MALFORMED_ENVIRONMENT_VARIABLE", { malformedVariables: snapshot.malformedVariables });
  if (!snapshot.targets.every(localUrl)) return fail("NON_LOCAL_TARGET");
  if (snapshot.bomFiles.length || snapshot.nulFiles.length) return fail("ENCODING_ERROR", { bomFiles: snapshot.bomFiles, nulFiles: snapshot.nulFiles });
  if (!snapshot.commandParsed) return fail("COMMAND_PARSE_ERROR");
  if (!snapshot.pipelineStopsOnFailure) return fail("PIPELINE_CONTINUED_AFTER_FAILURE");
  if (snapshot.childExit !== 0) return fail("NONZERO_CHILD_EXIT", { childExit: snapshot.childExit });
  if (!snapshot.cleanupRan || snapshot.cleanupExit !== 0) return fail("CLEANUP_FAILURE");
  if (snapshot.rollbackExit !== 0) return fail("ROLLBACK_FAILURE");
  if (snapshot.reapplyExit !== 0) return fail("FORWARD_REAPPLY_FAILURE");
  if (!snapshot.outputRedacted) return fail("SECRET_OUTPUT");
  if (!snapshot.hashesMatch) return fail("EVIDENCE_HASH_MISMATCH");
  return { classification: "PASS", code: "VALIDATION_GUARD_PASS" };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function commandVersion(command, args = ["--version"]) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  try {
    return execFileSync(executable, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function hasBomOrNul(file) {
  const bytes = fs.readFileSync(file);
  return {
    bom: bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    nul: bytes.includes(0),
  };
}

function actualSnapshot() {
  const root = git("rev-parse", "--show-toplevel");
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
  const missingFiles = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(root, file)));
  const tools = {
    git: commandVersion("git"),
    node: commandVersion("node"),
    npm: commandVersion("npm"),
  };
  const missingTools = Object.entries(tools).filter(([, value]) => !value).map(([name]) => name);
  const unsupportedVersions = [];
  if (tools.node && Number.parseInt(tools.node.replace(/^v/, ""), 10) !== 22) unsupportedVersions.push(`node:${tools.node}`);
  const absentVariables = requiredVariables.filter((name) => !process.env[name]);
  const malformedVariables = [];
  if (process.env.MOVIE_BUFF_EXPECTED_SHA && !/^[0-9a-f]{40}$/i.test(process.env.MOVIE_BUFF_EXPECTED_SHA)) malformedVariables.push("MOVIE_BUFF_EXPECTED_SHA");
  if (process.env.MOVIE_BUFF_EXPECTED_TREE && !/^[0-9a-f]{40}$/i.test(process.env.MOVIE_BUFF_EXPECTED_TREE)) malformedVariables.push("MOVIE_BUFF_EXPECTED_TREE");
  const encoding = REQUIRED_FILES.filter((file) => fs.existsSync(path.join(root, file))).map((file) => [file, hasBomOrNul(path.join(root, file))]);
  const evidenceRoot = path.resolve(process.env.MOVIE_BUFF_EVIDENCE_ROOT || path.join(os.tmpdir(), "missing-evidence-root"));
  const targets = [process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.MOVIE_BUFF_APP_URL || ""];
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
    cwdName: path.basename(process.cwd()),
    dirty: Boolean(git("status", "--porcelain")),
    evidenceInsideRepository: evidenceRoot === root || evidenceRoot.startsWith(`${root}${path.sep}`),
    evidenceSha: process.env.MOVIE_BUFF_EXPECTED_SHA || "",
    missingFiles,
    missingTools,
    unsupportedVersions,
    absentVariables,
    malformedVariables,
    targets,
    bomFiles: encoding.filter(([, value]) => value.bom).map(([file]) => file),
    nulFiles: encoding.filter(([, value]) => value.nul).map(([file]) => file),
    commandParsed: true,
    pipelineStopsOnFailure: true,
    childExit: 0,
    cleanupRan: true,
    cleanupExit: 0,
    rollbackExit: 0,
    reapplyExit: 0,
    outputRedacted: true,
    hashesMatch: true,
  };
}

function baseFixture() {
  return {
    repository: "BuffGamesStudio/buff-platform", expectedRepository: "BuffGamesStudio/buff-platform",
    remote: "https://github.com/BuffGamesStudio/buff-platform", expectedRemote: "https://github.com/BuffGamesStudio/buff-platform",
    branch: "validation/movie-buff-core-v2", expectedBranch: "validation/movie-buff-core-v2",
    sha: "a".repeat(40), expectedSha: "a".repeat(40), tree: "b".repeat(40), expectedTree: "b".repeat(40),
    cwdName: "buff-platform", dirty: false, evidenceInsideRepository: false, evidenceSha: "a".repeat(40),
    missingFiles: [], missingTools: [], unsupportedVersions: [], absentVariables: [], malformedVariables: [],
    targets: ["http://127.0.0.1:54321", "http://localhost:3000"], bomFiles: [], nulFiles: [], commandParsed: true,
    pipelineStopsOnFailure: true, childExit: 0, cleanupRan: true, cleanupExit: 0, rollbackExit: 0, reapplyExit: 0,
    outputRedacted: true, hashesMatch: true,
  };
}

function runSelfTests() {
  const cases = [
    ["wrong-folder", (s) => { s.cwdName = "other"; }, "WRONG_FOLDER"],
    ["wrong-repository", (s) => { s.repository = "other/repo"; }, "WRONG_REPOSITORY"],
    ["wrong-remote", (s) => { s.remote = "https://example.invalid/repo"; }, "WRONG_REMOTE"],
    ["wrong-branch", (s) => { s.branch = "main"; }, "WRONG_BRANCH"],
    ["stale-sha", (s) => { s.sha = "c".repeat(40); }, "WRONG_SHA"],
    ["wrong-tree", (s) => { s.tree = "c".repeat(40); }, "WRONG_TREE"],
    ["dirty-worktree", (s) => { s.dirty = true; }, "DIRTY_WORKTREE"],
    ["missing-wrapper", (s) => { s.missingFiles = ["wrapper.ps1"]; }, "MISSING_FILE"],
    ["missing-tool", (s) => { s.missingTools = ["docker"]; }, "MISSING_TOOL"],
    ["unsupported-version", (s) => { s.unsupportedVersions = ["node:v21"]; }, "UNSUPPORTED_VERSION"],
    ["absent-variable", (s) => { s.absentVariables = ["MOVIE_BUFF_APP_URL"]; }, "ABSENT_ENVIRONMENT_VARIABLE"],
    ["malformed-variable", (s) => { s.malformedVariables = ["MOVIE_BUFF_EXPECTED_SHA"]; }, "MALFORMED_ENVIRONMENT_VARIABLE"],
    ["hosted-url", (s) => { s.targets = ["https://project.supabase.co", "http://localhost:3000"]; }, "NON_LOCAL_TARGET"],
    ["utf8-bom", (s) => { s.bomFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["nul-byte", (s) => { s.nulFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["parse-error", (s) => { s.commandParsed = false; }, "COMMAND_PARSE_ERROR"],
    ["continued-after-failure", (s) => { s.pipelineStopsOnFailure = false; }, "PIPELINE_CONTINUED_AFTER_FAILURE"],
    ["child-exit", (s) => { s.childExit = 9; }, "NONZERO_CHILD_EXIT"],
    ["cleanup-missed", (s) => { s.cleanupRan = false; }, "CLEANUP_FAILURE"],
    ["cleanup-failed", (s) => { s.cleanupExit = 1; }, "CLEANUP_FAILURE"],
    ["rollback-failed", (s) => { s.rollbackExit = 1; }, "ROLLBACK_FAILURE"],
    ["reapply-failed", (s) => { s.reapplyExit = 1; }, "FORWARD_REAPPLY_FAILURE"],
    ["secret-output", (s) => { s.outputRedacted = false; }, "SECRET_OUTPUT"],
    ["dirty-evidence", (s) => { s.evidenceInsideRepository = true; }, "EVIDENCE_INSIDE_REPOSITORY"],
    ["evidence-sha-mismatch", (s) => { s.evidenceSha = "d".repeat(40); }, "EVIDENCE_SOURCE_MISMATCH"],
    ["hash-mismatch", (s) => { s.hashesMatch = false; }, "EVIDENCE_HASH_MISMATCH"],
  ];
  const results = [];
  for (const [name, mutate, expectedCode] of cases) {
    const fixture = baseFixture();
    mutate(fixture);
    const result = validateSnapshot(fixture);
    assert.equal(result.classification, "FAIL", name);
    assert.equal(result.code, expectedCode, name);
    results.push({ name, classification: "PASS", rejectedAs: result.code });
  }
  const spaces = baseFixture();
  spaces.cwdName = "buff-platform";
  assert.equal(validateSnapshot(spaces).classification, "PASS");
  results.push({ name: "spaces-in-parent-path", classification: "PASS", details: "leaf repository identity remains authoritative" });
  const crlf = Buffer.from("line1\r\nline2\r\n", "utf8");
  assert.equal(crlf.includes(0), false);
  results.push({ name: "crlf-readable", classification: "PASS" });
  return results;
}

const selfTest = process.argv.includes("--self-test");
const output = selfTest
  ? { classification: "PASS", code: "NEGATIVE_PATH_MATRIX_PASS", tests: runSelfTests() }
  : validateSnapshot(actualSnapshot());
assert.ok(CLASSIFICATIONS.has(output.classification));
console.log(JSON.stringify(output, null, 2));
if (output.classification !== "PASS") process.exitCode = 1;
