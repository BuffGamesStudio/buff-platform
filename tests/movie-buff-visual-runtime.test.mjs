import assert from "node:assert/strict";
import test from "node:test";

const {
  deriveMovieBuffVisualRuntimeState,
  mayMovieBuffVisualRuntimeAdvanceGameplay,
} = await import("../src/lib/movie-buff/visualRuntime.ts");

const baseInput = {
  phase: "board",
  phaseStartedAt: "2026-08-04T12:00:00.000Z",
  phaseDeadlineAt: "2026-08-04T12:00:10.000Z",
  selectorPlayerId: "player-a",
  currentPlayerId: "player-a",
  selectedTileId: null,
  usedTileIds: [],
  reconnecting: false,
  assetAvailable: true,
  motionPreference: "full",
};

test("visual runtime can never advance gameplay", () => {
  assert.equal(mayMovieBuffVisualRuntimeAdvanceGameplay(), false);
});

test("selector emphasis is derived from authoritative identities", () => {
  const state = deriveMovieBuffVisualRuntimeState(baseInput);
  assert.equal(state.isSelector, true);

  const other = deriveMovieBuffVisualRuntimeState({
    ...baseInput,
    currentPlayerId: "player-b",
  });
  assert.equal(other.isSelector, false);
});

test("missing animation assets fail to a static surface", () => {
  const state = deriveMovieBuffVisualRuntimeState({
    ...baseInput,
    assetAvailable: false,
  });
  assert.equal(state.shouldAnimate, false);
  assert.equal(state.shouldUseStaticFallback, true);
});

test("reduced motion uses the static surface", () => {
  const state = deriveMovieBuffVisualRuntimeState({
    ...baseInput,
    motionPreference: "reduced",
  });
  assert.equal(state.shouldAnimate, false);
  assert.equal(state.shouldUseStaticFallback, true);
});

test("reconnect does not replay a transition as a participation gate", () => {
  const state = deriveMovieBuffVisualRuntimeState(
    {
      ...baseInput,
      phase: "curtain_transition",
      reconnecting: true,
    },
    Date.parse("2026-08-04T12:00:05.000Z"),
  );
  assert.equal(state.phase, "reconnecting");
  assert.equal(state.shouldReplayTransition, false);
});

test("a current transition may animate without becoming authority", () => {
  const state = deriveMovieBuffVisualRuntimeState(
    {
      ...baseInput,
      phase: "film_slate_transition",
    },
    Date.parse("2026-08-04T12:00:05.000Z"),
  );
  assert.equal(state.shouldReplayTransition, true);
  assert.equal(mayMovieBuffVisualRuntimeAdvanceGameplay(), false);
});

test("an expired transition is not replayed", () => {
  const state = deriveMovieBuffVisualRuntimeState(
    {
      ...baseInput,
      phase: "curtain_transition",
    },
    Date.parse("2026-08-04T12:00:11.000Z"),
  );
  assert.equal(state.shouldReplayTransition, false);
});
