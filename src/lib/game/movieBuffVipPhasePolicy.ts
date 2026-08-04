export type MovieBuffVipCanonicalPhase =
  | "round_intro"
  | "vip_lock"
  | "board_select"
  | "transition"
  | "playback"
  | "answer"
  | "results"
  | "finished"
  | "abandoned"
  | "blocked";

const ALLOWED_MOVIE_BUFF_PHASE_ROUTES = new Set([
  "/games/movie-buff/round-intro",
  "/games/movie-buff/board-preview",
  "/games/movie-buff/play",
  "/games/movie-buff/round-results",
  "/games/movie-buff/final-results",
  "/games/movie-buff/match-status",
]);

export type MovieBuffVipCanonicalPhaseView = {
  roomId: string;
  roundId: string;
  roundNumber: number;
  phase: MovieBuffVipCanonicalPhase;
  phaseVersion: number;
  phaseRoute: string | null;
};

export function getMovieBuffVipCanonicalNavigationTarget({
  currentPath,
  roomId,
  phaseView,
}: {
  currentPath: string;
  roomId: string;
  phaseView: MovieBuffVipCanonicalPhaseView | null;
}) {
  if (!phaseView || !phaseView.phaseRoute || phaseView.roomId !== roomId) {
    return null;
  }

  if (!ALLOWED_MOVIE_BUFF_PHASE_ROUTES.has(phaseView.phaseRoute)) {
    return null;
  }

  if (phaseView.phaseRoute === currentPath) {
    return null;
  }

  const query = new URLSearchParams({
    roomId,
    round: String(phaseView.roundNumber),
  });
  return `${phaseView.phaseRoute}?${query.toString()}`;
}
