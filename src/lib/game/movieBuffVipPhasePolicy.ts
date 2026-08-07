export const MOVIE_BUFF_VIP_CANONICAL_PHASES = [
  "round_intro",
  "vip_lock",
  "board_select",
  "transition",
  "playback",
  "answer",
  "results",
  "finished",
  "abandoned",
  "blocked",
] as const;

export type MovieBuffVipCanonicalPhase =
  (typeof MOVIE_BUFF_VIP_CANONICAL_PHASES)[number];

const ALLOWED_MOVIE_BUFF_PHASES = new Set<string>(
  MOVIE_BUFF_VIP_CANONICAL_PHASES,
);
const MOVIE_BUFF_PHASE_ROUTE_BY_PHASE: Record<
  MovieBuffVipCanonicalPhase,
  string
> = {
  round_intro: "/games/movie-buff/round-intro",
  vip_lock: "/games/movie-buff/round-intro",
  board_select: "/games/movie-buff/board-preview",
  transition: "/games/movie-buff/play",
  playback: "/games/movie-buff/play",
  answer: "/games/movie-buff/play",
  results: "/games/movie-buff/round-results",
  finished: "/games/movie-buff/final-results",
  abandoned: "/games/movie-buff/match-status",
  blocked: "/games/movie-buff/match-status",
};

export type MovieBuffVipCanonicalPhaseView = {
  roomId: string;
  roundId: string;
  roundNumber: number;
  phase: MovieBuffVipCanonicalPhase;
  phaseVersion: number;
  phaseRoute: string | null;
};

export function isMovieBuffVipCanonicalPhase(
  value: unknown,
): value is MovieBuffVipCanonicalPhase {
  return typeof value === "string" && ALLOWED_MOVIE_BUFF_PHASES.has(value);
}

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

  if (phaseView.phaseRoute !== MOVIE_BUFF_PHASE_ROUTE_BY_PHASE[phaseView.phase]) {
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
