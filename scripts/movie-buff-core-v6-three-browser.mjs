import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const compositionSha = process.env.MOVIE_BUFF_COMPOSITION_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR;
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;

if (!expectedSha || !compositionSha || !appUrl || !usersPath || !evidenceDir || !playwrightRoot) {
  throw new Error(
    "MOVIE_BUFF_EXPECTED_GIT_SHA, MOVIE_BUFF_COMPOSITION_SHA, MOVIE_BUFF_APP_URL, MOVIE_BUFF_LOCAL_USERS_OUTPUT, MOVIE_BUFF_EVIDENCE_DIR, and PLAYWRIGHT_PACKAGE_ROOT are required.",
  );
}
for (const value of [expectedSha, compositionSha]) {
  assert.match(value, /^[0-9a-f]{40}$/i);
}
const target = new URL(appUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local application target ${target.origin}.`);
}
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, expectedSha);
execFileSync("git", ["merge-base", "--is-ancestor", compositionSha, expectedSha], {
  encoding: "utf8",
});

fs.mkdirSync(evidenceDir, { recursive: true });
const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.equal(users.length, 4);
const players = users.slice(0, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");

const evidence = {
  schemaVersion: 2,
  laboratory: "ephemeral-three-browser",
  classification: "UNKNOWN",
  exactHarnessSha: expectedSha,
  compositionSha,
  checkoutSha,
  target: { kind: "localhost", origin: target.origin },
  browserProcessCount: 3,
  browserContextCount: 3,
  startedAt: new Date().toISOString(),
  roomIds: [],
  finalPaths: [],
  forbiddenControls: {},
  pageErrors: [],
  consoleErrors: [],
  checks: [],
};

function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", details });
}

const forbidden = [
  "Start Round",
  "Continue to Clip Round",
  "Next Round",
  "Waiting for host to click",
];
const browsers = [];
const pages = [];

try {
  for (let index = 0; index < players.length; index += 1) {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      recordVideo: { dir: path.join(evidenceDir, `video-player-${index + 1}`) },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => evidence.pageErrors.push({ player: index + 1, message: error.message }));
    page.on("console", (message) => {
      if (message.type() === "error") {
        evidence.consoleErrors.push({ player: index + 1, message: message.text().slice(0, 500) });
      }
    });
    pages.push(page);
  }
  pass("three-independent-browser-processes", { count: browsers.length });

  await Promise.all(
    pages.map(async (page, index) => {
      const player = players[index];
      await page.goto(`${target.origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      await emailInput.waitFor({ state: "visible", timeout: 60_000 });
      await passwordInput.waitFor({ state: "visible", timeout: 60_000 });
      await emailInput.fill(player.email);
      await passwordInput.fill(player.password);
      await Promise.all([
        page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
        page.getByRole("button", { name: "Enter Buff Games" }).click(),
      ]);
      await page.getByRole("button", { name: "Find Match" }).waitFor({ state: "visible", timeout: 60_000 });
    }),
  );
  pass("three-authenticated-browser-sessions");

  await Promise.all(
    pages.map(async (page) => {
      const button = page.getByRole("button", { name: "Find Match" });
      await button.waitFor({ state: "visible", timeout: 60_000 });
      await page.waitForFunction(() => {
        const candidate = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Find Match"));
        return candidate && !candidate.disabled;
      }, null, { timeout: 60_000 });
      await button.click();
      await page.waitForURL(/\/games\/movie-buff\/waiting-room\?/, { timeout: 90_000 });
    }),
  );

  const roomIds = pages.map((page) => new URL(page.url()).searchParams.get("roomId"));
  evidence.roomIds = roomIds;
  assert.ok(roomIds.every(Boolean), "all three browsers must expose a roomId");
  assert.equal(new Set(roomIds).size, 1, "all three browsers must converge on one room");
  pass("strict-three-room-convergence", { roomId: roomIds[0] });

  await Promise.all(
    pages.map(async (page) => {
      await page.getByText("3 of 3 Joined", { exact: false }).waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "I'm Ready" }).click();
    }),
  );
  pass("three-ready-signals-submitted");

  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => ["/games/movie-buff/round-intro", "/games/movie-buff/play"].some((prefix) => location.pathname.startsWith(prefix)),
        null,
        { timeout: 90_000 },
      ),
    ),
  );

  const finalPaths = pages.map((page) => new URL(page.url()).pathname);
  evidence.finalPaths = finalPaths;
  assert.equal(new Set(finalPaths).size, 1, "all three browsers must share one runtime route");
  pass("shared-runtime-route", { path: finalPaths[0] });

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const results = {};
    for (const text of forbidden) {
      results[text] = await page.getByText(text, { exact: false }).count();
      assert.equal(results[text], 0, `forbidden manual phase control visible: ${text}`);
    }
    evidence.forbiddenControls[`player-${index + 1}`] = results;
    await page.screenshot({
      path: path.join(evidenceDir, `player-${index + 1}-runtime.png`),
      fullPage: true,
    });
  }
  pass("forbidden-manual-phase-controls-absent", { forbidden });

  evidence.classification = "PASS";
} catch (error) {
  evidence.classification = "FAIL";
  evidence.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  for (let index = 0; index < pages.length; index += 1) {
    try {
      await pages[index].screenshot({ path: path.join(evidenceDir, `player-${index + 1}-failure.png`), fullPage: true });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.pageErrorCount = evidence.pageErrors.length;
  evidence.consoleErrorCount = evidence.consoleErrors.length;
  fs.writeFileSync(path.join(evidenceDir, "three-browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
