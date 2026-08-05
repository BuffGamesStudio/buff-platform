import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const coreSha = process.env.MOVIE_BUFF_CORE_SHA?.trim();
const repairSha = process.env.MOVIE_BUFF_BOARD_REPAIR_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR;
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;
if (!expectedSha || !coreSha || !repairSha || !appUrl || !usersPath || !evidenceDir || !playwrightRoot) {
  throw new Error("MOVIE_BUFF_EXPECTED_GIT_SHA, MOVIE_BUFF_CORE_SHA, MOVIE_BUFF_BOARD_REPAIR_SHA, MOVIE_BUFF_APP_URL, MOVIE_BUFF_LOCAL_USERS_OUTPUT, MOVIE_BUFF_EVIDENCE_DIR, and PLAYWRIGHT_PACKAGE_ROOT are required.");
}
for (const value of [expectedSha, coreSha, repairSha]) assert.match(value, /^[0-9a-f]{40}$/i);
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

const evidence = {
  schemaVersion: 3,
  laboratory: "movie-buff-core-v12-three-browser",
  classification: "UNKNOWN",
  exactHarnessSha: expectedSha,
  coreSha,
  boardRepairSha: repairSha,
  checkoutSha,
  target: { kind: "localhost", origin: target.origin },
  browserProcessCount: 3,
  browserContextCount: 3,
  startedAt: new Date().toISOString(),
  roomIds: [],
  finalPaths: [],
  forbiddenControls: {},
  sharedStateErrors: {},
  pageErrors: [],
  consoleErrors: [],
  checks: [],
};
function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", details });
}
const forbidden = ["Start Round", "Continue to Clip Round", "Next Round", "Waiting for host to click"];
const sharedStateFailures = [
  "Shared match state is unavailable",
  "duplicate key value violates unique constraint",
  "movie_buff_boards_room_id_key",
];
const browsers = [];
const contexts = [];
const pages = [];

try {
  for (let index = 0; index < players.length; index += 1) {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => evidence.pageErrors.push({ player: index + 1, message: error.message.slice(0, 1000) }));
    page.on("console", (message) => {
      if (message.type() === "error") evidence.consoleErrors.push({ player: index + 1, message: message.text().slice(0, 1000) });
    });
    pages.push(page);
  }
  pass("three-independent-browser-processes", { count: browsers.length });

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
    await page.getByText("Checking your Buff Games account", { exact: false }).waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
    await page.getByRole("button", { name: "Find Match" }).waitFor({ state: "visible", timeout: 60_000 });
  }));
  pass("three-persisted-auth-browser-sessions");

  await Promise.all(pages.map(async (page) => {
    const button = page.getByRole("button", { name: "Find Match" });
    await page.waitForFunction(() => {
      const candidate = [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Find Match"));
      return Boolean(candidate && !candidate.disabled);
    }, null, { timeout: 60_000 });
    await button.click();
    await page.waitForURL(/\/games\/movie-buff\/waiting-room\?/, { timeout: 90_000 });
  }));

  const roomIds = pages.map((page) => new URL(page.url()).searchParams.get("roomId"));
  evidence.roomIds = roomIds;
  assert.ok(roomIds.every(Boolean));
  assert.equal(new Set(roomIds).size, 1, "all three browsers must converge on one room");
  pass("strict-three-room-convergence", { roomId: roomIds[0] });

  await Promise.all(pages.map(async (page) => {
    await page.getByText("3 of 3 Joined", { exact: false }).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "I'm Ready" }).click();
  }));
  pass("three-ready-signals-submitted");

  await Promise.all(pages.map((page) => page.waitForFunction(
    () => ["/games/movie-buff/round-intro", "/games/movie-buff/play"].some((prefix) => location.pathname.startsWith(prefix)),
    null,
    { timeout: 90_000 },
  )));
  const finalPaths = pages.map((page) => new URL(page.url()).pathname);
  evidence.finalPaths = finalPaths;
  assert.equal(new Set(finalPaths).size, 1, "all three browsers must share one runtime route");
  pass("shared-runtime-route", { path: finalPaths[0] });

  await Promise.all(pages.map((page) => page.waitForTimeout(3000)));

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const controlResults = {};
    for (const text of forbidden) {
      controlResults[text] = await page.getByText(text, { exact: false }).count();
      assert.equal(controlResults[text], 0, `forbidden manual phase control visible: ${text}`);
    }
    evidence.forbiddenControls[`player-${index + 1}`] = controlResults;

    const sharedResults = {};
    for (const text of sharedStateFailures) {
      sharedResults[text] = await page.getByText(text, { exact: false }).count();
      assert.equal(sharedResults[text], 0, `shared-state failure visible for player ${index + 1}: ${text}`);
    }
    evidence.sharedStateErrors[`player-${index + 1}`] = sharedResults;
    await page.screenshot({ path: path.join(evidenceDir, `player-${index + 1}-runtime.png`), fullPage: true });
  }
  pass("forbidden-manual-phase-controls-absent", { forbidden });
  pass("shared-state-failure-surfaces-absent", { sharedStateFailures });

  assert.equal(evidence.pageErrors.length, 0, `page errors observed: ${JSON.stringify(evidence.pageErrors)}`);
  assert.equal(evidence.consoleErrors.length, 0, `console errors observed: ${JSON.stringify(evidence.consoleErrors)}`);
  pass("browser-error-channels-clean");
  evidence.classification = "PASS";
} catch (error) {
  evidence.classification = "FAIL";
  evidence.failure = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
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
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
