#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/movie-buff-build-inactive-static.mjs [--limit <count>] [--difficulty <level>] [--title <text>] [--apply]",
      "",
      "Options:",
      "  --limit <count>        Build only the first N inactive source-backed rows. Default: 3",
      "  --difficulty <level>  Filter by difficulty (easy, medium, hard, expert).",
      "  --title <text>        Filter rows whose title contains the given text.",
      "  --apply                Write assets and activate DB rows. Without this flag, only the plan is reported.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: 3,
    difficulty: null,
    title: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--apply") {
      args.apply = true;
      continue;
    }

    if (value === "--limit") {
      args.limit =
        Number.parseInt(argv[index + 1] ?? "3", 10) || 3;
      index += 1;
      continue;
    }

    if (value === "--difficulty") {
      args.difficulty =
        String(argv[index + 1] ?? "")
          .trim()
          .toLowerCase() || null;
      index += 1;
      continue;
    }

    if (value === "--title") {
      args.title =
        String(argv[index + 1] ?? "").trim() || null;
      index += 1;
      continue;
    }

    if (value === "--help" || value === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return args;
}

function readEnvFile(envPath) {
  const content = fs.readFileSync(envPath, "utf8");
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed
      .slice(separatorIndex + 1)
      .trim();

    values[key] = rawValue.replace(
      /^['"]|['"]$/g,
      "",
    );
  }

  return values;
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

function parseSizeBytes(value) {
  const parsed = Number.parseInt(
    String(value ?? ""),
    10,
  );
  return Number.isFinite(parsed) ? parsed : 0;
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
        getCandidateTier(right) - getCandidateTier(left);

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

async function resolveArchiveSource(sourceUrl) {
  if (!isArchiveDetailsUrl(sourceUrl)) {
    return sourceUrl;
  }

  const identifier = getArchiveIdentifier(sourceUrl);
  const metadataResponse = await fetch(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
  );

  if (!metadataResponse.ok) {
    throw new Error(
      `Archive metadata lookup failed with ${metadataResponse.status}.`,
    );
  }

  const metadata = await metadataResponse.json();
  const bestFile = chooseBestArchiveFile(
    Array.isArray(metadata?.files)
      ? metadata.files
      : [],
  );

  if (!bestFile) {
    throw new Error(
      "No suitable downloadable video file was found in archive metadata.",
    );
  }

  return buildDownloadUrl(identifier, bestFile.name);
}

function buildRemoteCachePath(sourceUrl) {
  const url = new URL(sourceUrl);
  const parsedPath = path.parse(url.pathname);
  const safeBaseName =
    (parsedPath.name || "remote-source")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "remote-source";
  const extension = parsedPath.ext || ".mp4";
  const sourceHash = createHash("sha1")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 12);

  return path.join(
    os.tmpdir(),
    "movie-buff-source-cache",
    `${safeBaseName}-${sourceHash}${extension}`,
  );
}

async function downloadRemoteSource(sourceUrl) {
  const cachePath = buildRemoteCachePath(sourceUrl);

  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  fs.mkdirSync(path.dirname(cachePath), {
    recursive: true,
  });

  const tempPath = `${cachePath}.partial`;
  const resumePath = fs.existsSync(tempPath)
    ? tempPath
    : tempPath;

  try {
    const curlResult = spawnSync(
      "curl",
      [
        "--continue-at",
        "-",
        "--location",
        "--fail",
        "--silent",
        "--show-error",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--output",
        resumePath,
        sourceUrl,
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
          `Could not download remote source ${sourceUrl}.`,
      );
    }

    fs.renameSync(resumePath, cachePath);
  } catch (error) {
    throw error;
  }

  return cachePath;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
  const hasAudio = Array.isArray(parsed.streams)
    ? parsed.streams.some(
        (stream) => stream.codec_type === "audio",
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
  const maxStart = Math.max(durationSeconds - 5, 0);

  return [
    maxStart >= 30 ? 30 : 0,
    clamp(durationSeconds * 0.1, 0, maxStart),
    clamp(durationSeconds * 0.45, 0, maxStart),
    clamp(durationSeconds * 0.55, 0, maxStart),
    clamp(durationSeconds * 0.8, 0, maxStart),
    clamp(durationSeconds * 0.9, 0, maxStart),
  ].map((value) => Number(value.toFixed(2)));
}

function buildFilterComplex(segmentStarts, hasAudio) {
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

function buildThumbPath(mediaPath) {
  return path.join(
    path.dirname(mediaPath),
    `${path.parse(mediaPath).name}-thumb.jpg`,
  );
}

function buildMontage(sourcePath, mediaPath) {
  const { duration, hasAudio } = getMediaInfo(sourcePath);
  const segmentStarts = buildSegmentStarts(duration);
  const filterComplex = buildFilterComplex(
    segmentStarts,
    hasAudio,
  );
  const thumbPath = buildThumbPath(mediaPath);

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
    ffmpegArgs.push("-c:a", "aac", "-b:a", "192k");
  }

  ffmpegArgs.push("-movflags", "+faststart", mediaPath);
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
    segmentStarts,
    thumbPath,
  };
}

const args = parseArgs(process.argv.slice(2));
const envPath = path.join(repoRoot, ".env.local");
const envValues = readEnvFile(envPath);

const supabase = createClient(
  envValues.NEXT_PUBLIC_SUPABASE_URL,
  envValues.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

let query = supabase
  .from("content_media")
  .select(
    "id, content_id, legacy_clip_id, title, difficulty, source_url, media_url, is_active, is_hidden",
  )
  .eq("media_type", "video")
  .eq("is_active", false)
  .eq("is_hidden", false)
  .like("source_url", "https://archive.org/%");

if (args.difficulty) {
  query = query.eq("difficulty", args.difficulty);
}

if (args.title) {
  query = query.ilike("title", `%${args.title}%`);
}

const { data, error } = await query
  .order("difficulty", { ascending: true })
  .order("created_at", { ascending: true })
  .limit(args.limit);

if (error) {
  throw new Error(error.message);
}

const rows = data ?? [];
const results = [];

for (const row of rows) {
  const mediaPath = path.join(
    repoRoot,
    "public",
    String(row.media_url ?? "").replace(/^\//, ""),
  );

  const resolvedSourceUrl = await resolveArchiveSource(
    row.source_url,
  );

  const result = {
    contentMediaId: row.id,
    contentId: row.content_id,
    legacyClipId: row.legacy_clip_id,
    title: row.title,
    difficulty: row.difficulty,
    targetMediaUrl: row.media_url,
    resolvedSourceUrl,
    built: false,
    activated: false,
  };

  if (args.apply) {
    const localSourcePath = await downloadRemoteSource(
      resolvedSourceUrl,
    );

    buildMontage(localSourcePath, mediaPath);

    const { error: mediaUpdateError } = await supabase
      .from("content_media")
      .update({ is_active: true })
      .eq("id", row.id);

    if (mediaUpdateError) {
      throw new Error(mediaUpdateError.message);
    }

    if (row.legacy_clip_id) {
      const { error: clipUpdateError } = await supabase
        .from("clips")
        .update({ is_active: true })
        .eq("id", row.legacy_clip_id);

      if (clipUpdateError) {
        throw new Error(clipUpdateError.message);
      }
    }

    await supabase.rpc("movie_buff_refresh_clip_analytics", {
      p_content_media_id: row.id,
    });

    if (row.content_id) {
      await supabase.rpc("movie_buff_refresh_movie_analytics", {
        p_content_id: row.content_id,
      });
    }

    result.built = true;
    result.activated = true;
  }

  results.push(result);
}

console.log(
  JSON.stringify(
    {
      apply: args.apply,
      count: results.length,
      results,
    },
    null,
    2,
  ),
);
