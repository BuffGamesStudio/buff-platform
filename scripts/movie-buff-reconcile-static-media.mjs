import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const publicDomainRoot = path.join(
  repoRoot,
  "public",
  "media",
  "movie-buff",
  "public-domain",
);

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
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

async function listFiles(rootDirectory) {
  const results = [];
  const pending = [rootDirectory];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await fs.readdir(current, {
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

      results.push(absolutePath);
    }
  }

  return results;
}

function toPublicUrl(absolutePath) {
  const relativePath = path.relative(
    path.join(repoRoot, "public"),
    absolutePath,
  );

  return `/${relativePath.split(path.sep).join("/")}`;
}

async function loadActiveStaticRows() {
  const { data, error } = await supabase
    .from("content_media")
    .select(
      [
        "id",
        "content_id",
        "legacy_clip_id",
        "media_url",
        "media_type",
        "is_active",
        "is_hidden",
      ].join(", "),
    )
    .eq("media_type", "video")
    .eq("is_active", true)
    .eq("is_hidden", false)
    .like(
      "media_url",
      "/media/movie-buff/public-domain/%",
    );

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function updateInChunks(table, ids, patch) {
  const chunkSize = 50;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase
      .from(table)
      .update(patch)
      .in("id", chunk);

    if (error) {
      throw new Error(
        `${table} update failed: ${error.message}`,
      );
    }
  }
}

async function refreshAnalytics(mediaIds, contentIds) {
  for (const mediaId of mediaIds) {
    const { error } = await supabase.rpc(
      "movie_buff_refresh_clip_analytics",
      { p_content_media_id: mediaId },
    );

    if (error) {
      throw new Error(
        `clip analytics refresh failed for ${mediaId}: ${error.message}`,
      );
    }
  }

  for (const contentId of contentIds) {
    const { error } = await supabase.rpc(
      "movie_buff_refresh_movie_analytics",
      { p_content_id: contentId },
    );

    if (error) {
      throw new Error(
        `movie analytics refresh failed for ${contentId}: ${error.message}`,
      );
    }
  }
}

async function main() {
  const allFiles = await listFiles(publicDomainRoot);
  const existingPublicUrls = new Set(
    allFiles
      .filter((filePath) =>
        filePath.toLowerCase().endsWith(".mp4"),
      )
      .map(toPublicUrl),
  );

  const activeRows = await loadActiveStaticRows();
  const missingRows = activeRows.filter((row) => {
    const mediaUrl = String(
      row.media_url ?? "",
    ).trim();

    return (
      mediaUrl.length === 0 ||
      !existingPublicUrls.has(mediaUrl)
    );
  });

  const missingMediaIds = missingRows.map(
    (row) => row.id,
  );
  const missingClipIds = missingRows
    .map((row) => row.legacy_clip_id)
    .filter(Boolean);
  const touchedContentIds = [
    ...new Set(
      missingRows
        .map((row) => row.content_id)
        .filter(Boolean),
    ),
  ];

  if (missingMediaIds.length > 0) {
    await updateInChunks(
      "content_media",
      missingMediaIds,
      { is_active: false },
    );
  }

  if (missingClipIds.length > 0) {
    await updateInChunks("clips", missingClipIds, {
      is_active: false,
    });
  }

  if (
    missingMediaIds.length > 0 ||
    touchedContentIds.length > 0
  ) {
    await refreshAnalytics(
      missingMediaIds,
      touchedContentIds,
    );
  }

  console.log(
    JSON.stringify(
      {
        activeRowsBefore: activeRows.length,
        existingMp4Files:
          existingPublicUrls.size,
        deactivatedRows:
          missingMediaIds.length,
        remainingPlayableStaticRows:
          activeRows.length -
          missingMediaIds.length,
      },
      null,
      2,
    ),
  );
}

await main();
