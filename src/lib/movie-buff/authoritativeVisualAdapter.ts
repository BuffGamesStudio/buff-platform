import type {
  MovieBuffCanonicalVisualSource,
  MovieBuffCanonicalVisualSourcePhase,
  MovieBuffTransitionPresentation,
  MovieBuffVisualControllerType,
} from "./visualRuntime";

export type MovieBuffAuthoritativePhaseViewForVisuals = {
  roomId: string;
  matchId: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  phase: Exclude<MovieBuffCanonicalVisualSourcePhase, "waiting"> | (string & {});
  phaseVersion: number;
  phaseStartedAt: string;
  phaseEndsAt: string | null;
  phaseRoute: string;
  selectorSeatIndex: number | null;
  selectorPlayerId: string | null;
  selectorControllerType: MovieBuffVisualControllerType | null;
  callerIsSelector: boolean;
  selectorDeadlineAt: string | null;
  selectedTileId: string | null;
  selectedClipId: string | null;
  selectionSource: "human" | "timeout" | "buster_timeout" | "system" | null;
  playbackStartsAt: string | null;
  answerDeadlineAt: string | null;
  resultsEndAt: string | null;
  blockedReason: string | null;
  serverNow: string;
};

export type MovieBuffAuthoritativeVisualAdapterResult =
  | {
      valid: true;
      reason: null;
      source: MovieBuffCanonicalVisualSource;
    }
  | {
      valid: false;
      reason: string;
      source: null;
      phaseVersion: number;
    };

const phaseRoutes: Record<
  Exclude<MovieBuffCanonicalVisualSourcePhase, "waiting">,
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

function isKnownPhase(
  phase: MovieBuffAuthoritativePhaseViewForVisuals["phase"],
): phase is Exclude<MovieBuffCanonicalVisualSourcePhase, "waiting"> {
  return Object.prototype.hasOwnProperty.call(phaseRoutes, phase);
}

function invalidAdapterResult(
  view: Pick<MovieBuffAuthoritativePhaseViewForVisuals, "phaseVersion">,
  reason: string,
): MovieBuffAuthoritativeVisualAdapterResult {
  return {
    valid: false,
    reason,
    source: null,
    phaseVersion: view.phaseVersion,
  };
}

export function adaptMovieBuffAuthoritativePhaseViewToVisualSource({
  view,
  lastAcceptedPhaseVersion,
  transitionPresentation = null,
}: {
  view: MovieBuffAuthoritativePhaseViewForVisuals;
  lastAcceptedPhaseVersion: number | null;
  transitionPresentation?: MovieBuffTransitionPresentation | null;
}): MovieBuffAuthoritativeVisualAdapterResult {
  if (!isKnownPhase(view.phase)) {
    return invalidAdapterResult(view, "UNKNOWN_CANONICAL_PHASE");
  }

  if (view.phaseRoute !== phaseRoutes[view.phase]) {
    return invalidAdapterResult(view, "CONTRADICTORY_ROUTE_AND_PHASE");
  }

  if (view.phase === "transition" && transitionPresentation === null) {
    return invalidAdapterResult(view, "TRANSITION_PRESENTATION_MISSING");
  }

  if (view.phase !== "transition" && transitionPresentation !== null) {
    return invalidAdapterResult(
      view,
      "TRANSITION_PRESENTATION_OUTSIDE_TRANSITION",
    );
  }

  if (view.phase === "blocked" && !view.blockedReason?.trim()) {
    return invalidAdapterResult(view, "BLOCKED_REASON_MISSING");
  }

  if (view.phase !== "blocked" && view.blockedReason !== null) {
    return invalidAdapterResult(view, "BLOCKED_REASON_OUTSIDE_BLOCKED_PHASE");
  }

  if (
    view.selectorControllerType === "buster" &&
    (view.selectorPlayerId !== null || view.callerIsSelector)
  ) {
    return invalidAdapterResult(view, "CONTRADICTORY_BUSTER_IDENTITY");
  }

  return {
    valid: true,
    reason: null,
    source: {
      phase: view.phase,
      phaseVersion: view.phaseVersion,
      lastAcceptedPhaseVersion,
      selectedTileId: view.selectedTileId,
      transitionPresentation,
      selectorControllerType: view.selectorControllerType,
      selectorPlayerId: view.selectorPlayerId,
      terminalFallback:
        view.phase === "abandoned" || view.phase === "blocked"
          ? "match_status"
          : null,
    },
  };
}
