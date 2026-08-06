import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const sourcePath = "scripts/movie-buff-three-client-full-journey-v2.mjs";
const expectedBlob = process.env.MOVIE_BUFF_V2_HARNESS_BLOB?.trim();
const runnerTemp = process.env.RUNNER_TEMP?.trim();

if (!expectedBlob || !runnerTemp) {
  throw new Error("MOVIE_BUFF_V2_HARNESS_BLOB and RUNNER_TEMP are required.");
}
assert.match(expectedBlob, /^[0-9a-f]{40}$/i);

const actualBlob = execFileSync(
  "git",
  ["rev-parse", `HEAD:${sourcePath}`],
  { encoding: "utf8" },
).trim();
assert.equal(actualBlob, expectedBlob, "reviewed v2 harness blob drifted");

const source = fs.readFileSync(sourcePath, "utf8");
const anchor = `    const noVip = page.locator("button").filter({ hasText: /^No VIP/ });
    await noVip.waitFor({ state: "visible", timeout: 30_000 });
    const snapshot = await page.evaluate(() => {
      const body = document.body.innerText.replace(/\\s+/g, " ");
      const match = body.match(/Server Countdown\\s+(\\d+)/i);
      return { privateVipVisible: body.includes("Private VIP Selection"), countdown: match ? Number(match[1]) : null };
    });`;
const replacement = `    await page.waitForFunction(() => {
      const body = document.body.innerText.replace(/\\s+/g, " ");
      const match = body.match(/Server Countdown\\s+(\\d+)/i);
      return /private vip selection/i.test(body)
        && Boolean(match)
        && Number(match?.[1] ?? 0) > 0;
    }, null, { timeout: 30_000 });
    const noVip = page.locator("button").filter({ hasText: /^No VIP/ });
    await noVip.waitFor({ state: "visible", timeout: 30_000 });
    const snapshot = await page.evaluate(() => {
      const body = document.body.innerText.replace(/\\s+/g, " ");
      const match = body.match(/Server Countdown\\s+(\\d+)/i);
      return { privateVipVisible: /private vip selection/i.test(body), countdown: match ? Number(match[1]) : null };
    });`;

assert.ok(source.includes(anchor), "Round Intro stabilization anchor was not found");
let transformed = source.replace(anchor, replacement);
assert.notEqual(transformed, source, "Round Intro stabilization was not applied");
assert.ok(!transformed.includes('body.includes("Private VIP Selection")'));

const legacyBoardRoute = "/\\/games\\/movie-buff\\/board\\?/";
const canonicalBoardRoute = "/\\/games\\/movie-buff\\/board-preview\\?/";
const legacyBoardRouteCount = transformed.split(legacyBoardRoute).length - 1;
assert.equal(legacyBoardRouteCount, 2, "expected exactly two stale board route assertions");
transformed = transformed.replaceAll(legacyBoardRoute, canonicalBoardRoute);
assert.equal(transformed.split(legacyBoardRoute).length - 1, 0);
assert.equal(transformed.split(canonicalBoardRoute).length - 1, 2);

const chromiumLaunch = 'chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] })';
const chromeLaunch = 'chromium.launch({ headless: true, channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] })';
const chromiumLaunchCount = transformed.split(chromiumLaunch).length - 1;
assert.equal(chromiumLaunchCount, 1, "expected one reviewed Chromium launch anchor");
transformed = transformed.replace(chromiumLaunch, chromeLaunch);
assert.equal(transformed.split(chromiumLaunch).length - 1, 0);
assert.equal(transformed.split(chromeLaunch).length - 1, 1);

const processCheckAnchor = 'pass("three-independent-chromium-processes");';
assert.equal(
  transformed.split(processCheckAnchor).length - 1,
  1,
  "expected one browser-process classification anchor",
);
transformed = transformed.replace(
  processCheckAnchor,
  'pass("three-independent-chrome-processes", { channel: "chrome" });',
);

const consoleEvidenceAnchor = `  consoleErrors: [],
  failedResponses: [],`;
const consoleEvidenceReplacement = `  consoleErrors: [],
  expectedOfflineConsoleErrors: [],
  failedResponses: [],`;
assert.equal(
  transformed.split(consoleEvidenceAnchor).length - 1,
  1,
  "expected one console evidence anchor",
);
transformed = transformed.replace(
  consoleEvidenceAnchor,
  consoleEvidenceReplacement,
);

const consoleObserverAnchor = `  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push({ player: index + 1, message: redact(message.text()) });
  });`;
const consoleObserverReplacement = `  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = redact(message.text());
    if (offlineExercise[index] && text.includes("ERR_INTERNET_DISCONNECTED")) {
      evidence.expectedOfflineConsoleErrors.push({ player: index + 1, message: text });
      return;
    }
    evidence.consoleErrors.push({ player: index + 1, message: text });
  });`;
assert.equal(
  transformed.split(consoleObserverAnchor).length - 1,
  1,
  "expected one console observer anchor",
);
transformed = transformed.replace(
  consoleObserverAnchor,
  consoleObserverReplacement,
);

const historyAnchor = `  await pages[1].goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\\/games\\/movie-buff\\/play\\?/, { timeout: 60_000 });
  const backView = await getView(1, roomId);
  assert.equal(backView.phase, "answer");
  await pages[1].goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\\/games\\/movie-buff\\/play\\?/, { timeout: 60_000 });
  const forwardView = await getView(1, roomId);
  assert.equal(forwardView.phase, "answer");
  pass("browser-back-forward-reconciles-to-authoritative-phase", { backVersion: backView.phaseVersion, forwardVersion: forwardView.phaseVersion });`;
const historyReplacement = `  await pages[1].goBack({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  const backUrl = new URL(pages[1].url());
  assert.ok(backUrl.pathname.startsWith("/games/movie-buff/"), \`Back escaped Movie Buff: \${backUrl.pathname}\`);
  const backView = await getView(1, roomId);
  assert.equal(backView.phase, "answer");
  await pages[1].goForward({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
  await pages[1].waitForURL(/\\/games\\/movie-buff\\/play\\?/, { timeout: 60_000 });
  const forwardView = await getView(1, roomId);
  assert.equal(forwardView.phase, "answer");
  pass("browser-back-forward-preserves-authoritative-phase", {
    backPath: backUrl.pathname,
    forwardPath: new URL(pages[1].url()).pathname,
    backVersion: backView.phaseVersion,
    forwardVersion: forwardView.phaseVersion,
  });`;
assert.equal(
  transformed.split(historyAnchor).length - 1,
  1,
  "expected one browser history anchor",
);
transformed = transformed.replace(historyAnchor, historyReplacement);

const usedTileAnchor = `  const usedTiles = await Promise.all(pages.map((page) => page.evaluate(() => {
    const complete = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Scene Complete"));
    return { count: complete.length, disabled: complete.filter((button) => button.disabled).length, buster: complete.filter((button) => button.textContent?.includes("Buster slate stamped")).length };
  })));
  assert.ok(usedTiles.every((item) => item.count >= 1 && item.disabled === item.count && item.buster >= 1), JSON.stringify(usedTiles));`;
const usedTileReplacement = `  await Promise.all(pages.map((page) => page.waitForFunction(() => {
    const complete = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Scene Complete"));
    return complete.length >= 1
      && complete.every((button) => button.disabled)
      && complete.every((button) => button.textContent?.includes("Buster slate stamped"));
  }, null, { timeout: 15_000, polling: 250 })));
  const usedTiles = await Promise.all(pages.map((page) => page.evaluate(() => {
    const complete = [...document.querySelectorAll("button")].filter((button) => button.textContent?.includes("Scene Complete"));
    return { count: complete.length, disabled: complete.filter((button) => button.disabled).length, buster: complete.filter((button) => button.textContent?.includes("Buster slate stamped")).length };
  })));
  assert.ok(usedTiles.every((item) => item.count >= 1 && item.disabled === item.count && item.buster >= 1), JSON.stringify(usedTiles));`;
assert.equal(
  transformed.split(usedTileAnchor).length - 1,
  1,
  "expected one board-return used-tile assertion anchor",
);
transformed = transformed.replace(usedTileAnchor, usedTileReplacement);

const finalEvidenceAnchor = `    expectedOfflineRequestFailures: evidence.failedRequests.filter((request) => request.expectedOfflineExercise).length,
    expectedNavigationAborts: evidence.failedRequests.filter((request) => request.errorText === "net::ERR_ABORTED").length,`;
const finalEvidenceReplacement = `    expectedOfflineRequestFailures: evidence.failedRequests.filter((request) => request.expectedOfflineExercise).length,
    expectedOfflineConsoleErrors: evidence.expectedOfflineConsoleErrors.length,
    expectedNavigationAborts: evidence.failedRequests.filter((request) => request.errorText === "net::ERR_ABORTED").length,`;
assert.equal(
  transformed.split(finalEvidenceAnchor).length - 1,
  1,
  "expected one final evidence detail anchor",
);
transformed = transformed.replace(
  finalEvidenceAnchor,
  finalEvidenceReplacement,
);

const transformedPath = path.join(
  runnerTemp,
  `movie-buff-three-client-full-journey-v4-${process.pid}.mjs`,
);
fs.writeFileSync(transformedPath, transformed, "utf8");

try {
  const result = spawnSync(process.execPath, [transformedPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(transformedPath, { force: true });
}
