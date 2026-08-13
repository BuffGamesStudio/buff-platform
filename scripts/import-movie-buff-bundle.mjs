#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(
  fileURLToPath(import.meta.url),
);
const repoRoot = path.resolve(scriptDir, "..");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/import-movie-buff-bundle.mjs --bundle <path> [--apply] [--activate-built-assets]",
      "",
      "Options:",
      "  --bundle <path>   Path to the Movie Buff import bundle JSON.",
      "  --apply           Write changes to Supabase. Without this flag the script runs in dry-run mode.",
      "  --activate-built-assets  Publish movies and activate media only when the referenced local asset file exists under public/.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = {
    activateBuiltAssets: false,
    apply: false,
    bundlePath: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--apply") {
      args.apply = true;
      continue;
    }

    if (value === "--activate-built-assets") {
      args.activateBuiltAssets = true;
      continue;
    }

    if (value === "--bundle") {
      args.bundlePath = argv[index + 1] ?? "";
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

function transliterateText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeMovieText(value) {
  return transliterateText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function mapMediaTypeToLegacyClipType(mediaType) {
  switch (mediaType) {
    case "video":
    case "audio":
    case "image":
    case "poster":
    case "quote":
    case "trivia":
    case "year":
      return mediaType;
    case "text":
    default:
      return "trivia";
  }
}

function isPublishedMovie(publicationStatus) {
  return publicationStatus === "published";
}

function toNullableString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function toNullableInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function capitalizeWords(value) {
  return value.replace(
    /\b[a-z]/g,
    (character) =>
      character.toUpperCase(),
  );
}

function buildImportedMovieDescription(entry) {
  const explicitDescription =
    toNullableString(
      entry?.movie?.description,
    );

  if (explicitDescription) {
    return explicitDescription;
  }

  const releaseYear =
    toNullableInteger(
      entry?.movie?.releaseYear,
    );
  const director = toNullableString(
    entry?.movie?.director,
  );
  const metadata = entry?.metadata ?? {};
  const countryOrOrigin =
    toNullableString(
      metadata.countryOrOrigin,
    );
  const genres = Array.isArray(
    metadata.genres,
  )
    ? metadata.genres
        .filter(
          (value) =>
            typeof value === "string" &&
            value.trim().length > 0,
        )
        .slice(0, 2)
        .map((value) =>
          capitalizeWords(
            value.trim().replace(
              /[-_]+/g,
              " ",
            ),
          ),
        )
    : [];

  const segments = [];

  if (genres.length > 0) {
    segments.push(
      `A ${genres.join(" / ")} movie`,
    );
  } else {
    segments.push("A movie");
  }

  if (countryOrOrigin) {
    segments.push(`from ${countryOrOrigin}`);
  }

  if (releaseYear !== null) {
    segments.push(`released in ${releaseYear}`);
  }

  const baseDescription =
    segments.join(" ") + ".";

  if (director) {
    return `${baseDescription} Directed by ${director.replace(/\.+$/, "")}.`;
  }

  return baseDescription;
}

function resolvePublicAssetPath(publicUrl) {
  if (
    typeof publicUrl !== "string" ||
    !publicUrl.startsWith("/")
  ) {
    return null;
  }

  return path.join(
    repoRoot,
    "public",
    publicUrl.replace(/^\//, ""),
  );
}

function hasBuiltAsset(mediaUrl) {
  const resolvedPath =
    resolvePublicAssetPath(mediaUrl);

  const hasMediaFile =
    resolvedPath !== null &&
    fs.existsSync(resolvedPath);

  if (!hasMediaFile) {
    return false;
  }

  return true;
}

function buildAcceptedAnswers(title) {
  const answers = new Map();

  function addAnswer(answerText, answerType) {
    const cleanedAnswer = toNullableString(answerText);

    if (!cleanedAnswer) {
      return;
    }

    const normalizedAnswer =
      normalizeMovieText(cleanedAnswer);

    if (!normalizedAnswer) {
      return;
    }

    if (!answers.has(normalizedAnswer)) {
      answers.set(normalizedAnswer, {
        answer_text: cleanedAnswer,
        answer_type: answerType,
        normalized_answer:
          normalizedAnswer,
      });
    }
  }

  addAnswer(title, "primary");

  const withoutLeadingArticle = title.replace(
    /^(the|an|a)\s+/i,
    "",
  );

  if (
    withoutLeadingArticle.trim().length > 0 &&
    withoutLeadingArticle !== title
  ) {
    addAnswer(
      withoutLeadingArticle,
      "alternate",
    );
  }

  const transliteratedTitle =
    transliterateText(title);

  if (transliteratedTitle !== title) {
    addAnswer(
      transliteratedTitle,
      "translation",
    );
  }

  return Array.from(answers.values());
}

async function getSingleRow(queryBuilder) {
  const { data, error } = await queryBuilder.limit(2);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
}

async function findExistingContentItem(
  supabase,
  contentTypeId,
  title,
  releaseYear,
) {
  let query = supabase
    .from("content_items")
    .select(
      "id,legacy_movie_id,title,normalized_title,release_year",
    )
    .eq("content_type_id", contentTypeId)
    .eq(
      "normalized_title",
      normalizeMovieText(title),
    );

  query =
    releaseYear === null
      ? query.is("release_year", null)
      : query.eq("release_year", releaseYear);

  return getSingleRow(query);
}

async function findExistingMedia(
  supabase,
  contentId,
  media,
) {
  return getSingleRow(
    supabase
      .from("content_media")
      .select(
        "id,legacy_clip_id,title,media_type,sort_order",
      )
      .eq("content_id", contentId)
      .eq("media_type", media.mediaType)
      .eq("sort_order", toNullableInteger(media.sortOrder) ?? 0)
      .eq("title", toNullableString(media.title)),
  );
}

async function syncLegacyMovie(
  supabase,
  contentId,
  legacyMovieId,
  moviePayload,
) {
  const legacyMoviePayload = {
    title: moviePayload.title,
    normalized_title:
      moviePayload.normalized_title,
    release_year:
      moviePayload.release_year,
    description:
      moviePayload.description,
    poster_url: moviePayload.poster_url,
    difficulty: moviePayload.difficulty,
    is_active: isPublishedMovie(
      moviePayload.publication_status,
    ),
    updated_at: new Date().toISOString(),
  };

  let resolvedLegacyMovieId =
    legacyMovieId ?? null;

  if (!resolvedLegacyMovieId) {
    const { data, error } = await supabase
      .from("movies")
      .insert(legacyMoviePayload)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    resolvedLegacyMovieId = data.id;

    const { error: linkError } =
      await supabase
        .from("content_items")
        .update({
          legacy_movie_id:
            resolvedLegacyMovieId,
        })
        .eq("id", contentId);

    if (linkError) {
      throw new Error(linkError.message);
    }
  } else {
    const { error } = await supabase
      .from("movies")
      .update(legacyMoviePayload)
      .eq("id", resolvedLegacyMovieId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return resolvedLegacyMovieId;
}

async function replaceMovieCategories(
  supabase,
  contentId,
  legacyMovieId,
  categories,
) {
  const categoryIds =
    categories.categoryIds ?? [];
  const primaryCategoryId =
    categories.primaryCategoryId ?? null;

  const { error: contentDeleteError } =
    await supabase
      .from("content_categories")
      .delete()
      .eq("content_id", contentId);

  if (contentDeleteError) {
    throw new Error(
      contentDeleteError.message,
    );
  }

  if (categoryIds.length > 0) {
    const { error } = await supabase
      .from("content_categories")
      .insert(
        categoryIds.map((categoryId) => ({
          content_id: contentId,
          category_id: categoryId,
          is_primary:
            categoryId === primaryCategoryId,
        })),
      );

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: legacyDeleteError } =
    await supabase
      .from("movie_categories")
      .delete()
      .eq("movie_id", legacyMovieId);

  if (legacyDeleteError) {
    throw new Error(
      legacyDeleteError.message,
    );
  }

  if (categoryIds.length > 0) {
    const { error } = await supabase
      .from("movie_categories")
      .insert(
        categoryIds.map((categoryId) => ({
          movie_id: legacyMovieId,
          category_id: categoryId,
        })),
      );

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function syncLegacyMedia(
  supabase,
  legacyMovieId,
  legacyClipId,
  moviePayload,
  mediaPayload,
) {
  const legacyClipPayload = {
    movie_id: legacyMovieId,
    clip_type: mapMediaTypeToLegacyClipType(
      mediaPayload.media_type,
    ),
    media_url: mediaPayload.media_url,
    prompt: mediaPayload.prompt,
    quote_text: mediaPayload.quote_text,
    start_seconds:
      mediaPayload.start_seconds,
    end_seconds:
      mediaPayload.end_seconds,
    difficulty: mediaPayload.difficulty,
    licensing_status:
      mediaPayload.licensing_status,
    source_name: mediaPayload.source_name,
    source_url: mediaPayload.source_url,
    attribution: mediaPayload.attribution,
    is_active:
      isPublishedMovie(
        moviePayload.publication_status,
      ) &&
      mediaPayload.is_active &&
      !mediaPayload.is_hidden,
  };

  let resolvedLegacyClipId =
    legacyClipId ?? null;

  if (!resolvedLegacyClipId) {
    const { data, error } = await supabase
      .from("clips")
      .insert(legacyClipPayload)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    resolvedLegacyClipId = data.id;
  } else {
    const { error } = await supabase
      .from("clips")
      .update(legacyClipPayload)
      .eq("id", resolvedLegacyClipId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return resolvedLegacyClipId;
}

async function upsertAcceptedAnswers(
  supabase,
  contentId,
  title,
) {
  const answers = buildAcceptedAnswers(title);

  if (answers.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("content_answers")
    .upsert(
      answers.map((answer) => ({
        content_id: contentId,
        answer_text:
          answer.answer_text,
        normalized_answer:
          answer.normalized_answer,
        answer_type:
          answer.answer_type,
        is_active: true,
      })),
      {
        onConflict:
          "content_id,normalized_answer",
      },
    );

  if (error) {
    throw new Error(error.message);
  }

  return answers.length;
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

  const envValues = readEnvFile(
    path.join(repoRoot, ".env.local"),
  );
  const supabaseUrl =
    envValues.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    envValues.SUPABASE_SECRET_KEY ??
    envValues.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  const bundle = JSON.parse(
    fs.readFileSync(bundlePath, "utf8"),
  );

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: { persistSession: false },
    },
  );

  const { data: contentType, error: contentTypeError } =
    await supabase
      .from("content_types")
      .select("id,slug")
      .eq("id", bundle.contentTypeId)
      .single();

  if (contentTypeError) {
    throw new Error(contentTypeError.message);
  }

  if (contentType.slug !== "movie") {
    throw new Error(
      `Bundle content type must be movie, received ${contentType.slug}.`,
    );
  }

  const declaredCategoryIds = Array.from(
    new Set(
      bundle.movies.flatMap((entry) =>
        Array.isArray(
          entry.categories?.categoryIds,
        )
          ? entry.categories.categoryIds
          : [],
      ),
    ),
  );

  const {
    data: existingCategories,
    error: categoryError,
  } = await supabase
    .from("categories")
    .select("id")
    .in("id", declaredCategoryIds);

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  const existingCategoryIds = new Set(
    (existingCategories ?? []).map(
      (category) => category.id,
    ),
  );

  for (const categoryId of declaredCategoryIds) {
    if (!existingCategoryIds.has(categoryId)) {
      throw new Error(
        `Bundle references unknown category ID ${categoryId}.`,
      );
    }
  }

  const summary = {
    dryRun: !args.apply,
    moviesCreated: 0,
    moviesUpdated: 0,
    mediaCreated: 0,
    mediaUpdated: 0,
    answersSeeded: 0,
  };

  for (const entry of bundle.movies) {
    const movie = entry.movie ?? {};
    const firstMedia =
      Array.isArray(entry.media) &&
      entry.media.length > 0
        ? entry.media[0]
        : null;
    const requestedPublicationStatus =
      toNullableString(
        movie.publicationStatus,
      ) ?? "draft";
    const hasBuiltPlayableMedia =
      args.activateBuiltAssets &&
      (entry.media ?? []).some((media) =>
        hasBuiltAsset(
          media?.mediaUrl,
        ),
      );
    const effectivePublicationStatus =
      hasBuiltPlayableMedia &&
      requestedPublicationStatus !==
        "archived"
        ? "published"
        : requestedPublicationStatus;
    const importedDescription =
      buildImportedMovieDescription(
        entry,
      );
    const releaseYear = toNullableInteger(
      movie.releaseYear,
    );
    const contentItemPayload = {
      content_type_id: bundle.contentTypeId,
      title: movie.title,
      normalized_title:
        normalizeMovieText(movie.title),
      release_year: releaseYear,
      description:
        importedDescription,
      poster_url: toNullableString(
        movie.posterUrl,
      ),
      difficulty:
        toNullableString(
          movie.difficulty,
        ) ?? "medium",
      publication_status:
        effectivePublicationStatus,
      licensing_status:
        toNullableString(
          movie.licensingStatus,
        ) ?? "pending",
      source_name: toNullableString(
        firstMedia?.sourceName ?? "",
      ),
      source_url: toNullableString(
        firstMedia?.sourceUrl ?? "",
      ),
      attribution: toNullableString(
        firstMedia?.attribution ?? "",
      ),
      metadata: entry.metadata ?? {},
      is_active:
        movie.publicationStatus !==
        "archived",
    };

    const existingContentItem =
      await findExistingContentItem(
        supabase,
        bundle.contentTypeId,
        movie.title,
        releaseYear,
      );

    if (!existingContentItem) {
      summary.moviesCreated += 1;
    } else {
      summary.moviesUpdated += 1;
    }

    if (!args.apply) {
      summary.answersSeeded +=
        buildAcceptedAnswers(
          movie.title,
        ).length;
      summary.mediaCreated +=
        existingContentItem ? 0 : 1;
      summary.mediaUpdated +=
        existingContentItem ? 1 : 0;
      continue;
    }

    let contentId =
      existingContentItem?.id ?? null;
    let legacyMovieId =
      existingContentItem?.legacy_movie_id ??
      null;

    if (!contentId) {
      const { data, error } =
        await supabase
          .from("content_items")
          .insert(contentItemPayload)
          .select("id,legacy_movie_id")
          .single();

      if (error) {
        throw new Error(error.message);
      }

      contentId = data.id;
      legacyMovieId =
        data.legacy_movie_id ?? null;
    } else {
      const { error } = await supabase
        .from("content_items")
        .update(contentItemPayload)
        .eq("id", contentId);

      if (error) {
        throw new Error(error.message);
      }
    }

    legacyMovieId = await syncLegacyMovie(
      supabase,
      contentId,
      legacyMovieId,
      contentItemPayload,
    );

    await replaceMovieCategories(
      supabase,
      contentId,
      legacyMovieId,
      entry.categories ?? {},
    );

    for (const media of entry.media ?? []) {
      const mediaHasBuiltAsset =
        args.activateBuiltAssets &&
        hasBuiltAsset(
          media.mediaUrl,
        );
      const startSeconds =
        toNullableNumber(
          media.startSeconds,
        );
      const endSeconds = toNullableNumber(
        media.endSeconds,
      );
      const mediaPayload = {
        content_id: contentId,
        media_type:
          toNullableString(
            media.mediaType,
          ) ?? "video",
        round_position: toNullableString(
          media.roundPosition,
        ),
        title: toNullableString(
          media.title,
        ),
        prompt: toNullableString(
          media.prompt,
        ),
        quote_text: toNullableString(
          media.quoteText,
        ),
        media_url: toNullableString(
          media.mediaUrl,
        ),
        thumbnail_url:
          toNullableString(
            media.thumbnailUrl,
          ),
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        duration_seconds:
          startSeconds !== null &&
          endSeconds !== null
            ? Number(
                (
                  endSeconds -
                  startSeconds
                ).toFixed(2),
              )
            : null,
        difficulty:
          toNullableString(
            media.difficulty,
          ) ?? "medium",
        licensing_status:
          toNullableString(
            media.licensingStatus,
          ) ?? "pending",
        source_name: toNullableString(
          media.sourceName,
        ),
        source_url: toNullableString(
          media.sourceUrl,
        ),
        attribution: toNullableString(
          media.attribution,
        ),
        sort_order:
          toNullableInteger(
            media.sortOrder,
          ) ?? 0,
        is_hidden: media.isHidden === true,
        is_active:
          args.activateBuiltAssets
            ? mediaHasBuiltAsset &&
              media.isHidden !== true
            : media.isActive === true,
        metadata: {
          importKey:
            entry.importKey ?? null,
          launchOrder:
            entry.metadata
              ?.launchOrder ?? null,
          launchWave:
            entry.metadata
              ?.launchWave ?? null,
          montageSpec:
            "2x5s beginning + 2x5s middle + 2x5s ending",
        },
      };

      const existingMedia =
        await findExistingMedia(
          supabase,
          contentId,
          media,
        );

      let contentMediaId =
        existingMedia?.id ?? null;
      let legacyClipId =
        existingMedia?.legacy_clip_id ??
        null;

      if (!contentMediaId) {
        summary.mediaCreated += 1;

        const { data, error } =
          await supabase
            .from("content_media")
            .insert(mediaPayload)
            .select("id,legacy_clip_id")
            .single();

        if (error) {
          throw new Error(error.message);
        }

        contentMediaId = data.id;
        legacyClipId =
          data.legacy_clip_id ?? null;
      } else {
        summary.mediaUpdated += 1;

        const { error } = await supabase
          .from("content_media")
          .update(mediaPayload)
          .eq("id", contentMediaId);

        if (error) {
          throw new Error(error.message);
        }
      }

      legacyClipId = await syncLegacyMedia(
        supabase,
        legacyMovieId,
        legacyClipId,
        contentItemPayload,
        mediaPayload,
      );

      const { error: linkError } =
        await supabase
          .from("content_media")
          .update({
            legacy_clip_id:
              legacyClipId,
          })
          .eq("id", contentMediaId);

      if (linkError) {
        throw new Error(linkError.message);
      }
    }

    summary.answersSeeded +=
      await upsertAcceptedAnswers(
        supabase,
        contentId,
        movie.title,
      );
  }

  console.log(
    JSON.stringify(summary, null, 2),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
