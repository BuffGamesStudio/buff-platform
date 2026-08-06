import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
if (!expectedGitSha) {
  throw new Error("MOVIE_BUFF_EXPECTED_GIT_SHA is required.");
}

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedGitSha, "checkout HEAD does not match expected SHA");

for (const [value, label] of [
  [process.env.NEXT_PUBLIC_SUPABASE_URL, "Supabase"],
  [process.env.MOVIE_BUFF_APP_URL, "application"],
]) {
  if (!value) {
    throw new Error(`${label} URL is required.`);
  }
  const target = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${target.origin}.`);
  }
}

await import("./movie-buff-vip-authority-personas-impl.mjs");

const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-authority-persona-evidence.json",
);
const evidence = JSON.parse(fs.readFileSync(outputPath, "utf8"));
evidence.gitSha = gitSha;
evidence.expectedGitSha = expectedGitSha;
evidence.entrypoint = "scripts/movie-buff-vip-authority-personas.mjs";
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
