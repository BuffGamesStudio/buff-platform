import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const poolRoot = path.join(
  repoRoot,
  "public",
  "media",
  "movie-buff",
  "runtime-generated",
  "pool",
);

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

function collectPoolDirectories() {
  if (!fs.existsSync(poolRoot)) {
    return [];
  }

  const rows = [];
  const tiers = ["primary", "secondary"];

  for (const tier of tiers) {
    const tierRoot = path.join(poolRoot, tier);
    if (!fs.existsSync(tierRoot)) {
      continue;
    }

    for (const labelDir of fs.readdirSync(tierRoot, { withFileTypes: true })) {
      if (!labelDir.isDirectory()) {
        continue;
      }

      const labelRoot = path.join(tierRoot, labelDir.name);

      for (const mediaDir of fs.readdirSync(labelRoot, { withFileTypes: true })) {
        if (!mediaDir.isDirectory()) {
          continue;
        }

        const mediaRoot = path.join(labelRoot, mediaDir.name);
        const files = fs
          .readdirSync(mediaRoot, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              /\.(mp4|mp3)$/i.test(entry.name) &&
              !entry.name.includes(".partial") &&
              !entry.name.endsWith(".lock"),
          )
          .map((entry) => path.join(mediaRoot, entry.name));

        if (files.length === 0) {
          continue;
        }

        rows.push({
          mediaId: mediaDir.name,
          tier,
          label: labelDir.name,
          readyFiles: files.length,
          newestFile: files
            .map((fullPath) => ({
              fullPath,
              mtimeMs: fs.statSync(fullPath).mtimeMs,
            }))
            .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
            .fullPath,
        });
      }
    }
  }

  return rows;
}

const envValues = readEnvFile(
  path.join(repoRoot, ".env.local"),
);
const supabaseAdminKey =
  envValues.SUPABASE_SECRET_KEY ??
  envValues.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  envValues.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAdminKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const poolRows = collectPoolDirectories();
const mediaIds = Array.from(
  new Set(poolRows.map((row) => row.mediaId)),
);

let dbRows = [];

if (mediaIds.length > 0) {
  const { data, error } = await supabase
    .from("content_media")
    .select(
      "id, content_id, legacy_clip_id, title, difficulty, media_url, is_active, is_hidden",
    )
    .in("id", mediaIds);

  if (error) {
    throw new Error(error.message);
  }

  dbRows = data ?? [];
}

const dbById = new Map(
  dbRows.map((row) => [row.id, row]),
);

const joined = poolRows.map((row) => ({
  ...row,
  ...(dbById.get(row.mediaId) ?? {
    title: null,
    difficulty: null,
    media_url: null,
    is_active: null,
    is_hidden: null,
    content_id: null,
    legacy_clip_id: null,
  }),
}));

const promotable = joined.filter(
  (row) =>
    row.is_active === false &&
    row.is_hidden === false &&
    typeof row.media_url === "string" &&
    row.media_url.startsWith("/media/movie-buff/public-domain/"),
);

console.log(
  JSON.stringify(
    {
      totalPoolMediaIds: mediaIds.length,
      joinedCount: joined.length,
      promotableCount: promotable.length,
      promotable,
      joined,
    },
    null,
    2,
  ),
);
