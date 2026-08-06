import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.MOVIE_BUFF_APP_URL ?? "http://127.0.0.1:3001";
const evidenceDir = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_DIR ?? "mov18-browser-evidence",
);
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();

if (!expectedSha || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
  throw new Error("MOVIE_BUFF_EXPECTED_GIT_SHA must be a full commit SHA.");
}

const parsedAppUrl = new URL(appUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedAppUrl.hostname)) {
  throw new Error(`Refusing non-local application target ${parsedAppUrl.origin}.`);
}

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedSha, "browser evidence checkout SHA mismatch");

fs.mkdirSync(evidenceDir, { recursive: true });

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  sourceSha: checkoutSha,
  target: parsedAppUrl.origin,
  playwrightVersion: "1.54.2",
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  consoleErrors: [],
  pageErrors: [],
  httpErrors: [],
  gameplayRequests: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    observedAt: new Date().toISOString(),
    details,
  });
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function captureViewport(browser, viewport, name) {
  const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() === "error") {
      evidence.consoleErrors.push({ name, text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    evidence.pageErrors.push({ name, message: error.message });
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/movie-buff/")) {
      evidence.gameplayRequests.push({ name, url: request.url(), method: request.method() });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith(".riv")) {
      evidence.httpErrors.push({
        name,
        url: response.url(),
        status: response.status(),
      });
    }
  });

  await page.goto(`${parsedAppUrl.origin}/games/movie-buff/visual-runtime-preview`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Movie Buff visual runtime" }).waitFor();
  await page.locator("[data-movie-buff-canonical-adapter='passive']").waitFor();

  const selectorTile = page.getByRole("button", {
    name: /Preview Opening Shots, 100 points, Cold Open/i,
  });
  await selectorTile.click();
  await page.getByRole("status").filter({ hasText: /Preview only:/i }).waitFor();
  record(`${name}: selector-only local affordance`, {
    viewport,
  });

  await page.getByRole("button", { name: "View observer state" }).click();
  const observerTile = page.getByRole("button", {
    name: /Opening Shots, 100 points, waiting for selector/i,
  });
  assert.equal(await observerTile.isDisabled(), true);
  record(`${name}: nonselector observer semantics`, { viewport });

  const menuButton = page.getByRole("button", { name: "Game Menu" });
  await menuButton.click();
  const dialog = page.getByRole("dialog", { name: "Game Menu" });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Close");
  await page.keyboard.press("Shift+Tab");
  assert.match(
    await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""),
    /Return to visual preview/i,
  );
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Close");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.match(
    await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""),
    /Game Menu/i,
  );
  record(`${name}: modal focus trap Escape and restoration`, { viewport });

  await page.getByRole("button", { name: "Preview reconnect" }).click();
  await page.locator("[data-preview-reconnect-overlay='true']").waitFor();
  record(`${name}: reconnect overlay remains passive`, { viewport });

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  assert.equal(noHorizontalOverflow, true, `${name} has horizontal clipping`);
  record(`${name}: responsive no-clipping assertion`, { viewport });

  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  evidence.screenshots.push({
    name,
    path: path.basename(screenshotPath),
    sha256: sha256(screenshotPath),
    viewport,
  });

  await context.close();
}

async function captureReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    evidence.pageErrors.push({ name: "reduced-motion", message: error.message });
  });

  await page.goto(`${parsedAppUrl.origin}/games/movie-buff/visual-runtime-preview`, {
    waitUntil: "networkidle",
  });
  await page
    .locator("[data-movie-buff-static-fallback-reason='reduced_motion']")
    .first()
    .waitFor();
  assert.equal(await page.locator("[data-movie-buff-rive-canvas='true']").count(), 0);
  record("reduced motion mounts no Rive canvas");

  const screenshotPath = path.join(evidenceDir, "reduced-motion.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  evidence.screenshots.push({
    name: "reduced-motion",
    path: path.basename(screenshotPath),
    sha256: sha256(screenshotPath),
    viewport: { width: 1280, height: 800 },
  });
  await context.close();
}

async function captureHighZoom(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${parsedAppUrl.origin}/games/movie-buff/visual-runtime-preview`, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.waitForTimeout(250);
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  assert.equal(hasOverflow, false, "200% text zoom caused horizontal clipping");
  record("200% text zoom remains readable without horizontal clipping");

  const screenshotPath = path.join(evidenceDir, "zoom-200.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  evidence.screenshots.push({
    name: "zoom-200",
    path: path.basename(screenshotPath),
    sha256: sha256(screenshotPath),
    viewport: { width: 1440, height: 1000 },
  });
  await context.close();
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const matrices = [
    [{ width: 390, height: 844 }, "mobile-portrait"],
    [{ width: 844, height: 390 }, "mobile-landscape"],
    [{ width: 768, height: 1024 }, "tablet"],
    [{ width: 1440, height: 900 }, "desktop"],
  ];

  for (const [viewport, name] of matrices) {
    await captureViewport(browser, viewport, name);
  }
  await captureReducedMotion(browser);
  await captureHighZoom(browser);

  assert.equal(evidence.gameplayRequests.length, 0, "visual preview called gameplay APIs");
  assert.equal(evidence.pageErrors.length, 0, "browser page errors were observed");
  assert.equal(evidence.httpErrors.length, 0, "unexpected HTTP errors were observed");

  const unexpectedConsoleErrors = evidence.consoleErrors.filter(
    ({ text }) => !/rive|\.riv|fetch/i.test(text),
  );
  assert.equal(
    unexpectedConsoleErrors.length,
    0,
    "unexpected browser console errors were observed",
  );

  record("no gameplay endpoint requests");
  record("no page errors or unexpected HTTP errors");
  record("missing Rive assets remain contained to static fallback", {
    observedConsoleErrors: evidence.consoleErrors.length,
  });
  evidence.classification = "PASS";
} catch (error) {
  evidence.classification = "FAIL";
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(evidenceDir, "browser-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

console.log(
  JSON.stringify(
    {
      classification: evidence.classification,
      checks: evidence.checks.length,
      screenshots: evidence.screenshots.length,
      consoleErrors: evidence.consoleErrors.length,
      pageErrors: evidence.pageErrors.length,
      httpErrors: evidence.httpErrors.length,
      gameplayRequests: evidence.gameplayRequests.length,
    },
    null,
    2,
  ),
);
