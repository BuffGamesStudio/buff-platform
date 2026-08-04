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

const vipMigrationPath = "supabase/migrations/20260804073000_movie_buff_vip_authority.sql";
const vipMigration = read(vipMigrationPath);
const roundIntro = read("src/app/games/movie-buff/round-intro/page.tsx");
const vipDatabaseTests = read("supabase/tests/movie_buff_vip_authority_test.sql");

test("target root and exact SHA are explicit in independent runs", (t) => {
  if (!process.env.MOVIE_BUFF_VALIDATION_ROOT || !process.env.MOVIE_BUFF_VALIDATION_SHA) {
    t.skip("Set MOVIE_BUFF_VALIDATION_ROOT and MOVIE_BUFF_VALIDATION_SHA for exact-SHA validation.");
    return;
  }

  assert.ok(path.isAbsolute(repositoryRoot));
  assert.match(process.env.MOVIE_BUFF_VALIDATION_SHA, /^[0-9a-f]{40}$/i);
});

test("VIP functions use a fixed safe search path and browser-safe grants", (t) => {
  if (!vipMigration) {
    t.skip(`${vipMigrationPath} is not present in this checkout.`);
    return;
  }

  const definerCount = (vipMigration.match(/security definer/gi) ?? []).length;
  const safePathCount = (vipMigration.match(/set search_path = pg_catalog/gi) ?? []).length;
  assert.ok(definerCount > 0, "expected SECURITY DEFINER functions");
  assert.equal(safePathCount, definerCount, "every definer function must use pg_catalog");
  assert.match(vipMigration, /revoke all on function public\.lock_movie_buff_round_vip[\s\S]+from public, anon;/i);
  assert.match(vipMigration, /grant execute on function public\.lock_movie_buff_round_vip[\s\S]+to authenticated, service_role;/i);
});

test("Round Intro selection is not restricted to VIPs activated during Round Intro", (t) => {
  if (!vipMigration) {
    t.skip(`${vipMigrationPath} is not present in this checkout.`);
    return;
  }

  assert.doesNotMatch(
    vipMigration,
    /v_definition\.activation_window\s*<>\s*'round_intro'/i,
    "later-phase VIPs must still be selectable and locked during Round Intro",
  );
  assert.doesNotMatch(
    vipMigration,
    /when d\.activation_window\s*<>\s*'round_intro' then 'Not permitted during Round Intro'/i,
    "selection window and activation window must be modeled separately",
  );
});

test("Round Intro waits for canonical phase instead of navigating from advanceReady", (t) => {
  if (!roundIntro) {
    t.skip("Round Intro is not present in this checkout.");
    return;
  }

  assert.doesNotMatch(
    roundIntro,
    /view\?\.advanceReady[\s\S]{0,700}board-preview/i,
    "advanceReady is a condition, not proof that the shared phase changed",
  );
});

test("activation revalidates expiry, cooldown, definition activity, and eligibility", (t) => {
  if (!vipMigration) {
    t.skip(`${vipMigrationPath} is not present in this checkout.`);
    return;
  }

  const activation = vipMigration.split(/create or replace function public\.activate_movie_buff_round_vip/i)[1] ?? "";
  assert.match(activation, /is_active/i);
  assert.match(activation, /expires_at/i);
  assert.match(activation, /cooldown_until/i);
  assert.match(activation, /(match|round)_eligib|eligibility/i);
});

test("database tests execute real multi-persona VIP behavior", (t) => {
  if (!vipDatabaseTests) {
    t.skip("VIP database tests are not present in this checkout.");
    return;
  }

  for (const requiredEvidence of [
    "wrong room",
    "wrong round",
    "nonmember",
    "unowned",
    "exhausted",
    "reconnect",
    "duplicate activation",
    "private",
  ]) {
    assert.match(
      vipDatabaseTests.toLowerCase(),
      new RegExp(requiredEvidence.replace(" ", "[ _-]?")),
      `missing executable persona evidence for ${requiredEvidence}`,
    );
  }
});
