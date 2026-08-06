export type MovieBuffCanonicalVisualSourcePhase =
  | "waiting"
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

export type MovieBuffTransitionPresentation = "curtain" | "film_slate";
export type MovieBuffVisualControllerType = "human" | "buster";
export type MovieBuffTerminalFallback = "match_status";

export type MovieBuffVisualPhase =
  | "loading"
  | "waiting"
  | "round_intro"
  | "vip_selection"
  | "board"
  | "tile_selected"
  | "curtain_transition"
  | "film_slate_transition"
  | "playback"
  | "answer"
  | "results"
  | "match_complete"
  | "match_status"
  | "reconnecting"
  | "error";

export type MovieBuffCanonicalVisualSource = {
  phase: MovieBuffCanonicalVisualSourcePhase | (string & {});
  phaseVersion: number;
  lastAcceptedPhaseVersion: number | null;
  selectedTileId: string | null;
  transitionPresentation: MovieBuffTransitionPresentation | null;
  selectorControllerType: MovieBuffVisualControllerType | null;
  selectorPlayerId: string | null;
  terminalFallback: MovieBuffTerminalFallback | null;
};

export type MovieBuffVisualPhaseMapping = {
  phase: MovieBuffVisualPhase;
  valid: boolean;
  reason: string | null;
  phaseVersion: number;
};

export type MovieBuffMotionPreference = "full" | "reduced";

export type MovieBuffVisualRuntimeInput = {
  phase: MovieBuffVisualPhase;
  phaseStartedAt: string | null;
  phaseDeadlineAt: string | null;
  playbackStartsAt: string | null;
  serverNow: string | null;
  selectorPlayerId: string | null;
  currentPlayerId: string | null;
  selectedTileId: string | null;
  usedTileIds: readonly string[];
  reconnecting: boolean;
  assetAvailable: boolean;
  motionPreference: MovieBuffMotionPreference;
};

export type MovieBuffVisualRuntimeState = {
  phase: MovieBuffVisualPhase;
  isSelector: boolean;
  shouldAnimate: boolean;
  shouldUseStaticFallback: boolean;
  shouldReplayTransition: boolean;
  selectedTileId: string | null;
  usedTileIds: readonly string[];
  playbackOffsetMs: number | null;
};

function invalidVisualPhase(
  source: Pick<MovieBuffCanonicalVisualSource, "phaseVersion">,
  reason: string,
): MovieBuffVisualPhaseMapping {
  return {
    phase: "error",
    valid: false,
    reason,
    phaseVersion: source.phaseVersion,
  };
}

function isPositiveVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function mapMovieBuffAuthoritativePhaseToVisualPhase(
  source: MovieBuffCanonicalVisualSource,
): MovieBuffVisualPhaseMapping {
  if (!isPositiveVersion(source.phaseVersion)) {
    return invalidVisualPhase(source, "INVALID_PHASE_VERSION");
  }

  if (
    source.lastAcceptedPhaseVersion !== null &&
    (!isPositiveVersion(source.lastAcceptedPhaseVersion) ||
      source.phaseVersion < source.lastAcceptedPhaseVersion)
  ) {
    return invalidVisualPhase(source, "STALE_PHASE_VERSION");
  }

  if (
    source.selectorControllerType === "buster" &&
    source.selectorPlayerId !== null
  ) {
    return invalidVisualPhase(source, "CONTRADICTORY_BUSTER_IDENTITY");
  }

  if (
    source.selectorControllerType === null &&
    source.selectorPlayerId !== null
  ) {
    return invalidVisualPhase(source, "SELECTOR_IDENTITY_WITHOUT_CONTROLLER");
  }

  if (
    source.selectorControllerType === "human" &&
    source.selectorPlayerId === null &&
    ["board_select", "transition", "playback", "answer", "results"].includes(
      source.phase,
    )
  ) {
    return invalidVisualPhase(source, "HUMAN_SELECTOR_IDENTITY_MISSING");
  }

  if (source.phase !== "transition" && source.transitionPresentation !== null) {
    return invalidVisualPhase(source, "TRANSITION_PRESENTATION_OUTSIDE_TRANSITION");
  }

  switch (source.phase) {
    case "waiting":
      if (source.selectedTileId !== null) {
        return invalidVisualPhase(source, "WAITING_HAS_SELECTED_TILE");
      }
      return {
        phase: "waiting",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "round_intro":
      if (source.selectedTileId !== null) {
        return invalidVisualPhase(source, "ROUND_INTRO_HAS_SELECTED_TILE");
      }
      return {
        phase: "round_intro",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "vip_lock":
      if (source.selectedTileId !== null) {
        return invalidVisualPhase(source, "VIP_LOCK_HAS_SELECTED_TILE");
      }
      return {
        phase: "vip_selection",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "board_select":
      if (source.selectedTileId !== null) {
        return invalidVisualPhase(source, "BOARD_SELECT_HAS_SELECTED_TILE");
      }
      return {
        phase: "board",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "transition":
      if (source.selectedTileId === null) {
        return invalidVisualPhase(source, "TRANSITION_MISSING_SELECTED_TILE");
      }
      if (source.transitionPresentation === null) {
        return invalidVisualPhase(source, "TRANSITION_PRESENTATION_MISSING");
      }
      return {
        phase:
          source.transitionPresentation === "curtain"
            ? "curtain_transition"
            : "film_slate_transition",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "playback":
    case "answer":
    case "results":
      if (source.selectedTileId === null) {
        return invalidVisualPhase(
          source,
          `${source.phase.toUpperCase()}_MISSING_SELECTED_TILE`,
        );
      }
      return {
        phase: source.phase,
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "finished":
      return {
        phase: "match_complete",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    case "abandoned":
    case "blocked":
      if (source.terminalFallback !== "match_status") {
        return invalidVisualPhase(source, "TERMINAL_FALLBACK_MISSING");
      }
      return {
        phase: "match_status",
        valid: true,
        reason: null,
        phaseVersion: source.phaseVersion,
      };
    default:
      return invalidVisualPhase(source, "UNKNOWN_CANONICAL_PHASE");
  }
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function deriveMovieBuffSharedPlaybackOffsetMs({
  playbackStartsAt,
  serverNow,
  clientNowMs = Date.now(),
}: {
  playbackStartsAt: string | null;
  serverNow: string | null;
  clientNowMs?: number;
}): number | null {
  const playbackStartMs = parseTimestamp(playbackStartsAt);
  if (playbackStartMs === null) return null;

  const serverNowMs = parseTimestamp(serverNow);
  const authoritativeNowMs = serverNowMs ?? clientNowMs;
  return Math.max(0, authoritativeNowMs - playbackStartMs);
}

export function deriveMovieBuffVisualRuntimeState(
  input: MovieBuffVisualRuntimeInput,
  nowMs = Date.now(),
): MovieBuffVisualRuntimeState {
  const phaseStartedAt = parseTimestamp(input.phaseStartedAt);
  const phaseDeadlineAt = parseTimestamp(input.phaseDeadlineAt);
  const transitionIsCurrent =
    phaseStartedAt !== null &&
    phaseStartedAt <= nowMs &&
    (phaseDeadlineAt === null || nowMs < phaseDeadlineAt);

  const transitionPhase =
    input.phase === "curtain_transition" ||
    input.phase === "film_slate_transition";

  return {
    phase: input.reconnecting ? "reconnecting" : input.phase,
    isSelector:
      input.currentPlayerId !== null &&
      input.currentPlayerId === input.selectorPlayerId,
    shouldAnimate:
      input.assetAvailable &&
      input.motionPreference === "full" &&
      !input.reconnecting,
    shouldUseStaticFallback:
      !input.assetAvailable || input.motionPreference === "reduced",
    shouldReplayTransition:
      transitionPhase &&
      transitionIsCurrent &&
      !input.reconnecting &&
      input.motionPreference === "full" &&
      input.assetAvailable,
    selectedTileId: input.selectedTileId,
    usedTileIds: input.usedTileIds,
    playbackOffsetMs:
      input.phase === "playback"
        ? deriveMovieBuffSharedPlaybackOffsetMs({
            playbackStartsAt: input.playbackStartsAt,
            serverNow: input.serverNow,
            clientNowMs: nowMs,
          })
        : null,
  };
}

export function mayMovieBuffVisualRuntimeAdvanceGameplay(): false {
  return false;
}
