import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const repositoryRoot = path.resolve(
  process.env.MOVIE_BUFF_REPOSITORY_ROOT ?? process.cwd(),
);
const outputPath = process.env.MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT
  ? path.resolve(process.env.MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT)
  : null;
const requestedRoots = process.argv.slice(2);
const scanRoots = requestedRoots.length
  ? requestedRoots
  : ["supabase/migrations", "supabase/rollbacks", "supabase/tests"];

function collectSqlFiles(root) {
  const absoluteRoot = path.resolve(repositoryRoot, root);
  if (!absoluteRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`Refusing scan root outside repository: ${root}`);
  }
  if (!fs.existsSync(absoluteRoot)) return [];

  const files = [];
  const pending = [absoluteRoot];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".sql")) {
        files.push(absolute);
      }
    }
  }
  return files;
}

function inspectFile(absolutePath) {
  const bytes = fs.readFileSync(absolutePath);
  const relativePath = path
    .relative(repositoryRoot, absolutePath)
    .split(path.sep)
    .join("/");
  const reasons = [];

  if (bytes.length === 0) reasons.push("EMPTY_FILE");
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    reasons.push("UTF8_BOM");
  }
  if (bytes.includes(0x00)) reasons.push("NUL_BYTE");

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    reasons.push("INVALID_UTF8");
  }

  return {
    path: relativePath,
    classification: reasons.length ? "FAIL" : "PASS",
    reasons,
    bytes: bytes.length,
  };
}

const files = scanRoots
  .flatMap(collectSqlFiles)
  .sort((left, right) => left.localeCompare(right));
const results = files.map(inspectFile);
const failures = results.filter((result) => result.classification === "FAIL");
const report = {
  schemaVersion: 1,
  classification: failures.length ? "FAIL" : "PASS",
  repositoryRoot,
  scanRoots,
  fileCount: results.length,
  failureCount: failures.length,
  failures,
  generatedAt: new Date().toISOString(),
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
