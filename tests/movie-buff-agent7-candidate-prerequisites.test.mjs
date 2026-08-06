import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const lobbyPage = read("src/app/games/movie-buff/lobby/page.tsx");
const lobbyBootstrap = read(
  "src/app/games/movie-buff/lobby/LobbyAuthBootstrap.tsx",
);
const navigation = read(
  "src/components/movie-buff/MovieBuffAuthoritativeNavigation.tsx",
);
const resultsPage = read("src/app/games/movie-buff/round-results/page.tsx");
const resultsClient = read(
  "src/components/movie-buff/MovieBuffAuthoritativeResultsClient.tsx",
);
const browserHarness = read(
  "scripts/movie-buff-three-client-full-journey-v2.mjs",
);
const localUsers = read("scripts/movie-buff-core-v11-local-users.mjs");

test("lobby mounts the persisted-session bootstrap", () => {
  assert.match(lobbyPage, /import MovieBuffLobbyAuthBootstrap/);
  assert.match(lobbyPage, /<MovieBuffLobbyAuthBootstrap/);
  assert.doesNotMatch(lobbyPage, /<MovieBuffLobbyClient/);
});

test("persisted-session bootstrap treats an initial null as unresolved", () => {
  assert.match(lobbyBootstrap, /subscribeToAuthChanges/);
  assert.match(
    lobbyBootstrap,
    /if\s*\(user\s*===\s*null\)\s*\{\s*return false;\s*\}/s,
  );
  assert.match(lobbyBootstrap, /retryTimer\s*=\s*window\.setTimeout/);
  assert.match(
    lobbyBootstrap,
    /const retryUser\s*=\s*await getCurrentUser\(\)/,
  );
  assert.match(lobbyBootstrap, /unsubscribe\?\.\(\)/);
  assert.doesNotMatch(
    lobbyBootstrap,
    /authResolved\s*=\s*true;\s*if\s*\(!user\s*\|\|\s*user\.is_anonymous\s*===\s*true\)/s,
  );
});

test("results routing consumes the canonical room-scoped route", () => {
  assert.match(navigation, /"\/games\/movie-buff\/round-results"/);
  assert.match(
    navigation,
    /roomId=\$\{encodeURIComponent\(roomId\)\}&round=\$\{encodeURIComponent\(String\(roundNumber\)\)\}/,
  );
  assert.match(resultsPage, /resolved\?\.roomId/);
  assert.doesNotMatch(resultsPage, /resolved\?\.roundId|roundIdValue/);
  assert.match(
    resultsPage,
    /<MovieBuffAuthoritativeResultsClient roomId=\{roomId\}/,
  );
  assert.match(resultsClient, /Synchronized Results/);
  assert.match(resultsClient, /Return to board/);
  assert.match(resultsClient, /The server rotates the selector and advances automatically/);
});

test("browser laboratory covers the complete required journey", () => {
  const requiredChecks = [
    "three-independent-chromium-processes",
    "desktop-mobile-and-reduced-motion-profiles",
    "three-authenticated-public-players",
    "waiting-room-three-player-convergence-and-automatic-start",
    "round-intro-private-vip-lock-and-shared-countdown",
    "cinematic-board-selector-only-control-and-observers",
    "keyboard-selector-tile-choice",
    "cinematic-transition-shared-playback-start",
    "stale-client-rejected",
    "synchronized-automatic-playback",
    "refresh-restores-authoritative-session",
    "offline-reconnect-restores-authoritative-session",
    "shared-answer-deadline",
    "browser-back-forward-reconciles-to-authoritative-phase",
    "synchronized-results-automatic-return-countdown",
    "automatic-board-return-selector-rotation-used-tile-buster",
    "mov18-missing-asset-static-fallback",
    "mov18-reduced-motion-static-fallback",
    "mov18-responsive-accessible-preview-used-tile-treatment",
    "no-hydration-runtime-console-or-unexpected-network-failures",
  ];

  for (const check of requiredChecks) {
    assert.match(browserHarness, new RegExp(check.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "Start Round",
    "Continue to Clip Round",
    "Current live flow",
    "Next Round",
    "Waiting for host to click",
  ]) {
    assert.match(browserHarness, new RegExp(forbidden));
  }

  assert.match(browserHarness, /Refusing non-local target/);
  assert.match(browserHarness, /new Set\(roomIds\)\.size, 1/);
  assert.match(browserHarness, /phaseVersion/);
  assert.match(browserHarness, /playbackStartsAt/);
  assert.match(browserHarness, /answerDeadlineAt/);
  assert.match(browserHarness, /resultsEndAt/);
  assert.match(browserHarness, /expectedFallbackResponses/);
  assert.match(browserHarness, /pageErrors\.length, 0/);
  assert.match(browserHarness, /consoleErrors\.length, 0/);
  assert.match(browserHarness, /failedResponses\.length, 0/);
});

test("disposable identities refuse non-local Supabase", () => {
  assert.match(localUsers, /127\.0\.0\.1/);
  assert.match(localUsers, /localhost/);
  assert.match(localUsers, /::1/);
  assert.match(localUsers, /Refusing non-local Supabase target/);
});
