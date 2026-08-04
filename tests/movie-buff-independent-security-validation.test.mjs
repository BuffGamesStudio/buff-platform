import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = process.env.MOVIE_BUFF_VALIDATION_ROOT
  ? path.resolve(process.env.MOVIE_BUFF_VALIDATION_ROOT)
  : path.resolve(here, "..");

function read(relativePath) {
  const fullPath = path.join(repositoryRoot, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null;
}

const collector = read("scripts/movie-buff-security-evidence.mjs");
const mov15MigrationPath =
  "supabase/migrations/20260804081500_movie_buff_atomic_three_player_matchmaking.sql";
const mov15Migration = read(mov15MigrationPath);
const waitingRoom = read("src/app/games/movie-buff/waiting-room/page.tsx");
const mov15EvidenceRunner = read(
  "scripts/movie-buff-public-matchmaking-evidence-runner.mjs",
);
const vipMigrationPath =
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const vipMigration = read(vipMigrationPath);
const vipFinalizer = read(
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
);
const roundIntro = read("src/app/games/movie-buff/round-intro/page.tsx");
const vipPersona = read("scripts/movie-buff-vip-authority-personas.mjs");
const vipAdversarial = read("scripts/movie-buff-vip-authority-adversarial.mjs");
const vipFinalizeAdversarial = read(
  "scripts/movie-buff-vip-finalize-adversarial.mjs",
);
const mov17Alignment = read(
  "supabase/migrations/20260804083400_movie_buff_phase_contract_alignment.sql",
);
const mov17Buster = read(
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql",
);
const mov17EvidenceRunner = read(
  "scripts/movie-buff-three-client-phase-evidence-runner.mjs",
);
const riveCanvas = read(
  "src/components/movie-buff/visual/MovieBuffRiveCanvas.tsx",
);
const riveSurface = read(
  "src/components/movie-buff/visual/MovieBuffRiveSurface.tsx",
);

test("target root and exact SHA are explicit for exact-SHA runs", (t) => {
  if (!process.env.MOVIE_BUFF_VALIDATION_ROOT || !process.env.MOVIE_BUFF_VALIDATION_SHA) {
    t.skip("Set MOVIE_BUFF_VALIDATION_ROOT and MOVIE_BUFF_VALIDATION_SHA for exact-SHA validation.");
    return;
  }

  assert.ok(path.isAbsolute(repositoryRoot));
  assert.match(process.env.MOVIE_BUFF_VALIDATION_SHA, /^[0-9a-f]{40}$/i);
});

test("collector forbids static proof of behavioral claims", () => {
  assert.ok(collector, "security evidence collector must exist");
  assert.match(collector, /proofScope:\s*"repository-static"/);
  assert.match(collector, /staticMayNotProve/);
  assert.match(collector, /race safety/i);
  assert.match(collector, /hosted state/i);
  assert.doesNotMatch(
    collector,
    /claimType:\s*"behavior"[\s\S]{0,300}classification:\s*"PASS"/i,
  );
  assert.doesNotMatch(
    collector,
    /claimType:\s*"synchronization"[\s\S]{0,300}classification:\s*"PASS"/i,
  );
});

test("collector evaluates current separated loader, persona, and phase evidence paths", () => {
  assert.ok(collector);
  assert.match(collector, /MovieBuffRiveCanvas\.tsx/);
  assert.match(collector, /MovieBuffRiveSurface\.tsx/);
  assert.match(collector, /movie-buff-vip-authority-personas\.mjs/);
  assert.match(collector, /movie-buff-vip-authority-adversarial\.mjs/);
  assert.match(collector, /movie-buff-vip-finalize-adversarial\.mjs/);
  assert.match(collector, /movie-buff-three-client-phase-evidence-runner\.mjs/);
  assert.match(collector, /20260804073300_movie_buff_vip_deadline_finalize\.sql/);
  assert.match(collector, /20260804083200_movie_buff_buster_safe_boundary\.sql/);
});

test("MOV-15 static source declares strict-three compatibility guards", (t) => {
  if (!mov15Migration) {
    t.skip(`${mov15MigrationPath} is absent from this exact checkout.`);
    return;
  }

  assert.match(mov15Migration, /movie_buff_public_match_size\(\)/);
  assert.match(mov15Migration, /select\s+3\s*;/i);
  assert.match(mov15Migration, /public_matchmaking_key/i);
  assert.match(mov15Migration, /unique\s+index/i);
  assert.doesNotMatch(mov15Migration, /skip\s+locked/i);
});

test("public waiting-room source has no known two-player browser start rule", (t) => {
  if (!waitingRoom) {
    t.skip("Waiting-room source is absent from this exact checkout.");
    return;
  }

  assert.doesNotMatch(waitingRoom, /players\.length\s*>=\s*2/i);
  assert.doesNotMatch(waitingRoom, /autoStartTimer/i);
  assert.doesNotMatch(waitingRoom, /},\s*350\s*\)/);
  assert.doesNotMatch(waitingRoom, /at least 2 players are ready/i);
});

test("MOV-15 evidence wrapper binds manifest and child to checkout HEAD", (t) => {
  if (!mov15EvidenceRunner) {
    t.skip("MOV-15 evidence wrapper is absent from this exact checkout.");
    return;
  }

  assert.match(
    mov15EvidenceRunner,
    /execFileSync\("git", \["rev-parse", "HEAD"\]/,
  );
  assert.match(mov15EvidenceRunner, /checkoutSha !== exactSha/);
  assert.match(mov15EvidenceRunner, /MOVIE_BUFF_EXPECTED_GIT_SHA:\s*exactSha/);
  assert.match(mov15EvidenceRunner, /exactSha,\s*checkoutSha,/);
});

test("MOV-16 definer source declares fixed safe search paths", (t) => {
  if (!vipMigration) {
    t.skip(`${vipMigrationPath} is absent from this exact checkout.`);
    return;
  }

  const definerCount = (vipMigration.match(/security definer/gi) ?? []).length;
  const safePathCount =
    (vipMigration.match(/set search_path = pg_catalog/gi) ?? []).length;
  assert.ok(definerCount > 0, "expected SECURITY DEFINER functions");
  assert.equal(
    safePathCount,
    definerCount,
    "every MOV-16 definer declaration must set pg_catalog",
  );
});

test("known later-phase VIP selection restriction is absent", (t) => {
  if (!vipMigration) {
    t.skip(`${vipMigrationPath} is absent from this exact checkout.`);
    return;
  }

  assert.doesNotMatch(
    vipMigration,
    /v_definition\.activation_window\s*<>\s*'round_intro'/i,
  );
  assert.doesNotMatch(
    vipMigration,
    /when d\.activation_window\s*<>\s*'round_intro' then 'Not permitted during Round Intro'/i,
  );
});

test("Round Intro source does not navigate from VIP readiness alone", (t) => {
  if (!roundIntro) {
    t.skip("Round Intro source is absent from this exact checkout.");
    return;
  }

  assert.doesNotMatch(
    roundIntro,
    /advanceReady[\s\S]{0,900}(router\.(push|replace)|window\.location)[\s\S]{0,300}board-preview/i,
  );
});

test("MOV-16 finalizer is service-only and writes explicit deadline passes", (t) => {
  if (!vipFinalizer) {
    t.skip("MOV-16 finalizer is absent from this exact checkout.");
    return;
  }

  assert.match(vipFinalizer, /finalize_movie_buff_vip_round_window/);
  assert.match(vipFinalizer, /movie-buff-vip-window\|/);
  assert.match(vipFinalizer, /deadline_at is distinct from p_deadline_at/i);
  assert.match(vipFinalizer, /'deadline-pass:'/i);
  assert.match(vipFinalizer, /'advanceReady', true/);
  assert.match(vipFinalizer, /to service_role/i);
});

test("MOV-16 behavioral harness sources are local and exact-SHA bound", (t) => {
  const harnesses = [vipPersona, vipAdversarial, vipFinalizeAdversarial];
  if (harnesses.some((source) => !source)) {
    t.skip("One or more MOV-16 behavioral harnesses are absent from this exact checkout.");
    return;
  }

  for (const source of harnesses) {
    assert.match(source, /localhost|127\.0\.0\.1/);
    assert.match(source, /git["'], \["rev-parse", "HEAD"\]/);
    assert.match(source, /MOVIE_BUFF_EXPECTED_GIT_SHA/);
  }
});

test("MOV-17 keeps system out of participant seats until safe Buster activation", (t) => {
  if (!mov17Alignment || !mov17Buster) {
    t.skip("MOV-17 alignment or Buster correction is absent from this exact checkout.");
    return;
  }

  assert.match(mov17Alignment, /controller_type in \('human', 'buster'\)/);
  assert.match(mov17Buster, /new\.controller_type := 'human'/);
  assert.match(
    mov17Buster,
    /new\.controller_player_id := new\.original_player_id/,
  );
  assert.doesNotMatch(mov17Buster, /controller_type\s*:?=\s*'system'/);
  assert.match(mov17Buster, /replacement_ready_at <= v_now/);
  assert.match(mov17Buster, /controller_type = 'buster'/);
});

test("MOV-17 three-client wrapper is exact-SHA local-only and restores profiles", (t) => {
  if (!mov17EvidenceRunner) {
    t.skip("MOV-17 evidence wrapper is absent from this exact checkout.");
    return;
  }

  assert.match(mov17EvidenceRunner, /MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION/);
  assert.match(mov17EvidenceRunner, /checkoutSha !== exactSha/);
  assert.match(mov17EvidenceRunner, /sourceHashes/);
  assert.match(mov17EvidenceRunner, /stdoutSha256/);
  assert.match(mov17EvidenceRunner, /stderrSha256/);
  assert.match(mov17EvidenceRunner, /profilesRestored/);
});

test("MOV-18 renderer failure is wired through the real Rive canvas", (t) => {
  if (!riveCanvas || !riveSurface) {
    t.skip("MOV-18 Rive canvas/surface is absent from this exact checkout.");
    return;
  }

  assert.match(riveCanvas, /@rive-app\/react-webgl2/);
  assert.match(riveCanvas, /useRive\s*\(/);
  assert.match(riveCanvas, /onLoadError:\s*onRuntimeError/);
  assert.match(riveSurface, /<MovieBuffRiveCanvas/);
  assert.match(
    riveSurface,
    /onRuntimeError=\{\(\) => setAssetStatus\("failed"\)\}/,
  );
  assert.match(riveSurface, /method:\s*"HEAD"/);
  assert.doesNotMatch(riveSurface, /<div[\s\S]{0,500}onError=/);
});
