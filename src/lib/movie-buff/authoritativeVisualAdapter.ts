import type {
  MovieBuffCanonicalVisualSource,
  MovieBuffCanonicalVisualSourcePhase,
  MovieBuffTransitionPresentation,
  MovieBuffVisualControllerType,
} from "./visualRuntime";
import { mapMovieBuffAuthoritativePhaseToVisualPhase } from "./visualRuntime";

export const MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION = 1 as const;

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

const optionalTimestampFields = [
  ["phaseEndsAt", "PHASE_ENDS_AT_INVALID"],
  ["selectorDeadlineAt", "SELECTOR_DEADLINE_AT_INVALID"],
  ["playbackStartsAt", "PLAYBACK_STARTS_AT_INVALID"],
  ["answerDeadlineAt", "ANSWER_DEADLINE_AT_INVALID"],
  ["resultsEndAt", "RESULTS_END_AT_INVALID"],
] as const satisfies readonly (
  readonly [
    keyof Pick<
      MovieBuffAuthoritativePhaseViewForVisuals,
      | "phaseEndsAt"
      | "selectorDeadlineAt"
      | "playbackStartsAt"
      | "answerDeadlineAt"
      | "resultsEndAt"
    >,
    string,
  ]
)[];

function isKnownPhase(
  phase: MovieBuffAuthoritativePhaseViewForVisuals["phase"],
): phase is Exclude<MovieBuffCanonicalVisualSourcePhase, "waiting"> {
  return Object.prototype.hasOwnProperty.call(phaseRoutes, phase);
}

function isValidAuthoritativeTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isTransitionPresentation(
  value: unknown,
): value is MovieBuffTransitionPresentation {
  return value === "curtain" || value === "film_slate";
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
  schemaVersion = MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
}: {
  view: MovieBuffAuthoritativePhaseViewForVisuals;
  lastAcceptedPhaseVersion: number | null;
  transitionPresentation?: MovieBuffTransitionPresentation | null;
  schemaVersion?: number;
}): MovieBuffAuthoritativeVisualAdapterResult {
  if (schemaVersion !== MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION) {
    return invalidAdapterResult(view, "UNKNOWN_AUTHORITATIVE_SCHEMA_VERSION");
  }

  if (!isKnownPhase(view.phase)) {
    return invalidAdapterResult(view, "UNKNOWN_CANONICAL_PHASE");
  }

  if (!isValidAuthoritativeTimestamp(view.serverNow)) {
    return invalidAdapterResult(view, "SERVER_NOW_MISSING_OR_INVALID");
  }

  if (!isValidAuthoritativeTimestamp(view.phaseStartedAt)) {
    return invalidAdapterResult(view, "PHASE_STARTED_AT_MISSING_OR_INVALID");
  }

  for (const [field, reason] of optionalTimestampFields) {
    const value = view[field];
    if (value !== null && !isValidAuthoritativeTimestamp(value)) {
      return invalidAdapterResult(view, reason);
    }
  }

  if (view.phaseRoute !== phaseRoutes[view.phase]) {
    return invalidAdapterResult(view, "CONTRADICTORY_ROUTE_AND_PHASE");
  }

  if (
    view.phase === "transition" &&
    !isTransitionPresentation(transitionPresentation)
  ) {
    return invalidAdapterResult(
      view,
      "TRANSITION_PRESENTATION_MISSING_OR_INVALID",
    );
  }

  if (view.phase !== "transition" && transitionPresentation !== null) {
    return invalidAdapterResult(
      view,
      "TRANSITION_PRESENTATION_OUTSIDE_TRANSITION",
    );
  }

  if (
    ["transition", "playback", "answer", "results"].includes(view.phase) &&
    view.selectedClipId === null
  ) {
    return invalidAdapterResult(view, "ACTIVE_SCENE_CLIP_MISSING");
  }

  if (view.phase === "playback" && view.playbackStartsAt === null) {
    return invalidAdapterResult(view, "PLAYBACK_STARTS_AT_MISSING");
  }

  if (view.phase === "answer" && view.answerDeadlineAt === null) {
    return invalidAdapterResult(view, "ANSWER_DEADLINE_AT_MISSING");
  }

  if (view.phase === "results" && view.resultsEndAt === null) {
    return invalidAdapterResult(view, "AUTHORITATIVE_RESULTS_STATE_MISSING");
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

  if (
    view.callerIsSelector &&
    (view.selectorControllerType !== "human" || view.selectorPlayerId === null)
  ) {
    return invalidAdapterResult(view, "CONTRADICTORY_CALLER_SELECTOR_STATE");
  }

  const source: MovieBuffCanonicalVisualSource = {
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
  };

  const mapping = mapMovieBuffAuthoritativePhaseToVisualPhase(source);
  if (!mapping.valid) {
    return invalidAdapterResult(view, mapping.reason ?? "INVALID_VISUAL_MAPPING");
  }

  return {
    valid: true,
    reason: null,
    source,
  };
}
