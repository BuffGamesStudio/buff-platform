import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const requiredConsent = "YES_I_UNDERSTAND_LOCAL_ONLY";
const consent = process.env.MOVIE_BUFF_ALLOW_LOCAL_DESTRUCTIVE_TESTS;
const exactSha = process.env.MOVIE_BUFF_EXACT_SHA?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-public-matchmaking-race-evidence.json",
);
const manifestPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_MANIFEST ??
    `${outputPath}.manifest.json`,
);

if (consent !== requiredConsent) {
  throw new Error(
    `Set MOVIE_BUFF_ALLOW_LOCAL_DESTRUCTIVE_TESTS=${requiredConsent} to run disposable local cleanup.`,
  );
}

if (!exactSha || !/^[0-9a-f]{40}$/i.test(exactSha)) {
  throw new Error("MOVIE_BUFF_EXACT_SHA must contain the exact 40-character Git commit SHA under test.");
}

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
}

const target = new URL(supabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local Supabase target ${target.origin}.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const scriptPath = path.resolve("scripts/movie-buff-public-matchmaking-race.mjs");
const command = [process.execPath, scriptPath];
const startedAt = new Date().toISOString();
let stdout = "";
let stderr = "";

const child = spawn(command[0], command.slice(1), {
  cwd: process.cwd(),
  env: {
    ...process.env,
    MOVIE_BUFF_EVIDENCE_OUTPUT: outputPath,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code ?? 1));
});

const finishedAt = new Date().toISOString();
const evidenceExists = fs.existsSync(outputPath);
const evidenceBytes = evidenceExists ? fs.readFileSync(outputPath) : Buffer.alloc(0);
const manifest = {
  schemaVersion: 1,
  lane: "MOV-15",
  exactSha,
  target: {
    kind: "local",
    origin: target.origin,
    hostname: target.hostname,
  },
  consentValue: requiredConsent,
  command,
  startedAt,
  finishedAt,
  exitCode,
  stdoutSha256: sha256(stdout),
  stderrSha256: sha256(stderr),
  evidencePath: outputPath,
  evidencePresent: evidenceExists,
  evidenceSha256: evidenceExists ? sha256(evidenceBytes) : null,
  classification: exitCode === 0 && evidenceExists ? "PASS" : "FAIL",
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      manifestPath,
      classification: manifest.classification,
      exactSha,
      exitCode,
      evidenceSha256: manifest.evidenceSha256,
    },
    null,
    2,
  ),
);

process.exitCode = exitCode === 0 && evidenceExists ? 0 : 1;
