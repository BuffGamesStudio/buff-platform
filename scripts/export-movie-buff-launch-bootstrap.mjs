#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputPath = path.join(
  repoRoot,
  "scripts",
  "generated",
  "movie-buff-launch-bootstrap.sql",
);

const LOCAL_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabase = createClient(
  LOCAL_SUPABASE_URL,
  LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function sqlValue(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (typeof value === "object") {
    return `${sqlValue(JSON.stringify(value))}::jsonb`;
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertStatement({
  table,
  columns,
  rows,
  onConflict,
}) {
  if (rows.length === 0) {
    return `-- ${table}: no rows\n`;
  }

  const values = rows
    .map(
      (row) =>
        `(${columns
          .map((column) => sqlValue(row[column]))
          .join(", ")})`,
    )
    .join(",\n");

  return [
    `insert into public.${table} (`,
    `  ${columns.join(", ")}`,
    `)`,
    "values",
    values,
    onConflict ? `on conflict ${onConflict};` : ";",
    "",
  ].join("\n");
}

async function selectAll(table, queryBuilder) {
  const { data, error } = await queryBuilder;

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return data ?? [];
}

async function main() {
  const playableClips = await selectAll(
    "clips",
    supabase
      .from("clips")
      .select(
        [
          "id",
          "movie_id",
          "clip_type",
          "media_url",
          "prompt",
          "quote_text",
          "start_seconds",
          "end_seconds",
          "difficulty",
          "licensing_status",
          "source_name",
          "source_url",
          "attribution",
          "is_active",
          "created_at",
        ].join(","),
      )
      .eq("is_active", true)
      .eq("clip_type", "video")
      .not("media_url", "is", null),
  );

  const playableMovieIds = [
    ...new Set(playableClips.map((clip) => clip.movie_id)),
  ];
  const playableClipIds = playableClips.map((clip) => clip.id);

  const movies = await selectAll(
    "movies",
    supabase
      .from("movies")
      .select(
        [
          "id",
          "title",
          "normalized_title",
          "release_year",
          "description",
          "director",
          "poster_url",
          "backdrop_url",
          "runtime_minutes",
          "difficulty",
          "is_active",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .in("id", playableMovieIds),
  );

  const movieCategories = await selectAll(
    "movie_categories",
    supabase
      .from("movie_categories")
      .select("movie_id, category_id")
      .in("movie_id", playableMovieIds),
  );

  const categoryIds = [
    ...new Set(movieCategories.map((row) => row.category_id)),
  ];

  const categories = await selectAll(
    "categories",
    supabase
      .from("categories")
      .select("id, name, slug, description, created_at")
      .in("id", categoryIds),
  );

  const contentMedia = await selectAll(
    "content_media",
    supabase
      .from("content_media")
      .select("*")
      .in("legacy_clip_id", playableClipIds),
  );

  const contentIds = [
    ...new Set(contentMedia.map((row) => row.content_id).filter(Boolean)),
  ];

  const contentItems = await selectAll(
    "content_items",
    supabase
      .from("content_items")
      .select("*")
      .in("id", contentIds),
  );

  const contentTypeIds = [
    ...new Set(
      contentItems.map((row) => row.content_type_id).filter(Boolean),
    ),
  ];

  const contentTypes = await selectAll(
    "content_types",
    supabase
      .from("content_types")
      .select("*")
      .in("id", contentTypeIds),
  );

  const contentCategories = await selectAll(
    "content_categories",
    supabase
      .from("content_categories")
      .select("*")
      .in("content_id", contentIds),
  );

  const sql = [
    "-- Generated from the local launch-safe Movie Buff dataset",
    "-- Date: Friday, July 31, 2026",
    "begin;",
    "",
    insertStatement({
      table: "categories",
      columns: ["id", "name", "slug", "description", "created_at"],
      rows: categories,
      onConflict: "(id) do nothing",
    }),
    insertStatement({
      table: "movies",
      columns: [
        "id",
        "title",
        "normalized_title",
        "release_year",
        "description",
        "director",
        "poster_url",
        "backdrop_url",
        "runtime_minutes",
        "difficulty",
        "is_active",
        "created_at",
        "updated_at",
      ],
      rows: movies,
      onConflict: "(id) do nothing",
    }),
    insertStatement({
      table: "movie_categories",
      columns: ["movie_id", "category_id"],
      rows: movieCategories,
      onConflict: "(movie_id, category_id) do nothing",
    }),
    insertStatement({
      table: "clips",
      columns: [
        "id",
        "movie_id",
        "clip_type",
        "media_url",
        "prompt",
        "quote_text",
        "start_seconds",
        "end_seconds",
        "difficulty",
        "licensing_status",
        "source_name",
        "source_url",
        "attribution",
        "is_active",
        "created_at",
      ],
      rows: playableClips,
      onConflict: "(id) do nothing",
    }),
    insertStatement({
      table: "content_types",
      columns: Object.keys(contentTypes[0] ?? {}),
      rows: contentTypes,
      onConflict: "(id) do nothing",
    }),
    insertStatement({
      table: "content_items",
      columns: Object.keys(contentItems[0] ?? {}),
      rows: contentItems,
      onConflict: "(id) do nothing",
    }),
    insertStatement({
      table: "content_categories",
      columns: Object.keys(contentCategories[0] ?? {}),
      rows: contentCategories,
      onConflict: "(content_id, category_id) do nothing",
    }),
    insertStatement({
      table: "content_media",
      columns: Object.keys(contentMedia[0] ?? {}),
      rows: contentMedia,
      onConflict: "(id) do nothing",
    }),
    "commit;",
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });
  await fs.writeFile(outputPath, sql, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        categories: categories.length,
        movies: movies.length,
        movieCategories: movieCategories.length,
        clips: playableClips.length,
        contentTypes: contentTypes.length,
        contentItems: contentItems.length,
        contentCategories: contentCategories.length,
        contentMedia: contentMedia.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
