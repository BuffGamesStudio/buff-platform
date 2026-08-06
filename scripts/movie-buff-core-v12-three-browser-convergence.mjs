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
  throw new Error(
    "MOVIE_BUFF_EXPECTED_GIT_SHA, MOVIE_BUFF_CORE_SHA, MOVIE_BUFF_BOARD_REPAIR_SHA, MOVIE_BUFF_APP_URL, MOVIE_BUFF_LOCAL_USERS_OUTPUT, MOVIE_BUFF_EVIDENCE_DIR, and PLAYWRIGHT_PACKAGE_ROOT are required.",
  );
}
for (const value of [expectedSha, coreSha, repairSha]) {
  assert.match(value, /^[0-9a-f]{40}$/i);
}

const target = new URL(appUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local application target ${target.origin}.`);
}
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedSha);
execFileSync("git", ["merge-base", "--is-ancestor", coreSha, expectedSha]);
fs.mkdirSync(evidenceDir, { recursive: true });

const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.equal(users.length, 4);
const players = users.slice(0, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");

function redact(value) {
  return String(value)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED_SUPABASE_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED_LOCAL_DB_URL]")
    .slice(0, 2000);
}

function safeUrl(value) {
  const parsed = new URL(value);
  const allowedParams = new URLSearchParams();
  for (const [key, item] of parsed.searchParams) {
    if (/^(roomId|roundId|matchId)$/i.test(key)) allowedParams.set(key, item);
  }
  return `${parsed.origin}${parsed.pathname}${allowedParams.size ? `?${allowedParams}` : ""}`;
}

function isExpectedNavigationAbort(request) {
  return request.method === "GET" && request.errorText === "net::ERR_ABORTED";
}

const evidence = {
  schemaVersion: 6,
  laboratory: "movie-buff-core-v12-three-browser-convergence",
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
  initialPaths: [],
  finalPaths: [],
  preLockStatus: {},
  postLockStatus: {},
  forbiddenControls: {},
  sharedStateErrors: {},
  pageErrors: [],
  consoleErrors: [],
  failedResponses: [],
  failedRequests: [],
  unexpectedFailedRequests: [],
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
const sharedStateFailures = [
  "Shared match state is unavailable",
  "duplicate key value violates unique constraint",
  "movie_buff_boards_room_id_key",
];
const browsers = [];
const contexts = [];
const pages = [];
const responseInspectionPromises = [];

try {
  for (let index = 0; index < players.length; index += 1) {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      evidence.pageErrors.push({ player: index + 1, message: redact(error.message) });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        evidence.consoleErrors.push({ player: index + 1, message: redact(message.text()) });
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
      });
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const inspection = (async () => {
        let body = "";
        try {
          body = redact(await response.text());
        } catch (error) {
          body = `[response body unavailable: ${redact(error instanceof Error ? error.message : error)}]`;
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
    pages.push(page);
  }
  pass("three-independent-browser-processes", { count: browsers.length });

  await Promise.all(
    pages.map(async (page, index) => {
      const player = players[index];
      await page.goto(
        `${target.origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`,
        { waitUntil: "networkidle", timeout: 60_000 },
      );
      await page.getByPlaceholder("you@example.com").fill(player.email);
      await page.getByPlaceholder("Password").fill(player.password);
      await Promise.all([
        page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
        page.getByRole("button", { name: "Enter Buff Games" }).click(),
      ]);
      await page
        .getByText("Checking your Buff Games account", { exact: false })
        .waitFor({ state: "hidden", timeout: 60_000 })
        .catch(() => {});
      await page
        .getByRole("button", { name: "Find Match" })
        .waitFor({ state: "visible", timeout: 60_000 });
    }),
  );
  pass("three-persisted-auth-browser-sessions");

  await Promise.all(
    pages.map(async (page) => {
      const button = page.getByRole("button", { name: "Find Match" });
      await page.waitForFunction(
        () => {
          const candidate = [...document.querySelectorAll("button")].find((item) =>
            item.textContent?.includes("Find Match"),
          );
          return Boolean(candidate && !candidate.disabled);
        },
        null,
        { timeout: 60_000 },
      );
      await button.click();
      await page.waitForURL(/\/games\/movie-buff\/waiting-room\?/, {
        timeout: 90_000,
      });
    }),
  );

  const roomIds = pages.map((page) => new URL(page.url()).searchParams.get("roomId"));
  evidence.roomIds = roomIds;
  assert.ok(roomIds.every(Boolean));
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
        () =>
          ["/games/movie-buff/round-intro", "/games/movie-buff/play"].some((prefix) =>
            location.pathname.startsWith(prefix),
          ),
        null,
        { timeout: 90_000 },
      ),
    ),
  );
  const initialPaths = pages.map((page) => new URL(page.url()).pathname);
  evidence.initialPaths = initialPaths;
  assert.equal(new Set(initialPaths).size, 1, "all three browsers must share one runtime route");
  assert.equal(initialPaths[0], "/games/movie-buff/round-intro");
  pass("shared-round-intro-route", { path: initialPaths[0] });

  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => {
          const text = document.body.innerText.replace(/\s+/g, " ");
          return (
            text.includes("0 / 3") &&
            text.includes("LOCK NO VIP") &&
            !text.includes("VIP selection is not available")
          );
        },
        null,
        { timeout: 20_000 },
      ),
    ),
  );
  for (let index = 0; index < pages.length; index += 1) {
    evidence.preLockStatus[`player-${index + 1}`] = {
      unavailableCount: await pages[index]
        .getByText("VIP selection is not available", { exact: false })
        .count(),
      zeroOfThreeCount: await pages[index].getByText("0 / 3", { exact: true }).count(),
      noVipButtonCount: await pages[index]
        .locator("button")
        .filter({ hasText: /^No VIP/ })
        .count(),
    };
  }
  pass("three-client-vip-window-convergence", evidence.preLockStatus);

  await Promise.all(
    pages.map(async (page) => {
      const noVipButton = page.locator("button").filter({ hasText: /^No VIP/ });
      assert.equal(await noVipButton.count(), 1, "each browser must expose exactly one No VIP choice");
      await noVipButton.click();
    }),
  );
  await Promise.all(
    pages.map((page) =>
      page.getByText("Selection locked", { exact: false }).waitFor({
        state: "visible",
        timeout: 15_000,
      }),
    ),
  );
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(
        () => document.body.innerText.replace(/\s+/g, " ").includes("3 / 3"),
        null,
        { timeout: 15_000 },
      ),
    ),
  );
  for (let index = 0; index < pages.length; index += 1) {
    evidence.postLockStatus[`player-${index + 1}`] = {
      selectionLockedCount: await pages[index]
        .getByText("Selection locked", { exact: false })
        .count(),
      threeOfThreeCount: await pages[index].getByText("3 / 3", { exact: true }).count(),
    };
  }
  pass("three-no-vip-locks-converged", evidence.postLockStatus);

  await Promise.all(pages.map((page) => page.waitForTimeout(1000)));
  await Promise.allSettled(responseInspectionPromises);

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
    await page.screenshot({
      path: path.join(evidenceDir, `player-${index + 1}-locked.png`),
      fullPage: true,
    });
  }
  pass("forbidden-manual-phase-controls-absent", { forbidden });
  pass("shared-state-failure-surfaces-absent", { sharedStateFailures });

  evidence.finalPaths = pages.map((page) => new URL(page.url()).pathname);
  assert.equal(new Set(evidence.finalPaths).size, 1, "all three browsers must remain on one route");
  evidence.unexpectedFailedRequests = evidence.failedRequests.filter(
    (request) => !isExpectedNavigationAbort(request),
  );
  assert.equal(evidence.pageErrors.length, 0, `page errors observed: ${JSON.stringify(evidence.pageErrors)}`);
  assert.equal(
    evidence.unexpectedFailedRequests.length,
    0,
    `unexpected failed requests observed: ${JSON.stringify(evidence.unexpectedFailedRequests)}`,
  );
  assert.equal(
    evidence.failedResponses.length,
    0,
    `HTTP error responses observed: ${JSON.stringify(evidence.failedResponses)}`,
  );
  assert.equal(
    evidence.consoleErrors.length,
    0,
    `console errors observed: ${JSON.stringify(evidence.consoleErrors)}`,
  );
  pass("browser-error-channels-clean", {
    expectedNavigationAbortCount: evidence.failedRequests.length,
  });
  evidence.classification = "PASS";
} catch (error) {
  await Promise.allSettled(responseInspectionPromises);
  evidence.unexpectedFailedRequests = evidence.failedRequests.filter(
    (request) => !isExpectedNavigationAbort(request),
  );
  evidence.classification = "FAIL";
  evidence.failure =
    error instanceof Error
      ? { name: error.name, message: redact(error.message), stack: redact(error.stack ?? "") }
      : { message: redact(error) };
  for (let index = 0; index < pages.length; index += 1) {
    try {
      await pages[index].screenshot({
        path: path.join(evidenceDir, `player-${index + 1}-failure.png`),
        fullPage: true,
      });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.pageErrorCount = evidence.pageErrors.length;
  evidence.consoleErrorCount = evidence.consoleErrors.length;
  evidence.failedResponseCount = evidence.failedResponses.length;
  evidence.failedRequestCount = evidence.failedRequests.length;
  evidence.unexpectedFailedRequestCount = evidence.unexpectedFailedRequests.length;
  fs.writeFileSync(
    path.join(evidenceDir, "three-browser-convergence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
