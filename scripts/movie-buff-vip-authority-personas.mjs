import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();

if (!supabaseUrl || !appUrl || !expectedGitSha) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, MOVIE_BUFF_APP_URL, and MOVIE_BUFF_EXPECTED_GIT_SHA are required.",
  );
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed.origin;
}

requireLocal(supabaseUrl, "Supabase");
requireLocal(appUrl, "application");

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(gitSha, expectedGitSha, "checkout HEAD does not match expected SHA");

const implementationUrl = new URL(
  "./movie-buff-vip-authority-personas-impl.mjs",
  import.meta.url,
);
const implementationSource = fs.readFileSync(implementationUrl, "utf8");
const preservedBehaviorContract = [
  "unowned VIP is rejected",
  "exhausted quantity is rejected",
  "wrong room is rejected",
  "wrong round is rejected",
  "nonmember is rejected",
  "private unused selection does not leak",
  "reconnect restores lock",
  "activation consumes exactly once",
  "inactive client cannot stall",
  "missing window and inventory model fails closed",
];
for (const term of preservedBehaviorContract) {
  assert.match(
    implementationSource,
    new RegExp(term, "i"),
    `preserved persona implementation is missing behavior: ${term}`,
  );
}

await import(implementationUrl.href);

const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-authority-persona-evidence.json",
);
const evidence = JSON.parse(fs.readFileSync(outputPath, "utf8"));
evidence.gitSha = gitSha;
evidence.expectedGitSha = expectedGitSha;
evidence.entrypoint = "scripts/movie-buff-vip-authority-personas.mjs";
evidence.implementation = "scripts/movie-buff-vip-authority-personas-impl.mjs";
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
