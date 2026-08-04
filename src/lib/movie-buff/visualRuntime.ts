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
