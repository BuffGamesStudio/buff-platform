import fs from "node:fs";

const clipperPath = "src/lib/server/movieClipper.ts";
const routePath = "src/app/api/movie-buff/round-media/[roundId]/route.ts";

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

let clipper = fs.readFileSync(clipperPath, "utf8");

if (!clipper.includes('from "@/lib/server/movieRoundMediaFilesystem"')) {
  clipper = replaceOnce(
    clipper,
    'import { supabaseAdmin } from "@/lib/server/supabaseAdmin";\n',
    'import { supabaseAdmin } from "@/lib/server/supabaseAdmin";\nimport {\n  consumeAuthoritativeRoundAsset,\n  isMissingFilesystemEntry,\n  promotePoolAssetSafely,\n  shouldPurgeRuntimeAsset,\n} from "@/lib/server/movieRoundMediaFilesystem";\n',
    "round-media filesystem import",
  );
}

clipper = replaceOnce(
  clipper,
  `      if (\n        isExpiredFile(nextPath) ||\n        entry.name.endsWith(".lock")\n      ) {\n        await fsp.unlink(nextPath).catch(() => {});\n      }`,
  `      if (\n        shouldPurgeRuntimeAsset(\n          entry.name,\n          isExpiredFile(nextPath),\n        )\n      ) {\n        await fsp.unlink(nextPath).catch(() => {});\n      }`,
  "purge active lock protection",
);

clipper = replaceOnce(
  clipper,
  `      .map(async (entry) => {\n        const absolutePath = path.join(\n          poolDirectory,\n          entry.name,\n        );\n        const stats = await fsp.stat(absolutePath);\n\n        return {\n          absolutePath,\n          mtimeMs: stats.mtimeMs,\n        };\n      }),\n  );\n\n  return files\n    .filter(\n      (file) => !isExpiredFile(file.absolutePath),\n    )\n    .sort((left, right) => left.mtimeMs - right.mtimeMs);`,
  `      .map(async (entry) => {\n        const absolutePath = path.join(\n          poolDirectory,\n          entry.name,\n        );\n\n        try {\n          const stats = await fsp.stat(absolutePath);\n          return {\n            absolutePath,\n            mtimeMs: stats.mtimeMs,\n          };\n        } catch (error) {\n          if (isMissingFilesystemEntry(error)) {\n            return null;\n          }\n          throw error;\n        }\n      }),\n  );\n\n  return files\n    .filter(\n      (file): file is { absolutePath: string; mtimeMs: number } =>\n        file !== null && !isExpiredFile(file.absolutePath),\n    )\n    .sort((left, right) => left.mtimeMs - right.mtimeMs);`,
  "pool stat ENOENT reconciliation",
);

const oldPromotion = `async function promoteSecondaryVariantToPrimary(\n  source: ClipSourceRecord,\n) {\n  const reserveAssets = await listPoolAssetPaths(\n    source,\n    "secondary",\n  );\n  const chosenAsset = reserveAssets[0];\n\n  if (!chosenAsset || !source.contentMediaId) {\n    return false;\n  }\n\n  const labelSegment = slugifyPathSegment(\n    source.difficultyLabel ?? "buff",\n  );\n  const variantKey = buildPoolVariantKey();\n  const promotedAsset = buildGeneratedAssetPath(\n    "pool",\n    \`primary/\${labelSegment}/\${source.contentMediaId}/\${variantKey}\`,\n    source.clipType,\n  );\n\n  await fsp.mkdir(\n    path.dirname(promotedAsset.absolutePath),\n    { recursive: true },\n  );\n  await fsp.rename(\n    chosenAsset.absolutePath,\n    promotedAsset.absolutePath,\n  );\n\n  return true;\n}`;

const newPromotion = `async function promoteSecondaryVariantToPrimary(\n  source: ClipSourceRecord,\n) {\n  if (!source.contentMediaId) {\n    return false;\n  }\n\n  const labelSegment = slugifyPathSegment(\n    source.difficultyLabel ?? "buff",\n  );\n  const lockHash = createHash("sha1")\n    .update(source.contentMediaId)\n    .digest("hex")\n    .slice(0, 16);\n\n  return promotePoolAssetSafely({\n    lockPath: path.join(\n      RUNTIME_PUBLIC_ROOT,\n      "locks",\n      \`pool-promote-\${lockHash}.lock\`,\n    ),\n    listSecondaryAssets: () =>\n      listPoolAssetPaths(source, "secondary"),\n    createPrimaryPath: () => {\n      const variantKey = buildPoolVariantKey();\n      return buildGeneratedAssetPath(\n        "pool",\n        \`primary/\${labelSegment}/\${source.contentMediaId}/\${variantKey}\`,\n        source.clipType,\n      ).absolutePath;\n    },\n  });\n}`;
clipper = replaceOnce(clipper, oldPromotion, newPromotion, "serialized pool promotion");

const start = clipper.indexOf("async function tryConsumePooledRoundClip(");
const end = clipper.indexOf("\nexport async function getRoundGeneratedClip(", start);
if (start < 0 || end < 0) throw new Error("Missing pooled round consumer block");
const newConsumer = `async function tryConsumePooledRoundClip(\n  roundId: string,\n  source: ClipSourceRecord,\n) {\n  const roundAsset = buildGeneratedAssetPath(\n    "round",\n    roundId,\n    source.clipType,\n  );\n  const lockHash = createHash("sha1")\n    .update(roundId)\n    .digest("hex")\n    .slice(0, 16);\n\n  const consumption =\n    await consumeAuthoritativeRoundAsset({\n      lockPath: path.join(\n        RUNTIME_PUBLIC_ROOT,\n        "locks",\n        \`round-consume-\${lockHash}.lock\`,\n      ),\n      roundAssetPath: roundAsset.absolutePath,\n      listPrimaryAssets: () =>\n        listPoolAssetPaths(source, "primary"),\n    });\n\n  if (!consumption.available) {\n    return null;\n  }\n\n  const promoted = consumption.consumedPrimary\n    ? await promoteSecondaryVariantToPrimary(source)\n    : false;\n\n  if (consumption.consumedPrimary) {\n    void ensurePoolAssetsForSource(source, 2);\n  }\n\n  return {\n    assetPath: roundAsset.absolutePath,\n    assetUrl: roundAsset.publicUrl,\n    clipType: source.clipType,\n    durationSeconds: FINAL_CLIP_DURATION_SECONDS,\n    hasAudio: source.clipType === "audio",\n    resolvedSourceUrl: "",\n    segmentStarts: [],\n    sourceDurationSeconds: 0,\n    strategyNotes: [\n      consumption.consumedPrimary\n        ? "Consumed one pre-generated primary pooled clip under the authoritative round lock."\n        : "Reused the authoritative round asset created by an earlier concurrent caller.",\n      promoted\n        ? "Promoted one reserve variant from secondary into primary under a source lock."\n        : "No secondary reserve promotion was required or available.",\n      consumption.consumedPrimary\n        ? "Queued a secondary replacement variant in the background."\n        : "Did not duplicate destructive pool consumption for this round.",\n    ],\n  } satisfies GeneratedClipSummary;\n}\n`;
clipper = `${clipper.slice(0, start)}${newConsumer}${clipper.slice(end)}`;
fs.writeFileSync(clipperPath, clipper, "utf8");

let route = fs.readFileSync(routePath, "utf8");
if (!route.includes('import path from "node:path";')) {
  route = replaceOnce(
    route,
    'import fsp from "node:fs/promises";\n',
    'import fsp from "node:fs/promises";\nimport path from "node:path";\n',
    "route path import",
  );
}
route = replaceOnce(
  route,
  `  } catch (error) {\n    return NextResponse.json(\n      {\n        error:\n          error instanceof Error\n            ? error.message\n            : "Round media could not be generated.",\n      },\n      { status: 500 },\n    );\n  }`,
  `  } catch (error) {\n    const filesystemError = error as NodeJS.ErrnoException;\n    const safePath =\n      typeof filesystemError.path === "string"\n        ? path.basename(filesystemError.path)\n        : null;\n\n    console.error("[movie-buff-round-media] resolution failed", {\n      roundId,\n      name:\n        error instanceof Error\n          ? error.name\n          : "UnknownError",\n      code: filesystemError.code ?? null,\n      syscall: filesystemError.syscall ?? null,\n      path: safePath,\n    });\n\n    return NextResponse.json(\n      { error: "Round media could not be generated." },\n      { status: 500 },\n    );\n  }`,
  "sanitized route logging",
);
fs.writeFileSync(routePath, route, "utf8");
