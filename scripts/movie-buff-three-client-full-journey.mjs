import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const expectedBranch = process.env.MOVIE_BUFF_EXPECTED_BRANCH?.trim();
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const buildMarker = process.env.MOVIE_BUFF_BUILD_MARKER?.trim();
const coreSha = process.env.MOVIE_BUFF_CORE_SHA?.trim();
const mov17Sha = process.env.MOVIE_BUFF_MOV17_SHA?.trim();
const mov18Sha = process.env.MOVIE_BUFF_MOV18_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR;
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;

if (
  !expectedBranch ||
  !expectedSha ||
  !buildMarker ||
  !coreSha ||
  !mov17Sha ||
  !mov18Sha ||
  !appUrl ||
  !usersPath ||
  !evidenceDir ||
  !playwrightRoot
) {
  throw new Error("Movie Buff exact identity, local target, users, evidence, and Playwright inputs are required.");
}
for (const value of [expectedSha, coreSha, mov17Sha, mov18Sha]) {
  assert.match(value, /^[0-9a-f]{40}$/i);
}

const target = new URL(appUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local application target ${target.origin}.`);
}
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, expectedSha);
execFileSync("git", ["merge-base", "--is-ancestor", coreSha, expectedSha]);
fs.mkdirSync(evidenceDir, { recursive: true });

const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.equal(users.length, 4);
const players = users.slice(0, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");

const exactMarkerText = `${expectedBranch} · ${expectedSha} · ${buildMarker}`;
const forbiddenExact = [
  "Start Round",
  "Continue to Clip Round",
  "Current live flow",
  "Next Round",
  "Waiting for host to click",
];

function redact(value) {
  return String(value)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED_SUPABASE_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED_LOCAL_DB_URL]")
    .replace(/(authorization:\s*bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .slice(0, 4000);
}

function safeUrl(value) {
  const parsed = new URL(value);
  const allowed = new URLSearchParams();
  for (const [key, item] of parsed.searchParams) {
    if (/^(roomId|round|roundId|matchId)$/i.test(key)) allowed.set(key, item);
  }
  return `${parsed.origin}${parsed.pathname}${allowed.size ? `?${allowed}` : ""}`;
}

function isRiveFallbackResponse(response) {
  const parsed = new URL(response.url());
  return response.request().method() === "HEAD"
    && response.status() === 404
    && parsed.origin === target.origin
    && parsed.pathname.startsWith("/movie-buff/animations/")
    && parsed.pathname.endsWith(".riv");
}

function isExpectedNavigationAbort(item) {
  return item.method === "GET" && item.errorText === "net::ERR_ABORTED";
}

const evidence = {
  schemaVersion: 1,
  laboratory: "movie-buff-full-three-client-browser-journey",
  classification: "UNKNOWN",
  repository: "BuffGamesStudio/buff-platform",
  exactBranch: expectedBranch,
  exactSha: expectedSha,
  checkoutSha,
  buildMarker,
  coreSha,
  mov17Sha,
  mov18Sha,
  target: { kind: "disposable-localhost", origin: target.origin },
  browserProfiles: [
    { player: 1, viewport: "1365x900", reducedMotion: "no-preference" },
    { player: 2, viewport: "390x844", reducedMotion: "no-preference" },
    { player: 3, viewport: "768x1024", reducedMotion: "reduce" },
  ],
  startedAt: new Date().toISOString(),
  roomId: null,
  phaseTimeline: [],
  checks: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  expectedFallbackResponses: [],
  failedRequests: [],
  staleClient: null,
};

function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", details });
}

function recordPhase(label, views) {
  const snapshot = {
    label,
    capturedAt: new Date().toISOString(),
    phases: views.map((view) => ({
      phase: view.phase,
      phaseVersion: view.phaseVersion,
      roundNumber: view.roundNumber,
      roundId: view.roundId,
      callerIsSelector: view.callerIsSelector,
      selectedTileId: view.selectedTileId,
      playbackStartsAt: view.playbackStartsAt,
      answerDeadlineAt: view.answerDeadlineAt,
      resultsEndAt: view.resultsEndAt,
    })),
  };
  evidence.phaseTimeline.push(snapshot);
  return snapshot;
}

const browsers = [];
const contexts = [];
const pages = [];
const authHeaders = ["", "", ""];
const offlineExercise = [false, false, false];
const responseInspectionPromises = [];

function attachObservers(page, index) {
  page.on("pageerror", (error) => {
    evidence.pageErrors.push({ player: index + 1, message: redact(error.message) });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      evidence.consoleErrors.push({ player: index + 1, message: redact(message.text()) });
    }
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/movie-buff/")) {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("Bearer ")) authHeaders[index] = authorization;
    }
  });
  page.on("requestfailed", (request) => {
    evidence.failedRequests.push({
      player: index + 1,
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
      url: safeUrl(request.url()),
      errorText: redact(request.failure()?.errorText ?? "unknown request failure"),
      expectedOfflineExercise: offlineExercise[index],
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const inspection = (async () => {
      if (isRiveFallbackResponse(response)) {
        evidence.expectedFallbackResponses.push({
          player: index + 1,
          method: response.request().method(),
          url: safeUrl(response.url()),
          status: response.status(),
        });
        return;
      }
      let body = "";
      try {
        body = redact(await response.text());
      } catch (error) {
        body = `[body unavailable: ${redact(error instanceof Error ? error.message : error)}]`;
      }
      evidence.failedResponses.push({
        player: index + 1,
        method: response.request().method(),
        resourceType: response.request().resourceType(),
        url: safeUrl(response.url()),
        status: response.status(),
        statusText: response.statusText(),
        body,
      });
    })();
    responseInspectionPromises.push(inspection);
  });
}

async function waitForAuth(index, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (!authHeaders[index] && Date.now() < deadline) {
    await pages[index].waitForTimeout(100);
  }
  assert.ok(authHeaders[index], `player ${index + 1} authorization header was not observed`);
}

async function getView(index, roomId) {
  await waitForAuth(index);
  const response = await pages[index].request.post(`${target.origin}/api/movie-buff/match/view`, {
    headers: {
      Authorization: authHeaders[index],
      "Content-Type": "application/json",
    },
    data: { roomId },
  });
  assert.equal(response.status(), 200, `player ${index + 1} phase view returned ${response.status()}`);
  const payload = await response.json();
  return payload.view;
}

async function getViews(roomId) {
  return Promise.all(pages.map((_, index) => getView(index, roomId)));
}

async function waitForPhase(roomId, expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await getViews(roomId);
    if (last.every((view) => view.phase === expected)) return last;
    await pages[0].waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for all clients in ${expected}; last=${JSON.stringify(last.map((v) => ({ phase: v.phase, version: v.phaseVersion, round: v.roundNumber })))}`);
}

async function assertBuildIdentity(page, player) {
  const marker = page.getByTestId("movie-buff-build-marker");
  await marker.waitFor({ state: "visible", timeout: 60_000 });
  assert.equal((await marker.innerText()).replace(/\s+/g, " ").trim(), exactMarkerText);
  pass(`player-${player}-exact-build-marker`, { exactMarkerText });
}

async function assertNoManualControls(page, player, stage) {
  const labels = await page.locator("button,a").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
  for (const forbidden of forbiddenExact) {
    assert.ok(!labels.some((label) => label.toLowerCase() === forbidden.toLowerCase()), `${stage}: forbidden control ${forbidden} visible for player ${player}`);
  }
  const enabledPhaseControls = await page.locator("button:not([disabled]),a").evaluateAll((elements) =>
    elements
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((label) => /^(start|continue|next)\b/i.test(label)),
  );
  assert.deepEqual(enabledPhaseControls, [], `${stage}: gameplay Start/Continue/Next control visible for player ${player}`);
}

async function assertResponsiveAndAccessible(page, player, stage) {
  const report = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
    const unnamed = controls
      .filter((element) => {
        const name = (
          element.getAttribute("aria-label")
          || element.getAttribute("title")
          || element.textContent
          || (element instanceof HTMLInputElement ? element.placeholder : "")
          || ""
        ).replace(/\s+/g, " ").trim();
        return !name;
      })
      .map((element) => element.outerHTML.slice(0, 180));
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      unnamed,
      duplicateIds,
      h1Count: document.querySelectorAll("h1").length,
      activeElement: document.activeElement?.tagName ?? null,
    };
  });
  assert.ok(report.scrollWidth <= report.innerWidth + 2, `${stage}: horizontal overflow for player ${player}: ${JSON.stringify(report)}`);
  assert.deepEqual(report.unnamed, [], `${stage}: unnamed visible controls for player ${player}`);
  assert.deepEqual(report.duplicateIds, [], `${stage}: duplicate IDs for player ${player}`);
  assert.ok(report.h1Count >= 1, `${stage}: no h1 for player ${player}`);
  pass(`player-${player}-${stage}-responsive-accessible`, report);
}

async function screenshotAll(stage) {
  await Promise.all(pages.map(async (page, index) => {
    const file = `player-${index + 1}-${stage}.png`;
    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
    evidence.screenshots.push(file);
  }));
}

try {
  const profiles = [
    { viewport: { width: 1365, height: 900 }, reducedMotion: "no-preference" },
    { viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", isMobile: true },
    { viewport: { width: 768, height: 1024 }, reducedMotion: "reduce" },
  ];

  for (let index = 0; index < players.length; index += 1) {
    const browser = await chromium.launch({
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    browsers.push(browser);
    const context = await browser.newContext(profiles[index]);
    contexts.push(context);
    const page = await context.newPage();
    attachObservers(page, index);
    pages.push(page);
  }
  pass("three-independent-browser-processes", { count: browsers.length });
  pass("desktop-mobile-reduced-motion-profiles-created", { profiles: evidence.browserProfiles });

  await Promise.all(pages.map(async (page, index) => {
    const player = players[index];
    await page.goto(`${target.origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.getByPlaceholder("you@example.com").fill(player.email);
    await page.getByPlaceholder("Password").fill(player.password);
    await Promise.all([
      page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
      page.getByRole("button", { name: "Enter Buff Games" }).click(),
    ]);
    await page.getByRole("button", { name: "Find Match" }).waitFor({ state: "visible", timeout: 60_000 });
    await assertBuildIdentity(page, index + 1);
  }));
  pass("three-authenticated-public-player-sessions");

  await Promise.all(pages.map(async (page) => {
    await page.waitForFunction(() => {
      const candidate = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Find Match"));
      return Boolean(candidate && !candidate.disabled);
    }, null, { timeout: 60_000 });
    await page.getByRole("button", { name: "Find Match" }).click();
    await page.waitForURL(/\/games\/movie-buff\/waiting-room\?/, { timeout: 90_000 });
  }));

  const roomIds = pages.map((page) => new URL(page.url()).searchParams.get("roomId"));
  assert.ok(roomIds.every(Boolean));
  assert.equal(new Set(roomIds).size, 1);
  const roomId = roomIds[0];
  evidence.roomId = roomId;
  pass("waiting-room-strict-three-convergence", { roomId });

  await Promise.all(pages.map(async (page, index) => {
    await page.getByText("3 of 3 Joined", { exact: false }).waitFor({ timeout: 60_000 });
    await assertBuildIdentity(page, index + 1);
    await assertNoManualControls(page, index + 1, "waiting-room");
    await page.getByRole("button", { name: "I'm Ready" }).click();
  }));
  pass("three-ready-signals-and-automatic-match-start");

  await Promise.all(pages.map((page) =>
    page.waitForURL(/\/games\/movie-buff\/round-intro\?/, { timeout: 120_000 }),
  ));
  await Promise.all(pages.map((page) =>
    page.waitForFunction(() => document.body.innerText.includes("Private VIP Selection"), null, { timeout: 60_000 }),
  ));
  pass("shared-round-intro-route");

  const countdowns = await Promise.all(pages.map((page) => page.evaluate(() => {
    const match = document.body.innerText.replace(/\s+/g, " ").match(/Server Countdown\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  })));
  assert.ok(countdowns.every((value) => Number.isInteger(value) && value > 0), `invalid shared countdowns ${JSON.stringify(countdowns)}`);
  assert.ok(Math.max(...countdowns) - Math.min(...countdowns) <= 1, `countdowns diverged ${JSON.stringify(countdowns)}`);
  pass("shared-server-countdown-visible-and-converged", { countdowns });

  await Promise.all(pages.map(async (page, index) => {
    await assertNoManualControls(page, index + 1, "round-intro");
    await assertResponsiveAndAccessible(page, index + 1, "round-intro");
    const noVip = page.locator("button").filter({ hasText: /^No VIP/ });
    assert.equal(await noVip.count(), 1);
    await noVip.click();
  }));
  pass("three-private-no-vip-lock-actions-submitted");

  const boardViews = await waitForPhase(roomId, "board_select", 120_000);
  recordPhase("board-select-initial", boardViews);
  assert.equal(new Set(boardViews.map((view) => view.phaseVersion)).size, 1);
  assert.equal(new Set(boardViews.map((view) => view.roundId)).size, 1);
  const selectorIndexes = boardViews.map((view, index) => view.callerIsSelector ? index : -1).filter((index) => index >= 0);
  assert.equal(selectorIndexes.length, 1);
  const selectorIndex = selectorIndexes[0];
  pass("vip-lock-completion-advanced-automatically-to-cinematic-board", {
    phaseVersion: boardViews[0].phaseVersion,
    selectorPlayer: selectorIndex + 1,
  });

  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/board\?/, { timeout: 60_000 });
    await page.getByText(/Phase v\d+ · board select/i).waitFor({ timeout: 60_000 });
    await assertBuildIdentity(page, index + 1);
    await assertNoManualControls(page, index + 1, "board-select");
    await assertResponsiveAndAccessible(page, index + 1, "board-select");
  }));

  const boardUi = [];
  for (let index = 0; index < pages.length; index += 1) {
    const enabledSelectCount = await pages[index].locator("button").filter({ hasText: "Select this scene" }).evaluateAll(
      (buttons) => buttons.filter((button) => !button.disabled).length,
    );
    const observerCount = await pages[index].getByText("Waiting for selector", { exact: false }).count();
    boardUi.push({ player: index + 1, enabledSelectCount, observerCount });
    if (index === selectorIndex) {
      assert.ok(enabledSelectCount > 0);
      assert.equal(observerCount, 0);
    } else {
      assert.equal(enabledSelectCount, 0);
      assert.ok(observerCount > 0);
    }
  }
  pass("selector-only-tile-control-and-synchronized-observers", { boardUi });
  await screenshotAll("board-select");

  const selectorPage = pages[selectorIndex];
  const selectorButton = selectorPage.locator("button").filter({ hasText: "Select this scene" }).first();
  await selectorButton.focus();
  assert.equal(await selectorButton.evaluate((element) => document.activeElement === element), true);
  const selectRequestPromise = selectorPage.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/movie-buff/match/select",
  );
  const selectResponsePromise = selectorPage.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/movie-buff/match/select",
  );
  await selectorButton.press("Enter");
  const selectRequest = await selectRequestPromise;
  const selectResponse = await selectResponsePromise;
  assert.equal(selectResponse.status(), 200);
  const selectionPayload = selectRequest.postDataJSON();
  assert.equal(selectionPayload.expectedVersion, boardViews[selectorIndex].phaseVersion);
  pass("keyboard-selector-tile-choice-accepted", {
    player: selectorIndex + 1,
    expectedVersion: selectionPayload.expectedVersion,
    tileId: selectionPayload.tileId,
  });

  const transitionViews = await waitForPhase(roomId, "transition", 90_000);
  recordPhase("transition", transitionViews);
  assert.equal(new Set(transitionViews.map((view) => view.playbackStartsAt)).size, 1);
  assert.equal(new Set(transitionViews.map((view) => view.selectedTileId)).size, 1);
  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
    await page.getByText("Curtain and film slate", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoManualControls(page, index + 1, "transition");
  }));
  pass("cinematic-transition-and-shared-playback-timestamp", {
    playbackStartsAt: transitionViews[0].playbackStartsAt,
  });
  await screenshotAll("transition");

  const staleResponse = await selectorPage.request.post(`${target.origin}/api/movie-buff/match/select`, {
    headers: {
      Authorization: authHeaders[selectorIndex],
      "Content-Type": "application/json",
    },
    data: {
      roomId,
      tileId: selectionPayload.tileId,
      expectedVersion: selectionPayload.expectedVersion,
      idempotencyKey: `stale-browser-${crypto.randomUUID()}`,
    },
  });
  const staleBody = redact(await staleResponse.text());
  assert.equal(staleResponse.status(), 409);
  assert.match(staleBody, /(not in board selection|phase version changed)/i);
  evidence.staleClient = { status: staleResponse.status(), body: staleBody };
  pass("stale-client-selection-rejected", evidence.staleClient);

  const playbackViews = await waitForPhase(roomId, "playback", 180_000);
  recordPhase("playback", playbackViews);
  assert.equal(new Set(playbackViews.map((view) => view.playbackStartsAt)).size, 1);
  await Promise.all(pages.map((page) =>
    page.getByText(/Authoritative phase/i).waitFor({ timeout: 60_000 }),
  ));
  const playbackStates = await Promise.all(pages.map((page) => page.evaluate(() => {
    const media = document.querySelector("video,audio");
    return {
      phaseText: [...document.querySelectorAll("p")].map((item) => item.textContent ?? "").find((text) => /playback · v\d+/i.test(text)) ?? "",
      hasMedia: Boolean(media),
      currentTime: media instanceof HTMLMediaElement ? media.currentTime : null,
      paused: media instanceof HTMLMediaElement ? media.paused : null,
    };
  })));
  assert.ok(playbackStates.every((state) => /playback/i.test(state.phaseText)), JSON.stringify(playbackStates));
  const mediaTimes = playbackStates.map((state) => state.currentTime).filter((value) => typeof value === "number");
  if (mediaTimes.length === 3) {
    assert.ok(Math.max(...mediaTimes) - Math.min(...mediaTimes) <= 1.5, `media clocks diverged ${JSON.stringify(mediaTimes)}`);
  }
  pass("synchronized-playback-observed", { playbackStartsAt: playbackViews[0].playbackStartsAt, playbackStates });

  await pages[1].reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertBuildIdentity(pages[1], 2);
  const refreshedView = await getView(1, roomId);
  assert.ok(["playback", "answer"].includes(refreshedView.phase));
  pass("refresh-restored-authoritative-session", { phase: refreshedView.phase, phaseVersion: refreshedView.phaseVersion });

  offlineExercise[2] = true;
  await contexts[2].setOffline(true);
  await pages[2].waitForTimeout(1_200);
  await contexts[2].setOffline(false);
  await pages[2].reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertBuildIdentity(pages[2], 3);
  offlineExercise[2] = false;
  const reconnectedView = await getView(2, roomId);
  assert.ok(["playback", "answer"].includes(reconnectedView.phase));
  pass("offline-reconnect-restored-authoritative-session", {
    phase: reconnectedView.phase,
    phaseVersion: reconnectedView.phaseVersion,
  });

  const answerViews = await waitForPhase(roomId, "answer", 180_000);
  recordPhase("answer", answerViews);
  assert.equal(new Set(answerViews.map((view) => view.answerDeadlineAt)).size, 1);
  assert.ok(answerViews[0].answerDeadlineAt);
  await Promise.all(pages.map(async (page, index) => {
    await page.getByText("Answer time", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoManualControls(page, index + 1, "answer");
    await assertResponsiveAndAccessible(page, index + 1, "answer");
  }));
  pass("shared-answer-deadline-visible-and-identical", { answerDeadlineAt: answerViews[0].answerDeadlineAt });

  await pages[1].goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
  const afterBack = await getView(1, roomId);
  assert.equal(afterBack.phase, "answer");
  await pages[1].goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
  const afterForward = await getView(1, roomId);
  assert.equal(afterForward.phase, "answer");
  pass("browser-back-forward-reconciled-to-authoritative-answer-phase", {
    afterBackVersion: afterBack.phaseVersion,
    afterForwardVersion: afterForward.phaseVersion,
  });
  await screenshotAll("answer");

  const resultsViews = await waitForPhase(roomId, "results", 240_000);
  recordPhase("results", resultsViews);
  assert.equal(new Set(resultsViews.map((view) => view.resultsEndAt)).size, 1);
  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/round-results\?/, { timeout: 60_000 });
    await page.getByText("Synchronized Results", { exact: false }).waitFor({ timeout: 60_000 });
    await page.getByText("Return to board", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoManualControls(page, index + 1, "results");
  }));
  pass("synchronized-results-and-automatic-return-countdown", { resultsEndAt: resultsViews[0].resultsEndAt });
  await screenshotAll("results");

  const nextBoardViews = await waitForPhase(roomId, "board_select", 240_000);
  recordPhase("board-select-return", nextBoardViews);
  assert.equal(nextBoardViews[0].roundNumber, boardViews[0].roundNumber + 1);
  assert.equal(new Set(nextBoardViews.map((view) => view.roundId)).size, 1);
  const nextSelectorIndexes = nextBoardViews.map((view, index) => view.callerIsSelector ? index : -1).filter((index) => index >= 0);
  assert.equal(nextSelectorIndexes.length, 1);
  assert.notEqual(nextSelectorIndexes[0], selectorIndex);
  await Promise.all(pages.map((page) => page.waitForURL(/\/games\/movie-buff\/board\?/, { timeout: 60_000 })));
  const usedTileStates = await Promise.all(pages.map((page) => page.evaluate(() => {
    const sceneComplete = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Scene Complete"));
    return {
      count: sceneComplete.length,
      disabledCount: sceneComplete.filter((button) => button.disabled).length,
      busterCount: sceneComplete.filter((button) => button.textContent?.includes("Buster slate stamped")).length,
    };
  })));
  assert.ok(usedTileStates.every((state) => state.count >= 1 && state.disabledCount === state.count && state.busterCount >= 1), JSON.stringify(usedTileStates));
  pass("automatic-board-return-selector-rotation-and-used-tile-buster-treatment", {
    oldSelectorPlayer: selectorIndex + 1,
    nextSelectorPlayer: nextSelectorIndexes[0] + 1,
    usedTileStates,
  });
  await screenshotAll("board-return");

  await pages[0].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await pages[0].getByText("The motion asset or renderer could not load", { exact: false }).waitFor({ timeout: 60_000 });
  await assertBuildIdentity(pages[0], 1);
  pass("mov18-missing-asset-static-fallback-rendered");

  await pages[2].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await pages[2].getByText("Reduced-motion mode is active", { exact: false }).waitFor({ timeout: 60_000 });
  await assertBuildIdentity(pages[2], 3);
  pass("mov18-reduced-motion-static-fallback-rendered");

  await pages[1].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertBuildIdentity(pages[1], 2);
  await Promise.all(pages.map((page, index) => assertResponsiveAndAccessible(page, index + 1, "mov18-preview")));
  const previewUsedTile = await pages[1].getByText("Scene Complete", { exact: false }).count();
  const previewBuster = await pages[1].getByText("Buster slate stamped", { exact: false }).count();
  assert.ok(previewUsedTile >= 1 && previewBuster >= 1);
  pass("mov18-responsive-accessible-preview-and-used-tile-treatment");
  await screenshotAll("mov18-fallbacks");

  await Promise.allSettled(responseInspectionPromises);
  const unexpectedRequests = evidence.failedRequests.filter((request) =>
    !request.expectedOfflineExercise && !isExpectedNavigationAbort(request),
  );
  assert.equal(evidence.pageErrors.length, 0, `page errors: ${JSON.stringify(evidence.pageErrors)}`);
  assert.equal(evidence.consoleErrors.length, 0, `console errors: ${JSON.stringify(evidence.consoleErrors)}`);
  assert.equal(evidence.failedResponses.length, 0, `HTTP failures: ${JSON.stringify(evidence.failedResponses)}`);
  assert.equal(unexpectedRequests.length, 0, `request failures: ${JSON.stringify(unexpectedRequests)}`);
  assert.ok(evidence.expectedFallbackResponses.length >= 1, "missing MOV-18 asset fallback request was not observed");
  pass("hydration-runtime-console-and-network-error-channels-clean", {
    expectedOfflineFailureCount: evidence.failedRequests.filter((request) => request.expectedOfflineExercise).length,
    expectedNavigationAbortCount: evidence.failedRequests.filter(isExpectedNavigationAbort).length,
    expectedRiveFallbackResponseCount: evidence.expectedFallbackResponses.length,
  });

  evidence.classification = "PASS";
} catch (error) {
  await Promise.allSettled(responseInspectionPromises);
  evidence.classification = "FAIL";
  evidence.failure = error instanceof Error
    ? { name: error.name, message: redact(error.message), stack: redact(error.stack ?? "") }
    : { message: redact(error) };
  for (let index = 0; index < pages.length; index += 1) {
    try {
      const file = `player-${index + 1}-failure.png`;
      await pages[index].screenshot({ path: path.join(evidenceDir, file), fullPage: true });
      evidence.screenshots.push(file);
    } catch {}
  }
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.pageErrorCount = evidence.pageErrors.length;
  evidence.consoleErrorCount = evidence.consoleErrors.length;
  evidence.failedResponseCount = evidence.failedResponses.length;
  evidence.failedRequestCount = evidence.failedRequests.length;
  fs.writeFileSync(
    path.join(evidenceDir, "three-client-full-journey.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
