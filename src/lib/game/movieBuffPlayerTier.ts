export type MovieBuffPlayerTier =
  | "Fan"
  | "Buff"
  | "Buffster";

export function getMovieBuffPlayerTier(
  score: number,
): MovieBuffPlayerTier {
  if (score >= 2500) {
    return "Buffster";
  }

  if (score >= 1000) {
    return "Buff";
  }

  return "Fan";
}

export function getMovieBuffPlayerTierDescription(
  tier: MovieBuffPlayerTier,
): string {
  switch (tier) {
    case "Fan":
      return "loves movies and is finding their groove";
    case "Buff":
      return "knows their films and plays with confidence";
    case "Buffster":
      return "top-tier movie mind with elite recall";
    default:
      return "";
  }
}
