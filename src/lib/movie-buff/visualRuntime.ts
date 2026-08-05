export type MovieBuffCanonicalVisualSourcePhase =
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

export type MovieBuffVisualPhase =
  | "loading"
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
  | "reconnecting"
  | "error";

export type MovieBuffCanonicalVisualSource = {
  phase: MovieBuffCanonicalVisualSourcePhase | (string & {});
  selectedTileId: string | null;
};

export type MovieBuffVisualPhaseMapping = {
  phase: MovieBuffVisualPhase;
  valid: boolean;
  reason: string | null;
};

export type MovieBuffMotionPreference = "full" | "reduced";

export type MovieBuffVisualRuntimeInput = {
  phase: MovieBuffVisualPhase;
  phaseStartedAt: string | null;
  phaseDeadlineAt: string | null;
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
};

function invalidVisualPhase(reason: string): MovieBuffVisualPhaseMapping {
  return {
    phase: "error",
    valid: false,
    reason,
  };
}

export function mapMovieBuffAuthoritativePhaseToVisualPhase(
  source: MovieBuffCanonicalVisualSource,
): MovieBuffVisualPhaseMapping {
  switch (source.phase) {
    case "round_intro":
      return { phase: "round_intro", valid: true, reason: null };
    case "vip_lock":
      return { phase: "vip_selection", valid: true, reason: null };
    case "board_select":
      if (source.selectedTileId !== null) {
        return invalidVisualPhase("BOARD_SELECT_HAS_SELECTED_TILE");
      }
      return { phase: "board", valid: true, reason: null };
    case "transition":
      if (source.selectedTileId === null) {
        return invalidVisualPhase("TRANSITION_MISSING_SELECTED_TILE");
      }
      return { phase: "film_slate_transition", valid: true, reason: null };
    case "playback":
      return { phase: "playback", valid: true, reason: null };
    case "answer":
      return { phase: "answer", valid: true, reason: null };
    case "results":
      return { phase: "results", valid: true, reason: null };
    case "finished":
      return { phase: "match_complete", valid: true, reason: null };
    case "abandoned":
      return invalidVisualPhase("MATCH_ABANDONED");
    case "blocked":
      return invalidVisualPhase("MATCH_BLOCKED");
    default:
      return invalidVisualPhase("UNKNOWN_CANONICAL_PHASE");
  }
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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
  };
}

export function mayMovieBuffVisualRuntimeAdvanceGameplay(): false {
  return false;
}
