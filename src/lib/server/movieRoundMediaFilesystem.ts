import fsp from "node:fs/promises";
import path from "node:path";

const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_LOCK_WAIT_INTERVAL_MS = 25;

export type PoolAssetPath = {
  absolutePath: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isMissingFilesystemEntry(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function shouldPurgeRuntimeAsset(
  fileName: string,
  expired: boolean,
) {
  if (fileName.endsWith(".lock")) {
    return false;
  }

  return expired;
}

export async function withExclusiveFilesystemLock<T>(
  lockPath: string,
  callback: () => Promise<T>,
  options?: {
    waitIntervalMs?: number;
    waitTimeoutMs?: number;
  },
): Promise<T> {
  const startedAt = Date.now();
  const waitTimeoutMs =
    options?.waitTimeoutMs ?? DEFAULT_LOCK_WAIT_TIMEOUT_MS;
  const waitIntervalMs =
    options?.waitIntervalMs ?? DEFAULT_LOCK_WAIT_INTERVAL_MS;

  await fsp.mkdir(path.dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const handle = await fsp.open(lockPath, "wx");

      try {
        return await callback();
      } finally {
        await handle.close();
        await fsp.unlink(lockPath).catch(() => {});
      }
    } catch (error) {
      if (
        !(
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "EEXIST"
        )
      ) {
        throw error;
      }

      if (Date.now() - startedAt > waitTimeoutMs) {
        throw new Error(
          `Timed out waiting for round-media lock ${path.basename(lockPath)}.`,
        );
      }

      await sleep(waitIntervalMs);
    }
  }
}

async function renameRoundAssetWithReconciliation(
  sourcePath: string,
  roundAssetPath: string,
  relistPrimaryAssets: () => Promise<PoolAssetPath[]>,
) {
  try {
    await fsp.rename(sourcePath, roundAssetPath);
    return true;
  } catch (error) {
    if (!isMissingFilesystemEntry(error)) {
      throw error;
    }

    try {
      await fsp.stat(roundAssetPath);
      return true;
    } catch (roundError) {
      if (!isMissingFilesystemEntry(roundError)) {
        throw roundError;
      }
    }

    const refreshedAssets = await relistPrimaryAssets();
    const refreshedSource = refreshedAssets[0]?.absolutePath;

    if (!refreshedSource) {
      return false;
    }

    try {
      await fsp.rename(refreshedSource, roundAssetPath);
      return true;
    } catch (retryError) {
      if (!isMissingFilesystemEntry(retryError)) {
        throw retryError;
      }

      try {
        await fsp.stat(roundAssetPath);
        return true;
      } catch (roundError) {
        if (!isMissingFilesystemEntry(roundError)) {
          throw roundError;
        }
        return false;
      }
    }
  }
}

export async function consumeAuthoritativeRoundAsset(options: {
  lockPath: string;
  roundAssetPath: string;
  listPrimaryAssets: () => Promise<PoolAssetPath[]>;
}) {
  return withExclusiveFilesystemLock(options.lockPath, async () => {
    try {
      await fsp.stat(options.roundAssetPath);
      return {
        available: true,
        consumedPrimary: false,
      };
    } catch (error) {
      if (!isMissingFilesystemEntry(error)) {
        throw error;
      }
    }

    const readyAssets = await options.listPrimaryAssets();
    const chosenAsset = readyAssets[0]?.absolutePath;

    if (!chosenAsset) {
      return {
        available: false,
        consumedPrimary: false,
      };
    }

    await fsp.mkdir(path.dirname(options.roundAssetPath), {
      recursive: true,
    });

    const available = await renameRoundAssetWithReconciliation(
      chosenAsset,
      options.roundAssetPath,
      options.listPrimaryAssets,
    );

    return {
      available,
      consumedPrimary: available,
    };
  });
}

export async function promotePoolAssetSafely(options: {
  lockPath: string;
  listSecondaryAssets: () => Promise<PoolAssetPath[]>;
  createPrimaryPath: () => string;
}) {
  return withExclusiveFilesystemLock(options.lockPath, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reserveAssets = await options.listSecondaryAssets();
      const chosenAsset = reserveAssets[0]?.absolutePath;

      if (!chosenAsset) {
        return false;
      }

      const promotedAssetPath = options.createPrimaryPath();
      await fsp.mkdir(path.dirname(promotedAssetPath), {
        recursive: true,
      });

      try {
        await fsp.rename(chosenAsset, promotedAssetPath);
        return true;
      } catch (error) {
        if (!isMissingFilesystemEntry(error)) {
          throw error;
        }
      }
    }

    return false;
  });
}
