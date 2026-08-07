import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const {
  consumeAuthoritativeRoundAsset,
  promotePoolAssetSafely,
  shouldPurgeRuntimeAsset,
} = await import("../src/lib/server/movieRoundMediaFilesystem.ts");

async function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".lock"))
    .map((entry) => ({ absolutePath: path.join(directory, entry.name) }))
    .sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
}

test("concurrent same-round consumers converge on one authoritative asset", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "movie-buff-round-media-"));
  try {
    const primary = path.join(root, "pool", "primary");
    const round = path.join(root, "round", "round-1.mp4");
    const lock = path.join(root, "locks", "round-1.lock");
    await fsp.mkdir(primary, { recursive: true });
    await fsp.writeFile(path.join(primary, "asset-a.mp4"), "authoritative-media");

    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });
    const callers = Array.from({ length: 8 }, async () => {
      await barrier;
      return consumeAuthoritativeRoundAsset({
        lockPath: lock,
        roundAssetPath: round,
        listPrimaryAssets: () => listFiles(primary),
      });
    });
    releaseBarrier();
    const results = await Promise.all(callers);

    assert.equal(await fsp.readFile(round, "utf8"), "authoritative-media");
    assert.equal(results.filter((result) => result.available).length, 8);
    assert.equal(results.filter((result) => result.consumedPrimary).length, 1);
    assert.equal((await listFiles(primary)).length, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("secondary promotion is serialized and consumes at most one reserve per caller", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "movie-buff-promotion-"));
  try {
    const primary = path.join(root, "primary");
    const secondary = path.join(root, "secondary");
    const lock = path.join(root, "locks", "promotion.lock");
    await fsp.mkdir(secondary, { recursive: true });
    await fsp.writeFile(path.join(secondary, "reserve-a.mp4"), "reserve-a");

    let sequence = 0;
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        promotePoolAssetSafely({
          lockPath: lock,
          listSecondaryAssets: () => listFiles(secondary),
          createPrimaryPath: () => path.join(primary, `promoted-${sequence++}.mp4`),
        }),
      ),
    );

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await listFiles(primary)).length, 1);
    assert.equal((await listFiles(secondary)).length, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("generic purge never deletes active lock files", () => {
  assert.equal(shouldPurgeRuntimeAsset("round.mp4.lock", true), false);
  assert.equal(shouldPurgeRuntimeAsset("promotion.named.lock", true), false);
  assert.equal(shouldPurgeRuntimeAsset("expired.mp4", true), true);
  assert.equal(shouldPurgeRuntimeAsset("fresh.mp4", false), false);
});
