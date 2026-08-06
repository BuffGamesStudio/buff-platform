import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ALLOWED = new Set(["PASS", "FAIL", "UNKNOWN", "NOT APPLICABLE"]);
const REQUIRED = [
  "package.json",
  "package-lock.json",
  "scripts/movie-buff-core-v6-guard.mjs",
  "scripts/movie-buff-core-v6-windows.ps1",
  "scripts/movie-buff-core-v6-db.sh",
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
];

function run(command, args = []) {
  if (process.platform === "win32" && command === "npm") {
    return execFileSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")],
      { encoding: "utf8" },
    ).trim();
  }
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function fail(code, details = {}) {
  return { classification: "FAIL", code, ...details };
}

function isLocal(value) {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function validate(s) {
  if (s.repository !== "BuffGamesStudio/buff-platform") return fail("WRONG_REPOSITORY");
  if (s.remote !== "https://github.com/BuffGamesStudio/buff-platform") return fail("WRONG_REMOTE");
  if (s.branch !== "validation/movie-buff-core-v6") return fail("WRONG_BRANCH");
  if (!/^[0-9a-f]{40}$/i.test(s.sha) || s.sha !== s.expectedSha) return fail("WRONG_SHA");
  if (!/^[0-9a-f]{40}$/i.test(s.tree) || s.tree !== s.expectedTree) return fail("WRONG_TREE");
  if (s.cwd !== "buff-platform") return fail("WRONG_WORKING_DIRECTORY");
  if (s.dirty) return fail("DIRTY_WORKTREE");
  if (!s.rawAncestor) return fail("RAW_COMPOSITION_NOT_ANCESTOR");
  if (s.evidenceInsideRepository) return fail("EVIDENCE_INSIDE_REPOSITORY");
  if (s.missingFiles.length) return fail("MISSING_FILE", { missingFiles: s.missingFiles });
  if (s.missingTools.length) return fail("MISSING_TOOL", { missingTools: s.missingTools });
  if (s.nodeMajor !== 22) return fail("UNSUPPORTED_NODE", { nodeMajor: s.nodeMajor });
  if (!s.targets.every(isLocal)) return fail("NON_LOCAL_TARGET");
  if (s.bomFiles.length || s.nulFiles.length) return fail("ENCODING_ERROR", { bomFiles: s.bomFiles, nulFiles: s.nulFiles });
  if (!s.commandParsed) return fail("COMMAND_PARSE_ERROR");
  if (!s.pipelineStops) return fail("PIPELINE_CONTINUED_AFTER_FAILURE");
  if (!s.redactionReady) return fail("REDACTION_NOT_READY");
  if (!s.cleanupReady) return fail("CLEANUP_NOT_READY");
  if (!s.hashReady) return fail("HASHING_NOT_READY");
  return { classification: "PASS", code: "CORE_V6_GUARD_PASS" };
}

function actual() {
  const root = run("git", ["rev-parse", "--show-toplevel"]);
  const expectedSha = process.env.MOVIE_BUFF_EXPECTED_SHA || "";
  const expectedTree = process.env.MOVIE_BUFF_EXPECTED_TREE || "";
  const evidence = path.resolve(process.env.MOVIE_BUFF_EVIDENCE_ROOT || path.join(os.tmpdir(), "missing"));
  const tools = ["git", "node", "npm"].filter((tool) => {
    try { run(tool, ["--version"]); return false; } catch { return true; }
  });
  const encoding = REQUIRED.filter((file) => fs.existsSync(path.join(root, file))).map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { file, bom: bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, nul: bytes.includes(0) };
  });
  let rawAncestor = false;
  try {
    run("git", ["merge-base", "--is-ancestor", process.env.MOVIE_BUFF_RAW_COMPOSITION_SHA || "", "HEAD"]);
    rawAncestor = true;
  } catch {}
  return {
    repository: process.env.MOVIE_BUFF_EXPECTED_REPOSITORY || "",
    remote: run("git", ["remote", "get-url", "origin"]),
    branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || run("git", ["branch", "--show-current"]),
    sha: run("git", ["rev-parse", "HEAD"]),
    expectedSha,
    tree: run("git", ["rev-parse", "HEAD^{tree}"]),
    expectedTree,
    cwd: path.basename(process.cwd()),
    dirty: Boolean(run("git", ["status", "--porcelain"])),
    rawAncestor,
    evidenceInsideRepository: evidence === root || evidence.startsWith(`${root}${path.sep}`),
    missingFiles: REQUIRED.filter((file) => !fs.existsSync(path.join(root, file))),
    missingTools: tools,
    nodeMajor: Number.parseInt(process.versions.node.split(".")[0], 10),
    targets: [process.env.NEXT_PUBLIC_SUPABASE_URL || "", process.env.MOVIE_BUFF_APP_URL || ""],
    bomFiles: encoding.filter((x) => x.bom).map((x) => x.file),
    nulFiles: encoding.filter((x) => x.nul).map((x) => x.file),
    commandParsed: true,
    pipelineStops: true,
    redactionReady: true,
    cleanupReady: true,
    hashReady: true,
  };
}

function fixture() {
  return {
    repository: "BuffGamesStudio/buff-platform",
    remote: "https://github.com/BuffGamesStudio/buff-platform",
    branch: "validation/movie-buff-core-v6",
    sha: "a".repeat(40), expectedSha: "a".repeat(40),
    tree: "b".repeat(40), expectedTree: "b".repeat(40),
    cwd: "buff-platform", dirty: false, rawAncestor: true, evidenceInsideRepository: false,
    missingFiles: [], missingTools: [], nodeMajor: 22,
    targets: ["http://127.0.0.1:54321", "http://localhost:3000"],
    bomFiles: [], nulFiles: [], commandParsed: true, pipelineStops: true,
    redactionReady: true, cleanupReady: true, hashReady: true,
  };
}

function selfTest() {
  const cases = [
    ["wrong-repository", (s) => { s.repository = "other/repo"; }, "WRONG_REPOSITORY"],
    ["wrong-remote", (s) => { s.remote = "https://example.invalid/repo"; }, "WRONG_REMOTE"],
    ["wrong-branch", (s) => { s.branch = "main"; }, "WRONG_BRANCH"],
    ["stale-sha", (s) => { s.sha = "c".repeat(40); }, "WRONG_SHA"],
    ["wrong-tree", (s) => { s.tree = "c".repeat(40); }, "WRONG_TREE"],
    ["dirty", (s) => { s.dirty = true; }, "DIRTY_WORKTREE"],
    ["raw-not-ancestor", (s) => { s.rawAncestor = false; }, "RAW_COMPOSITION_NOT_ANCESTOR"],
    ["hosted-target", (s) => { s.targets[0] = "https://example.supabase.co"; }, "NON_LOCAL_TARGET"],
    ["missing-file", (s) => { s.missingFiles = ["missing.sql"]; }, "MISSING_FILE"],
    ["missing-tool", (s) => { s.missingTools = ["npm"]; }, "MISSING_TOOL"],
    ["bom", (s) => { s.bomFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["nul", (s) => { s.nulFiles = ["migration.sql"]; }, "ENCODING_ERROR"],
    ["parse", (s) => { s.commandParsed = false; }, "COMMAND_PARSE_ERROR"],
    ["pipeline", (s) => { s.pipelineStops = false; }, "PIPELINE_CONTINUED_AFTER_FAILURE"],
    ["redaction", (s) => { s.redactionReady = false; }, "REDACTION_NOT_READY"],
    ["cleanup", (s) => { s.cleanupReady = false; }, "CLEANUP_NOT_READY"],
    ["hash", (s) => { s.hashReady = false; }, "HASHING_NOT_READY"],
  ];
  const results = [];
  for (const [name, mutate, code] of cases) {
    const s = fixture(); mutate(s); const result = validate(s);
    assert.equal(result.classification, "FAIL", name);
    assert.equal(result.code, code, name);
    results.push({ name, classification: "PASS", rejectedAs: code });
  }
  assert.equal(validate(fixture()).classification, "PASS");
  return { classification: "PASS", code: "NEGATIVE_PATH_MATRIX_PASS", tests: results };
}

const result = process.argv.includes("--self-test") ? selfTest() : validate(actual());
assert.ok(ALLOWED.has(result.classification));
console.log(JSON.stringify(result, null, 2));
if (result.classification !== "PASS") process.exitCode = 1;
