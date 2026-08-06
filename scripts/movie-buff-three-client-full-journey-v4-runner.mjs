import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const sourcePath = "scripts/movie-buff-three-client-full-journey-v3-runner.mjs";
const expectedBlob = process.env.MOVIE_BUFF_V3_RUNNER_BLOB?.trim();
const runnerTemp = process.env.RUNNER_TEMP?.trim();

if (!expectedBlob || !runnerTemp) {
  throw new Error("MOVIE_BUFF_V3_RUNNER_BLOB and RUNNER_TEMP are required.");
}
assert.match(expectedBlob, /^[0-9a-f]{40}$/i);

const actualBlob = execFileSync("git", ["rev-parse", `HEAD:${sourcePath}`], {
  encoding: "utf8",
}).trim();
assert.equal(actualBlob, expectedBlob, "reviewed v3 runner blob drifted");

const source = fs.readFileSync(sourcePath, "utf8");
const insertionAnchor = "const transformedPath = path.join(\n";
assert.equal(source.split(insertionAnchor).length - 1, 1, "v3 insertion anchor drifted");

const stabilization = String.raw`
const boardReturnAnchor = String.raw\`  await Promise.all(pages.map((page) => page.waitForURL(/\\/games\\/movie-buff\\/board-preview\\?/, { timeout: 60_000 })));
  const usedTiles = await Promise.all(pages.map((page) => page.evaluate(() => {\`;
const boardReturnReplacement = String.raw\`  await Promise.all(pages.map(async (page) => {
    await page.waitForURL(/\\/games\\/movie-buff\\/board-preview\\?/, { timeout: 60_000 });
    await page.getByText("Shared Game Board", { exact: false }).waitFor({ timeout: 60_000 });
    await page.getByText("Scene Complete", { exact: false }).first().waitFor({ timeout: 60_000 });
  }));
  const usedTiles = await Promise.all(pages.map((page) => page.evaluate(() => {\`;
assert.equal(transformed.split(boardReturnAnchor).length - 1, 1, "board-return convergence anchor drifted");
transformed = transformed.replace(boardReturnAnchor, boardReturnReplacement);

const refreshAnchor = String.raw\`  pass("automatic-board-return-selector-rotation-used-tile-buster", { previousSelector: selectorIndex + 1, nextSelector: nextSelectors[0] + 1, usedTiles });
  await screenshotAll("board-return");\`;
const refreshReplacement = String.raw\`  pass("automatic-board-return-selector-rotation-used-tile-buster", { previousSelector: selectorIndex + 1, nextSelector: nextSelectors[0] + 1, usedTiles });
  await pages[0].reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await pages[0].getByText("Shared Game Board", { exact: false }).waitFor({ timeout: 60_000 });
  await pages[0].getByText("Scene Complete", { exact: false }).first().waitFor({ timeout: 60_000 });
  await pages[0].getByText("Buster slate stamped", { exact: false }).first().waitFor({ timeout: 60_000 });
  pass("used-tile-treatment-survives-refresh");
  await screenshotAll("board-return");\`;
assert.equal(transformed.split(refreshAnchor).length - 1, 1, "used-tile refresh anchor drifted");
transformed = transformed.replace(refreshAnchor, refreshReplacement);
`;

const derived = source.replace(insertionAnchor, `${stabilization}\n${insertionAnchor}`);
assert.notEqual(derived, source, "v4 stabilization was not inserted");

const derivedPath = path.join(runnerTemp, `movie-buff-three-client-full-journey-v4-runner-${process.pid}.mjs`);
fs.writeFileSync(derivedPath, derived, "utf8");

try {
  const result = spawnSync(process.execPath, [derivedPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(derivedPath, { force: true });
}
