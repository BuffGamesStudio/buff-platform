import "server-only";

import { createClient } from "@supabase/supabase-js";

type MovieStatus =
  | "Ready"
  | "Draft"
  | "Missing media"
  | "Archived";

type ContentItemRow = {
  id: string;
  title: string;
  release_year: number | null;
  poster_url: string | null;
  difficulty: string;
  publication_status: string;
  licensing_status: string;
  source_name: string | null;
  source_url: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type MediaRow = {
  content_id: string;
  media_type: string;
  media_url: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
  is_hidden: boolean;
  is_active: boolean;
};

type MovieAnalyticsRow = {
  content_id: string;
  total_clip_count: number;
  playable_clip_count: number;
  total_plays: number;
  total_hints_used: number;
  last_played_at: string | null;
};

type CategoryLinkRow = {
  content_id: string;
  category_id: string;
  is_primary: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type LegacyMovieListRow = {
  id: string;
  title: string;
  release_year: number | null;
  poster_url: string | null;
  difficulty: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type LegacyClipListRow = {
  movie_id: string;
  id: string;
  clip_type: string;
  media_url: string | null;
  source_url: string | null;
  source_name: string | null;
  licensing_status: string;
  is_active: boolean;
};

export type AdminMovieListItem = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  category: string;
  sourceName: string | null;
  sourceUrl: string | null;
  countryOrOrigin: string | null;
  language: string | null;
  clips: number;
  playableClips: number;
  totalPlays: number;
  totalHintsUsed: number;
  lastPlayedAt: string | null;
  ingestStatus: string;
  autoClipStatus: string;
  lifecycleStatus: string;
  difficulty: string;
  license: string;
  publicationStatus: string;
  status: MovieStatus;
  createdAt: string;
};

export type AdminMovieDetail = {
  id: string;
  title: string;
  releaseYear: string;
  posterUrl: string;
  difficulty: string;
  publicationStatus: string;
  licensingStatus: string;
  categoryIds: string[];
  primaryCategoryId: string | null;
  mediaCount: number;
  mediaItems: AdminMovieMedia[];
};

export type AdminMovieInput = {
  title: string;
  releaseYear: string;
  posterUrl: string;
  difficulty: string;
  publicationStatus: string;
  licensingStatus: string;
};

export type AdminCategoryOption = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

export type AdminMovieCategoryInput = {
  categoryIds: string[];
  primaryCategoryId: string | null;
};

export type AdminMovieMedia = {
  id: string;
  mediaType: string;
  roundPosition: string;
  title: string;
  prompt: string;
  quoteText: string;
  mediaUrl: string;
  thumbnailUrl: string;
  startSeconds: string;
  endSeconds: string;
  durationSeconds: string;
  difficulty: string;
  licensingStatus: string;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  sortOrder: number;
  isHidden: boolean;
  isActive: boolean;
};

export type AdminMovieMediaInput = {
  mediaType: string;
  roundPosition: string;
  title: string;
  prompt: string;
  quoteText: string;
  mediaUrl: string;
  thumbnailUrl: string;
  startSeconds: string;
  endSeconds: string;
  difficulty: string;
  licensingStatus: string;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  sortOrder: string;
  isHidden: boolean;
};

const MOVIE_DIFFICULTIES = [
  "easy",
  "medium",
  "hard",
  "expert",
] as const;

const MOVIE_PUBLICATION_STATUSES = [
  "draft",
  "review",
  "published",
  "archived",
] as const;

const MOVIE_LICENSING_STATUSES = [
  "pending",
  "licensed",
  "public_domain",
  "promotional",
  "original",
  "user_connected",
  "restricted",
] as const;

const MEDIA_TYPES = [
  "video",
  "audio",
  "image",
  "poster",
  "quote",
  "trivia",
  "year",
  "text",
] as const;

const ROUND_POSITIONS = [
  "beginning",
  "middle",
  "ending",
  "any",
] as const;

type ContentMediaRow = {
  id: string;
  media_type: string;
  round_position: string | null;
  title: string | null;
  prompt: string | null;
  quote_text: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  duration_seconds: number | null;
  difficulty: string;
  licensing_status: string;
  source_name: string | null;
  source_url: string | null;
  attribution: string | null;
  sort_order: number;
  is_hidden: boolean;
  is_active: boolean;
};

type LegacyMovieSyncRow = {
  id: string;
  legacy_movie_id: string | null;
  title: string;
  normalized_title: string;
  release_year: number | null;
  poster_url: string | null;
  difficulty: string;
  publication_status: string;
};

type LegacyMovieMediaSyncRow = {
  id: string;
  media_type: string;
  prompt: string | null;
  quote_text: string | null;
  media_url: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  difficulty: string;
  licensing_status: string;
  source_name: string | null;
  source_url: string | null;
  attribution: string | null;
  is_hidden: boolean;
  is_active: boolean;
  legacy_clip_id: string | null;
};

type LegacyMovieState = {
  legacyMovieId: string;
  publicationStatus: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getMovieStatus(
  publicationStatus: string,
  clipCount: number,
): MovieStatus {
  if (publicationStatus === "archived") {
    return "Archived";
  }

  if (publicationStatus !== "published") {
    return "Draft";
  }

  if (clipCount === 0) {
    return "Missing media";
  }

  return "Ready";
}

function extractMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function formatMovieOpsLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isMissingContentEngineSchema(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("content_") &&
    (normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("does not exist"))
  );
}

function hasGeneratedClipSignature(
  mediaRow: MediaRow,
) {
  if (
    typeof mediaRow.media_url === "string" &&
    mediaRow.media_url.includes(
      "/api/movie-buff/generated/",
    )
  ) {
    return true;
  }

  const montageSpec = extractMetadataString(
    mediaRow.metadata,
    ["montageSpec"],
  );

  return montageSpec !== null;
}

function normalizeMovieTitle(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function formatNumberField(value: number | null) {
  return value === null ? "" : value.toString();
}

function isPublishedMovie(publicationStatus: string) {
  return publicationStatus === "published";
}

function mapMediaTypeToLegacyClipType(
  mediaType: string,
) {
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

function getStringField(
  payload: Record<string, unknown>,
  key:
    | keyof AdminMovieInput
    | keyof AdminMovieMediaInput,
) {
  const value = payload[key];

  return typeof value === "string" ? value : "";
}

function getBooleanField(
  payload: Record<string, unknown>,
  key: keyof AdminMovieMediaInput,
) {
  return payload[key] === true;
}

function isAllowedValue<T extends readonly string[]>(
  allowedValues: T,
  candidate: string,
): candidate is T[number] {
  return allowedValues.includes(candidate as T[number]);
}

function parseMovieInput(input: unknown): AdminMovieInput {
  if (!input || typeof input !== "object") {
    throw new Error("The movie payload is invalid.");
  }

  const payload = input as Record<string, unknown>;
  const title = getStringField(payload, "title").trim();
  const releaseYear = getStringField(payload, "releaseYear").trim();
  const posterUrl = getStringField(payload, "posterUrl").trim();
  const difficulty = getStringField(payload, "difficulty").trim();
  const publicationStatus = getStringField(
    payload,
    "publicationStatus",
  ).trim();
  const licensingStatus = getStringField(
    payload,
    "licensingStatus",
  ).trim();

  if (!title) {
    throw new Error("A movie title is required.");
  }

  if (
    releaseYear !== "" &&
    (!Number.isInteger(Number(releaseYear)) ||
      Number(releaseYear) < 1800 ||
      Number(releaseYear) > 2200)
  ) {
    throw new Error("Enter a valid release year.");
  }

  if (!isAllowedValue(MOVIE_DIFFICULTIES, difficulty)) {
    throw new Error("Select a valid difficulty.");
  }

  if (
    !isAllowedValue(
      MOVIE_PUBLICATION_STATUSES,
      publicationStatus,
    )
  ) {
    throw new Error("Select a valid publication status.");
  }

  if (
    !isAllowedValue(
      MOVIE_LICENSING_STATUSES,
      licensingStatus,
    )
  ) {
    throw new Error("Select a valid licensing status.");
  }

  return {
    title,
    releaseYear,
    posterUrl,
    difficulty,
    publicationStatus,
    licensingStatus,
  };
}

function parseMovieCategoryInput(
  input: unknown,
): AdminMovieCategoryInput {
  if (!input || typeof input !== "object") {
    throw new Error("The category payload is invalid.");
  }

  const payload = input as Record<string, unknown>;
  const categoryIds = Array.isArray(payload.categoryIds)
    ? Array.from(
        new Set(
          payload.categoryIds
            .filter(
              (value): value is string =>
                typeof value === "string",
            )
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
        ),
      )
    : [];
  const primaryCategoryId =
    typeof payload.primaryCategoryId === "string"
      ? payload.primaryCategoryId.trim() || null
      : null;

  if (
    primaryCategoryId &&
    !categoryIds.includes(primaryCategoryId)
  ) {
    throw new Error(
      "Select a primary category from the chosen categories.",
    );
  }

  return {
    categoryIds,
    primaryCategoryId,
  };
}

function parseOptionalDecimal(
  value: string,
  label: string,
) {
  if (value === "") {
    return null;
  }

  const parsedValue = Number(value);

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    throw new Error(`Enter a valid ${label}.`);
  }

  return parsedValue;
}

function parseMovieMediaInput(
  input: unknown,
): AdminMovieMediaInput {
  if (!input || typeof input !== "object") {
    throw new Error("The clue payload is invalid.");
  }

  const payload = input as Record<string, unknown>;
  const mediaType = getStringField(
    payload,
    "mediaType",
  ).trim();
  const roundPosition = getStringField(
    payload,
    "roundPosition",
  ).trim();
  const title = getStringField(payload, "title").trim();
  const prompt = getStringField(
    payload,
    "prompt",
  ).trim();
  const quoteText = getStringField(
    payload,
    "quoteText",
  ).trim();
  const mediaUrl = getStringField(
    payload,
    "mediaUrl",
  ).trim();
  const thumbnailUrl = getStringField(
    payload,
    "thumbnailUrl",
  ).trim();
  const startSeconds = getStringField(
    payload,
    "startSeconds",
  ).trim();
  const endSeconds = getStringField(
    payload,
    "endSeconds",
  ).trim();
  const difficulty = getStringField(
    payload,
    "difficulty",
  ).trim();
  const licensingStatus = getStringField(
    payload,
    "licensingStatus",
  ).trim();
  const sourceName = getStringField(
    payload,
    "sourceName",
  ).trim();
  const sourceUrl = getStringField(
    payload,
    "sourceUrl",
  ).trim();
  const attribution = getStringField(
    payload,
    "attribution",
  ).trim();
  const sortOrder = getStringField(
    payload,
    "sortOrder",
  ).trim();
  const isHidden = getBooleanField(
    payload,
    "isHidden",
  );

  if (!isAllowedValue(MEDIA_TYPES, mediaType)) {
    throw new Error("Select a valid clue type.");
  }

  if (
    !isAllowedValue(ROUND_POSITIONS, roundPosition)
  ) {
    throw new Error("Select a valid round position.");
  }

  if (!isAllowedValue(MOVIE_DIFFICULTIES, difficulty)) {
    throw new Error("Select a valid difficulty.");
  }

  if (
    !isAllowedValue(
      MOVIE_LICENSING_STATUSES,
      licensingStatus,
    )
  ) {
    throw new Error("Select a valid licensing status.");
  }

  const sortOrderValue =
    sortOrder === "" ? 0 : Number(sortOrder);

  if (!Number.isInteger(sortOrderValue)) {
    throw new Error("Enter a valid sort order.");
  }

  if (
    ["video", "audio", "image", "poster"].includes(
      mediaType,
    ) &&
    !mediaUrl
  ) {
    throw new Error(
      "A media URL is required for video, audio, image, and poster clues.",
    );
  }

  if (
    ["quote", "trivia", "text", "year"].includes(
      mediaType,
    ) &&
    !prompt &&
    !quoteText &&
    !title
  ) {
    throw new Error(
      "Add a prompt, quote, or title for text-based clues.",
    );
  }

  const startSecondsValue = parseOptionalDecimal(
    startSeconds,
    "start time",
  );
  const endSecondsValue = parseOptionalDecimal(
    endSeconds,
    "end time",
  );

  if (
    startSecondsValue !== null &&
    endSecondsValue !== null &&
    endSecondsValue <= startSecondsValue
  ) {
    throw new Error(
      "End time must be greater than start time.",
    );
  }

  return {
    mediaType,
    roundPosition,
    title,
    prompt,
    quoteText,
    mediaUrl,
    thumbnailUrl,
    startSeconds,
    endSeconds,
    difficulty,
    licensingStatus,
    sourceName,
    sourceUrl,
    attribution,
    sortOrder: sortOrderValue.toString(),
    isHidden,
  };
}

function mapMediaRowToAdminMedia(
  media: ContentMediaRow,
): AdminMovieMedia {
  return {
    id: media.id,
    mediaType: media.media_type,
    roundPosition: media.round_position ?? "any",
    title: media.title ?? "",
    prompt: media.prompt ?? "",
    quoteText: media.quote_text ?? "",
    mediaUrl: media.media_url ?? "",
    thumbnailUrl: media.thumbnail_url ?? "",
    startSeconds: formatNumberField(
      media.start_seconds,
    ),
    endSeconds: formatNumberField(media.end_seconds),
    durationSeconds: formatNumberField(
      media.duration_seconds,
    ),
    difficulty: media.difficulty,
    licensingStatus: media.licensing_status,
    sourceName: media.source_name ?? "",
    sourceUrl: media.source_url ?? "",
    attribution: media.attribution ?? "",
    sortOrder: media.sort_order,
    isHidden: media.is_hidden,
    isActive: media.is_active,
  };
}

async function getMovieContentTypeId() {
  const { data, error } = await supabaseAdmin
    .from("content_types")
    .select("id")
    .eq("slug", "movie")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const contentType = data as {
    id?: string;
  } | null;

  if (!contentType?.id) {
    throw new Error("The movie content type is missing.");
  }

  return contentType.id;
}

async function getMovieForLegacySync(
  movieId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select(
      [
        "id",
        "legacy_movie_id",
        "title",
        "normalized_title",
        "release_year",
        "poster_url",
        "difficulty",
        "publication_status",
      ].join(","),
    )
    .eq("id", movieId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const movie = data as {
    id?: string;
  } | null;

  if (!movie?.id) {
    throw new Error("The movie could not be found.");
  }

  return data as unknown as LegacyMovieSyncRow;
}

async function syncLegacyMovie(
  movieId: string,
): Promise<LegacyMovieState> {
  const movie = await getMovieForLegacySync(movieId);
  const legacyMoviePayload = {
    title: movie.title,
    normalized_title:
      movie.normalized_title ||
      normalizeMovieTitle(movie.title),
    release_year: movie.release_year,
    poster_url: movie.poster_url,
    difficulty: movie.difficulty,
    is_active: isPublishedMovie(
      movie.publication_status,
    ),
    updated_at: new Date().toISOString(),
  };

  let legacyMovieId = movie.legacy_movie_id;

  if (!legacyMovieId) {
    const { data, error } = await supabaseAdmin
      .from("movies")
      .insert(legacyMoviePayload)
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const createdMovie = data as {
      id?: string;
    } | null;

    if (!createdMovie?.id) {
      throw new Error("The legacy movie could not be created.");
    }

    legacyMovieId = createdMovie.id;

    const { error: linkError } = await supabaseAdmin
      .from("content_items")
      .update({
        legacy_movie_id: legacyMovieId,
      })
      .eq("id", movieId);

    if (linkError) {
      throw new Error(linkError.message);
    }
  } else {
    const { error: updateError } =
      await supabaseAdmin
        .from("movies")
        .update(legacyMoviePayload)
        .eq("id", legacyMovieId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    legacyMovieId,
    publicationStatus: movie.publication_status,
  };
}

async function syncLegacyMovieCategories(
  movieId: string,
) {
  const { legacyMovieId } = await syncLegacyMovie(
    movieId,
  );
  const { data: categoryLinks, error } =
    await supabaseAdmin
      .from("content_categories")
      .select("category_id")
      .eq("content_id", movieId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("movie_categories")
    .delete()
    .eq("movie_id", legacyMovieId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const categoryIds = (categoryLinks ?? [])
    .map((link) => {
      const categoryLink = link as {
        category_id?: string;
      };

      return categoryLink.category_id?.trim() ?? "";
    })
    .filter((categoryId) => categoryId.length > 0);

  if (categoryIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("movie_categories")
    .insert(
      categoryIds.map((categoryId) => ({
        movie_id: legacyMovieId,
        category_id: categoryId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function getMovieMediaForLegacySync(
  movieId: string,
  mediaId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("content_media")
    .select(
      [
        "id",
        "media_type",
        "prompt",
        "quote_text",
        "media_url",
        "start_seconds",
        "end_seconds",
        "difficulty",
        "licensing_status",
        "source_name",
        "source_url",
        "attribution",
        "is_hidden",
        "is_active",
        "legacy_clip_id",
      ].join(","),
    )
    .eq("id", mediaId)
    .eq("content_id", movieId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const media = data as {
    id?: string;
  } | null;

  if (!media?.id) {
    throw new Error("The clue could not be found.");
  }

  return data as unknown as LegacyMovieMediaSyncRow;
}

async function syncLegacyMovieMedia(
  movieId: string,
  mediaId: string,
  legacyMovieState?: LegacyMovieState,
) {
  const resolvedMovieState =
    legacyMovieState ??
    (await syncLegacyMovie(movieId));
  const media = await getMovieMediaForLegacySync(
    movieId,
    mediaId,
  );
  const legacyClipPayload = {
    movie_id: resolvedMovieState.legacyMovieId,
    clip_type: mapMediaTypeToLegacyClipType(
      media.media_type,
    ),
    media_url: media.media_url,
    prompt: media.prompt,
    quote_text: media.quote_text,
    start_seconds: media.start_seconds,
    end_seconds: media.end_seconds,
    difficulty: media.difficulty,
    licensing_status: media.licensing_status,
    source_name: media.source_name,
    source_url: media.source_url,
    attribution: media.attribution,
    is_active:
      isPublishedMovie(
        resolvedMovieState.publicationStatus,
      ) &&
      media.is_active &&
      !media.is_hidden,
  };

  if (media.legacy_clip_id) {
    const { error: updateError } =
      await supabaseAdmin
        .from("clips")
        .update(legacyClipPayload)
        .eq("id", media.legacy_clip_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return;
  }

  const { data, error: insertError } =
    await supabaseAdmin
      .from("clips")
      .insert(legacyClipPayload)
      .select("id")
      .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  const createdClip = data as {
    id?: string;
  } | null;

  if (!createdClip?.id) {
    throw new Error("The legacy clue could not be created.");
  }

  const { error: linkError } = await supabaseAdmin
    .from("content_media")
    .update({
      legacy_clip_id: createdClip.id,
    })
    .eq("id", mediaId)
    .eq("content_id", movieId);

  if (linkError) {
    throw new Error(linkError.message);
  }
}

async function syncAllLegacyMovieMedia(
  movieId: string,
) {
  const legacyMovieState = await syncLegacyMovie(
    movieId,
  );
  const { data, error } = await supabaseAdmin
    .from("content_media")
    .select("id")
    .eq("content_id", movieId);

  if (error) {
    throw new Error(error.message);
  }

  const mediaIds = (data ?? [])
    .map((media) => {
      const mediaRow = media as { id?: string };

      return mediaRow.id?.trim() ?? "";
    })
    .filter((id) => id.length > 0);

  await Promise.all(
    mediaIds.map((mediaId) =>
      syncLegacyMovieMedia(
        movieId,
        mediaId,
        legacyMovieState,
      ),
    ),
  );
}

async function archiveLegacyMovieMedia(
  movieId: string,
  mediaId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("content_media")
    .select("legacy_clip_id")
    .eq("id", mediaId)
    .eq("content_id", movieId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const legacyClipId =
    (data as { legacy_clip_id?: string | null } | null)
      ?.legacy_clip_id ?? null;

  if (!legacyClipId) {
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from("clips")
    .update({
      is_active: false,
    })
    .eq("id", legacyClipId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function getAdminCategoriesByIds(
  categoryIds: string[],
) {
  if (categoryIds.length === 0) {
    return [] as CategoryRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, description")
    .in("id", categoryIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as CategoryRow[];
}

export async function listAdminCategories(): Promise<
  AdminCategoryOption[]
> {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, description")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CategoryRow[]).map(
    (category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
    }),
  );
}

export async function listAdminMovies(): Promise<
  AdminMovieListItem[]
> {
  try {
    const contentTypeId = await getMovieContentTypeId();

    const { data: contentItems, error: contentItemsError } =
      await supabaseAdmin
        .from("content_items")
        .select(
          [
            "id",
            "title",
            "release_year",
            "poster_url",
            "difficulty",
            "publication_status",
            "licensing_status",
            "source_name",
            "source_url",
            "is_active",
            "metadata",
            "created_at",
          ].join(","),
        )
        .eq("content_type_id", contentTypeId)
        .order("created_at", { ascending: false });

    if (contentItemsError) {
      throw new Error(contentItemsError.message);
    }

    const items =
      (contentItems ?? []) as unknown as ContentItemRow[];
    const contentIds = items.map((item) => item.id);

    if (contentIds.length === 0) {
      return [];
    }

    const [
      { data: mediaRows, error: mediaError },
      { data: categoryLinks, error: categoryLinksError },
      {
        data: movieAnalyticsRows,
        error: movieAnalyticsError,
      },
    ] = await Promise.all([
      supabaseAdmin
        .from("content_media")
        .select(
          "content_id, media_url, source_url, metadata, is_hidden, is_active, media_type"
        )
        .in("content_id", contentIds)
        .in("media_type", ["video", "audio"])
        .eq("is_active", true),
      supabaseAdmin
        .from("content_categories")
        .select("content_id, category_id, is_primary")
        .in("content_id", contentIds),
      supabaseAdmin
        .from("movie_buff_movie_analytics")
        .select(
          "content_id, total_clip_count, playable_clip_count, total_plays, total_hints_used, last_played_at"
        )
        .in("content_id", contentIds),
    ]);

    if (mediaError) {
      throw new Error(mediaError.message);
    }

    if (categoryLinksError) {
      throw new Error(categoryLinksError.message);
    }

    if (movieAnalyticsError) {
      throw new Error(movieAnalyticsError.message);
    }

    const links =
      (categoryLinks ?? []) as unknown as CategoryLinkRow[];
    const categoryIds = Array.from(
      new Set(links.map((link) => link.category_id)),
    );
    const categories =
      await getAdminCategoriesByIds(categoryIds);

    const mediaCountByContent = new Map<string, number>();
    const mediaRowsByContent = new Map<string, MediaRow[]>();

    for (const media of (mediaRows ?? []) as unknown as MediaRow[]) {
      mediaCountByContent.set(
        media.content_id,
        (mediaCountByContent.get(media.content_id) ?? 0) + 1,
      );

      const existingMedia =
        mediaRowsByContent.get(media.content_id) ?? [];
      existingMedia.push(media);
      mediaRowsByContent.set(
        media.content_id,
        existingMedia,
      );
    }

    const categoryNameById = new Map(
      categories.map((item) => [item.id, item.name]),
    );
    const movieAnalyticsByContentId = new Map(
      (
        (movieAnalyticsRows as MovieAnalyticsRow[] | null) ??
        []
      ).map((row) => [row.content_id, row])
    );

    const linksByContent =
      new Map<string, CategoryLinkRow[]>();

    for (const link of links) {
      const existingLinks =
        linksByContent.get(link.content_id) ?? [];
      existingLinks.push(link);
      linksByContent.set(link.content_id, existingLinks);
    }

    return items.map((item) => {
      const movieLinks =
        linksByContent.get(item.id) ?? [];
      const primaryLink =
        movieLinks.find((link) => link.is_primary) ??
        movieLinks[0];
      const categoryName = primaryLink
        ? categoryNameById.get(primaryLink.category_id) ??
          "Uncategorized"
        : "Uncategorized";
      const movieAnalytics =
        movieAnalyticsByContentId.get(item.id);
      const movieMediaRows =
        mediaRowsByContent.get(item.id) ?? [];
      const clipCount =
        movieAnalytics?.total_clip_count ??
        mediaCountByContent.get(item.id) ??
        0;
      const playableClipCount =
        movieAnalytics?.playable_clip_count ?? 0;
      const hasGeneratedMedia =
        movieMediaRows.some(hasGeneratedClipSignature);
      const lifecycleStatus =
        item.publication_status === "archived"
          ? "retired"
          : item.is_active === false
            ? "inactive"
            : "active";
      const ingestStatus =
        clipCount === 0
          ? "metadata_only"
          : playableClipCount > 0
            ? "ready"
            : "needs_review";
      const autoClipStatus = hasGeneratedMedia
        ? playableClipCount > 0
          ? "generated_ready"
          : "generated_pending"
        : clipCount > 0
          ? "manual"
          : "not_configured";

      return {
        id: item.id,
        title: item.title,
        year: item.release_year,
        posterUrl: item.poster_url,
        category: categoryName,
        sourceName: item.source_name,
        sourceUrl: item.source_url,
        countryOrOrigin: extractMetadataString(
          item.metadata,
          [
            "countryOrOrigin",
            "country",
            "originCountry",
            "country_of_origin",
          ],
        ),
        language: extractMetadataString(
          item.metadata,
          [
            "originalLanguage",
            "language",
            "primaryLanguage",
            "spokenLanguage",
          ],
        ),
        clips: clipCount,
        playableClips: playableClipCount,
        totalPlays:
          movieAnalytics?.total_plays ?? 0,
        totalHintsUsed:
          movieAnalytics?.total_hints_used ?? 0,
        lastPlayedAt:
          movieAnalytics?.last_played_at ?? null,
        ingestStatus:
          formatMovieOpsLabel(ingestStatus),
        autoClipStatus:
          formatMovieOpsLabel(autoClipStatus),
        lifecycleStatus:
          formatMovieOpsLabel(lifecycleStatus),
        difficulty: formatLabel(item.difficulty),
        license: formatLabel(item.licensing_status),
        publicationStatus: formatLabel(
          item.publication_status,
        ),
        status: getMovieStatus(
          item.publication_status,
          clipCount,
        ),
        createdAt: item.created_at,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingContentEngineSchema(error.message)
    ) {
      return listLegacyAdminMovies();
    }

    throw error;
  }
}

async function listLegacyAdminMovies(): Promise<
  AdminMovieListItem[]
> {
  const [
    { data: movies, error: moviesError },
    { data: clips, error: clipsError },
    {
      data: movieCategories,
      error: movieCategoriesError,
    },
  ] = await Promise.all([
    supabaseAdmin
      .from("movies")
      .select(
        "id, title, release_year, poster_url, difficulty, is_active, created_at, updated_at"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("clips")
      .select(
        "movie_id, id, clip_type, media_url, source_url, source_name, licensing_status, is_active"
      ),
    supabaseAdmin
      .from("movie_categories")
      .select("movie_id, category_id"),
  ]);

  if (moviesError) {
    throw new Error(moviesError.message);
  }

  if (clipsError) {
    throw new Error(clipsError.message);
  }

  if (movieCategoriesError) {
    throw new Error(movieCategoriesError.message);
  }

  const typedMovies =
    (movies ?? []) as unknown as LegacyMovieListRow[];
  const typedClips =
    (clips ?? []) as unknown as LegacyClipListRow[];
  const typedMovieCategories =
    ((movieCategories ?? []) as unknown as Array<{
      movie_id: string;
      category_id: string;
    }>);

  const categoryIds = Array.from(
    new Set(
      typedMovieCategories.map(
        (link) => link.category_id,
      ),
    ),
  );
  const categories =
    categoryIds.length > 0
      ? await getAdminCategoriesByIds(categoryIds)
      : [];
  const categoryNameById = new Map(
    categories.map((category) => [
      category.id,
      category.name,
    ]),
  );

  const primaryCategoryByMovieId = new Map<
    string,
    string
  >();

  for (const link of typedMovieCategories) {
    if (!primaryCategoryByMovieId.has(link.movie_id)) {
      primaryCategoryByMovieId.set(
        link.movie_id,
        link.category_id,
      );
    }
  }

  const clipsByMovieId = new Map<
    string,
    LegacyClipListRow[]
  >();

  for (const clip of typedClips) {
    const existingClips =
      clipsByMovieId.get(clip.movie_id) ?? [];
    existingClips.push(clip);
    clipsByMovieId.set(clip.movie_id, existingClips);
  }

  return typedMovies.map((movie) => {
    const movieClips =
      clipsByMovieId.get(movie.id) ?? [];
    const activeClips = movieClips.filter(
      (clip) => clip.is_active,
    );
    const primaryClip = activeClips[0] ?? movieClips[0] ?? null;
    const categoryName =
      categoryNameById.get(
        primaryCategoryByMovieId.get(movie.id) ?? "",
      ) ?? "Uncategorized";

    return {
      id: movie.id,
      title: movie.title,
      year: movie.release_year,
      posterUrl: movie.poster_url,
      category: categoryName,
      sourceName: primaryClip?.source_name ?? null,
      sourceUrl: primaryClip?.source_url ?? null,
      countryOrOrigin: null,
      language: null,
      clips: movieClips.length,
      playableClips: activeClips.length,
      totalPlays: 0,
      totalHintsUsed: 0,
      lastPlayedAt: null,
      ingestStatus:
        movieClips.length > 0
          ? "Legacy Ready"
          : "Metadata Only",
      autoClipStatus: "Legacy Manual",
      lifecycleStatus: movie.is_active
        ? "Active"
        : "Inactive",
      difficulty: formatLabel(movie.difficulty),
      license: formatLabel(
        primaryClip?.licensing_status ?? "pending",
      ),
      publicationStatus: movie.is_active
        ? "Published"
        : "Archived",
      status: movie.is_active
        ? activeClips.length > 0
          ? "Ready"
          : "Missing media"
        : "Archived",
      createdAt: movie.created_at,
    };
  });
}

export async function getAdminMovie(
  movieId: string,
): Promise<AdminMovieDetail> {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select(
      [
        "id",
        "title",
        "release_year",
        "poster_url",
        "difficulty",
        "publication_status",
        "licensing_status",
      ].join(","),
    )
    .eq("id", movieId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("The movie could not be loaded.");
  }

  const movie = data as unknown as ContentItemRow;
  const [
    {
      data: mediaRows,
      count,
      error: mediaError,
    },
    {
      data: categoryLinks,
      error: categoryLinksError,
    },
  ] = await Promise.all([
    supabaseAdmin
      .from("content_media")
      .select(
        [
          "id",
          "media_type",
          "round_position",
          "title",
          "prompt",
          "quote_text",
          "media_url",
          "thumbnail_url",
          "start_seconds",
          "end_seconds",
          "duration_seconds",
          "difficulty",
          "licensing_status",
          "source_name",
          "source_url",
          "attribution",
          "sort_order",
          "is_hidden",
          "is_active",
        ].join(","),
        { count: "exact" },
      )
      .eq("content_id", movieId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("content_categories")
      .select("content_id, category_id, is_primary")
      .eq("content_id", movieId),
  ]);

  if (mediaError) {
    throw new Error(mediaError.message);
  }

  if (categoryLinksError) {
    throw new Error(categoryLinksError.message);
  }

  const movieCategoryLinks =
    (categoryLinks ?? []) as unknown as CategoryLinkRow[];
  const primaryCategoryLink =
    movieCategoryLinks.find((link) => link.is_primary) ??
    movieCategoryLinks[0];

  return {
    id: movie.id,
    title: movie.title ?? "",
    releaseYear: movie.release_year?.toString() ?? "",
    posterUrl: movie.poster_url ?? "",
    difficulty: movie.difficulty ?? "medium",
    publicationStatus:
      movie.publication_status ?? "draft",
    licensingStatus:
      movie.licensing_status ?? "pending",
    categoryIds: movieCategoryLinks.map(
      (link) => link.category_id,
    ),
    primaryCategoryId:
      primaryCategoryLink?.category_id ?? null,
    mediaCount: count ?? 0,
    mediaItems: ((mediaRows ?? []) as unknown as ContentMediaRow[]).map(
      mapMediaRowToAdminMedia,
    ),
  };
}

export async function createAdminMovie(
  input: unknown,
) {
  const payload = parseMovieInput(input);
  const contentTypeId = await getMovieContentTypeId();

  const { data, error } = await supabaseAdmin
    .from("content_items")
    .insert({
      content_type_id: contentTypeId,
      title: payload.title,
      normalized_title: normalizeMovieTitle(
        payload.title,
      ),
      release_year:
        payload.releaseYear === ""
          ? null
          : Number(payload.releaseYear),
      poster_url: payload.posterUrl || null,
      difficulty: payload.difficulty,
      publication_status: payload.publicationStatus,
      licensing_status: payload.licensingStatus,
      is_active:
        payload.publicationStatus !== "archived",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const createdMovie = data as {
    id?: string;
  } | null;

  if (!createdMovie?.id) {
    throw new Error("The movie could not be created.");
  }

  const movieId = createdMovie.id;

  await syncLegacyMovie(movieId);

  return movieId;
}

export async function updateAdminMovie(
  movieId: string,
  input: unknown,
) {
  const payload = parseMovieInput(input);

  const { error } = await supabaseAdmin
    .from("content_items")
    .update({
      title: payload.title,
      normalized_title: normalizeMovieTitle(
        payload.title,
      ),
      release_year:
        payload.releaseYear === ""
          ? null
          : Number(payload.releaseYear),
      poster_url: payload.posterUrl || null,
      difficulty: payload.difficulty,
      publication_status: payload.publicationStatus,
      licensing_status: payload.licensingStatus,
      is_active:
        payload.publicationStatus !== "archived",
    })
    .eq("id", movieId);

  if (error) {
    throw new Error(error.message);
  }

  await syncLegacyMovie(movieId);
  await syncAllLegacyMovieMedia(movieId);
}

export async function updateAdminMovieCategories(
  movieId: string,
  input: unknown,
) {
  const payload = parseMovieCategoryInput(input);
  const categories = await getAdminCategoriesByIds(
    payload.categoryIds,
  );

  if (categories.length !== payload.categoryIds.length) {
    throw new Error(
      "One or more selected categories no longer exist.",
    );
  }

  const nextPrimaryCategoryId =
    payload.categoryIds.length === 0
      ? null
      : payload.primaryCategoryId ??
        payload.categoryIds[0];

  const { error: deleteError } = await supabaseAdmin
    .from("content_categories")
    .delete()
    .eq("content_id", movieId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (payload.categoryIds.length === 0) {
    await syncLegacyMovieCategories(movieId);
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("content_categories")
    .insert(
      payload.categoryIds.map((categoryId) => ({
        content_id: movieId,
        category_id: categoryId,
        is_primary: categoryId === nextPrimaryCategoryId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }

  await syncLegacyMovieCategories(movieId);
}

export async function createAdminMovieMedia(
  movieId: string,
  input: unknown,
) {
  const payload = parseMovieMediaInput(input);
  const startSecondsValue = parseOptionalDecimal(
    payload.startSeconds,
    "start time",
  );
  const endSecondsValue = parseOptionalDecimal(
    payload.endSeconds,
    "end time",
  );

  const { data, error } = await supabaseAdmin
    .from("content_media")
    .insert({
      content_id: movieId,
      media_type: payload.mediaType,
      round_position: payload.roundPosition,
      title: payload.title || null,
      prompt: payload.prompt || null,
      quote_text: payload.quoteText || null,
      media_url: payload.mediaUrl || null,
      thumbnail_url: payload.thumbnailUrl || null,
      start_seconds: startSecondsValue,
      end_seconds: endSecondsValue,
      duration_seconds:
        startSecondsValue !== null &&
        endSecondsValue !== null
          ? endSecondsValue - startSecondsValue
          : null,
      difficulty: payload.difficulty,
      licensing_status: payload.licensingStatus,
      source_name: payload.sourceName || null,
      source_url: payload.sourceUrl || null,
      attribution: payload.attribution || null,
      sort_order: Number(payload.sortOrder),
      is_hidden: payload.isHidden,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const createdMedia = data as {
    id?: string;
  } | null;

  if (!createdMedia?.id) {
    throw new Error("The clue could not be created.");
  }

  const mediaId = createdMedia.id;

  await syncLegacyMovieMedia(movieId, mediaId);

  return mediaId;
}

export async function updateAdminMovieMedia(
  movieId: string,
  mediaId: string,
  input: unknown,
) {
  const payload = parseMovieMediaInput(input);
  const startSecondsValue = parseOptionalDecimal(
    payload.startSeconds,
    "start time",
  );
  const endSecondsValue = parseOptionalDecimal(
    payload.endSeconds,
    "end time",
  );

  const { error } = await supabaseAdmin
    .from("content_media")
    .update({
      media_type: payload.mediaType,
      round_position: payload.roundPosition,
      title: payload.title || null,
      prompt: payload.prompt || null,
      quote_text: payload.quoteText || null,
      media_url: payload.mediaUrl || null,
      thumbnail_url: payload.thumbnailUrl || null,
      start_seconds: startSecondsValue,
      end_seconds: endSecondsValue,
      duration_seconds:
        startSecondsValue !== null &&
        endSecondsValue !== null
          ? endSecondsValue - startSecondsValue
          : null,
      difficulty: payload.difficulty,
      licensing_status: payload.licensingStatus,
      source_name: payload.sourceName || null,
      source_url: payload.sourceUrl || null,
      attribution: payload.attribution || null,
      sort_order: Number(payload.sortOrder),
      is_hidden: payload.isHidden,
    })
    .eq("id", mediaId)
    .eq("content_id", movieId)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  await syncLegacyMovieMedia(movieId, mediaId);
}

export async function archiveAdminMovieMedia(
  movieId: string,
  mediaId: string,
) {
  const { error } = await supabaseAdmin
    .from("content_media")
    .update({
      is_active: false,
    })
    .eq("id", mediaId)
    .eq("content_id", movieId);

  if (error) {
    throw new Error(error.message);
  }

  await archiveLegacyMovieMedia(movieId, mediaId);
}
