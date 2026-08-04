import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.env.MOVIE_BUFF_VALIDATION_ROOT ?? process.cwd());
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    path.join(root, "movie-buff-security-evidence.json"),
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

function staticCheck({
  name,
  classification,
  details,
  artifacts = [],
  claimType = "source-invariant",
}) {
  if (!/^(PASS|FAIL|UNKNOWN)$/.test(classification)) {
    throw new Error(`${name}: invalid classification ${classification}`);
  }

  const timestamp = new Date().toISOString();
  return {
    name,
    proofScope: "repository-static",
    claimType,
    executed: true,
    classification,
    command: `node scripts/movie-buff-security-evidence.mjs # static check: ${name}`,
    exitCode:
      classification === "PASS" ? 0 : classification === "FAIL" ? 1 : null,
    startedAt: timestamp,
    finishedAt: timestamp,
    details,
    artifacts,
  };
}

function unavailable(name, relativePath, claimType = "source-invariant") {
  return staticCheck({
    name,
    classification: "UNKNOWN",
    claimType,
    details: `${relativePath} is absent from the exact checkout under review.`,
    artifacts: [],
  });
}

const sha = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
const checks = [];

const mov15MigrationPath =
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql";
const mov15Migration = read(mov15MigrationPath);
const waitingRoomPath = "src/app/games/movie-buff/waiting-room/page.tsx";
const waitingRoom = read(waitingRoomPath);

if (!mov15Migration) {
  checks.push(unavailable("MOV-15 strict-three migration source", mov15MigrationPath));
} else {
  const hasDurableKey =
    /public_matchmaking_key/i.test(mov15Migration) &&
    /unique\s+index[\s\S]*public_waiting_compatibility_key/i.test(mov15Migration);
  const stillSkipsLocked = /skip\s+locked/i.test(mov15Migration);
  const callerControlsCapacity =
    /max_players\s*,?[\s\S]{0,300}p_max_players/i.test(mov15Migration) &&
    !/never let the caller[\s\S]{0,200}control public match capacity/i.test(
      mov15Migration,
    );

  checks.push(
    staticCheck({
      name: "MOV-15 durable normalized compatibility boundary",
      classification:
        hasDurableKey && !stillSkipsLocked && !callerControlsCapacity
          ? "PASS"
          : "FAIL",
      details: {
        hasDurableKey,
        stillSkipsLocked,
        callerControlsCapacity,
        sha256: sha256(mov15Migration),
      },
      artifacts: [mov15MigrationPath],
    }),
  );

  checks.push(
    staticCheck({
      name: "MOV-15 concurrent convergence behavior",
      classification: "UNKNOWN",
      claimType: "behavior",
      details:
        "Source structure cannot prove repeated concurrent convergence, late-third handling, or duplicate-request behavior.",
      artifacts: [mov15MigrationPath],
    }),
  );
}

if (!waitingRoom) {
  checks.push(unavailable("Public waiting-room manual authority guard", waitingRoomPath));
} else {
  const forbidden = [
    /players\.length\s*>=\s*2/i,
    /autoStartTimer/i,
    /},\s*350\s*\)/,
    /at least 2 players are ready/i,
  ].filter((pattern) => pattern.test(waitingRoom));

  checks.push(
    staticCheck({
      name: "Public waiting room has no known two-player browser start rule",
      classification: forbidden.length === 0 ? "PASS" : "FAIL",
      details: {
        forbiddenPatternCount: forbidden.length,
        sha256: sha256(waitingRoom),
      },
      artifacts: [waitingRoomPath],
    }),
  );
}

const vipMigrationPath =
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const vipMigration = read(vipMigrationPath);
const roundIntroPath = "src/app/games/movie-buff/round-intro/page.tsx";
const roundIntro = read(roundIntroPath);
const vipTestsPath = "supabase/tests/movie_buff_vip_authority_test.sql";
const vipTests = read(vipTestsPath);

if (!vipMigration) {
  checks.push(unavailable("MOV-16 migration source", vipMigrationPath));
} else {
  const definerCount = (vipMigration.match(/security definer/gi) ?? []).length;
  const safePathCount =
    (vipMigration.match(/set search_path = pg_catalog/gi) ?? []).length;
  checks.push(
    staticCheck({
      name: "MOV-16 definer functions declare fixed pg_catalog search path",
      classification:
        definerCount > 0 && definerCount === safePathCount ? "PASS" : "FAIL",
      details: {
        definerCount,
        safePathCount,
        sha256: sha256(vipMigration),
      },
      artifacts: [vipMigrationPath],
    }),
  );

  const laterPhaseSelectionBlocked =
    /v_definition\.activation_window\s*<>\s*'round_intro'/i.test(vipMigration) ||
    /when d\.activation_window\s*<>\s*'round_intro'/i.test(vipMigration);
  checks.push(
    staticCheck({
      name: "MOV-16 selection-window and activation-window separation",
      classification: laterPhaseSelectionBlocked ? "FAIL" : "UNKNOWN",
      claimType: "behavior",
      details: {
        laterPhaseSelectionBlocked,
        note:
          "Absence of the known restriction does not prove complete eligibility behavior.",
      },
      artifacts: [vipMigrationPath],
    }),
  );

  checks.push(
    staticCheck({
      name: "MOV-16 duplicate lock and consumption race behavior",
      classification: "UNKNOWN",
      claimType: "behavior",
      details:
        "Concurrency safety requires execution against a database target; source inspection is insufficient.",
      artifacts: [vipMigrationPath],
    }),
  );
}

if (!roundIntro) {
  checks.push(unavailable("Round Intro canonical phase guard", roundIntroPath));
} else {
  const browserAdvancesFromVipReady =
    /advanceReady[\s\S]{0,900}(router\.(push|replace)|window\.location)[\s\S]{0,300}board-preview/i.test(
      roundIntro,
    );
  checks.push(
    staticCheck({
      name: "Round Intro does not navigate from VIP readiness alone",
      classification: browserAdvancesFromVipReady ? "FAIL" : "PASS",
      details: {
        browserAdvancesFromVipReady,
        sha256: sha256(roundIntro),
      },
      artifacts: [roundIntroPath],
    }),
  );
}

if (!vipTests) {
  checks.push(unavailable("MOV-16 behavioral database-test source", vipTestsPath));
} else {
  const structuralOnly =
    !/set_config\s*\(\s*'request\.jwt\.claims'/i.test(vipTests) &&
    !/(throws_ok|lives_ok)\s*\(/i.test(vipTests);
  checks.push(
    staticCheck({
      name: "MOV-16 database tests include executable persona setup",
      classification: structuralOnly ? "FAIL" : "UNKNOWN",
      claimType: "test-coverage",
      details: {
        structuralOnly,
        note:
          "Presence of persona setup would still require an executed pgTAP result before behavior can PASS.",
        sha256: sha256(vipTests),
      },
      artifacts: [vipTestsPath],
    }),
  );
}

const riveSurfacePath =
  "src/components/movie-buff/visual/MovieBuffRiveSurface.tsx";
const riveSurface = read(riveSurfacePath);
if (!riveSurface) {
  checks.push(unavailable("MOV-18 asset failure surface", riveSurfacePath));
} else {
  const divOwnsErrorHandler = /<div[\s\S]{0,500}onError=/.test(riveSurface);
  const actualRiveRuntime = /@rive-app\/react-webgl2/.test(riveSurface);
  checks.push(
    staticCheck({
      name: "MOV-18 missing-asset failure callback is attached to an actual loader",
      classification:
        actualRiveRuntime && !divOwnsErrorHandler ? "PASS" : "FAIL",
      details: {
        actualRiveRuntime,
        divOwnsErrorHandler,
        note:
          "A div error handler does not prove or receive a failed .riv asset load.",
        sha256: sha256(riveSurface),
      },
      artifacts: [riveSurfacePath],
    }),
  );
}

const bundle = {
  schemaVersion: 2,
  repository: "BuffGamesStudio/buff-platform",
  sha,
  branch,
  target: {
    kind: "repository-static",
    identity: root,
  },
  generatedAt: new Date().toISOString(),
  evidencePolicy: {
    staticMayProve: ["directly present defect", "narrow source invariant"],
    staticMayNotProve: [
      "runtime behavior",
      "race safety",
      "synchronization",
      "hosted state",
      "accessibility",
      "rollback execution",
    ],
  },
  checks,
};

fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, sha, branch, checks }, null, 2));

if (checks.some((check) => check.classification === "FAIL")) {
  process.exitCode = 1;
}
