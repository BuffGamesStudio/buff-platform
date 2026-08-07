import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const branch = process.env.MOVIE_BUFF_EXPECTED_BRANCH?.trim();
const sha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const buildMarker = process.env.MOVIE_BUFF_BUILD_MARKER?.trim();
const parentSha = process.env.MOVIE_BUFF_PARENT_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL?.trim();
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT?.trim();
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR?.trim();
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT?.trim();

if (!branch || !sha || !buildMarker || !parentSha || !appUrl || !usersPath || !evidenceDir || !playwrightRoot) {
  throw new Error("Exact identity, target, users, evidence, and Playwright inputs are required.");
}
assert.match(sha, /^[0-9a-f]{40}$/i);
assert.match(parentSha, /^[0-9a-f]{40}$/i);
const target = new URL(appUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.hostname), `Refusing non-local target ${target.origin}`);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sha);
execFileSync("git", ["merge-base", "--is-ancestor", parentSha, sha]);
fs.mkdirSync(evidenceDir, { recursive: true });

const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.ok(Array.isArray(users) && users.length >= 3);
const players = users.slice(0, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");
const exactMarker = `${branch} · ${sha} · ${buildMarker}`;
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
    .slice(0, 5000);
}

function safeUrl(value) {
  const parsed = new URL(value);
  const retained = new URLSearchParams();
  for (const [key, item] of parsed.searchParams) {
    if (/^(roomId|round|roundId|matchId)$/i.test(key)) retained.set(key, item);
  }
  return `${parsed.origin}${parsed.pathname}${retained.size ? `?${retained}` : ""}`;
}

const evidence = {
  schemaVersion: 2,
  laboratory: "movie-buff-exact-three-client-full-journey-v2",
  classification: "UNKNOWN",
  repository: "BuffGamesStudio/buff-platform",
  branch,
  sha,
  tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
  parents: execFileSync("git", ["show", "-s", "--format=%P", "HEAD"], { encoding: "utf8" }).trim().split(/\s+/),
  parentSha,
  buildMarker,
  exactMarker,
  target: { kind: "disposable-localhost", origin: target.origin, deterministicMediaFixture: true },
  profiles: [
    { player: 1, viewport: "1365x900", reducedMotion: "no-preference" },
    { player: 2, viewport: "390x844", reducedMotion: "no-preference" },
    { player: 3, viewport: "768x1024", reducedMotion: "reduce" },
  ],
  startedAt: new Date().toISOString(),
  roomId: null,
  checks: [],
  timeline: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  expectedFallbackResponses: [],
  failedRequests: [],
};

function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", details });
}

function phaseRecord(label, views) {
  const record = {
    label,
    capturedAt: new Date().toISOString(),
    clients: views.map((view, index) => ({
      player: index + 1,
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
  evidence.timeline.push(record);
  return record;
}

const browsers = [];
const contexts = [];
const pages = [];
const authHeaders = ["", "", ""];
const offlineExercise = [false, false, false];
const responseInspections = [];

function isExpectedFallbackResponse(response) {
  const parsed = new URL(response.url());
  return response.request().method() === "HEAD"
    && response.status() === 404
    && parsed.origin === target.origin
    && parsed.pathname.startsWith("/movie-buff/animations/")
    && parsed.pathname.endsWith(".riv");
}

function attachObservers(page, index) {
  page.on("pageerror", (error) => evidence.pageErrors.push({ player: index + 1, message: redact(error.message) }));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push({ player: index + 1, message: redact(message.text()) });
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
      navigation: request.isNavigationRequest(),
      url: safeUrl(request.url()),
      errorText: redact(request.failure()?.errorText ?? "unknown"),
      expectedOfflineExercise: offlineExercise[index],
    });
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const inspection = (async () => {
      if (isExpectedFallbackResponse(response)) {
        evidence.expectedFallbackResponses.push({ player: index + 1, method: response.request().method(), url: safeUrl(response.url()), status: response.status() });
        return;
      }
      let body = "";
      try { body = redact(await response.text()); } catch (error) { body = `[unavailable: ${redact(error)}]`; }
      evidence.failedResponses.push({ player: index + 1, method: response.request().method(), url: safeUrl(response.url()), status: response.status(), body });
    })();
    responseInspections.push(inspection);
  });
}

async function waitForAuth(index, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (!authHeaders[index] && Date.now() < deadline) await pages[index].waitForTimeout(100);
  assert.ok(authHeaders[index], `No authorization header observed for player ${index + 1}`);
}

async function getView(index, roomId) {
  await waitForAuth(index);
  const response = await pages[index].request.post(`${target.origin}/api/movie-buff/match/view`, {
    headers: { Authorization: authHeaders[index], "Content-Type": "application/json" },
    data: { roomId },
  });
  assert.equal(response.status(), 200, `Phase view failed for player ${index + 1}: ${response.status()}`);
  return (await response.json()).view;
}

async function getViews(roomId) {
  return Promise.all(pages.map((_, index) => getView(index, roomId)));
}

async function waitForPhase(roomId, expected, timeout = 240_000) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    last = await getViews(roomId);
    if (last.every((view) => view.phase === expected)) return last;
    await pages[0].waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for ${expected}; last=${JSON.stringify(last.map((view) => ({ phase: view.phase, version: view.phaseVersion, round: view.roundNumber })))}`);
}

async function assertMarker(page, player) {
  const marker = page.getByTestId("movie-buff-build-marker");
  await marker.waitFor({ state: "visible", timeout: 60_000 });
  assert.equal((await marker.innerText()).replace(/\s+/g, " ").trim(), exactMarker);
  pass(`player-${player}-exact-visible-build-marker`);
}

async function assertNoAdvanceControls(page, player, stage) {
  const labels = await page.locator("button,a").evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean));
  for (const forbidden of forbiddenExact) {
    assert.ok(!labels.some((label) => label.toLowerCase() === forbidden.toLowerCase()), `${stage}: forbidden control ${forbidden} for player ${player}`);
  }
  const phaseControls = labels.filter((label) => /^(start|continue|next)\b/i.test(label));
  assert.deepEqual(phaseControls, [], `${stage}: manual gameplay advance controls for player ${player}: ${JSON.stringify(phaseControls)}`);
}

async function assertResponsiveAccessible(page, player, stage) {
  const report = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
    const unnamed = controls.filter((element) => {
      const name = (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || (element instanceof HTMLInputElement ? element.placeholder : "") || "").replace(/\s+/g, " ").trim();
      return !name;
    }).map((element) => element.outerHTML.slice(0, 180));
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id).filter(Boolean);
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      unnamed,
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      missingImageAlt: document.querySelectorAll("img:not([alt])").length,
      h1Count: document.querySelectorAll("h1").length,
      lang: document.documentElement.lang,
    };
  });
  assert.ok(report.documentWidth <= report.viewport + 2 && report.bodyWidth <= report.viewport + 2, `${stage}: horizontal overflow player ${player}: ${JSON.stringify(report)}`);
  assert.deepEqual(report.unnamed, [], `${stage}: unnamed controls player ${player}`);
  assert.deepEqual(report.duplicateIds, [], `${stage}: duplicate IDs player ${player}`);
  assert.equal(report.missingImageAlt, 0, `${stage}: images missing alt player ${player}`);
  assert.ok(report.h1Count >= 1, `${stage}: missing h1 player ${player}`);
  assert.ok(report.lang, `${stage}: missing document language player ${player}`);
  pass(`player-${player}-${stage}-responsive-accessible`, report);
}

async function screenshotAll(stage) {
  await Promise.all(pages.map(async (page, index) => {
    const file = `player-${index + 1}-${stage}.png`;
    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
    evidence.screenshots.push(file);
  }));
}

async function assertPlaying(page, player, stage, timeout = 45_000) {
  await page.getByTestId("movie-buff-shared-media").waitFor({ state: "attached", timeout });
  await page.waitForFunction(() => {
    const media = document.querySelector('[data-testid="movie-buff-shared-media"]');
    return media instanceof HTMLMediaElement && media.readyState >= 2 && !media.paused && media.currentTime > 0.2;
  }, null, { timeout });
  const first = await page.getByTestId("movie-buff-shared-media").evaluate((media) => ({
    currentTime: media instanceof HTMLMediaElement ? media.currentTime : null,
    paused: media instanceof HTMLMediaElement ? media.paused : null,
    readyState: media instanceof HTMLMediaElement ? media.readyState : null,
    duration: media instanceof HTMLMediaElement ? media.duration : null,
  }));
  await page.waitForTimeout(700);
  const second = await page.getByTestId("movie-buff-shared-media").evaluate((media) => ({
    currentTime: media instanceof HTMLMediaElement ? media.currentTime : null,
    paused: media instanceof HTMLMediaElement ? media.paused : null,
    readyState: media instanceof HTMLMediaElement ? media.readyState : null,
  }));
  assert.equal(first.paused, false, `${stage}: player ${player} media paused`);
  assert.equal(second.paused, false, `${stage}: player ${player} media paused after sample`);
  assert.ok(typeof first.currentTime === "number" && typeof second.currentTime === "number" && second.currentTime > first.currentTime + 0.35, `${stage}: player ${player} media clock did not advance: ${JSON.stringify({ first, second })}`);
  return { player, first, second };
}

try {
  const profiles = [
    { viewport: { width: 1365, height: 900 }, reducedMotion: "no-preference" },
    { viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", isMobile: true },
    { viewport: { width: 768, height: 1024 }, reducedMotion: "reduce" },
  ];
  for (let index = 0; index < 3; index += 1) {
    const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
    browsers.push(browser);
    const context = await browser.newContext(profiles[index]);
    contexts.push(context);
    const page = await context.newPage();
    attachObservers(page, index);
    pages.push(page);
  }
  pass("three-independent-chromium-processes");
  pass("desktop-mobile-and-reduced-motion-profiles");

  await Promise.all(pages.map(async (page, index) => {
    await page.goto(`${target.origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.getByPlaceholder("you@example.com").fill(players[index].email);
    await page.getByPlaceholder("Password").fill(players[index].password);
    await Promise.all([
      page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
      page.getByRole("button", { name: "Enter Buff Games" }).click(),
    ]);
    await page.getByRole("button", { name: "Find Match" }).waitFor({ state: "visible", timeout: 60_000 });
    await assertMarker(page, index + 1);
  }));
  pass("three-authenticated-public-players");

  await Promise.all(pages.map(async (page) => {
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Find Match"));
      return Boolean(button && !button.disabled);
    }, null, { timeout: 60_000 });
    await page.getByRole("button", { name: "Find Match" }).click();
    await page.waitForURL(/\/games\/movie-buff\/waiting-room\?/, { timeout: 90_000 });
  }));
  const roomIds = pages.map((page) => new URL(page.url()).searchParams.get("roomId"));
  assert.ok(roomIds.every(Boolean));
  assert.equal(new Set(roomIds).size, 1);
  const roomId = roomIds[0];
  evidence.roomId = roomId;

  await Promise.all(pages.map(async (page, index) => {
    await page.getByText("3 of 3 Joined", { exact: false }).waitFor({ timeout: 60_000 });
    await assertMarker(page, index + 1);
    await assertNoAdvanceControls(page, index + 1, "waiting-room");
    await page.getByRole("button", { name: "I'm Ready" }).click();
  }));
  pass("waiting-room-three-player-convergence-and-automatic-start", { roomId });

  const introSnapshots = await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/round-intro\?/, { timeout: 120_000 });
    const noVip = page.locator("button").filter({ hasText: /^No VIP/ });
    await noVip.waitFor({ state: "visible", timeout: 30_000 });
    const snapshot = await page.evaluate(() => {
      const body = document.body.innerText.replace(/\s+/g, " ");
      const match = body.match(/Server Countdown\s+(\d+)/i);
      return { privateVipVisible: body.includes("Private VIP Selection"), countdown: match ? Number(match[1]) : null };
    });
    assert.equal(snapshot.privateVipVisible, true);
    assert.ok(Number.isInteger(snapshot.countdown) && snapshot.countdown > 0);
    await assertNoAdvanceControls(page, index + 1, "round-intro");
    await assertResponsiveAccessible(page, index + 1, "round-intro");
    const file = `player-${index + 1}-round-intro.png`;
    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
    evidence.screenshots.push(file);
    await noVip.click();
    return snapshot;
  }));
  assert.ok(Math.max(...introSnapshots.map((item) => item.countdown)) - Math.min(...introSnapshots.map((item) => item.countdown)) <= 1, `Round Intro countdowns diverged: ${JSON.stringify(introSnapshots)}`);
  pass("round-intro-private-vip-lock-and-shared-countdown", { introSnapshots });

  const boardViews = await waitForPhase(roomId, "board_select", 120_000);
  phaseRecord("board-select-initial", boardViews);
  assert.equal(new Set(boardViews.map((view) => view.phaseVersion)).size, 1);
  const selectors = boardViews.map((view, index) => view.callerIsSelector ? index : -1).filter((index) => index >= 0);
  assert.equal(selectors.length, 1);
  const selectorIndex = selectors[0];
  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/board\?/, { timeout: 60_000 });
    await page.getByText(/Phase v\d+ · board select/i).waitFor({ timeout: 60_000 });
    await assertMarker(page, index + 1);
    await assertNoAdvanceControls(page, index + 1, "board-select");
    await assertResponsiveAccessible(page, index + 1, "board-select");
  }));

  const boardUi = [];
  for (let index = 0; index < 3; index += 1) {
    const enabledTiles = await pages[index].locator("button").filter({ hasText: "Select this scene" }).evaluateAll((buttons) => buttons.filter((button) => !button.disabled).length);
    const observerLabels = await pages[index].getByText("Waiting for selector", { exact: false }).count();
    boardUi.push({ player: index + 1, enabledTiles, observerLabels });
    if (index === selectorIndex) assert.ok(enabledTiles > 0 && observerLabels === 0);
    else assert.ok(enabledTiles === 0 && observerLabels > 0);
  }
  pass("cinematic-board-selector-only-control-and-observers", { selectorPlayer: selectorIndex + 1, boardUi });
  await screenshotAll("board-select");

  const selectorPage = pages[selectorIndex];
  const tileButton = selectorPage.locator("button").filter({ hasText: "Select this scene" }).first();
  await tileButton.focus();
  assert.equal(await tileButton.evaluate((element) => document.activeElement === element), true);
  const requestPromise = selectorPage.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/movie-buff/match/select");
  const responsePromise = selectorPage.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/movie-buff/match/select");
  await tileButton.press("Enter");
  const selectionRequest = await requestPromise;
  const selectionResponse = await responsePromise;
  assert.equal(selectionResponse.status(), 200);
  const selectionPayload = selectionRequest.postDataJSON();
  assert.equal(selectionPayload.expectedVersion, boardViews[selectorIndex].phaseVersion);
  pass("keyboard-selector-tile-choice", { selectorPlayer: selectorIndex + 1, tileId: selectionPayload.tileId, expectedVersion: selectionPayload.expectedVersion });

  const transitionViews = await waitForPhase(roomId, "transition", 90_000);
  phaseRecord("transition", transitionViews);
  assert.equal(new Set(transitionViews.map((view) => view.playbackStartsAt)).size, 1);
  assert.equal(new Set(transitionViews.map((view) => view.selectedTileId)).size, 1);
  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
    await page.getByText("Curtain and film slate", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoAdvanceControls(page, index + 1, "transition");
  }));
  pass("cinematic-transition-shared-playback-start", { playbackStartsAt: transitionViews[0].playbackStartsAt });
  await screenshotAll("transition");

  const staleResponse = await selectorPage.request.post(`${target.origin}/api/movie-buff/match/select`, {
    headers: { Authorization: authHeaders[selectorIndex], "Content-Type": "application/json" },
    data: { roomId, tileId: selectionPayload.tileId, expectedVersion: selectionPayload.expectedVersion, idempotencyKey: `stale-${crypto.randomUUID()}` },
  });
  const staleBody = redact(await staleResponse.text());
  assert.equal(staleResponse.status(), 409);
  assert.match(staleBody, /(not in board selection|phase version changed)/i);
  pass("stale-client-rejected", { status: staleResponse.status(), body: staleBody });

  const playbackViews = await waitForPhase(roomId, "playback", 180_000);
  phaseRecord("playback", playbackViews);
  assert.equal(new Set(playbackViews.map((view) => view.playbackStartsAt)).size, 1);
  await Promise.all(pages.map((page, index) => assertNoAdvanceControls(page, index + 1, "playback")));
  const playbackSamples = await Promise.all(pages.map((page, index) => assertPlaying(page, index + 1, "playback")));
  const playbackTimes = playbackSamples.map((sample) => sample.second.currentTime);
  assert.ok(Math.max(...playbackTimes) - Math.min(...playbackTimes) <= 1.5, `Playback clocks diverged: ${JSON.stringify(playbackTimes)}`);
  assert.equal(await pages[0].getByTestId("movie-buff-playback-recovering").count(), 0);
  pass("synchronized-automatic-playback", { playbackStartsAt: playbackViews[0].playbackStartsAt, playbackTimes });
  await screenshotAll("playback");

  await pages[1].reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertMarker(pages[1], 2);
  const refreshedView = await getView(1, roomId);
  assert.ok(["playback", "answer"].includes(refreshedView.phase));
  if (refreshedView.phase === "playback") await assertPlaying(pages[1], 2, "refresh");
  pass("refresh-restores-authoritative-session", { phase: refreshedView.phase, phaseVersion: refreshedView.phaseVersion });

  offlineExercise[2] = true;
  await contexts[2].setOffline(true);
  await pages[2].waitForTimeout(1_200);
  await contexts[2].setOffline(false);
  await pages[2].reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  offlineExercise[2] = false;
  await assertMarker(pages[2], 3);
  const reconnectedView = await getView(2, roomId);
  assert.ok(["playback", "answer"].includes(reconnectedView.phase));
  if (reconnectedView.phase === "playback") await assertPlaying(pages[2], 3, "reconnect");
  pass("offline-reconnect-restores-authoritative-session", { phase: reconnectedView.phase, phaseVersion: reconnectedView.phaseVersion });

  const answerViews = await waitForPhase(roomId, "answer", 180_000);
  phaseRecord("answer", answerViews);
  assert.equal(new Set(answerViews.map((view) => view.answerDeadlineAt)).size, 1);
  assert.ok(answerViews[0].answerDeadlineAt);
  await Promise.all(pages.map(async (page, index) => {
    await page.getByText("Answer time", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoAdvanceControls(page, index + 1, "answer");
    await assertResponsiveAccessible(page, index + 1, "answer");
  }));
  pass("shared-answer-deadline", { answerDeadlineAt: answerViews[0].answerDeadlineAt });

  await pages[1].goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
  const backView = await getView(1, roomId);
  assert.equal(backView.phase, "answer");
  await pages[1].goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\/games\/movie-buff\/play\?/, { timeout: 60_000 });
  const forwardView = await getView(1, roomId);
  assert.equal(forwardView.phase, "answer");
  pass("browser-back-forward-reconciles-to-authoritative-phase", { backVersion: backView.phaseVersion, forwardVersion: forwardView.phaseVersion });
  await screenshotAll("answer");

  const resultsViews = await waitForPhase(roomId, "results", 240_000);
  phaseRecord("results", resultsViews);
  assert.equal(new Set(resultsViews.map((view) => view.resultsEndAt)).size, 1);
  await Promise.all(pages.map(async (page, index) => {
    await page.waitForURL(/\/games\/movie-buff\/round-results\?/, { timeout: 60_000 });
    await page.getByText("Synchronized Results", { exact: false }).waitFor({ timeout: 60_000 });
    await page.getByText("Return to board", { exact: false }).waitFor({ timeout: 60_000 });
    await assertNoAdvanceControls(page, index + 1, "results");
    await assertResponsiveAccessible(page, index + 1, "results");
  }));
  pass("synchronized-results-automatic-return-countdown", { resultsEndAt: resultsViews[0].resultsEndAt });
  await screenshotAll("results");

  const returnViews = await waitForPhase(roomId, "board_select", 240_000);
  phaseRecord("board-return", returnViews);
  assert.equal(returnViews[0].roundNumber, boardViews[0].roundNumber + 1);
  const nextSelectors = returnViews.map((view, index) => view.callerIsSelector ? index : -1).filter((index) => index >= 0);
  assert.equal(nextSelectors.length, 1);
  assert.notEqual(nextSelectors[0], selectorIndex);
  await Promise.all(pages.map((page) => page.waitForURL(/\/games\/movie-buff\/board\?/, { timeout: 60_000 })));
  const usedTiles = await Promise.all(pages.map((page) => page.evaluate(() => {
    const complete = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Scene Complete"));
    return { count: complete.length, disabled: complete.filter((button) => button.disabled).length, buster: complete.filter((button) => button.textContent?.includes("Buster slate stamped")).length };
  })));
  assert.ok(usedTiles.every((item) => item.count >= 1 && item.disabled === item.count && item.buster >= 1), JSON.stringify(usedTiles));
  pass("automatic-board-return-selector-rotation-used-tile-buster", { previousSelector: selectorIndex + 1, nextSelector: nextSelectors[0] + 1, usedTiles });
  await screenshotAll("board-return");

  await pages[0].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await pages[0].getByText("The motion asset or renderer could not load", { exact: false }).waitFor({ timeout: 60_000 });
  await assertMarker(pages[0], 1);
  pass("mov18-missing-asset-static-fallback");

  await pages[2].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await pages[2].getByText("Reduced-motion mode is active", { exact: false }).waitFor({ timeout: 60_000 });
  const reducedMotionMatch = await pages[2].evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  assert.equal(reducedMotionMatch, true);
  await assertMarker(pages[2], 3);
  pass("mov18-reduced-motion-static-fallback");

  await pages[1].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertMarker(pages[1], 2);
  await Promise.all(pages.map((page, index) => assertResponsiveAccessible(page, index + 1, "mov18-preview")));
  assert.ok(await pages[1].getByText("Scene Complete", { exact: false }).count() >= 1);
  assert.ok(await pages[1].getByText("Buster slate stamped", { exact: false }).count() >= 1);
  pass("mov18-responsive-accessible-preview-used-tile-treatment");
  await screenshotAll("mov18-fallbacks");

  await Promise.allSettled(responseInspections);
  const unexpectedRequests = evidence.failedRequests.filter((request) => !request.expectedOfflineExercise && request.errorText !== "net::ERR_ABORTED");
  assert.equal(evidence.pageErrors.length, 0, `Page errors: ${JSON.stringify(evidence.pageErrors)}`);
  assert.equal(evidence.consoleErrors.length, 0, `Console errors: ${JSON.stringify(evidence.consoleErrors)}`);
  assert.equal(evidence.failedResponses.length, 0, `HTTP failures: ${JSON.stringify(evidence.failedResponses)}`);
  assert.equal(unexpectedRequests.length, 0, `Request failures: ${JSON.stringify(unexpectedRequests)}`);
  assert.ok(evidence.expectedFallbackResponses.length >= 1, "MOV-18 expected fallback HEAD 404 was not observed");
  pass("no-hydration-runtime-console-or-unexpected-network-failures", {
    expectedOfflineRequestFailures: evidence.failedRequests.filter((request) => request.expectedOfflineExercise).length,
    expectedNavigationAborts: evidence.failedRequests.filter((request) => request.errorText === "net::ERR_ABORTED").length,
    expectedRiveFallbackResponses: evidence.expectedFallbackResponses.length,
  });

  evidence.classification = "PASS";
} catch (error) {
  await Promise.allSettled(responseInspections);
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
  fs.writeFileSync(path.join(evidenceDir, "three-client-full-journey-v2.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
