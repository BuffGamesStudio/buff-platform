export const movieBuffPlayableCategorySlugs = [
  "action",
  "comedy",
  "classics",
  "horror",
  "science-fiction",
  "drama",
] as const;

export type MovieBuffPlayableCategorySlug =
  (typeof movieBuffPlayableCategorySlugs)[number];

function normalizedCategorySlug(slug: string | null | undefined) {
  return slug?.trim().toLowerCase() ?? "";
}

export function isMovieBuffPlayableCategory(
  category: { slug?: string | null } | null | undefined,
) {
  return movieBuffPlayableCategorySlugs.includes(
    normalizedCategorySlug(category?.slug) as MovieBuffPlayableCategorySlug,
  );
}

export function movieBuffPlayableCategoryRank(
  slug: string | null | undefined,
) {
  const normalized = normalizedCategorySlug(slug);
  const rank = movieBuffPlayableCategorySlugs.indexOf(
    normalized as MovieBuffPlayableCategorySlug,
  );

  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

export function sortMovieBuffPlayableCategories<T extends { slug: string }>(
  categories: T[],
) {
  return [...categories].sort((a, b) => {
    const rankDifference =
      movieBuffPlayableCategoryRank(a.slug) -
      movieBuffPlayableCategoryRank(b.slug);

    return rankDifference || a.slug.localeCompare(b.slug);
  });
}
