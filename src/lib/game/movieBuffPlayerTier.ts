export type MovieBuffPlayerTier =
  | "Fan"
  | "Fanatic"
  | "Buff";

export function getMovieBuffPlayerTier(
  score: number,
): MovieBuffPlayerTier {
  if (score >= 2500) {
    return "Buff";
  }

  if (score >= 1000) {
    return "Fanatic";
  }

  return "Fan";
}

export function getMovieBuffPlayerTierDescription(
  tier: MovieBuffPlayerTier,
): string {
  switch (tier) {
    case "Fan":
      return "loves movies and is finding their groove";
    case "Fanatic":
      return "locked in and spotting films with sharper recall";
    case "Buff":
      return "top-tier movie mind with elite recall";
    default:
      return "";
  }
}
