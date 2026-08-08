import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  consumeAuthoritativeRoundAsset,
  isMissingFilesystemEntry,
  promotePoolAssetSafely,
  shouldPurgeRuntimeAsset,
} from "@/lib/server/movieRoundMediaFilesystem";

const SEGMENT_DURATION_SECONDS = 5;
const SEGMENTS_PER_ZONE = 2;
const FINAL_CLIP_DURATION_SECONDS =
  SEGMENT_DURATION_SECONDS * SEGMENTS_PER_ZONE * 3;
const GENERATED_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;
const LOCK_WAIT_TIMEOUT_MS = 60 * 1000;
const LOCK_WAIT_INTERVAL_MS = 500;
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const PUBLIC_ROOT = path.join(REPO_ROOT, "public");
const RUNTIME_PUBLIC_ROOT = path.join(
  PUBLIC_ROOT,
  "media",
  "movie-buff",
  "runtime-generated",
);
const REMOTE_SOURCE_CACHE_ROOT = path.join(
  os.tmpdir(),
  "movie-buff-source-cache",
);

type ClipKind = "video" | "audio";
type ClipPoolScope = "preview" | "round" | "pool";
type DifficultyPoolLabel =
  | "Fan"
  | "Fanatic"
  | "Buff";
type PoolTier = "primary" | "secondary";

type ClipSourceRecord = {
  clipType: ClipKind;
  contentId: string | null;
  contentMediaId: string | null;
  difficultyLabel: string | null;
  fallbackMediaUrl: string | null;
  id: string;
  movieTitle: string;
  sourceUrl: string | null;
};

type ResolvedSource = {
  cachePath: string;
  hasAudio: boolean;
  resolvedSourceUrl: string;
  sourceDurationSeconds: number;
};

type GeneratedClipSummary = {
  assetPath: string | null;
  assetUrl: string;
  clipType: ClipKind;
  durationSeconds: number;
  hasAudio: boolean;
  resolvedSourceUrl: string;
  segmentStarts: number[];
  sourceDurationSeconds: number;
  strategyNotes: string[];
};

type GeneratedRouteSummary = GeneratedClipSummary & {
  mediaId: string;
};

type GlobalPoolCandidate = {
  contentId: string | null;
  contentMediaId: string;
  difficultyLabel: DifficultyPoolLabel;
  movieTitle: string;
  clipType: ClipKind;
  qualityScore: number;
  rotationWeight: number;
  status: string;
  lastPlayedAt: string | null;
  totalPlays: number;
  sourceUrl: string | null;
  fallbackMediaUrl: string | null;
};

type GlobalPoolInventory = {
  perLabelReadyCounts: Record<
    DifficultyPoolLabel,
    Record<PoolTier, number>
  >;
  perMediaReadyCounts: Map<
    string,
    Record<PoolTier, number>
  >;
  perMovieReadyCounts: Map<
    string,
    Record<PoolTier, number>
  >;
};

type MovieBuffGlobalPoolStatus = {
  generatedAt: string;
  totalEligibleClips: number;
  totalPrimaryReadyAssets: number;
  totalSecondaryReadyAssets: number;
  perLabel: Array<{
    eligibleClips: number;
    label: DifficultyPoolLabel;
    primaryReadyAssets: number;
    secondaryReadyAssets: number;
  }>;
};

type MovieBuffGlobalPoolWarmSummary = {
  createdCount: number;
  failedCandidates: Array<{
    contentMediaId: string;
    error: string;
    label: DifficultyPoolLabel;
    tier: PoolTier;
  }>;
  skippedByCooldown: boolean;
};

type LegacyGlobalPoolRow = {
  id: string;
  movie_id: string;
  clip_type: string | null;
  is_active: boolean;
  media_url: string | null;
  source_url: string | null;
};

type LegacyGlobalPoolMovieRow = {
  id: string;
  title: string | null;
  difficulty: string | null;
};

const GLOBAL_POOL_LABELS: DifficultyPoolLabel[] = [
  "Fan",
  "Fanatic",
  "Buff",
];
const PRIMARY_POOL_TARGET_PER_LABEL = 4;
const SECONDARY_POOL_TARGET_PER_LABEL = 8;
const POOL_MAX_READY_PER_CLIP = 2;
const PRIMARY_POOL_MAX_READY_PER_MOVIE = 2;
const SECONDARY_POOL_MAX_READY_PER_MOVIE = 3;
const GLOBAL_POOL_MAX_NEW_ASSETS_PER_RUN = 6;
const GLOBAL_POOL_RUN_COOLDOWN_MS =
  2 * 60 * 1000;
const GLOBAL_POOL_STATE_PATH = path.join(
  RUNTIME_PUBLIC_ROOT,
  ".global-pool-state.json",
);

function runCommand(command: string, args: string[]) {
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

function normalizeClipKind(value: string | null | undefined): ClipKind {
  return value?.toLowerCase() === "audio"
    ? "audio"
    : "video";
}

function isMissingContentEngineSchemaMessage(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    (normalizedMessage.includes("content_media") ||
      normalizedMessage.includes("content_items") ||
      normalizedMessage.includes(
        "movie_buff_clip_analytics",
      )) &&
    (normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("does not exist"))
  );
}

function normalizeDifficultyPoolLabel(
  value: string | null | undefined,
): DifficultyPoolLabel {
  const normalized = value
    ?.trim()
    .toLowerCase();

  if (
    normalized === "rookie" ||
    normalized === "fan" ||
    normalized === "easy"
  ) {
    return "Fan";
  }

  if (
    normalized === "buff" ||
    normalized === "buffster" ||
    normalized === "hard" ||
    normalized === "expert"
  ) {
    return "Buff";
  }

  return "Fanatic";
}

function toPublicUrl(absolutePath: string) {
  const relativePath = path.relative(
    PUBLIC_ROOT,
    absolutePath,
  );

  return `/${relativePath.split(path.sep).join("/")}`;
}

function resolveExistingLocalPublicAsset(
  publicUrl: string | null | undefined,
) {
  const normalizedPublicUrl =
    publicUrl?.trim() ?? "";

  if (
    normalizedPublicUrl.length === 0 ||
    isHttpUrl(normalizedPublicUrl) ||
    !normalizedPublicUrl.startsWith("/")
  ) {
    return null;
  }

  const relativeUrlPath =
    normalizedPublicUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(
    PUBLIC_ROOT,
    relativeUrlPath,
  );

  const relativeToPublicRoot = path.relative(
    PUBLIC_ROOT,
    absolutePath,
  );

  if (
    relativeToPublicRoot.startsWith("..") ||
    path.isAbsolute(relativeToPublicRoot) ||
    !fs.existsSync(absolutePath)
  ) {
    return null;
  }

  return {
    absolutePath,
    publicUrl: normalizedPublicUrl,
  };
}

function isLocalPublicAssetUrl(
  publicUrl: string | null | undefined,
) {
  const normalizedPublicUrl =
    publicUrl?.trim() ?? "";

  return (
    normalizedPublicUrl.length > 0 &&
    !isHttpUrl(normalizedPublicUrl) &&
    normalizedPublicUrl.startsWith("/")
  );
}

function slugifyPathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

async function readJsonFile<T>(
  filePath: string,
): Promise<T | null> {
  try {
    const raw = await fsp.readFile(
      filePath,
      "utf8",
    );

    if (!raw.trim()) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
) {
  const directory = path.dirname(filePath);
  const parsedPath = path.parse(filePath);
  const tempPath = path.join(
    directory,
    `${parsedPath.name}.partial${parsedPath.ext || ".json"}`,
  );

  await fsp.mkdir(directory, {
    recursive: true,
  });

  await fsp.writeFile(
    tempPath,
    JSON.stringify(value, null, 2),
    "utf8",
  );
  await fsp.rename(tempPath, filePath);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isArchiveDetailsUrl(value: string) {
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

function getArchiveIdentifier(value: string) {
  const url = new URL(value);
  return decodeURIComponent(
    url.pathname.replace(/^\/details\//, ""),
  );
}

function parseSizeBytes(value: unknown) {
  const parsed = Number.parseInt(
    String(value ?? ""),
    10,
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function isVideoCandidate(file: unknown) {
  const name = String(
    (file as { name?: string } | null)?.name ?? "",
  );
  const loweredName = name.toLowerCase();
  const sizeBytes = parseSizeBytes(
    (file as { size?: unknown } | null)?.size,
  );

  if (
    !/\.(mp4|m4v|mov|mkv)$/i.test(name) ||
    loweredName.includes("sample") ||
    loweredName.includes("preview")
  ) {
    return false;
  }

  return sizeBytes >= 50_000_000;
}

function getCandidateTier(file: unknown) {
  const format = String(
    (file as { format?: string } | null)?.format ?? "",
  )
    .toLowerCase()
    .trim();
  const source = String(
    (file as { source?: string } | null)?.source ?? "",
  )
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

function chooseBestArchiveFile(files: unknown[]) {
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
        parseSizeBytes(
          (left as { size?: unknown } | null)?.size,
        ) -
        parseSizeBytes(
          (right as { size?: unknown } | null)?.size,
        )
      );
    });

  return candidates[0] ?? null;
}

function buildDownloadUrl(identifier: string, fileName: string) {
  const encodedSegments = [identifier, fileName].map(
    (segment) => encodeURIComponent(segment),
  );

  return `https://archive.org/download/${encodedSegments[0]}/${encodedSegments[1]}`;
}

async function resolveArchiveDownloadUrl(sourceUrl: string) {
  const identifier = getArchiveIdentifier(sourceUrl);
  const metadataResponse = await fetch(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
    {
      cache: "no-store",
    },
  );

  if (!metadataResponse.ok) {
    throw new Error(
      `Archive metadata lookup failed with ${metadataResponse.status}.`,
    );
  }

  const metadata = (await metadataResponse.json()) as {
    files?: unknown[];
  };
  const bestFile = chooseBestArchiveFile(
    Array.isArray(metadata.files)
      ? metadata.files
      : [],
  );

  if (!bestFile) {
    throw new Error(
      "No suitable downloadable video file was found in archive metadata.",
    );
  }

  return buildDownloadUrl(
    identifier,
    String(
      (bestFile as { name?: string } | null)?.name ?? "",
    ),
  );
}

function buildRemoteCachePath(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const parsedPath = path.parse(url.pathname);
  const safeBaseName =
    (parsedPath.name || "remote-source")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "remote-source";
  const extension =
    parsedPath.ext || ".mp4";
  const sourceHash = createHash("sha1")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 12);

  return path.join(
    REMOTE_SOURCE_CACHE_ROOT,
    `${safeBaseName}-${sourceHash}${extension}`,
  );
}

async function resolveSourceUrl(sourceUrl: string) {
  if (isArchiveDetailsUrl(sourceUrl)) {
    return resolveArchiveDownloadUrl(sourceUrl);
  }

  return sourceUrl;
}

async function ensureLocalSourcePath(sourceUrl: string) {
  const resolvedSourceUrl =
    await resolveSourceUrl(sourceUrl);

  if (!isHttpUrl(resolvedSourceUrl)) {
    const localPath = path.resolve(
      REPO_ROOT,
      resolvedSourceUrl,
    );

    if (!fs.existsSync(localPath)) {
      throw new Error(
        `Source file not found: ${localPath}`,
      );
    }

    return {
      cachePath: localPath,
      resolvedSourceUrl,
    };
  }

  const cachePath =
    buildRemoteCachePath(resolvedSourceUrl);

  if (fs.existsSync(cachePath)) {
    return {
      cachePath,
      resolvedSourceUrl,
    };
  }

  fs.mkdirSync(path.dirname(cachePath), {
    recursive: true,
  });

  const tempPath = `${cachePath}.partial`;

  try {
    const response = await fetch(resolvedSourceUrl, {
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `Could not download remote source ${resolvedSourceUrl}. Received ${response.status}.`,
      );
    }

    if (!response.body) {
      throw new Error(
        `Could not download remote source ${resolvedSourceUrl}. Response body was empty.`,
      );
    }

    const writeStream = fs.createWriteStream(tempPath);
    await pipeline(
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ),
      writeStream,
    );

    fs.renameSync(tempPath, cachePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    throw error;
  }

  return {
    cachePath,
    resolvedSourceUrl,
  };
}

function getMediaInfo(sourcePath: string) {
  const output = runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=index,codec_type",
    "-of",
    "json",
    sourcePath,
  ]);

  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const duration = Number.parseFloat(
    parsed.format?.duration ?? "0",
  );
  const hasAudio = Array.isArray(parsed.streams)
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToHundredths(value: number) {
  return Number(value.toFixed(2));
}

function hashSeed(value: string) {
  const digest = createHash("sha1")
    .update(value)
    .digest("hex")
    .slice(0, 8);

  return Number.parseInt(digest, 16) >>> 0;
}

function createSeededRandom(seedValue: string) {
  let state = hashSeed(seedValue) || 0x6d2b79f5;

  return () => {
    state += 0x6d2b79f5;
    let output = state;
    output = Math.imul(
      output ^ (output >>> 15),
      output | 1,
    );
    output ^= output + Math.imul(
      output ^ (output >>> 7),
      output | 61,
    );

    return (
      ((output ^ (output >>> 14)) >>> 0) /
      4294967296
    );
  };
}

type Zone = {
  end: number;
  label: string;
  start: number;
};

function buildSelectionZones(
  durationSeconds: number,
) {
  const maxStart = Math.max(
    durationSeconds - SEGMENT_DURATION_SECONDS,
    0,
  );
  const titleSafeLead = Math.min(
    Math.max(durationSeconds * 0.12, 45),
    150,
  );
  const creditSafeTail = Math.min(
    Math.max(durationSeconds * 0.12, 60),
    180,
  );
  const creditCutoff = clamp(
    durationSeconds - creditSafeTail,
    SEGMENT_DURATION_SECONDS,
    maxStart,
  );
  const beginningStart = clamp(
    titleSafeLead,
    0,
    maxStart,
  );
  const beginningEnd = clamp(
    durationSeconds * 0.3,
    beginningStart + SEGMENT_DURATION_SECONDS,
    creditCutoff,
  );
  const middleStart = clamp(
    durationSeconds * 0.42,
    beginningStart,
    maxStart,
  );
  const middleEnd = clamp(
    durationSeconds * 0.62,
    middleStart + SEGMENT_DURATION_SECONDS,
    creditCutoff,
  );
  const endingStart = clamp(
    durationSeconds * 0.68,
    middleStart,
    maxStart,
  );
  const endingEnd = clamp(
    creditCutoff,
    endingStart + SEGMENT_DURATION_SECONDS,
    maxStart,
  );

  const zones: Zone[] = [
    {
      label: "beginning",
      start: beginningStart,
      end: Math.max(beginningStart, beginningEnd),
    },
    {
      label: "middle",
      start: middleStart,
      end: Math.max(middleStart, middleEnd),
    },
    {
      label: "ending",
      start: endingStart,
      end: Math.max(endingStart, endingEnd),
    },
  ];

  const notes = [
    `Skipped roughly the first ${Math.round(titleSafeLead)} seconds to avoid title cards.`,
    `Skipped roughly the last ${Math.round(creditSafeTail)} seconds to avoid end credits.`,
    "Used seeded selection inside beginning, middle, and ending safe zones so the same round stays stable while different rounds can vary.",
    "This reduces obvious titles and credits. Avoiding hero close-ups is heuristic and not guaranteed.",
  ];

  return {
    notes,
    zones,
  };
}

function chooseStartsForZone(
  zone: Zone,
  random: () => number,
) {
  const latestStart = Math.max(
    zone.start,
    zone.end - SEGMENT_DURATION_SECONDS,
  );
  const span = Math.max(
    latestStart - zone.start,
    0,
  );

  if (span <= 8) {
    return [
      roundToHundredths(zone.start),
      roundToHundredths(latestStart),
    ];
  }

  const midpoint = zone.start + span / 2;
  const firstMax = Math.max(
    zone.start,
    midpoint - SEGMENT_DURATION_SECONDS,
  );
  const first =
    zone.start +
    random() * Math.max(firstMax - zone.start, 0);
  const secondMin = Math.min(
    latestStart,
    Math.max(first + 8, midpoint),
  );
  const second =
    secondMin +
    random() * Math.max(latestStart - secondMin, 0);

  return [
    roundToHundredths(first),
    roundToHundredths(second),
  ];
}

function buildSegmentStarts(
  durationSeconds: number,
  seedValue: string,
) {
  const { notes, zones } =
    buildSelectionZones(durationSeconds);
  const random =
    createSeededRandom(seedValue);
  const segmentStarts = zones.flatMap((zone) =>
    chooseStartsForZone(zone, random),
  );

  return {
    notes,
    segmentStarts,
  };
}

function buildVideoFilterComplex(
  segmentStarts: number[],
  hasAudio: boolean,
) {
  const lines: string[] = [];

  segmentStarts.forEach((start, index) => {
    const end = roundToHundredths(
      start + SEGMENT_DURATION_SECONDS,
    );

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

function buildAudioFilterComplex(
  segmentStarts: number[],
) {
  const lines: string[] = [];

  segmentStarts.forEach((start, index) => {
    const end = roundToHundredths(
      start + SEGMENT_DURATION_SECONDS,
    );

    lines.push(
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`,
    );
  });

  const concatInputs = segmentStarts
    .map((_, index) => `[a${index}]`)
    .join("");

  lines.push(
    `${concatInputs}concat=n=${segmentStarts.length}:v=0:a=1[aout]`,
  );

  return lines.join(";");
}

function renderGeneratedClip(
  sourcePath: string,
  outputPath: string,
  clipType: ClipKind,
  segmentStarts: number[],
  hasAudio: boolean,
) {
  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
  });

  const ffmpegArgs =
    clipType === "audio"
      ? [
          "-y",
          "-i",
          sourcePath,
          "-filter_complex",
          buildAudioFilterComplex(segmentStarts),
          "-map",
          "[aout]",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "192k",
          outputPath,
        ]
      : [
          "-y",
          "-i",
          sourcePath,
          "-filter_complex",
          buildVideoFilterComplex(
            segmentStarts,
            hasAudio,
          ),
          "-map",
          "[vout]",
          ...(hasAudio
            ? ["-map", "[aout]"]
            : ["-an"]),
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          ...(hasAudio
            ? [
                "-c:a",
                "aac",
                "-b:a",
                "192k",
              ]
            : []),
          "-movflags",
          "+faststart",
          outputPath,
        ];

  runCommand("ffmpeg", ffmpegArgs);
}

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

async function withBuildLock<T>(
  outputPath: string,
  builder: () => Promise<T>,
) {
  const lockPath = `${outputPath}.lock`;
  const startedAt = Date.now();

  await fsp.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  while (true) {
    try {
      const handle = await fsp.open(lockPath, "wx");

      try {
        return await builder();
      } finally {
        await handle.close();
        await fsp.unlink(lockPath).catch(() => {});
      }
    } catch (error) {
      const lockError = error as NodeJS.ErrnoException;

      if (lockError.code !== "EEXIST") {
        throw error;
      }

      if (
        fs.existsSync(outputPath) &&
        !isExpiredFile(outputPath)
      ) {
        return undefined as T;
      }

      if (
        Date.now() - startedAt >
        LOCK_WAIT_TIMEOUT_MS
      ) {
        throw new Error(
          `Timed out waiting for clip build lock at ${lockPath}.`,
        );
      }

      await sleep(LOCK_WAIT_INTERVAL_MS);
    }
  }
}

async function withNamedLock<T>(
  lockName: string,
  callback: () => Promise<T>,
) {
  const lockPath = path.join(
    RUNTIME_PUBLIC_ROOT,
    `${lockName}.named`,
  );

  return withBuildLock(lockPath, callback);
}

function isExpiredFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return true;
  }

  const stats = fs.statSync(filePath);

  return (
    Date.now() - stats.mtimeMs >
    GENERATED_CACHE_TTL_MS
  );
}

function candidateFreshnessBonus(
  lastPlayedAt: string | null,
) {
  if (!lastPlayedAt) {
    return 18;
  }

  const ageMs =
    Date.now() -
    new Date(lastPlayedAt).getTime();

  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return 0;
  }

  return clamp(
    ageMs / (6 * 60 * 60 * 1000),
    0,
    18,
  );
}

async function purgeExpiredAssets() {
  if (!fs.existsSync(RUNTIME_PUBLIC_ROOT)) {
    return;
  }

  const stack = [RUNTIME_PUBLIC_ROOT];

  while (stack.length > 0) {
    const currentPath = stack.pop();

    if (!currentPath) {
      continue;
    }

    const entries = await fsp.readdir(currentPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const nextPath = path.join(
        currentPath,
        entry.name,
      );

      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }

      if (
        shouldPurgeRuntimeAsset(
          entry.name,
          isExpiredFile(nextPath),
        )
      ) {
        await fsp.unlink(nextPath).catch(() => {});
      }
    }
  }
}

async function resolvePlayableSource(
  source: ClipSourceRecord,
) {
  const sourceUrl = source.sourceUrl?.trim() ?? "";

  if (!sourceUrl) {
    return null;
  }

  const resolvedSource =
    await ensureLocalSourcePath(sourceUrl);
  const mediaInfo = getMediaInfo(
    resolvedSource.cachePath,
  );

  return {
    cachePath: resolvedSource.cachePath,
    hasAudio: mediaInfo.hasAudio,
    resolvedSourceUrl:
      resolvedSource.resolvedSourceUrl,
    sourceDurationSeconds: mediaInfo.duration,
  } satisfies ResolvedSource;
}

function buildGeneratedAssetPath(
  scope: ClipPoolScope,
  key: string,
  clipType: ClipKind,
) {
  const extension =
    clipType === "audio" ? "mp3" : "mp4";
  const absolutePath = path.join(
    RUNTIME_PUBLIC_ROOT,
    scope,
    `${key}.${extension}`,
  );

  return {
    absolutePath,
    publicUrl: toPublicUrl(absolutePath),
  };
}

function buildRoundRouteMediaUrl(roundId: string) {
  return `/api/movie-buff/round-media/${roundId}`;
}

function buildGeneratedPreviewMediaUrl(mediaId: string) {
  return `/api/movie-buff/generated/${mediaId}`;
}

async function generateClipAsset(
  scope: ClipPoolScope,
  key: string,
  source: ClipSourceRecord,
  seedValue: string,
) {
  const assetPath = buildGeneratedAssetPath(
    scope,
    key,
    source.clipType,
  );

  if (!isExpiredFile(assetPath.absolutePath)) {
    return {
      assetPath: assetPath.absolutePath,
      assetUrl: assetPath.publicUrl,
      clipType: source.clipType,
      durationSeconds:
        FINAL_CLIP_DURATION_SECONDS,
      hasAudio: source.clipType === "audio",
      resolvedSourceUrl: "",
      segmentStarts: [],
      sourceDurationSeconds: 0,
      strategyNotes: [
        "Served the cached generated clip without re-inspecting the source master.",
      ],
    } satisfies GeneratedClipSummary;
  }

  await purgeExpiredAssets();

  const existingLocalFallback =
    resolveExistingLocalPublicAsset(
      source.fallbackMediaUrl,
    );

  if (existingLocalFallback) {
    if (scope === "pool") {
      await withBuildLock(
        assetPath.absolutePath,
        async () => {
          if (!isExpiredFile(assetPath.absolutePath)) {
            return;
          }

          await fsp.mkdir(
            path.dirname(assetPath.absolutePath),
            {
              recursive: true,
            },
          );

          await fsp.copyFile(
            existingLocalFallback.absolutePath,
            assetPath.absolutePath,
          );
          const now = new Date();
          await fsp.utimes(
            assetPath.absolutePath,
            now,
            now,
          );
        },
      );

      return {
        assetPath: assetPath.absolutePath,
        assetUrl: assetPath.publicUrl,
        clipType: source.clipType,
        durationSeconds:
          FINAL_CLIP_DURATION_SECONDS,
        hasAudio: source.clipType === "audio",
        resolvedSourceUrl: "",
        segmentStarts: [],
        sourceDurationSeconds: 0,
        strategyNotes: [
          "Filled the pool with a copied verified local media asset instead of generating from the source master.",
        ],
      } satisfies GeneratedClipSummary;
    }

    return {
      assetPath: existingLocalFallback.absolutePath,
      assetUrl: existingLocalFallback.publicUrl,
      clipType: source.clipType,
      durationSeconds:
        FINAL_CLIP_DURATION_SECONDS,
      hasAudio: source.clipType === "audio",
      resolvedSourceUrl: "",
      segmentStarts: [],
      sourceDurationSeconds: 0,
      strategyNotes: [
        "Served an existing verified local media asset instead of generating on demand.",
      ],
    } satisfies GeneratedClipSummary;
  }

  if (
    scope !== "pool" &&
    isLocalPublicAssetUrl(
      source.fallbackMediaUrl,
    )
  ) {
    return {
      assetPath: null,
      assetUrl:
        source.fallbackMediaUrl?.trim() ?? "",
      clipType: source.clipType,
      durationSeconds:
        FINAL_CLIP_DURATION_SECONDS,
      hasAudio: source.clipType === "audio",
      resolvedSourceUrl: "",
      segmentStarts: [],
      sourceDurationSeconds: 0,
      strategyNotes: [
        "Served an existing public media asset URL directly instead of generating a round file inside the function runtime.",
      ],
    } satisfies GeneratedClipSummary;
  }

  const playableSource =
    await resolvePlayableSource(source);

  if (!playableSource) {
    const fallbackMediaUrl =
      source.fallbackMediaUrl?.trim() ?? "";

    if (!fallbackMediaUrl) {
      throw new Error(
        "No source URL is available for generated playback.",
      );
    }

    return {
      assetPath: null,
      assetUrl: fallbackMediaUrl,
      clipType: source.clipType,
      durationSeconds:
        FINAL_CLIP_DURATION_SECONDS,
      hasAudio: source.clipType === "audio",
      resolvedSourceUrl: "",
      segmentStarts: [],
      sourceDurationSeconds: 0,
      strategyNotes: [
        "Fell back to the existing media URL because no source master URL was available.",
      ],
    } satisfies GeneratedClipSummary;
  }

  if (!isExpiredFile(assetPath.absolutePath)) {
    const { notes, segmentStarts } =
      buildSegmentStarts(
        playableSource.sourceDurationSeconds,
        seedValue,
      );

    return {
      assetPath: assetPath.absolutePath,
      assetUrl: assetPath.publicUrl,
      clipType: source.clipType,
      durationSeconds:
        FINAL_CLIP_DURATION_SECONDS,
      hasAudio: playableSource.hasAudio,
      resolvedSourceUrl:
        playableSource.resolvedSourceUrl,
      segmentStarts,
      sourceDurationSeconds:
        playableSource.sourceDurationSeconds,
      strategyNotes: notes,
    } satisfies GeneratedClipSummary;
  }

  const { notes, segmentStarts } =
    buildSegmentStarts(
      playableSource.sourceDurationSeconds,
      seedValue,
    );

  await withBuildLock(
    assetPath.absolutePath,
    async () => {
      if (!isExpiredFile(assetPath.absolutePath)) {
        return;
      }

      const parsedOutputPath = path.parse(
        assetPath.absolutePath,
      );
      const tempOutputPath = path.join(
        parsedOutputPath.dir,
        `${parsedOutputPath.name}.partial${parsedOutputPath.ext}`,
      );

      await fsp.mkdir(
        path.dirname(assetPath.absolutePath),
        {
          recursive: true,
        },
      );

      renderGeneratedClip(
        playableSource.cachePath,
        tempOutputPath,
        source.clipType,
        segmentStarts,
        playableSource.hasAudio,
      );

      await fsp.rename(
        tempOutputPath,
        assetPath.absolutePath,
      );
    },
  );

  return {
    assetPath: assetPath.absolutePath,
    assetUrl: assetPath.publicUrl,
    clipType: source.clipType,
    durationSeconds: FINAL_CLIP_DURATION_SECONDS,
    hasAudio: playableSource.hasAudio,
    resolvedSourceUrl:
      playableSource.resolvedSourceUrl,
    segmentStarts,
    sourceDurationSeconds:
      playableSource.sourceDurationSeconds,
    strategyNotes: notes,
  } satisfies GeneratedClipSummary;
}

async function getClipSourceByRoundId(roundId: string) {
  const { data: roundRow, error: roundError } =
    await supabaseAdmin
      .from("match_rounds")
      .select("clip_id")
      .eq("id", roundId)
      .maybeSingle();

  if (roundError) {
    throw new Error(roundError.message);
  }

  const round = roundRow as
    | {
        clip_id?: string | null;
      }
    | null;

  const clipId = round?.clip_id;

  if (!clipId) {
    throw new Error(
      "No clip is attached to this round.",
    );
  }

  return getClipSourceByLegacyClipId(clipId);
}

async function getClipSourceByLegacyClipId(clipId: string) {
  const { data: clipRow, error: clipError } =
    await supabaseAdmin
      .from("clips")
      .select(
        "id, clip_type, media_url, source_url, movie_id",
      )
      .eq("id", clipId)
      .maybeSingle();

  if (clipError) {
    throw new Error(clipError.message);
  }

  const clip = clipRow as
    | {
        clip_type?: string | null;
        id?: string;
        media_url?: string | null;
        movie_id?: string | null;
        source_url?: string | null;
      }
    | null;

  if (!clip?.id) {
    throw new Error("Clip not found.");
  }

  let movieTitle = "Movie Buff clip";
  let contentId: string | null = null;
  let contentMediaId: string | null = null;
  let difficultyLabel: string | null = null;

  const { data: contentMediaRow } = await supabaseAdmin
    .from("content_media")
    .select("id, content_id, difficulty")
    .eq("legacy_clip_id", clip.id)
    .maybeSingle();

  if (contentMediaRow) {
    const mediaRow = contentMediaRow as {
      content_id?: string | null;
      difficulty?: string | null;
      id?: string | null;
    };

    contentId = mediaRow.content_id ?? null;
    contentMediaId = mediaRow.id ?? null;

    const difficultyValue = String(
      mediaRow.difficulty ?? "",
    ).toLowerCase();

      difficultyLabel =
        difficultyValue === "easy"
          ? "Fan"
          : difficultyValue === "hard" ||
              difficultyValue === "expert"
            ? "Buff"
          : difficultyValue
              ? "Fanatic"
              : null;
  }

  if (clip.movie_id) {
    const { data: movieRow } = await supabaseAdmin
      .from("movies")
      .select("title")
      .eq("id", clip.movie_id)
      .maybeSingle();

    movieTitle =
      (
        movieRow as { title?: string } | null
      )?.title ?? movieTitle;
  }

  return {
    clipType: normalizeClipKind(clip.clip_type),
    contentId,
    contentMediaId,
    difficultyLabel,
    fallbackMediaUrl: clip.media_url ?? null,
    id: clip.id,
    movieTitle,
    sourceUrl: clip.source_url ?? null,
  } satisfies ClipSourceRecord;
}

async function getClipSourceByContentMediaId(
  mediaId: string,
) {
  const { data: mediaRow, error: mediaError } =
    await supabaseAdmin
      .from("content_media")
      .select(
        "id, media_type, media_url, source_url, content_id",
      )
      .eq("id", mediaId)
      .maybeSingle();

  if (mediaError) {
    throw new Error(mediaError.message);
  }

  const media = mediaRow as
    | {
        content_id?: string | null;
        id?: string;
        media_type?: string | null;
        media_url?: string | null;
        source_url?: string | null;
      }
    | null;

  if (!media?.id) {
    throw new Error("Content media not found.");
  }

  let movieTitle = "Movie Buff clip";

  if (media.content_id) {
    const { data: contentRow } =
      await supabaseAdmin
        .from("content_items")
        .select("title")
        .eq("id", media.content_id)
        .maybeSingle();

    movieTitle =
      (
        contentRow as { title?: string } | null
      )?.title ?? movieTitle;
  }

  return {
    clipType: normalizeClipKind(media.media_type),
    contentId: media.content_id ?? null,
    contentMediaId: media.id,
    difficultyLabel: null,
    fallbackMediaUrl: media.media_url ?? null,
    id: media.id,
    movieTitle,
    sourceUrl: media.source_url ?? null,
  } satisfies ClipSourceRecord;
}

export async function verifyGeneratedClipSource(
  sourceUrl: string,
  clipType: ClipKind,
) {
  const sourceRecord: ClipSourceRecord = {
    clipType,
    contentId: null,
    contentMediaId: null,
    difficultyLabel: null,
    fallbackMediaUrl: null,
    id: "verification",
    movieTitle: "Verification",
    sourceUrl,
  };
  const resolvedSource =
    await resolvePlayableSource(sourceRecord);

  if (!resolvedSource) {
    throw new Error(
      "A source URL is required to verify generated clip playback.",
    );
  }

  const { notes, segmentStarts } =
    buildSegmentStarts(
      resolvedSource.sourceDurationSeconds,
      `verify:${resolvedSource.resolvedSourceUrl}`,
    );

  return {
    clipType,
    hasAudio: resolvedSource.hasAudio,
    resolvedSourceUrl:
      resolvedSource.resolvedSourceUrl,
    segmentStarts,
    sourceDurationSeconds:
      roundToHundredths(
        resolvedSource.sourceDurationSeconds,
      ),
    strategyNotes: notes,
  };
}

async function listGlobalPoolCandidates() {
  const { data: mediaRows, error: mediaError } =
    await supabaseAdmin
      .from("content_media")
      .select(
        "id, content_id, media_type, source_url, media_url, is_active, is_hidden, legacy_clip_id, difficulty"
      )
      .eq("is_active", true)
      .eq("is_hidden", false)
      .eq("media_type", "video")
      .not("legacy_clip_id", "is", null);

  if (mediaError) {
    if (
      isMissingContentEngineSchemaMessage(
        mediaError.message,
      )
    ) {
      const [
        {
          data: legacyClipRows,
          error: legacyClipError,
        },
        {
          data: legacyMovieRows,
          error: legacyMovieError,
        },
      ] = await Promise.all([
        supabaseAdmin
          .from("clips")
          .select(
            "id, movie_id, clip_type, is_active, media_url, source_url"
          )
          .eq("is_active", true),
        supabaseAdmin
          .from("movies")
          .select("id, title, difficulty"),
      ]);

      if (legacyClipError) {
        throw new Error(legacyClipError.message);
      }

      if (legacyMovieError) {
        throw new Error(legacyMovieError.message);
      }

      const legacyMovieById = new Map(
        (((legacyMovieRows ?? []) as unknown) as LegacyGlobalPoolMovieRow[]).map(
          (row) => [row.id, row]
        )
      );

      return (((legacyClipRows ?? []) as unknown) as LegacyGlobalPoolRow[]).map(
        (row) => {
          const movieRow =
            legacyMovieById.get(row.movie_id);

          return {
            contentId: row.movie_id,
            contentMediaId: row.id,
            difficultyLabel:
              normalizeDifficultyPoolLabel(
                movieRow?.difficulty,
              ),
            movieTitle:
              movieRow?.title?.trim() ||
              "Movie Buff clip",
            clipType: normalizeClipKind(
              row.clip_type,
            ),
            qualityScore: 100,
            rotationWeight: 50,
            status: row.is_active
              ? "active"
              : "retired",
            lastPlayedAt: null,
            totalPlays: 0,
            sourceUrl: row.source_url ?? null,
            fallbackMediaUrl:
              row.media_url ?? null,
          } satisfies GlobalPoolCandidate;
        }
      );
    }

    throw new Error(mediaError.message);
  }

  const typedMediaRows = (mediaRows ??
    []) as Array<{
    content_id: string | null;
    difficulty: string | null;
    id: string;
    is_active: boolean;
    is_hidden: boolean;
    legacy_clip_id: string | null;
    media_type: string | null;
    media_url: string | null;
    source_url: string | null;
  }>;

  if (typedMediaRows.length === 0) {
    return [] satisfies GlobalPoolCandidate[];
  }

  const contentIds = Array.from(
    new Set(
      typedMediaRows
        .map((row) => row.content_id)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  );
  const mediaIds = typedMediaRows.map(
    (row) => row.id,
  );

  const [
    { data: contentRows, error: contentError },
    {
      data: analyticsRows,
      error: analyticsError,
    },
  ] = await Promise.all([
    contentIds.length > 0
      ? supabaseAdmin
          .from("content_items")
          .select("id, title")
          .in("id", contentIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),
    supabaseAdmin
      .from("movie_buff_clip_analytics")
      .select(
        "content_media_id, quality_score, rotation_weight, system_difficulty_label, status, last_played_at, total_plays"
      )
      .in("content_media_id", mediaIds),
  ]);

  if (contentError) {
    if (
      isMissingContentEngineSchemaMessage(
        contentError.message,
      )
    ) {
      return [] satisfies GlobalPoolCandidate[];
    }

    throw new Error(contentError.message);
  }

  if (analyticsError) {
    if (
      isMissingContentEngineSchemaMessage(
        analyticsError.message,
      )
    ) {
      return [] satisfies GlobalPoolCandidate[];
    }

    throw new Error(analyticsError.message);
  }

  const contentTitleById = new Map(
    ((contentRows ?? []) as Array<{
      id: string;
      title: string | null;
    }>).map((row) => [
      row.id,
      row.title?.trim() || "Movie Buff clip",
    ]),
  );
  const analyticsByMediaId = new Map(
    ((analyticsRows ?? []) as Array<{
      content_media_id: string;
      last_played_at: string | null;
      quality_score: number | null;
      rotation_weight: number | null;
      status: string | null;
      system_difficulty_label: string | null;
      total_plays: number | null;
    }>).map((row) => [
      row.content_media_id,
      row,
    ]),
  );

  return typedMediaRows
    .map((row) => {
      const analytics =
        analyticsByMediaId.get(row.id);
      const status =
        analytics?.status?.trim() || "active";
      const qualityScore = Number(
        analytics?.quality_score ?? 100,
      );
      const rotationWeight = Number(
        analytics?.rotation_weight ?? 50,
      );

      if (
        ["retired", "test_only", "cooling_down"].includes(
          status,
        ) ||
        qualityScore < 45 ||
        rotationWeight <= 0
      ) {
        return null;
      }

      return {
        contentId: row.content_id,
        contentMediaId: row.id,
        difficultyLabel:
          normalizeDifficultyPoolLabel(
            analytics?.system_difficulty_label ??
              row.difficulty,
          ),
        movieTitle:
          contentTitleById.get(row.content_id ?? "") ??
          "Movie Buff clip",
        clipType: normalizeClipKind(row.media_type),
        qualityScore,
        rotationWeight,
        status,
        lastPlayedAt:
          analytics?.last_played_at ?? null,
        totalPlays: Number(
          analytics?.total_plays ?? 0,
        ),
        sourceUrl: row.source_url ?? null,
        fallbackMediaUrl: row.media_url ?? null,
      } satisfies GlobalPoolCandidate;
    })
    .filter(
      (
        candidate,
      ): candidate is GlobalPoolCandidate =>
        candidate !== null,
    );
}

async function readGlobalPoolInventory(
  candidates: GlobalPoolCandidate[],
): Promise<GlobalPoolInventory> {
  const perLabelReadyCounts: Record<
    DifficultyPoolLabel,
    Record<PoolTier, number>
  > = {
    Fan: { primary: 0, secondary: 0 },
    Fanatic: { primary: 0, secondary: 0 },
    Buff: { primary: 0, secondary: 0 },
  };
  const perMediaReadyCounts = new Map<
    string,
    Record<PoolTier, number>
  >();
  const perMovieReadyCounts = new Map<
    string,
    Record<PoolTier, number>
  >();
  const candidateByMediaId = new Map(
    candidates.map((candidate) => [
      candidate.contentMediaId,
      candidate,
    ]),
  );
  const poolRoot = path.join(
    RUNTIME_PUBLIC_ROOT,
    "pool",
  );

  if (!fs.existsSync(poolRoot)) {
    return {
      perLabelReadyCounts,
      perMediaReadyCounts,
      perMovieReadyCounts,
    };
  }

  for (const label of GLOBAL_POOL_LABELS) {
    for (const tier of [
      "primary",
      "secondary",
    ] as PoolTier[]) {
      const labelDirectory = path.join(
        poolRoot,
        tier,
        slugifyPathSegment(label),
      );

      if (!fs.existsSync(labelDirectory)) {
        continue;
      }

      const mediaDirectories = await fsp.readdir(
        labelDirectory,
        {
          withFileTypes: true,
        },
      );

      for (const mediaDirectory of mediaDirectories) {
        if (!mediaDirectory.isDirectory()) {
          continue;
        }

        const mediaId = mediaDirectory.name;
        const candidate =
          candidateByMediaId.get(mediaId);

        if (!candidate) {
          continue;
        }

        const mediaPath = path.join(
          labelDirectory,
          mediaId,
        );
        const entries = await fsp.readdir(
          mediaPath,
          {
            withFileTypes: true,
          },
        );
        const readyCount = entries.filter(
          (entry) => {
            if (!entry.isFile()) {
              return false;
            }

            const absolutePath = path.join(
              mediaPath,
              entry.name,
            );

            return (
              !entry.name.includes(".partial") &&
              !entry.name.endsWith(".lock") &&
              !isExpiredFile(absolutePath)
            );
          },
        ).length;

        if (readyCount <= 0) {
          continue;
        }

        perLabelReadyCounts[label][tier] +=
          readyCount;

        const mediaCounts =
          perMediaReadyCounts.get(mediaId) ?? {
            primary: 0,
            secondary: 0,
          };
        mediaCounts[tier] += readyCount;
        perMediaReadyCounts.set(
          mediaId,
          mediaCounts,
        );

        if (candidate.contentId) {
          const movieCounts =
            perMovieReadyCounts.get(
              candidate.contentId,
            ) ?? {
              primary: 0,
              secondary: 0,
            };
          movieCounts[tier] += readyCount;
          perMovieReadyCounts.set(
            candidate.contentId,
            movieCounts,
          );
        }
      }
    }
  }

  return {
    perLabelReadyCounts,
    perMediaReadyCounts,
    perMovieReadyCounts,
  };
}

function chooseGlobalPoolCandidate(
  tier: PoolTier,
  label: DifficultyPoolLabel,
  candidates: GlobalPoolCandidate[],
  inventory: GlobalPoolInventory,
) {
  let bestCandidate:
    | GlobalPoolCandidate
    | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (candidate.difficultyLabel !== label) {
      continue;
    }

    const readyForClip =
      inventory.perMediaReadyCounts.get(
        candidate.contentMediaId,
      )?.[tier] ?? 0;

    if (readyForClip >= POOL_MAX_READY_PER_CLIP) {
      continue;
    }

    const readyForMovie = candidate.contentId
      ? inventory.perMovieReadyCounts.get(
          candidate.contentId,
        )?.[tier] ?? 0
      : 0;
    const maxPerMovie =
      tier === "primary"
        ? PRIMARY_POOL_MAX_READY_PER_MOVIE
        : SECONDARY_POOL_MAX_READY_PER_MOVIE;

    if (
      candidate.contentId &&
      readyForMovie >= maxPerMovie
    ) {
      continue;
    }

    const freshnessBonus =
      candidateFreshnessBonus(
        candidate.lastPlayedAt,
      );
    const lowSampleBonus =
      candidate.totalPlays < 5
        ? 8 - candidate.totalPlays
        : 0;
    const diversityBonus =
      readyForClip === 0 ? 10 : 3;
    const score =
      candidate.rotationWeight +
      candidate.qualityScore * 0.35 +
      freshnessBonus +
      lowSampleBonus +
      diversityBonus +
      (tier === "primary" ? 6 : 0);

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate;
}

async function runGlobalPoolWarmPass(
  options?: {
    force?: boolean;
  },
) {
  return withNamedLock(
    "global-pool-warm-pass",
    async () => {
      const state = await readJsonFile<{
        lastRunAt?: number;
      }>(GLOBAL_POOL_STATE_PATH);
      const failedCandidates: MovieBuffGlobalPoolWarmSummary["failedCandidates"] =
        [];

      if (
        options?.force !== true &&
        typeof state?.lastRunAt === "number" &&
        Date.now() - state.lastRunAt <
          GLOBAL_POOL_RUN_COOLDOWN_MS
      ) {
        return {
          createdCount: 0,
          failedCandidates,
          skippedByCooldown: true,
        } satisfies MovieBuffGlobalPoolWarmSummary;
      }

      const candidates =
        await listGlobalPoolCandidates();
      const inventory =
        await readGlobalPoolInventory(
          candidates,
        );
      let createdCount = 0;

      for (const label of GLOBAL_POOL_LABELS) {
        while (
          inventory.perLabelReadyCounts[label]
            .primary <
            PRIMARY_POOL_TARGET_PER_LABEL &&
          createdCount <
            GLOBAL_POOL_MAX_NEW_ASSETS_PER_RUN
        ) {
          const candidate =
            chooseGlobalPoolCandidate(
              "primary",
              label,
              candidates,
              inventory,
            );

          if (!candidate) {
            break;
          }

          const source: ClipSourceRecord = {
            clipType: candidate.clipType,
            contentId: candidate.contentId,
            contentMediaId:
              candidate.contentMediaId,
            difficultyLabel:
              candidate.difficultyLabel,
            fallbackMediaUrl:
              candidate.fallbackMediaUrl,
            id: candidate.contentMediaId,
            movieTitle: candidate.movieTitle,
            sourceUrl: candidate.sourceUrl,
          };
          const labelSegment =
            slugifyPathSegment(label);
          const variantKey =
            buildPoolVariantKey();

          try {
            await generateClipAsset(
              "pool",
              `primary/${labelSegment}/${candidate.contentMediaId}/${variantKey}`,
              source,
              `primary-pool:${label}:${candidate.contentMediaId}:${variantKey}`,
            );
          } catch (error) {
            failedCandidates.push({
              contentMediaId:
                candidate.contentMediaId,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
              label,
              tier: "primary",
            });
            const mediaCounts =
              inventory.perMediaReadyCounts.get(
                candidate.contentMediaId,
              ) ?? {
                primary: 0,
                secondary: 0,
              };
            mediaCounts.primary =
              POOL_MAX_READY_PER_CLIP;
            inventory.perMediaReadyCounts.set(
              candidate.contentMediaId,
              mediaCounts,
            );
            continue;
          }

          createdCount += 1;
          inventory.perLabelReadyCounts[label].primary +=
            1;
          const mediaCounts =
            inventory.perMediaReadyCounts.get(
              candidate.contentMediaId,
            ) ?? {
              primary: 0,
              secondary: 0,
            };
          mediaCounts.primary += 1;
          inventory.perMediaReadyCounts.set(
            candidate.contentMediaId,
            mediaCounts,
          );

          if (candidate.contentId) {
            const movieCounts =
              inventory.perMovieReadyCounts.get(
                candidate.contentId,
              ) ?? {
                primary: 0,
                secondary: 0,
              };
            movieCounts.primary += 1;
            inventory.perMovieReadyCounts.set(
              candidate.contentId,
              movieCounts,
            );
          }
        }

        while (
          inventory.perLabelReadyCounts[label]
            .secondary <
            SECONDARY_POOL_TARGET_PER_LABEL &&
          createdCount <
            GLOBAL_POOL_MAX_NEW_ASSETS_PER_RUN
        ) {
          const candidate =
            chooseGlobalPoolCandidate(
              "secondary",
              label,
              candidates,
              inventory,
            );

          if (!candidate) {
            break;
          }

          const source: ClipSourceRecord = {
            clipType: candidate.clipType,
            contentId: candidate.contentId,
            contentMediaId:
              candidate.contentMediaId,
            difficultyLabel:
              candidate.difficultyLabel,
            fallbackMediaUrl:
              candidate.fallbackMediaUrl,
            id: candidate.contentMediaId,
            movieTitle: candidate.movieTitle,
            sourceUrl: candidate.sourceUrl,
          };
          const labelSegment =
            slugifyPathSegment(label);
          const variantKey =
            buildPoolVariantKey();

          try {
            await generateClipAsset(
              "pool",
              `secondary/${labelSegment}/${candidate.contentMediaId}/${variantKey}`,
              source,
              `secondary-pool:${label}:${candidate.contentMediaId}:${variantKey}`,
            );
          } catch (error) {
            failedCandidates.push({
              contentMediaId:
                candidate.contentMediaId,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
              label,
              tier: "secondary",
            });
            const mediaCounts =
              inventory.perMediaReadyCounts.get(
                candidate.contentMediaId,
              ) ?? {
                primary: 0,
                secondary: 0,
              };
            mediaCounts.secondary =
              POOL_MAX_READY_PER_CLIP;
            inventory.perMediaReadyCounts.set(
              candidate.contentMediaId,
              mediaCounts,
            );
            continue;
          }

          createdCount += 1;
          inventory.perLabelReadyCounts[label].secondary +=
            1;
          const mediaCounts =
            inventory.perMediaReadyCounts.get(
              candidate.contentMediaId,
            ) ?? {
              primary: 0,
              secondary: 0,
            };
          mediaCounts.secondary += 1;
          inventory.perMediaReadyCounts.set(
            candidate.contentMediaId,
            mediaCounts,
          );

          if (candidate.contentId) {
            const movieCounts =
              inventory.perMovieReadyCounts.get(
                candidate.contentId,
              ) ?? {
                primary: 0,
                secondary: 0,
              };
            movieCounts.secondary += 1;
            inventory.perMovieReadyCounts.set(
              candidate.contentId,
              movieCounts,
            );
          }
        }
      }

      await writeJsonFileAtomic(
        GLOBAL_POOL_STATE_PATH,
        { lastRunAt: Date.now() },
      );

      return {
        createdCount,
        failedCandidates,
        skippedByCooldown: false,
      } satisfies MovieBuffGlobalPoolWarmSummary;
    },
  );
}

function queueGlobalPoolWarmPass() {
  void runGlobalPoolWarmPass().catch(() => {});
}

export async function warmMovieBuffGlobalPool(
  options?: {
    force?: boolean;
  },
) {
  return runGlobalPoolWarmPass(options);
}

export async function getMovieBuffGlobalPoolStatus(): Promise<MovieBuffGlobalPoolStatus> {
  const candidates =
    await listGlobalPoolCandidates();
  const inventory =
    await readGlobalPoolInventory(candidates);
  const hasExplicitReadyInventory =
    GLOBAL_POOL_LABELS.some(
      (label) =>
        inventory.perLabelReadyCounts[label]
          .primary > 0 ||
        inventory.perLabelReadyCounts[label]
          .secondary > 0,
    );
  const usingLegacyStaticAssets =
    !hasExplicitReadyInventory &&
    candidates.some(
      (candidate) =>
        typeof candidate.fallbackMediaUrl ===
          "string" &&
        candidate.fallbackMediaUrl.length > 0,
    );

  const perLabel = GLOBAL_POOL_LABELS.map(
    (label) => {
      const eligibleClips = candidates.filter(
        (candidate) =>
          candidate.difficultyLabel === label,
      ).length;

      return {
        eligibleClips,
        label,
        primaryReadyAssets:
          usingLegacyStaticAssets
            ? eligibleClips
            : inventory.perLabelReadyCounts[label]
                .primary,
        secondaryReadyAssets:
          usingLegacyStaticAssets
            ? 0
            : inventory.perLabelReadyCounts[label]
                .secondary,
      };
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    totalEligibleClips: candidates.length,
    totalPrimaryReadyAssets: perLabel.reduce(
      (sum, entry) =>
        sum + entry.primaryReadyAssets,
      0,
    ),
    totalSecondaryReadyAssets: perLabel.reduce(
      (sum, entry) =>
        sum + entry.secondaryReadyAssets,
      0,
    ),
    perLabel,
  };
}

async function listPoolAssetPaths(
  source: ClipSourceRecord,
  tier: PoolTier,
) {
  if (!source.contentMediaId) {
    return [];
  }

  const labelSegment = slugifyPathSegment(
    source.difficultyLabel ?? "buff",
  );
  const poolDirectory = path.join(
    RUNTIME_PUBLIC_ROOT,
    "pool",
    tier,
    labelSegment,
    source.contentMediaId,
  );

  if (!fs.existsSync(poolDirectory)) {
    return [];
  }

  const entries = await fsp.readdir(poolDirectory, {
    withFileTypes: true,
  });
  const extension =
    source.clipType === "audio" ? ".mp3" : ".mp4";

  const files = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(extension) &&
          !entry.name.endsWith(".partial" + extension),
      )
      .map(async (entry) => {
        const absolutePath = path.join(
          poolDirectory,
          entry.name,
        );

        try {
          const stats = await fsp.stat(absolutePath);
          return {
            absolutePath,
            mtimeMs: stats.mtimeMs,
          };
        } catch (error) {
          if (isMissingFilesystemEntry(error)) {
            return null;
          }
          throw error;
        }
      }),
  );

  return files
    .filter(
      (file): file is { absolutePath: string; mtimeMs: number } =>
        file !== null && !isExpiredFile(file.absolutePath),
    )
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
}

function buildPoolVariantKey() {
  return `${Date.now()}-${createHash("sha1")
    .update(
      `${Date.now()}:${Math.random()}:${process.pid}`,
    )
    .digest("hex")
    .slice(0, 10)}`;
}

async function ensurePoolAssetsForSource(
  source: ClipSourceRecord,
  desiredDepth: number,
) {
  if (!source.contentMediaId) {
    return;
  }

  const readyAssets = await listPoolAssetPaths(
    source,
    "secondary",
  );
  const assetsToCreate = Math.max(
    0,
    desiredDepth - readyAssets.length,
  );

  for (let index = 0; index < assetsToCreate; index += 1) {
    const labelSegment = slugifyPathSegment(
      source.difficultyLabel ?? "buff",
    );
    const variantKey = buildPoolVariantKey();

    try {
      await generateClipAsset(
        "pool",
        `secondary/${labelSegment}/${source.contentMediaId}/${variantKey}`,
        source,
        `secondary-local:${source.contentMediaId}:${variantKey}`,
      );
    } catch {
      break;
    }
  }
}

async function promoteSecondaryVariantToPrimary(
  source: ClipSourceRecord,
) {
  if (!source.contentMediaId) {
    return false;
  }

  const labelSegment = slugifyPathSegment(
    source.difficultyLabel ?? "buff",
  );
  const lockHash = createHash("sha1")
    .update(source.contentMediaId)
    .digest("hex")
    .slice(0, 16);

  return promotePoolAssetSafely({
    lockPath: path.join(
      RUNTIME_PUBLIC_ROOT,
      "locks",
      `pool-promote-${lockHash}.lock`,
    ),
    listSecondaryAssets: () =>
      listPoolAssetPaths(source, "secondary"),
    createPrimaryPath: () => {
      const variantKey = buildPoolVariantKey();
      return buildGeneratedAssetPath(
        "pool",
        `primary/${labelSegment}/${source.contentMediaId}/${variantKey}`,
        source.clipType,
      ).absolutePath;
    },
  });
}

async function tryConsumePooledRoundClip(
  roundId: string,
  source: ClipSourceRecord,
) {
  const roundAsset = buildGeneratedAssetPath(
    "round",
    roundId,
    source.clipType,
  );
  const lockHash = createHash("sha1")
    .update(roundId)
    .digest("hex")
    .slice(0, 16);

  const consumption =
    await consumeAuthoritativeRoundAsset({
      lockPath: path.join(
        RUNTIME_PUBLIC_ROOT,
        "locks",
        `round-consume-${lockHash}.lock`,
      ),
      roundAssetPath: roundAsset.absolutePath,
      listPrimaryAssets: () =>
        listPoolAssetPaths(source, "primary"),
    });

  if (!consumption.available) {
    return null;
  }

  const promoted = consumption.consumedPrimary
    ? await promoteSecondaryVariantToPrimary(source)
    : false;

  if (consumption.consumedPrimary) {
    void ensurePoolAssetsForSource(source, 2);
  }

  return {
    assetPath: roundAsset.absolutePath,
    assetUrl: roundAsset.publicUrl,
    clipType: source.clipType,
    durationSeconds: FINAL_CLIP_DURATION_SECONDS,
    hasAudio: source.clipType === "audio",
    resolvedSourceUrl: "",
    segmentStarts: [],
    sourceDurationSeconds: 0,
    strategyNotes: [
      consumption.consumedPrimary
        ? "Consumed one pre-generated primary pooled clip under the authoritative round lock."
        : "Reused the authoritative round asset created by an earlier concurrent caller.",
      promoted
        ? "Promoted one reserve variant from secondary into primary under a source lock."
        : "No secondary reserve promotion was required or available.",
      consumption.consumedPrimary
        ? "Queued a secondary replacement variant in the background."
        : "Did not duplicate destructive pool consumption for this round.",
    ],
  } satisfies GeneratedClipSummary;
}

export async function getRoundGeneratedClip(
  roundId: string,
) {
  const source =
    await getClipSourceByRoundId(roundId);
  const pooledSummary =
    await tryConsumePooledRoundClip(
      roundId,
      source,
    );

  if (pooledSummary) {
    queueGlobalPoolWarmPass();
    return pooledSummary;
  }

  const summary = await generateClipAsset(
    "round",
    roundId,
    source,
    `round:${roundId}:${source.id}`,
  );

  void ensurePoolAssetsForSource(source, 2);
  queueGlobalPoolWarmPass();

  return summary;
}

export async function getGeneratedMediaPreview(
  mediaId: string,
): Promise<GeneratedRouteSummary> {
  const source =
    await getClipSourceByContentMediaId(mediaId);
  const summary = await generateClipAsset(
    "preview",
    mediaId,
    source,
    `preview:${mediaId}:${source.id}`,
  );

  return {
    ...summary,
    mediaId,
  };
}

export {
  buildGeneratedPreviewMediaUrl,
  buildRoundRouteMediaUrl,
  FINAL_CLIP_DURATION_SECONDS,
  queueGlobalPoolWarmPass,
};
