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
const vipMigrationPath =
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const vipMigration = read(vipMigrationPath);
const roundIntro = read("src/app/games/movie-buff/round-intro/page.tsx");
const vipDatabaseTests = read("supabase/tests/movie_buff_vip_authority_test.sql");
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

test("MOV-16 pgTAP source includes persona execution, not only catalog checks", (t) => {
  if (!vipDatabaseTests) {
    t.skip("MOV-16 pgTAP source is absent from this exact checkout.");
    return;
  }

  const hasJwtPersonaSetup =
    /set_config\s*\(\s*'request\.jwt\.claims'/i.test(vipDatabaseTests);
  const hasBehaviorAssertions = /(throws_ok|lives_ok)\s*\(/i.test(vipDatabaseTests);
  assert.ok(
    hasJwtPersonaSetup || hasBehaviorAssertions,
    "structural catalog assertions do not prove MOV-16 persona behavior",
  );
});

test("MOV-18 asset failure is wired to an actual loader", (t) => {
  if (!riveSurface) {
    t.skip("MOV-18 Rive surface is absent from this exact checkout.");
    return;
  }

  assert.match(riveSurface, /@rive-app\/react-webgl2/);
  assert.doesNotMatch(riveSurface, /<div[\s\S]{0,500}onError=/);
});
