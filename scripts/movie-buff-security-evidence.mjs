import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.env.MOVIE_BUFF_VALIDATION_ROOT ?? process.cwd());
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ?? path.join(root, "movie-buff-security-evidence.json"),
);

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function staticCheck(name, classification, details, artifacts = []) {
  return {
    name,
    executed: true,
    classification,
    command: `static inspection by scripts/movie-buff-security-evidence.mjs: ${name}`,
    exitCode: classification === "FAIL" ? 1 : classification === "PASS" ? 0 : null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    details,
    artifacts,
  };
}

const sha = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const migrationPath = "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const migration = read(migrationPath);
const introPath = "src/app/games/movie-buff/round-intro/page.tsx";
const intro = read(introPath);
const testsPath = "supabase/tests/movie_buff_vip_authority_test.sql";
const databaseTests = read(testsPath);

const checks = [];

if (!migration) {
  checks.push(staticCheck("MOV-16 migration present", "UNKNOWN", `${migrationPath} is absent.`));
} else {
  const definerCount = (migration.match(/security definer/gi) ?? []).length;
  const safePathCount = (migration.match(/set search_path = pg_catalog/gi) ?? []).length;
  checks.push(
    staticCheck(
      "MOV-16 safe definer search path",
      definerCount > 0 && definerCount === safePathCount ? "PASS" : "FAIL",
      { definerCount, safePathCount, sha256: sha256(migration) },
      [migrationPath],
    ),
  );

  const laterPhaseSelectionBlocked =
    /v_definition\.activation_window\s*<>\s*'round_intro'/i.test(migration) ||
    /when d\.activation_window\s*<>\s*'round_intro'/i.test(migration);
  checks.push(
    staticCheck(
      "Round Intro can arm later-phase VIPs",
      laterPhaseSelectionBlocked ? "FAIL" : "PASS",
      { laterPhaseSelectionBlocked },
      [migrationPath],
    ),
  );

  const activationSection = migration.split(/create or replace function public\.activate_movie_buff_round_vip/i)[1] ?? "";
  const activationRevalidates =
    /is_active/i.test(activationSection) &&
    /expires_at/i.test(activationSection) &&
    /cooldown_until/i.test(activationSection) &&
    /(match|round)_eligib|eligibility/i.test(activationSection);
  checks.push(
    staticCheck(
      "Activation-time eligibility revalidation",
      activationRevalidates ? "PASS" : "FAIL",
      { activationRevalidates },
      [migrationPath],
    ),
  );
}

if (!intro) {
  checks.push(staticCheck("Round Intro canonical transition", "UNKNOWN", `${introPath} is absent.`));
} else {
  const clientAdvancesFromReady = /view\?\.advanceReady[\s\S]{0,700}board-preview/i.test(intro);
  checks.push(
    staticCheck(
      "Round Intro waits for canonical phase",
      clientAdvancesFromReady ? "FAIL" : "PASS",
      { clientAdvancesFromReady, sha256: sha256(intro) },
      [introPath],
    ),
  );
}

if (!databaseTests) {
  checks.push(staticCheck("MOV-16 executable persona tests", "UNKNOWN", `${testsPath} is absent.`));
} else {
  const requiredTerms = [
    "wrong room",
    "wrong round",
    "nonmember",
    "unowned",
    "exhausted",
    "reconnect",
    "duplicate activation",
    "private",
  ];
  const missing = requiredTerms.filter((term) => !databaseTests.toLowerCase().includes(term));
  checks.push(
    staticCheck(
      "MOV-16 executable persona tests",
      missing.length === 0 ? "PASS" : "FAIL",
      { missing, sha256: sha256(databaseTests) },
      [testsPath],
    ),
  );
}

const bundle = {
  schemaVersion: 1,
  repository: "BuffGamesStudio/buff-platform",
  sha,
  branch,
  target: {
    kind: "repository-static",
    identity: root,
  },
  generatedAt: new Date().toISOString(),
  checks,
};

fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, sha, branch, checks }, null, 2));

if (checks.some((check) => check.classification === "FAIL")) {
  process.exitCode = 1;
}
