#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(
  fileURLToPath(import.meta.url),
);
const repoRoot = path.resolve(scriptDir, "..");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/build-movie-buff-montages.mjs --bundle <path> --manifest <path> [--movie <title>] [--limit <count>] [--apply]",
      "  node scripts/build-movie-buff-montages.mjs --bundle <path> --write-template <path>",
      "",
      "Options:",
      "  --bundle <path>          Path to the Movie Buff admin import bundle JSON.",
      "  --manifest <path>        JSON file mapping movie titles to local source master files.",
      "  --movie <title>          Build only one title.",
      "  --limit <count>          Build only the first N movies in launch order.",
      "  --apply                  Run FFmpeg and write assets. Without this flag the script only reports the plan.",
      "  --write-template <path>  Write a source-manifest template derived from the bundle.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    apply: false,
    bundlePath: "",
    limit: null,
    manifestPath: "",
    movieTitle: "",
    templatePath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--apply") {
      args.apply = true;
      continue;
    }

    if (value === "--bundle") {
      args.bundlePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--manifest") {
      args.manifestPath = argv[index + 1] ?? "";
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

    if (value === "--write-template") {
      args.templatePath = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  if (!args.bundlePath) {
    printUsage();
    throw new Error("Missing required --bundle argument.");
  }

  if (!args.templatePath && !args.manifestPath) {
    printUsage();
    throw new Error(
      "Provide either --manifest or --write-template.",
    );
  }

  return args;
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

function normalizeMovieText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isRemoteSource(value) {
  return /^https?:\/\//i.test(value);
}

function buildRemoteCachePath(sourcePath) {
  const url = new URL(sourcePath);
  const parsedPath = path.parse(url.pathname);
  const safeBaseName =
    (parsedPath.name || "remote-source")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "remote-source";
  const extension =
    parsedPath.ext || ".mp4";
  const sourceHash = createHash("sha1")
    .update(sourcePath)
    .digest("hex")
    .slice(0, 12);

  return path.join(
    os.tmpdir(),
    "movie-buff-source-cache",
    `${safeBaseName}-${sourceHash}${extension}`,
  );
}

async function downloadRemoteSource(sourcePath) {
  const cachePath =
    buildRemoteCachePath(sourcePath);

  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  fs.mkdirSync(path.dirname(cachePath), {
    recursive: true,
  });

  const tempPath = `${cachePath}.partial`;

  try {
    const curlResult = spawnSync(
      "curl",
      [
        "--location",
        "--fail",
        "--silent",
        "--show-error",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--output",
        tempPath,
        sourcePath,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    if (curlResult.status !== 0) {
      throw new Error(
        curlResult.stderr ||
          curlResult.stdout ||
          `Could not download remote source ${sourcePath}.`,
      );
    }

    fs.renameSync(tempPath, cachePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    throw error;
  }

  return cachePath;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} failed.\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout;
}

function getMediaInfo(sourcePath) {
  const output = runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type",
    "-of",
    "json",
    sourcePath,
  ]);

  const parsed = JSON.parse(output);
  const duration = Number.parseFloat(
    parsed.format?.duration ?? "0",
  );
  const hasAudio = Array.isArray(
    parsed.streams,
  )
    ? parsed.streams.some(
        (stream) =>
          stream.codec_type === "audio",
      )
    : false;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Could not read a valid duration for ${sourcePath}.`,
    );
  }

  return {
    duration,
    hasAudio,
  };
}

function buildSegmentStarts(durationSeconds) {
  const maxStart = Math.max(
    durationSeconds - 5,
    0,
  );

  return [
    maxStart >= 30 ? 30 : 0,
    clamp(durationSeconds * 0.1, 0, maxStart),
    clamp(durationSeconds * 0.45, 0, maxStart),
    clamp(durationSeconds * 0.55, 0, maxStart),
    clamp(durationSeconds * 0.8, 0, maxStart),
    clamp(durationSeconds * 0.9, 0, maxStart),
  ].map((value) =>
    Number(value.toFixed(2)),
  );
}

function createManifestTemplate(bundle) {
  return {
    generatedAt: new Date().toISOString(),
    notes: [
      "Fill sourcePath with either a local movie master file or a direct downloadable movie file URL that you are legally allowed to use.",
      "The montage builder will cut 6 x 5-second segments into one 30-second final clip.",
    ],
    movies: bundle.movies.map((entry) => ({
      title: entry.movie.title,
      sourcePath: "",
      notes:
        "Example: D:/PublicDomainMovies/night-of-the-living-dead.mp4 or https://archive.org/download/<identifier>/<file>.mp4",
    })),
  };
}

function readManifest(manifestPath) {
  const parsed = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  );

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.movies)
      ? parsed.movies
      : [];

  const manifestByTitle = new Map();

  for (const row of rows) {
    if (
      typeof row?.title === "string" &&
      typeof row?.sourcePath === "string"
    ) {
      manifestByTitle.set(row.title, {
        sourcePath: row.sourcePath,
      });
    }
  }

  return manifestByTitle;
}

function buildOutputPaths(mediaUrl, thumbnailUrl) {
  if (
    typeof mediaUrl !== "string" ||
    !mediaUrl.startsWith("/")
  ) {
    throw new Error(
      `Expected mediaUrl to be a public site path, received ${mediaUrl}.`,
    );
  }

  const resolvedMediaPath = path.join(
    repoRoot,
    "public",
    mediaUrl.replace(/^\//, ""),
  );

  const resolvedThumbPath =
    typeof thumbnailUrl === "string" &&
    thumbnailUrl.startsWith("/")
      ? path.join(
          repoRoot,
          "public",
          thumbnailUrl.replace(/^\//, ""),
        )
      : path.join(
          path.dirname(resolvedMediaPath),
          `${path.parse(resolvedMediaPath).name}-thumb.jpg`,
        );

  return {
    mediaPath: resolvedMediaPath,
    thumbPath: resolvedThumbPath,
  };
}

function buildFilterComplex(
  segmentStarts,
  hasAudio,
) {
  const lines = [];

  segmentStarts.forEach((start, index) => {
    const end = Number((start + 5).toFixed(2));

    lines.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
    );

    if (hasAudio) {
      lines.push(
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`,
      );
    }
  });

  if (hasAudio) {
    const concatInputs = segmentStarts
      .map((_, index) => `[v${index}][a${index}]`)
      .join("");

    lines.push(
      `${concatInputs}concat=n=${segmentStarts.length}:v=1:a=1[vout][aout]`,
    );
  } else {
    const concatInputs = segmentStarts
      .map((_, index) => `[v${index}]`)
      .join("");

    lines.push(
      `${concatInputs}concat=n=${segmentStarts.length}:v=1:a=0[vout]`,
    );
  }

  return lines.join(";");
}

function buildPlanRows(bundle, args, manifestByTitle) {
  let movies = [...bundle.movies].sort(
    (left, right) =>
      (left.metadata?.launchOrder ?? 9999) -
      (right.metadata?.launchOrder ?? 9999),
  );

  if (args.movieTitle) {
    const normalizedRequestedTitle =
      normalizeMovieText(args.movieTitle);

    movies = movies.filter(
      (entry) =>
        entry.movie.title === args.movieTitle ||
        normalizeMovieText(entry.movie.title) ===
          normalizedRequestedTitle,
    );
  }

  if (
    Number.isFinite(args.limit) &&
    args.limit !== null &&
    args.limit > 0
  ) {
    movies = movies.slice(0, args.limit);
  }

  return movies.map((entry) => {
    const media = entry.media?.[0];

    if (!media) {
      throw new Error(
        `Bundle entry for ${entry.movie.title} does not have a media row.`,
      );
    }

    const manifestEntry = manifestByTitle.get(
      entry.movie.title,
    );
    const outputPaths = buildOutputPaths(
      media.mediaUrl,
      media.thumbnailUrl,
    );

    return {
      launchOrder:
        entry.metadata?.launchOrder ?? null,
      title: entry.movie.title,
      sourcePath:
        manifestEntry?.sourcePath ?? "",
      mediaUrl: media.mediaUrl,
      outputMediaPath:
        outputPaths.mediaPath,
      outputThumbPath:
        outputPaths.thumbPath,
    };
  });
}

function buildMontage(
  sourcePath,
  mediaPath,
  thumbPath,
) {
  const { duration, hasAudio } =
    getMediaInfo(sourcePath);
  const segmentStarts =
    buildSegmentStarts(duration);
  const filterComplex =
    buildFilterComplex(
      segmentStarts,
      hasAudio,
    );

  fs.mkdirSync(path.dirname(mediaPath), {
    recursive: true,
  });

  const ffmpegArgs = [
    "-y",
    "-i",
    sourcePath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
  ];

  if (hasAudio) {
    ffmpegArgs.push("-map", "[aout]");
  } else {
    ffmpegArgs.push("-an");
  }

  ffmpegArgs.push(
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
  );

  if (hasAudio) {
    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-b:a",
      "192k",
    );
  }

  ffmpegArgs.push(
    "-movflags",
    "+faststart",
    mediaPath,
  );

  runCommand("ffmpeg", ffmpegArgs);

  runCommand("ffmpeg", [
    "-y",
    "-ss",
    "15",
    "-i",
    mediaPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    thumbPath,
  ]);

  return {
    duration,
    hasAudio,
    segmentStarts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundlePath = path.resolve(
    process.cwd(),
    args.bundlePath,
  );

  if (!fs.existsSync(bundlePath)) {
    throw new Error(
      `Bundle file not found: ${bundlePath}`,
    );
  }

  const bundle = JSON.parse(
    fs.readFileSync(bundlePath, "utf8"),
  );

  if (args.templatePath) {
    const templatePath = path.resolve(
      process.cwd(),
      args.templatePath,
    );
    fs.mkdirSync(path.dirname(templatePath), {
      recursive: true,
    });
    fs.writeFileSync(
      templatePath,
      JSON.stringify(
        createManifestTemplate(bundle),
        null,
        2,
      ),
      "utf8",
    );
    console.log(
      JSON.stringify(
        {
          templateWritten: templatePath,
          movieCount:
            bundle.movies.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const manifestPath = path.resolve(
    process.cwd(),
    args.manifestPath,
  );

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Manifest file not found: ${manifestPath}`,
    );
  }

  const manifestByTitle =
    readManifest(manifestPath);
  const planRows = buildPlanRows(
    bundle,
    args,
    manifestByTitle,
  );

  if (planRows.length === 0) {
    throw new Error(
      "No movies matched the current selection.",
    );
  }

  const summary = {
    dryRun: !args.apply,
    requestedMovies: planRows.length,
    builtMovies: 0,
    missingSources: [],
    outputs: [],
  };

  for (const row of planRows) {
    if (!row.sourcePath) {
      summary.missingSources.push({
        title: row.title,
        reason:
          "No sourcePath found in manifest.",
      });
      continue;
    }

    const sourcePath = isRemoteSource(
      row.sourcePath,
    )
      ? row.sourcePath
      : path.resolve(
          process.cwd(),
          row.sourcePath,
        );

    if (
      !isRemoteSource(sourcePath) &&
      !fs.existsSync(sourcePath)
    ) {
      summary.missingSources.push({
        title: row.title,
        reason: `Missing source file ${sourcePath}.`,
      });
      continue;
    }

    if (!args.apply) {
      const mediaInfo = getMediaInfo(
        sourcePath,
      );
      summary.outputs.push({
        launchOrder: row.launchOrder,
        title: row.title,
        sourcePath,
        outputMediaPath:
          row.outputMediaPath,
        outputThumbPath:
          row.outputThumbPath,
        durationSeconds: Number(
          mediaInfo.duration.toFixed(2),
        ),
        hasAudio: mediaInfo.hasAudio,
        segmentStarts:
          buildSegmentStarts(
            mediaInfo.duration,
          ),
      });
      continue;
    }

    const buildSourcePath =
      isRemoteSource(sourcePath)
        ? await downloadRemoteSource(
            sourcePath,
          )
        : sourcePath;
    const buildResult = buildMontage(
      buildSourcePath,
      row.outputMediaPath,
      row.outputThumbPath,
    );

    summary.builtMovies += 1;
    summary.outputs.push({
      launchOrder: row.launchOrder,
      title: row.title,
      sourcePath,
      buildSourcePath,
      outputMediaPath:
        row.outputMediaPath,
      outputThumbPath:
        row.outputThumbPath,
      durationSeconds: Number(
        buildResult.duration.toFixed(2),
      ),
      hasAudio: buildResult.hasAudio,
      segmentStarts:
        buildResult.segmentStarts,
    });
  }

  console.log(
    JSON.stringify(summary, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
