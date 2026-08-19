import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  isMovieBuffPlayableCategory,
  sortMovieBuffPlayableCategories,
} from "@/lib/game/movieBuffPlayableCategories";

export type MovieBuffLobbyCategory = {
  id: string | null;
  name: string;
  slug: string;
  description: string | null;
  playableClipCount: number;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type MovieRow = {
  id: string;
};

type ClipRow = {
  id: string;
  movie_id: string;
  media_url: string | null;
};

type MovieCategoryRow = {
  movie_id: string;
  category_id: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  );
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

export async function listMovieBuffLobbyCategories(): Promise<
  MovieBuffLobbyCategory[]
> {
  const [
    { data: categories, error: categoriesError },
    { data: activeMovies, error: activeMoviesError },
    { data: activeClips, error: activeClipsError },
    {
      data: movieCategories,
      error: movieCategoriesError,
    },
  ] = await Promise.all([
    supabaseAdmin
      .from("categories")
      .select("id, name, slug, description")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("movies")
      .select("id")
      .eq("is_active", true),
    supabaseAdmin
      .from("clips")
      .select("id, movie_id, media_url")
      .eq("is_active", true)
      .eq("clip_type", "video"),
    supabaseAdmin
      .from("movie_categories")
      .select("movie_id, category_id"),
  ]);

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  if (activeMoviesError) {
    throw new Error(activeMoviesError.message);
  }

  if (activeClipsError) {
    throw new Error(activeClipsError.message);
  }

  if (movieCategoriesError) {
    throw new Error(movieCategoriesError.message);
  }

  const activeMovieIds = new Set(
    ((activeMovies ?? []) as unknown as MovieRow[]).map(
      (movie) => movie.id,
    ),
  );

  const playableClips = (
    (activeClips ?? []) as unknown as ClipRow[]
  ).filter(
    (clip) =>
      activeMovieIds.has(clip.movie_id) &&
      (clip.media_url ?? "").trim().length > 0,
  );

  const playableClipCountsByMovie = new Map<
    string,
    number
  >();

  for (const clip of playableClips) {
    playableClipCountsByMovie.set(
      clip.movie_id,
      (playableClipCountsByMovie.get(
        clip.movie_id,
      ) ?? 0) + 1,
    );
  }

  const playableClipCountsByCategory = new Map<
    string,
    number
  >();

  for (const link of (movieCategories ??
    []) as unknown as MovieCategoryRow[]) {
    const movieClipCount =
      playableClipCountsByMovie.get(link.movie_id) ?? 0;

    if (movieClipCount === 0) {
      continue;
    }

    playableClipCountsByCategory.set(
      link.category_id,
      (playableClipCountsByCategory.get(
        link.category_id,
      ) ?? 0) + movieClipCount,
    );
  }

  const categoryRows =
    (categories ?? []) as unknown as CategoryRow[];

  const playableCategories = categoryRows
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      playableClipCount:
        playableClipCountsByCategory.get(
          category.id,
        ) ?? 0,
    }))
    .filter(
      (category) =>
        category.playableClipCount > 0 &&
        isMovieBuffPlayableCategory(category),
    );

  return [
    {
      id: null,
      name: "All Movies",
      slug: "all-movies",
      description:
        "Play from every available movie clip.",
      playableClipCount: playableClips.length,
    },
    ...sortMovieBuffPlayableCategories(playableCategories),
  ];
}
