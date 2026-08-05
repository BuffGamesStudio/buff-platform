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

const actualBlob = execFileSync(
  "git",
  ["rev-parse", `HEAD:${sourcePath}`],
  { encoding: "utf8" },
).trim();
assert.equal(actualBlob, expectedBlob, "reviewed v3 wrapper blob drifted");

const source = fs.readFileSync(sourcePath, "utf8");
const insertionAnchor = "const transformedPath = path.join(\n";
assert.equal(
  source.split(insertionAnchor).length - 1,
  1,
  "expected one transformed harness output anchor",
);

const additions = "const fallbackPathAnchor = 'parsed.pathname.startsWith(\"/movie-buff/animations/\")';\nassert.equal(\n  transformed.split(fallbackPathAnchor).length - 1,\n  1,\n  \"expected one MOV-18 fallback path anchor\",\n);\ntransformed = transformed.replace(\n  fallbackPathAnchor,\n  'parsed.pathname.startsWith(\"/movie-buff/rive/\")',\n);\n\nconst fallbackFlagAnchor = \"const offlineExercise = [false, false, false];\\\\nconst responseInspections = [];\";\nconst fallbackFlagReplacement = \"const offlineExercise = [false, false, false];\\\\nconst fallbackExercise = [false, false, false];\\\\nconst responseInspections = [];\";\nassert.equal(\n  transformed.split(fallbackFlagAnchor).length - 1,\n  1,\n  \"expected one fallback exercise flag anchor\",\n);\ntransformed = transformed.replace(\n  fallbackFlagAnchor,\n  fallbackFlagReplacement,\n);\n\nconst fallbackEvidenceAnchor = \"  consoleErrors: [],\\\\n  expectedOfflineConsoleErrors: [],\\\\n  failedResponses: [],\";\nconst fallbackEvidenceReplacement = \"  consoleErrors: [],\\\\n  expectedOfflineConsoleErrors: [],\\\\n  expectedFallbackConsoleErrors: [],\\\\n  failedResponses: [],\";\nassert.equal(\n  transformed.split(fallbackEvidenceAnchor).length - 1,\n  1,\n  \"expected one fallback console evidence anchor\",\n);\ntransformed = transformed.replace(\n  fallbackEvidenceAnchor,\n  fallbackEvidenceReplacement,\n);\n\nconst fallbackConsoleAnchor = \"    if (offlineExercise[index] && text.includes(\\\\\\\"ERR_INTERNET_DISCONNECTED\\\\\\\")) {\\\\n      evidence.expectedOfflineConsoleErrors.push({ player: index + 1, message: text });\\\\n      return;\\\\n    }\\\\n    evidence.consoleErrors.push({ player: index + 1, message: text });\";\nconst fallbackConsoleReplacement = \"    if (offlineExercise[index] && text.includes(\\\\\\\"ERR_INTERNET_DISCONNECTED\\\\\\\")) {\\\\n      evidence.expectedOfflineConsoleErrors.push({ player: index + 1, message: text });\\\\n      return;\\\\n    }\\\\n    if (fallbackExercise[index] && text.includes(\\\\\\\"404 (Not Found)\\\\\\\")) {\\\\n      evidence.expectedFallbackConsoleErrors.push({ player: index + 1, message: text });\\\\n      return;\\\\n    }\\\\n    evidence.consoleErrors.push({ player: index + 1, message: text });\";\nassert.equal(\n  transformed.split(fallbackConsoleAnchor).length - 1,\n  1,\n  \"expected one fallback console observer anchor\",\n);\ntransformed = transformed.replace(\n  fallbackConsoleAnchor,\n  fallbackConsoleReplacement,\n);\n\nconst mov18Anchor = \"  await pages[0].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n  await pages[0].getByText(\\\\\\\"The motion asset or renderer could not load\\\\\\\", { exact: false }).waitFor({ timeout: 60_000 });\\\\n  await assertMarker(pages[0], 1);\\\\n  pass(\\\\\\\"mov18-missing-asset-static-fallback\\\\\\\");\\\\n\\\\n  await pages[2].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n  await pages[2].getByText(\\\\\\\"Reduced-motion mode is active\\\\\\\", { exact: false }).waitFor({ timeout: 60_000 });\\\\n  const reducedMotionMatch = await pages[2].evaluate(() => matchMedia(\\\\\\\"(prefers-reduced-motion: reduce)\\\\\\\").matches);\\\\n  assert.equal(reducedMotionMatch, true);\\\\n  await assertMarker(pages[2], 3);\\\\n  pass(\\\\\\\"mov18-reduced-motion-static-fallback\\\\\\\");\\\\n\\\\n  await pages[1].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n  await assertMarker(pages[1], 2);\";\nconst mov18Replacement = \"  fallbackExercise[0] = true;\\\\n  try {\\\\n    await pages[0].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n    await pages[0].getByText(\\\\\\\"The motion asset or renderer could not load\\\\\\\", { exact: false }).first().waitFor({ timeout: 60_000 });\\\\n    await pages[0].waitForTimeout(250);\\\\n    await assertMarker(pages[0], 1);\\\\n    pass(\\\\\\\"mov18-missing-asset-static-fallback\\\\\\\");\\\\n  } finally {\\\\n    fallbackExercise[0] = false;\\\\n  }\\\\n\\\\n  fallbackExercise[2] = true;\\\\n  try {\\\\n    await pages[2].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n    await pages[2].getByText(\\\\\\\"Reduced-motion mode is active\\\\\\\", { exact: false }).first().waitFor({ timeout: 60_000 });\\\\n    await pages[2].waitForTimeout(250);\\\\n    const reducedMotionMatch = await pages[2].evaluate(() => matchMedia(\\\\\\\"(prefers-reduced-motion: reduce)\\\\\\\").matches);\\\\n    assert.equal(reducedMotionMatch, true);\\\\n    await assertMarker(pages[2], 3);\\\\n    pass(\\\\\\\"mov18-reduced-motion-static-fallback\\\\\\\");\\\\n  } finally {\\\\n    fallbackExercise[2] = false;\\\\n  }\\\\n\\\\n  fallbackExercise[1] = true;\\\\n  try {\\\\n    await pages[1].goto(`${target.origin}/games/movie-buff/visual-runtime-preview`, { waitUntil: \\\\\\\"domcontentloaded\\\\\\\", timeout: 60_000 });\\\\n    await pages[1].getByText(\\\\\\\"The motion asset or renderer could not load\\\\\\\", { exact: false }).first().waitFor({ timeout: 60_000 });\\\\n    await pages[1].waitForTimeout(250);\\\\n    await assertMarker(pages[1], 2);\\\\n  } finally {\\\\n    fallbackExercise[1] = false;\\\\n  }\";\nassert.equal(\n  transformed.split(mov18Anchor).length - 1,\n  1,\n  \"expected one MOV-18 preview sequence anchor\",\n);\ntransformed = transformed.replace(\n  mov18Anchor,\n  mov18Replacement,\n);\n\nconst fallbackFinalAnchor = \"    expectedOfflineConsoleErrors: evidence.expectedOfflineConsoleErrors.length,\\\\n    expectedNavigationAborts: evidence.failedRequests.filter((request) => request.errorText === \\\\\\\"net::ERR_ABORTED\\\\\\\").length,\\\\n    expectedRiveFallbackResponses: evidence.expectedFallbackResponses.length,\";\nconst fallbackFinalReplacement = \"    expectedOfflineConsoleErrors: evidence.expectedOfflineConsoleErrors.length,\\\\n    expectedFallbackConsoleErrors: evidence.expectedFallbackConsoleErrors.length,\\\\n    expectedNavigationAborts: evidence.failedRequests.filter((request) => request.errorText === \\\\\\\"net::ERR_ABORTED\\\\\\\").length,\\\\n    expectedRiveFallbackResponses: evidence.expectedFallbackResponses.length,\";\nassert.equal(\n  transformed.split(fallbackFinalAnchor).length - 1,\n  1,\n  \"expected one final MOV-18 evidence detail anchor\",\n);\ntransformed = transformed.replace(\n  fallbackFinalAnchor(\n  fallbackFinalReplacement,\n);\n\n";
const transformedRunner = source.replace(
  insertionAnchor,
  `${additions}${insertionAnchor}`,
);
const transformedRunnerPath = path.join(
  runnerTemp,
  `movie-buff-three-client-full-journey-v5-${process.pid}.mjs`,
);
fs.writeFileSync(transformedRunnerPath, transformedRunner, "utf8");

try {
  const result = spawnSync(process.execPath, [transformedRunnerPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(transformedRunnerPath, { force: true });
}
