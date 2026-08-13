import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { resolveSmokeEnvironment } from "./movie-buff-smoke-env.mjs";

const repoRoot = process.cwd();
const runtimePoolRoot = path.join(
  repoRoot,
  "public",
  "media",
  "movie-buff",
  "runtime-generated",
  "pool",
);

const smokeEnvironment = resolveSmokeEnvironment();
const supabaseUrl = smokeEnvironment.supabaseUrl;
const supabaseServiceRoleKey =
  smokeEnvironment.serviceRoleKey;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function isMissingContentEngineSchema(
  message,
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

function countFilesInDirectory(root) {
  if (!fs.existsSync(root)) {
    return 0;
  }

  let count = 0;
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const absolutePath = path.join(
        current,
        entry.name,
      );

      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      if (
        entry.isFile() &&
        /\.(mp4|mp3)$/i.test(entry.name)
      ) {
        count += 1;
      }
    }
  }

  return count;
}

function buildPoolCounts() {
  const tiers = ["primary", "secondary"];
  const labels = ["fan", "buff", "buffster"];
  const counts = {};

  for (const tier of tiers) {
    counts[tier] = {};

    for (const label of labels) {
      counts[tier][label] = countFilesInDirectory(
        path.join(runtimePoolRoot, tier, label),
      );
    }
  }

  return counts;
}

function summarizeByDifficulty(rows) {
  return rows.reduce((accumulator, row) => {
    const key = String(
      row.difficulty ?? "(null)",
    ).toLowerCase();
    accumulator[key] =
      (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

async function buildLegacyCoverageSummary() {
  const [
    { data: moviesData, error: moviesError },
    { data: clipsData, error: clipsError },
  ] = await Promise.all([
    supabase
      .from("movies")
      .select("id, difficulty, is_active"),
    supabase
      .from("clips")
      .select(
        "id, movie_id, is_active, media_url, source_url, licensing_status",
      ),
  ]);

  if (moviesError) {
    throw new Error(moviesError.message);
  }

  if (clipsError) {
    throw new Error(clipsError.message);
  }

  const movies = moviesData ?? [];
  const clips = clipsData ?? [];
  const movieById = new Map(
    movies.map((movie) => [movie.id, movie]),
  );

  const sourceBackedClips = clips.filter(
    (clip) =>
      Boolean(clip.media_url) ||
      Boolean(clip.source_url),
  );
  const activeSourceBackedClips =
    sourceBackedClips.filter(
      (clip) => clip.is_active,
    );
  const activeMovies = movies.filter(
    (movie) => movie.is_active,
  );

  return {
    mode: "legacy-fallback",
    sourceBackedVideoRows:
      sourceBackedClips.length,
    activeSourceBackedVideoRows:
      activeSourceBackedClips.length,
    inactiveSourceBackedVideoRows:
      sourceBackedClips.length -
      activeSourceBackedClips.length,
    activeByDifficulty:
      summarizeByDifficulty(activeMovies),
    inactiveByDifficulty:
      summarizeByDifficulty(
        movies.filter((movie) => !movie.is_active),
      ),
    legacyMovieCount: movies.length,
    legacyActiveMovieCount:
      activeMovies.length,
    legacyClipCount: clips.length,
    legacyActiveClipCount:
      clips.filter((clip) => clip.is_active)
        .length,
    legacyClipDifficultyByMovie:
      summarizeByDifficulty(
        activeSourceBackedClips
          .map((clip) =>
            movieById.get(clip.movie_id),
          )
          .filter(Boolean),
      ),
    runtimePoolFileCounts:
      buildPoolCounts(),
  };
}

async function main() {
  const { data, error } = await supabase
    .from("content_media")
    .select(
      "id, difficulty, is_active, is_hidden, media_type, source_url, licensing_status",
    )
    .eq("media_type", "video")
    .not("source_url", "is", null);

  if (error) {
    if (
      isMissingContentEngineSchema(
        error.message,
      )
    ) {
      console.log(
        JSON.stringify(
          await buildLegacyCoverageSummary(),
          null,
          2,
        ),
      );
      return;
    }

    throw new Error(error.message);
  }

  const rows = data ?? [];
  const activeRows = rows.filter(
    (row) => row.is_active && !row.is_hidden,
  );
  const inactiveRows = rows.filter(
    (row) => !row.is_active || row.is_hidden,
  );

  const output = {
    mode: "content-engine",
    sourceBackedVideoRows: rows.length,
    activeSourceBackedVideoRows: activeRows.length,
    inactiveSourceBackedVideoRows:
      inactiveRows.length,
    activeByDifficulty:
      summarizeByDifficulty(activeRows),
    inactiveByDifficulty:
      summarizeByDifficulty(inactiveRows),
    runtimePoolFileCounts:
      buildPoolCounts(),
  };

  console.log(
    JSON.stringify(output, null, 2),
  );
}

await main();
