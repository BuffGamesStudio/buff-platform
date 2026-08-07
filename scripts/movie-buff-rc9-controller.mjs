import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const manifestPath = path.join(root, "docs/operations/movie-buff-rc-9-controller.json");
const outputPath = path.resolve(process.env.RC9_EVIDENCE_OUTPUT ?? path.join(process.env.RUNNER_TEMP ?? "/tmp", "movie-buff-rc9-controller.json"));

function fail(message, details = {}) {
  const report = {
    releaseCandidate: "RC-9",
    classification: "FAIL",
    message,
    details,
    generatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(`RC9_CLASSIFICATION=FAIL`);
  console.error(message);
  process.exit(1);
}

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    fail(`git ${args.join(" ")} failed`, { status: error.status ?? null });
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

if (!fs.existsSync(manifestPath)) fail("RC-9 controller manifest is missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.releaseCandidate !== "RC-9") fail("Controller manifest is not bound to RC-9");
if (manifest.repository !== "BuffGamesStudio/buff-platform") fail("Repository identity mismatch", { actual: manifest.repository });
if (manifest.branch !== "validation/movie-buff-rc-9-controller") fail("Branch identity mismatch", { actual: manifest.branch });

const actualRemote = runGit(["remote", "get-url", "origin"]).replace(/\.git$/, "");
const expectedRemote = manifest.remote.replace(/\.git$/, "");
if (actualRemote !== expectedRemote) fail("Remote identity mismatch", { expectedRemote, actualRemote });

const actualSha = runGit(["rev-parse", "HEAD"]);
const expectedSha = process.env.RC9_EXPECTED_SHA?.trim();
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) fail("RC9_EXPECTED_SHA must be an explicit full 40-character SHA");
if (actualSha !== expectedSha) fail("Exact SHA mismatch", { expectedSha, actualSha });

const actualTreeSha = runGit(["rev-parse", "HEAD^{tree}"]);
const expectedTreeSha = process.env.RC9_EXPECTED_TREE_SHA?.trim();
if (!expectedTreeSha || !/^[0-9a-f]{40}$/.test(expectedTreeSha)) fail("RC9_EXPECTED_TREE_SHA must be an explicit full 40-character tree SHA");
if (actualTreeSha !== expectedTreeSha) fail("Exact tree SHA mismatch", { expectedTreeSha, actualTreeSha });

const currentBranch = process.env.RC9_EXPECTED_BRANCH?.trim() || process.env.GITHUB_HEAD_REF?.trim() || process.env.GITHUB_REF_NAME?.trim();
if (currentBranch !== manifest.branch) fail("Runtime branch mismatch", { expected: manifest.branch, actual: currentBranch ?? null });

const dirty = runGit(["status", "--porcelain"]);
if (dirty) fail("Worktree is dirty before validation");

for (const wrapper of manifest.requiredWrappers) {
  if (!fs.existsSync(path.join(root, wrapper))) fail("Required wrapper is missing", { wrapper });
}

const migrations = [];
for (const relativePath of manifest.migrationIdentity.requiredPaths) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail("Required RC-9 migration identity is missing", { path: relativePath });
  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail("UTF-8 BOM detected in required RC-9 migration", { path: relativePath });
  }
  migrations.push({ path: relativePath, sha256: sha256File(absolutePath), bytes: bytes.length });
}

const targetVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "MOVIE_BUFF_BASE_URL",
];
for (const name of targetVariables) {
  const value = process.env[name];
  if (!value) continue;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("Malformed target URL", { variable: name });
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    fail("Non-local target refused", { variable: name, hostname: parsed.hostname });
  }
}

const manifestSha256 = sha256File(manifestPath);
const wrapperSha256 = sha256File(path.join(root, "scripts/movie-buff-rc9-controller.mjs"));
const report = {
  releaseCandidate: "RC-9",
  classification: "PASS",
  repository: manifest.repository,
  remote: manifest.remote,
  branch: manifest.branch,
  sha: actualSha,
  treeSha: actualTreeSha,
  integrationSha: manifest.integrationSha,
  integrationTreeSha: manifest.integrationTreeSha,
  controllerBaseSha: manifest.controllerBaseSha,
  componentHeads: manifest.componentHeads,
  manifestPath: path.relative(root, manifestPath).replaceAll(path.sep, "/"),
  manifestSha256,
  wrapperSha256,
  migrations,
  worktreeCleanBefore: true,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (runGit(["status", "--porcelain"])) fail("Worktree is dirty after validation");
console.log(`RC9_CLASSIFICATION=PASS`);
console.log(`RC9_SHA=${actualSha}`);
console.log(`RC9_TREE_SHA=${actualTreeSha}`);
console.log(`RC9_EVIDENCE=${outputPath}`);
