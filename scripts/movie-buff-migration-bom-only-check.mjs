import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baselineRef = process.argv[2];
const requestedPaths = process.argv.slice(3);
const currentRef = process.env.MOVIE_BUFF_CURRENT_REF?.trim() || "HEAD";
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

if (!baselineRef) {
  throw new Error("A baseline Git ref is required.");
}

function gitShow(ref, filePath) {
  const result = spawnSync("git", ["show", `${ref}:${filePath}`], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to read ${filePath} at ${ref}: ${result.stderr?.toString("utf8") ?? "unknown Git error"}`,
    );
  }
  return result.stdout;
}

function hasUtf8Bom(bytes) {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  );
}

const results = filePaths.map((filePath) => {
  const absolutePath = path.resolve(repositoryRoot, filePath);
  if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`Refusing path outside repository: ${filePath}`);
  }
  const baselineBytes = gitShow(baselineRef, filePath);
  const currentBytes = gitShow(currentRef, filePath);
  const baselineHadBom = hasUtf8Bom(baselineBytes);
  const expectedBytes = baselineHadBom ? baselineBytes.subarray(3) : baselineBytes;
  const currentHasBom = hasUtf8Bom(currentBytes);
  const exactBomOnlyChange =
    baselineHadBom && !currentHasBom && currentBytes.equals(expectedBytes);

  return {
    path: filePath,
    classification: exactBomOnlyChange ? "PASS" : "FAIL",
    baselineHadBom,
    currentHasBom,
    baselineBytes: baselineBytes.length,
    currentBytes: currentBytes.length,
    expectedBytesAfterBomRemoval: expectedBytes.length,
  };
});

const failures = results.filter((result) => result.classification === "FAIL");
const report = {
  schemaVersion: 1,
  classification: failures.length ? "FAIL" : "PASS",
  baselineRef,
  currentRef,
  fileCount: results.length,
  failureCount: failures.length,
  results,
  generatedAt: new Date().toISOString(),
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
