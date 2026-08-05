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

const chromiumLaunch = "chromium.launch({ headless: true })";
const chromeLaunch = 'chromium.launch({ headless: true, channel: "chrome" })';
const chromiumLaunchCount = transformed.split(chromiumLaunch).length - 1;
assert.equal(chromiumLaunchCount, 1, "expected one reviewed Chromium launch anchor");
transformed = transformed.replace(chromiumLaunch, chromeLaunch);
assert.equal(transformed.split(chromiumLaunch).length - 1, 0);
assert.equal(transformed.split(chromeLaunch).length - 1, 1);

const browserEvidenceAnchor = "  browserProcessCount: 3,\n";
assert.equal(
  transformed.split(browserEvidenceAnchor).length - 1,
  1,
  "expected one browser evidence anchor",
);
transformed = transformed.replace(
  browserEvidenceAnchor,
  '  browserChannel: "chrome",\n  browserProcessCount: 3,\n',
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
