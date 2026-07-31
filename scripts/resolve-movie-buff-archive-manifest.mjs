#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/resolve-movie-buff-archive-manifest.mjs --bundle <path> --output <path> [--movie <title>] [--limit <count>]",
      "",
      "Options:",
      "  --bundle <path>   Path to the Movie Buff admin import bundle JSON.",
      "  --output <path>   Path to write the resolved manifest JSON.",
      "  --movie <title>   Resolve only one title.",
      "  --limit <count>   Resolve only the first N movies in launch order.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    bundlePath: "",
    limit: null,
    movieTitle: "",
    outputPath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--bundle") {
      args.bundlePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--output") {
      args.outputPath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--movie") {
      args.movieTitle = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--limit") {
      const rawLimit = argv[index + 1] ?? "";
      args.limit = Number.parseInt(rawLimit, 10);
      index += 1;
      continue;
    }

    if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  if (!args.bundlePath || !args.outputPath) {
    printUsage();
    throw new Error(
      "Both --bundle and --output are required.",
    );
  }

  return args;
}

function isArchiveDetailsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === "archive.org" &&
      url.pathname.startsWith("/details/")
    );
  } catch {
    return false;
  }
}

function getArchiveIdentifier(value) {
  const url = new URL(value);
  return decodeURIComponent(
    url.pathname.replace(/^\/details\//, ""),
  );
}

function parseSizeBytes(value) {
  const parsed = Number.parseInt(
    String(value ?? ""),
    10,
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function isVideoCandidate(file) {
  const name = String(file?.name ?? "");
  const loweredName = name.toLowerCase();
  const sizeBytes = parseSizeBytes(file?.size);

  if (
    !/\.(mp4|m4v|mov|mkv)$/i.test(name) ||
    loweredName.includes("sample") ||
    loweredName.includes("preview")
  ) {
    return false;
  }

  return sizeBytes >= 50_000_000;
}

function getCandidateTier(file) {
  const format = String(file?.format ?? "")
    .toLowerCase()
    .trim();
  const source = String(file?.source ?? "")
    .toLowerCase()
    .trim();

  if (
    source === "derivative" &&
    format.includes("h.264")
  ) {
    return 6;
  }

  if (
    source === "original" &&
    format.includes("h.264")
  ) {
    return 5;
  }

  if (
    source === "derivative" &&
    format.includes("mpeg4")
  ) {
    return 4;
  }

  if (format.includes("512kb")) {
    return 3;
  }

  if (source === "original") {
    return 2;
  }

  return 1;
}

function chooseBestArchiveFile(files) {
  const candidates = files
    .filter(isVideoCandidate)
    .sort((left, right) => {
      const tierDifference =
        getCandidateTier(right) -
        getCandidateTier(left);

      if (tierDifference !== 0) {
        return tierDifference;
      }

      return (
        parseSizeBytes(left.size) -
        parseSizeBytes(right.size)
      );
    });

  return candidates[0] ?? null;
}

function buildDownloadUrl(identifier, fileName) {
  const encodedSegments = [identifier, fileName].map(
    (segment) => encodeURIComponent(segment),
  );

  return `https://archive.org/download/${encodedSegments[0]}/${encodedSegments[1]}`;
}

function buildSelection(bundle, args) {
  let movies = [...bundle.movies].sort(
    (left, right) =>
      (left.metadata?.launchOrder ?? 9999) -
      (right.metadata?.launchOrder ?? 9999),
  );

  if (args.movieTitle) {
    movies = movies.filter(
      (entry) =>
        entry.movie?.title === args.movieTitle,
    );
  }

  if (
    Number.isFinite(args.limit) &&
    args.limit !== null &&
    args.limit > 0
  ) {
    movies = movies.slice(0, args.limit);
  }

  return movies;
}

async function resolveArchiveSource(sourceUrl) {
  if (!isArchiveDetailsUrl(sourceUrl)) {
    return {
      reason:
        "Source URL is not a direct archive.org details page.",
      sourcePath: "",
    };
  }

  const identifier =
    getArchiveIdentifier(sourceUrl);
  const metadataResponse = await fetch(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
  );

  if (!metadataResponse.ok) {
    return {
      reason: `Metadata lookup failed with ${metadataResponse.status}.`,
      sourcePath: "",
    };
  }

  const metadata =
    await metadataResponse.json();
  const bestFile = chooseBestArchiveFile(
    Array.isArray(metadata?.files)
      ? metadata.files
      : [],
  );

  if (!bestFile) {
    return {
      reason:
        "No suitable downloadable video file was found in archive metadata.",
      sourcePath: "",
    };
  }

  return {
    archiveFileName: bestFile.name,
    archiveFileSizeBytes:
      parseSizeBytes(bestFile.size),
    archiveFileFormat:
      String(bestFile.format ?? ""),
    archiveIdentifier: identifier,
    reason: "",
    sourcePath: buildDownloadUrl(
      identifier,
      bestFile.name,
    ),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = path.resolve(
    process.cwd(),
    args.bundlePath,
  );
  const outputPath = path.resolve(
    process.cwd(),
    args.outputPath,
  );

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `Bundle file not found: ${bundlePath}`,
    );
  }

  const bundle = JSON.parse(
    fs.readFileSync(bundlePath, "utf8"),
  );
  const selection = buildSelection(bundle, args);

  if (selection.length === 0) {
    throw new Error(
      "No movies matched the current selection.",
    );
  }

  const manifestRows = [];
  let resolvedCount = 0;

  for (const entry of selection) {
    const title = entry.movie?.title ?? "";
    const sourceUrl =
      entry.media?.[0]?.sourceUrl ?? "";
    const result =
      await resolveArchiveSource(sourceUrl);

    if (result.sourcePath) {
      resolvedCount += 1;
    }

    manifestRows.push({
      title,
      sourcePath: result.sourcePath,
      sourceUrl,
      archiveIdentifier:
        result.archiveIdentifier ?? "",
      archiveFileName:
        result.archiveFileName ?? "",
      archiveFileFormat:
        result.archiveFileFormat ?? "",
      archiveFileSizeBytes:
        result.archiveFileSizeBytes ?? 0,
      notes: result.reason
        ? result.reason
        : "Resolved from archive.org metadata.",
    });
  }

  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
  });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        notes: [
          "sourcePath values are direct downloadable movie file URLs resolved from archive.org item metadata.",
          "This manifest is intended for scripts/build-movie-buff-montages.mjs.",
        ],
        movies: manifestRows,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        requestedMovies: selection.length,
        resolvedMovies: resolvedCount,
        manifestPath: outputPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
