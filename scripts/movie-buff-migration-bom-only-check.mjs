import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const baselineRef = process.argv[2];
const requestedPaths = process.argv.slice(3);
const currentRef = process.env.MOVIE_BUFF_CURRENT_REF?.trim() || "HEAD";
const requireClean = process.env.MOVIE_BUFF_REQUIRE_CLEAN !== "0";
const outputPath = process.env.MOVIE_BUFF_BOM_ONLY_OUTPUT
  ? path.resolve(process.env.MOVIE_BUFF_BOM_ONLY_OUTPUT)
  : null;
const repositoryRoot = path.resolve(
  process.env.MOVIE_BUFF_REPOSITORY_ROOT ?? process.cwd(),
);
const defaultPaths = [
  "supabase/migrations/202607250001_start_movie_buff_match.sql",
  "supabase/migrations/202607250002_fix_start_match_ambiguity.sql",
  "supabase/migrations/202607250003_movie_buff_answers.sql",
  "supabase/migrations/202607250004_advance_movie_buff_round.sql",
  "supabase/migrations/202607250005_movie_buff_round_results.sql",
  "supabase/migrations/202607250006_exact_movie_buff_round_results.sql",
  "supabase/migrations/202607260001_movie_buff_final_results.sql",
  "supabase/migrations/202607262300_add_movie_buff_trivia_clips.sql",
  "supabase/migrations/202607270002_buff_games_content_engine.sql",
];
const filePaths = requestedPaths.length ? requestedPaths : defaultPaths;

if (!baselineRef) throw new Error("A baseline Git ref is required.");

function git(args, encoding = "utf8") {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new Error(`git ${args.join(" ")} failed: ${stderr || "unknown Git error"}`);
  }
  return result.stdout;
}

function resolveCommit(ref) {
  return git(["rev-parse", "--verify", `${ref}^{commit}`]).trim();
}

function resolveTree(ref) {
  return git(["rev-parse", "--verify", `${ref}^{tree}`]).trim();
}

function gitShow(ref, filePath) {
  return git(["show", `${ref}:${filePath}`], null);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasUtf8Bom(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function isValidUtf8(bytes) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function validateRelativeRepositoryPath(filePath) {
  if (!filePath || path.isAbsolute(filePath)) {
    throw new Error(`Refusing path outside repository: ${filePath}`);
  }
  const normalized = path.posix.normalize(filePath.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Refusing path outside repository: ${filePath}`);
  }
  return normalized;
}

const baselineSha = resolveCommit(baselineRef);
const baselineTree = resolveTree(baselineRef);
const currentSha = resolveCommit(currentRef);
const currentTree = resolveTree(currentRef);
const dirtyPaths = git(["status", "--porcelain"]).trim();
if (requireClean && dirtyPaths) {
  throw new Error("Repository worktree is dirty; byte evidence requires a clean checkout.");
}

const results = filePaths.map((requestedPath) => {
  const filePath = validateRelativeRepositoryPath(requestedPath);
  const baselineBytes = gitShow(baselineSha, filePath);
  const currentBytes = gitShow(currentSha, filePath);
  const baselineHadBom = hasUtf8Bom(baselineBytes);
  const expectedBytes = baselineHadBom ? baselineBytes.subarray(3) : baselineBytes;
  const currentHasBom = hasUtf8Bom(currentBytes);
  const currentValidUtf8 = isValidUtf8(currentBytes);
  const currentHasNul = currentBytes.includes(0x00);
  const currentNonempty = currentBytes.length > 0;
  const exactBytesAfterBomRemoval = currentBytes.equals(expectedBytes);
  const classification =
    baselineHadBom &&
    !currentHasBom &&
    currentValidUtf8 &&
    !currentHasNul &&
    currentNonempty &&
    exactBytesAfterBomRemoval
      ? "PASS"
      : "FAIL";

  return {
    path: filePath,
    classification,
    baselineHadBom,
    currentHasBom,
    currentValidUtf8,
    currentHasNul,
    currentNonempty,
    exactBytesAfterBomRemoval,
    baselineBytes: baselineBytes.length,
    currentBytes: currentBytes.length,
    expectedBytesAfterBomRemoval: expectedBytes.length,
    baselineSha256: sha256(baselineBytes),
    expectedAfterBomRemovalSha256: sha256(expectedBytes),
    currentSha256: sha256(currentBytes),
  };
});

const failures = results.filter((result) => result.classification === "FAIL");
const report = {
  schemaVersion: 2,
  classification: failures.length ? "FAIL" : "PASS",
  repositoryRoot,
  baselineRef,
  baselineSha,
  baselineTree,
  currentRef,
  currentSha,
  currentTree,
  cleanWorktree: !dirtyPaths,
  fileCount: results.length,
  failureCount: failures.length,
  results,
  generatedAt: new Date().toISOString(),
  proofScope:
    "Git blob byte identity only: current equals baseline after removal of exactly one leading EF BB BF sequence. Database, runtime, browser, hosted, staging, and production behavior are not implied.",
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
