import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const appUrl = process.env.MOVIE_BUFF_APP_URL?.trim();
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT?.trim();
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR?.trim();
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT?.trim();
const branch = process.env.MOVIE_BUFF_EXPECTED_BRANCH?.trim();
const sha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const marker = process.env.MOVIE_BUFF_BUILD_MARKER?.trim();

if (!appUrl || !usersPath || !evidenceDir || !playwrightRoot || !branch || !sha || !marker) {
  throw new Error("Agent 7 lobby audit requires exact app, users, evidence, Playwright, branch, SHA, and marker inputs.");
}

const target = new URL(appUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(target.hostname), `Refusing non-local target ${target.origin}`);
assert.match(sha, /^[0-9a-f]{40}$/i);
fs.mkdirSync(evidenceDir, { recursive: true });

const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.ok(Array.isArray(users) && users.length >= 3, "Three local users are required");
const players = users.slice(0, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");
const exactMarker = `${branch} · ${sha} · ${marker}`;

const evidence = {
  schemaVersion: 1,
  laboratory: "movie-buff-agent7-lobby-control-audit",
  classification: "UNKNOWN",
  branch,
  sha,
  exactMarker,
  target: target.origin,
  startedAt: new Date().toISOString(),
  clients: [],
  pageErrors: [],
  consoleErrors: [],
};

const browsers = [];
const contexts = [];
try {
  const profiles = [
    { viewport: { width: 1365, height: 900 }, reducedMotion: "no-preference" },
    { viewport: { width: 390, height: 844 }, reducedMotion: "no-preference", isMobile: true },
    { viewport: { width: 768, height: 1024 }, reducedMotion: "reduce" },
  ];

  for (let index = 0; index < 3; index += 1) {
    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    browsers.push(browser);
    const context = await browser.newContext(profiles[index]);
    contexts.push(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => evidence.pageErrors.push({ player: index + 1, message: error.message.slice(0, 1000) }));
    page.on("console", (message) => {
      if (message.type() === "error") evidence.consoleErrors.push({ player: index + 1, message: message.text().slice(0, 1000) });
    });

    await page.goto(`${target.origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.getByPlaceholder("you@example.com").fill(players[index].email);
    await page.getByPlaceholder("Password").fill(players[index].password);
    await Promise.all([
      page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
      page.getByRole("button", { name: "Enter Buff Games" }).click(),
    ]);
    await page.getByRole("button", { name: "Find Match" }).waitFor({ state: "visible", timeout: 60_000 });

    const buildMarker = page.getByTestId("movie-buff-build-marker");
    await buildMarker.waitFor({ state: "visible", timeout: 60_000 });
    assert.equal((await buildMarker.innerText()).replace(/\s+/g, " ").trim(), exactMarker);

    const labels = await page.locator("button,a").evaluateAll((elements) => elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean));

    const forbidden = labels.filter((label) => /^(start|continue|next)\b/i.test(label));
    const screenshot = `agent7-player-${index + 1}-lobby.png`;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
    evidence.clients.push({
      player: index + 1,
      viewport: profiles[index].viewport,
      reducedMotion: profiles[index].reducedMotion,
      markerVisible: true,
      visibleControls: labels,
      forbiddenControls: forbidden,
      screenshot,
    });
  }

  const forbiddenCount = evidence.clients.reduce((sum, client) => sum + client.forbiddenControls.length, 0);
  evidence.classification =
    forbiddenCount === 0 && evidence.pageErrors.length === 0 && evidence.consoleErrors.length === 0
      ? "PASS"
      : "FAIL";
  evidence.forbiddenControlCount = forbiddenCount;
  process.exitCode = evidence.classification === "PASS" ? 0 : 1;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.failure = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: String(error instanceof Error ? error.message : error).slice(0, 2000),
  };
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(evidenceDir, "agent7-lobby-control-audit.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await Promise.allSettled(contexts.map((context) => context.close()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
}
