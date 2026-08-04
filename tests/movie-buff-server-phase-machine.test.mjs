import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const {
  shouldNavigateForMovieBuffPhase,
} = await import("../src/lib/game/movieBuffPhaseService.ts");

const contract = fs.readFileSync(
  "docs/product/movie-buff-server-phase-machine-v1.md",
  "utf8",
);

test("phase routes are derived from persisted phase names", () => {
  assert.equal(
    shouldNavigateForMovieBuffPhase("/games/movie-buff/round-intro", "vip_selection"),
    null,
  );
  assert.equal(
    shouldNavigateForMovieBuffPhase("/games/movie-buff/round-intro", "board"),
    "/games/movie-buff/board-preview",
  );
  assert.equal(
    shouldNavigateForMovieBuffPhase("/games/movie-buff/play", "answer"),
    null,
  );
  assert.equal(
    shouldNavigateForMovieBuffPhase("/games/movie-buff/play", "results"),
    "/games/movie-buff/round-results",
  );
});

test("contract forbids browser and animation authority", () => {
  assert.match(contract, /No browser, host, selector, animation callback, or local timer may advance/i);
  assert.match(contract, /client route change/i);
  assert.match(contract, /local countdown completion cannot advance/i);
});

test("contract preserves MOV-15, PR #3, and PR #5 boundaries", () => {
  assert.match(contract, /MOV-15 owns public admission and strict-three readiness/i);
  assert.match(contract, /PR #3 is the visual baseline/i);
  assert.match(contract, /PR #5 is the authorization baseline/i);
});

test("manual shared-flow controls are prohibited", () => {
  for (const label of [
    "Start Round",
    "Continue to Clip Round",
    "Current live flow",
    "Next Round",
    "Waiting for host to click",
  ]) {
    assert.match(contract, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
