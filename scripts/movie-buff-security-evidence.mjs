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

// MOV-15: strict-three source and evidence binding.
const mov15MigrationPath =
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql";
const mov15Migration = read(mov15MigrationPath);
const waitingRoomPath = "src/app/games/movie-buff/waiting-room/page.tsx";
const waitingRoom = read(waitingRoomPath);
const mov15EvidenceRunnerPath =
  "scripts/movie-buff-public-matchmaking-evidence-runner.mjs";
const mov15EvidenceRunner = read(mov15EvidenceRunnerPath);

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
      claimType: "race-safety",
      details:
        "Source structure cannot prove repeated concurrent convergence, late-third handling, or external row-lock waiting.",
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

if (!mov15EvidenceRunner) {
  checks.push(unavailable("MOV-15 exact-SHA evidence wrapper", mov15EvidenceRunnerPath));
} else {
  const bindsCheckout =
    /execFileSync\("git", \["rev-parse", "HEAD"\]/.test(mov15EvidenceRunner) &&
    /checkoutSha !== exactSha/.test(mov15EvidenceRunner) &&
    /MOVIE_BUFF_EXPECTED_GIT_SHA:\s*exactSha/.test(mov15EvidenceRunner) &&
    /exactSha,\s*checkoutSha,/.test(mov15EvidenceRunner);
  checks.push(
    staticCheck({
      name: "MOV-15 manifest and child bind to one exact checkout SHA",
      classification: bindsCheckout ? "PASS" : "FAIL",
      details: {
        bindsCheckout,
        sha256: sha256(mov15EvidenceRunner),
      },
      artifacts: [mov15EvidenceRunnerPath],
    }),
  );
}

// MOV-16: authority, finalization, and behavioral evidence source coverage.
const vipMigrationPath =
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const vipMigration = read(vipMigrationPath);
const vipFinalizerPath =
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql";
const vipFinalizer = read(vipFinalizerPath);
const roundIntroPath = "src/app/games/movie-buff/round-intro/page.tsx";
const roundIntro = read(roundIntroPath);
const vipTestsPath = "supabase/tests/movie_buff_vip_authority_test.sql";
const vipTests = read(vipTestsPath);
const vipPersonaPath = "scripts/movie-buff-vip-authority-personas.mjs";
const vipPersona = read(vipPersonaPath);
const vipAdversarialPath = "scripts/movie-buff-vip-authority-adversarial.mjs";
const vipAdversarial = read(vipAdversarialPath);
const vipFinalizeAdversarialPath = "scripts/movie-buff-vip-finalize-adversarial.mjs";
const vipFinalizeAdversarial = read(vipFinalizeAdversarialPath);

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
      name: "MOV-16 selection-window and activation-window source separation",
      classification: laterPhaseSelectionBlocked ? "FAIL" : "PASS",
      details: {
        laterPhaseSelectionBlocked,
        note:
          "This PASS is limited to absence of the previously confirmed Round Intro-only source restriction.",
      },
      artifacts: [vipMigrationPath],
    }),
  );

  checks.push(
    staticCheck({
      name: "MOV-16 duplicate lock and consumption race behavior",
      classification: "UNKNOWN",
      claimType: "race-safety",
      details:
        "Concurrency safety requires execution against a database target; source inspection is insufficient.",
      artifacts: [vipMigrationPath],
    }),
  );
}

if (!vipFinalizer) {
  checks.push(unavailable("MOV-16 deadline finalizer source", vipFinalizerPath));
} else {
  const hasFinalizerContract =
    /finalize_movie_buff_vip_round_window/.test(vipFinalizer) &&
    /movie-buff-vip-window\|/.test(vipFinalizer) &&
    /deadline_at is distinct from p_deadline_at/i.test(vipFinalizer) &&
    /'deadline-pass:'/i.test(vipFinalizer) &&
    /'advanceReady', true/.test(vipFinalizer) &&
    /to service_role/i.test(vipFinalizer) &&
    !/to authenticated/i.test(
      vipFinalizer.split(/grant execute on function/i).at(-1) ?? "",
    );
  checks.push(
    staticCheck({
      name: "MOV-16 service-only deadline finalization boundary",
      classification: hasFinalizerContract ? "PASS" : "FAIL",
      details: {
        hasFinalizerContract,
        sha256: sha256(vipFinalizer),
      },
      artifacts: [vipFinalizerPath],
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
  checks.push(unavailable("MOV-16 structural database-test source", vipTestsPath));
} else {
  checks.push(
    staticCheck({
      name: "MOV-16 structural pgTAP source is present",
      classification: /select plan\(/i.test(vipTests) ? "PASS" : "FAIL",
      claimType: "test-coverage",
      details: {
        note:
          "Structural pgTAP presence does not prove database behavior and is evaluated separately from persona harness coverage.",
        sha256: sha256(vipTests),
      },
      artifacts: [vipTestsPath],
    }),
  );
}

const personaHarnesses = [
  [vipPersonaPath, vipPersona],
  [vipAdversarialPath, vipAdversarial],
  [vipFinalizeAdversarialPath, vipFinalizeAdversarial],
];
const presentPersonaHarnesses = personaHarnesses.filter(([, source]) => source);
const harnessesLocalAndShaBound =
  presentPersonaHarnesses.length === personaHarnesses.length &&
  presentPersonaHarnesses.every(([, source]) =>
    /localhost|127\.0\.0\.1/.test(source) &&
    /git["'], \["rev-parse", "HEAD"\]/.test(source) &&
    /MOVIE_BUFF_EXPECTED_GIT_SHA/.test(source),
  );
checks.push(
  staticCheck({
    name: "MOV-16 executable persona/adversarial source coverage",
    classification:
      presentPersonaHarnesses.length === 0
        ? "UNKNOWN"
        : harnessesLocalAndShaBound
          ? "PASS"
          : "FAIL",
    claimType: "test-coverage",
    details: {
      presentHarnesses: presentPersonaHarnesses.map(([file]) => file),
      harnessesLocalAndShaBound,
      note: "Source coverage is not execution proof.",
    },
    artifacts: presentPersonaHarnesses.map(([file]) => file),
  }),
);
checks.push(
  staticCheck({
    name: "MOV-16 persona, privacy, finalizer, and exactly-once behavior",
    classification: "UNKNOWN",
    claimType: "behavior",
    details: "Committed harnesses require exact-SHA database execution and raw evidence.",
    artifacts: presentPersonaHarnesses.map(([file]) => file),
  }),
);

// MOV-17: participant-controller and exact-SHA proof integrity.
const mov17AlignmentPath =
  "supabase/migrations/20260804083400_movie_buff_phase_contract_alignment.sql";
const mov17Alignment = read(mov17AlignmentPath);
const mov17BusterPath =
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql";
const mov17Buster = read(mov17BusterPath);
const mov17EvidenceRunnerPath =
  "scripts/movie-buff-three-client-phase-evidence-runner.mjs";
const mov17EvidenceRunner = read(mov17EvidenceRunnerPath);

if (!mov17Alignment || !mov17Buster) {
  checks.push(
    unavailable(
      "MOV-17 non-seat system and safe-boundary Buster contract",
      !mov17Alignment ? mov17AlignmentPath : mov17BusterPath,
    ),
  );
} else {
  const controllerConstraint =
    /controller_type in \('human', 'buster'\)/.test(mov17Alignment);
  const stagesSystemSeat =
    /controller_type\s*:?=\s*'system'/.test(mov17Buster) ||
    /controller_type\s*=\s*'system'/.test(mov17Buster);
  const preservesAbandonedHuman =
    /new\.controller_type := 'human'/.test(mov17Buster) &&
    /new\.controller_player_id := new\.original_player_id/.test(mov17Buster);
  const activatesBusterAtBoundary =
    /participant_state = 'abandoned'/.test(mov17Buster) &&
    /controller_type = 'buster'/.test(mov17Buster) &&
    /replacement_ready_at <= v_now/.test(mov17Buster);
  checks.push(
    staticCheck({
      name: "MOV-17 system remains non-seat and Buster activates at a safe boundary",
      classification:
        controllerConstraint &&
        !stagesSystemSeat &&
        preservesAbandonedHuman &&
        activatesBusterAtBoundary
          ? "PASS"
          : "FAIL",
      details: {
        controllerConstraint,
        stagesSystemSeat,
        preservesAbandonedHuman,
        activatesBusterAtBoundary,
        alignmentSha256: sha256(mov17Alignment),
        busterSha256: sha256(mov17Buster),
      },
      artifacts: [mov17AlignmentPath, mov17BusterPath],
    }),
  );
}

if (!mov17EvidenceRunner) {
  checks.push(unavailable("MOV-17 exact-SHA three-client wrapper", mov17EvidenceRunnerPath));
} else {
  const wrapperIntegrity =
    /MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION/.test(mov17EvidenceRunner) &&
    /checkoutSha !== exactSha/.test(mov17EvidenceRunner) &&
    /sourceHashes/.test(mov17EvidenceRunner) &&
    /stdoutSha256/.test(mov17EvidenceRunner) &&
    /stderrSha256/.test(mov17EvidenceRunner) &&
    /profilesRestored/.test(mov17EvidenceRunner);
  checks.push(
    staticCheck({
      name: "MOV-17 three-client evidence wrapper integrity",
      classification: wrapperIntegrity ? "PASS" : "FAIL",
      details: {
        wrapperIntegrity,
        sha256: sha256(mov17EvidenceRunner),
      },
      artifacts: [mov17EvidenceRunnerPath],
    }),
  );
  checks.push(
    staticCheck({
      name: "MOV-17 synchronized three-client phase journey",
      classification: "UNKNOWN",
      claimType: "synchronization",
      details: "The exact-SHA wrapper and child proof are present but unexecuted.",
      artifacts: [mov17EvidenceRunnerPath],
    }),
  );
}

// MOV-18: real loader adapter and fail-closed surface are separate components.
const riveCanvasPath =
  "src/components/movie-buff/visual/MovieBuffRiveCanvas.tsx";
const riveCanvas = read(riveCanvasPath);
const riveSurfacePath =
  "src/components/movie-buff/visual/MovieBuffRiveSurface.tsx";
const riveSurface = read(riveSurfacePath);

if (!riveCanvas || !riveSurface) {
  checks.push(
    unavailable(
      "MOV-18 asset and renderer failure boundary",
      !riveCanvas ? riveCanvasPath : riveSurfacePath,
    ),
  );
} else {
  const actualRiveRuntime =
    /@rive-app\/react-webgl2/.test(riveCanvas) &&
    /useRive\s*\(/.test(riveCanvas) &&
    /onLoadError:\s*onRuntimeError/.test(riveCanvas);
  const surfaceWiresRuntimeFailure =
    /<MovieBuffRiveCanvas/.test(riveSurface) &&
    /onRuntimeError=\{\(\) => setAssetStatus\("failed"\)\}/.test(riveSurface);
  const surfaceChecksAsset =
    /method:\s*"HEAD"/.test(riveSurface) &&
    /response\.ok \? "ready" : "failed"/.test(riveSurface);
  const divOwnsErrorHandler = /<div[\s\S]{0,500}onError=/.test(riveSurface);

  checks.push(
    staticCheck({
      name: "MOV-18 actual Rive loader reports renderer failure to static surface",
      classification:
        actualRiveRuntime &&
        surfaceWiresRuntimeFailure &&
        surfaceChecksAsset &&
        !divOwnsErrorHandler
          ? "PASS"
          : "FAIL",
      details: {
        actualRiveRuntime,
        surfaceWiresRuntimeFailure,
        surfaceChecksAsset,
        divOwnsErrorHandler,
        canvasSha256: sha256(riveCanvas),
        surfaceSha256: sha256(riveSurface),
      },
      artifacts: [riveCanvasPath, riveSurfacePath],
    }),
  );

  checks.push(
    staticCheck({
      name: "MOV-18 production asset load and rendered accessibility behavior",
      classification: "UNKNOWN",
      claimType: "accessibility",
      details:
        "Source wiring and focused tests cannot prove real .riv parse/init, browser rendering, hydration, focus, keyboard, or screen-reader behavior.",
      artifacts: [riveCanvasPath, riveSurfacePath],
    }),
  );
}

const bundle = {
  schemaVersion: 3,
  repository: "BuffGamesStudio/buff-platform",
  sha,
  branch,
  target: {
    kind: "repository-static",
    identity: root,
  },
  generatedAt: new Date().toISOString(),
  evidencePolicy: {
    staticMayProve: ["directly present defect", "narrow source invariant", "test source coverage"],
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
