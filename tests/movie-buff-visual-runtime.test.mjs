import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  deriveMovieBuffSharedPlaybackOffsetMs,
  deriveMovieBuffVisualRuntimeState,
  mapMovieBuffAuthoritativePhaseToVisualPhase,
  mayMovieBuffVisualRuntimeAdvanceGameplay,
} = await import("../src/lib/movie-buff/visualRuntime.ts");
const {
  adaptMovieBuffAuthoritativePhaseViewToVisualSource: adaptAuthoritativeViewRaw,
  MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
} = await import("../src/lib/movie-buff/authoritativeVisualAdapter.ts");
const { movieBuffVisualAssets } = await import(
  "../src/lib/movie-buff/visualAssetMap.ts"
);

const adaptMovieBuffAuthoritativePhaseViewToVisualSource = (input) =>
  adaptAuthoritativeViewRaw({
    schemaVersion: MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
    ...input,
  });

const baseInput = {
  phase: "board",
  phaseStartedAt: "2026-08-04T12:00:00.000Z",
  phaseDeadlineAt: "2026-08-04T12:00:10.000Z",
  playbackStartsAt: null,
  serverNow: "2026-08-04T12:00:05.000Z",
  selectorPlayerId: "player-a",
  currentPlayerId: "player-a",
  selectedTileId: null,
  usedTileIds: [],
  reconnecting: false,
  assetAvailable: true,
  motionPreference: "full",
};

const canonicalSource = (overrides = {}) => ({
  phase: "board_select",
  phaseVersion: 7,
  lastAcceptedPhaseVersion: 6,
  selectedTileId: null,
  transitionPresentation: null,
  selectorControllerType: "human",
  selectorPlayerId: "player-a",
  terminalFallback: null,
  ...overrides,
});

const authoritativeView = (overrides = {}) => ({
  roomId: "00000000-0000-4000-8000-000000000001",
  matchId: "00000000-0000-4000-8000-000000000002",
  roundId: "00000000-0000-4000-8000-000000000003",
  roundNumber: 1,
  totalRounds: 5,
  phase: "board_select",
  phaseVersion: 7,
  phaseStartedAt: "2026-08-04T12:00:00.000Z",
  phaseEndsAt: "2026-08-04T12:00:20.000Z",
  phaseRoute: "/games/movie-buff/board-preview",
  selectorSeatIndex: 1,
  selectorPlayerId: "player-a",
  selectorControllerType: "human",
  callerIsSelector: true,
  selectorDeadlineAt: "2026-08-04T12:00:20.000Z",
  selectedTileId: null,
  selectedClipId: null,
  selectionSource: null,
  playbackStartsAt: null,
  answerDeadlineAt: null,
  resultsEndAt: null,
  blockedReason: null,
  serverNow: "2026-08-04T12:00:05.000Z",
  ...overrides,
});

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("visual runtime can never advance gameplay", () => {
  assert.equal(mayMovieBuffVisualRuntimeAdvanceGameplay(), false);
});

test("current MOV-17 phase view adapts to the passive visual source", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView(),
    lastAcceptedPhaseVersion: 6,
  });

  assert.equal(adapted.valid, true);
  assert.deepEqual(adapted.source, canonicalSource());
});

test("authoritative route and phase contradictions fail closed", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView({ phaseRoute: "/games/movie-buff/play" }),
    lastAcceptedPhaseVersion: 6,
  });

  assert.equal(adapted.valid, false);
  assert.equal(adapted.reason, "CONTRADICTORY_ROUTE_AND_PHASE");
  assert.equal(adapted.source, null);
});

test("transition presentation remains explicit visual-only input", () => {
  const transition = authoritativeView({
    phase: "transition",
    phaseVersion: 8,
    phaseRoute: "/games/movie-buff/play",
    selectedTileId: "tile-7",
    selectedClipId: "clip-7",
    selectionSource: "human",
    callerIsSelector: false,
  });

  const missing = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: transition,
    lastAcceptedPhaseVersion: 7,
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "TRANSITION_PRESENTATION_MISSING");

  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: transition,
    lastAcceptedPhaseVersion: 7,
    transitionPresentation: "curtain",
  });
  assert.equal(adapted.valid, true);
  assert.equal(adapted.source.transitionPresentation, "curtain");
});

test("blocked state uses the passive match-status fallback", () => {
  const blocked = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView({
      phase: "blocked",
      phaseVersion: 9,
      phaseRoute: "/games/movie-buff/match-status",
      selectorSeatIndex: null,
      selectorPlayerId: null,
      selectorControllerType: null,
      callerIsSelector: false,
      selectorDeadlineAt: null,
      blockedReason: "ROUND_STATE_CONFLICT",
    }),
    lastAcceptedPhaseVersion: 8,
  });

  assert.equal(blocked.valid, true);
  assert.equal(blocked.source.terminalFallback, "match_status");

  const malformed = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView({
      phase: "blocked",
      phaseVersion: 9,
      phaseRoute: "/games/movie-buff/match-status",
      selectorSeatIndex: null,
      selectorPlayerId: null,
      selectorControllerType: null,
      callerIsSelector: false,
      selectorDeadlineAt: null,
      blockedReason: null,
    }),
    lastAcceptedPhaseVersion: 8,
  });
  assert.equal(malformed.valid, false);
  assert.equal(malformed.reason, "BLOCKED_REASON_MISSING");
});

test("MOV-17 canonical phases map to passive MOV-18 visual phases", () => {
  const cases = [
    ["waiting", null, null, "waiting"],
    ["round_intro", null, null, "round_intro"],
    ["vip_lock", null, null, "vip_selection"],
    ["board_select", null, null, "board"],
    ["transition", "tile-7", "curtain", "curtain_transition"],
    ["transition", "tile-7", "film_slate", "film_slate_transition"],
    ["playback", "tile-7", null, "playback"],
    ["answer", "tile-7", null, "answer"],
    ["results", "tile-7", null, "results"],
    ["finished", null, null, "match_complete"],
  ];

  for (const [phase, selectedTileId, transitionPresentation, expected] of cases) {
    const selectorRequired = [
      "board_select",
      "transition",
      "playback",
      "answer",
      "results",
    ].includes(phase);
    const mapping = mapMovieBuffAuthoritativePhaseToVisualPhase(
      canonicalSource({
        phase,
        selectedTileId,
        transitionPresentation,
        selectorControllerType: selectorRequired ? "human" : null,
        selectorPlayerId: selectorRequired ? "player-a" : null,
      }),
    );
    assert.equal(mapping.valid, true, phase);
    assert.equal(mapping.phase, expected, phase);
    assert.equal(mapping.reason, null, phase);
    assert.equal(mapping.phaseVersion, 7, phase);
  }
});

test("terminal states require an explicit fail-closed fallback contract", () => {
  for (const phase of ["abandoned", "blocked"]) {
    const withoutFallback = mapMovieBuffAuthoritativePhaseToVisualPhase(
      canonicalSource({
        phase,
        selectorControllerType: null,
        selectorPlayerId: null,
      }),
    );
    assert.equal(withoutFallback.valid, false);
    assert.equal(withoutFallback.reason, "TERMINAL_FALLBACK_MISSING");

    const withFallback = mapMovieBuffAuthoritativePhaseToVisualPhase(
      canonicalSource({
        phase,
        selectorControllerType: null,
        selectorPlayerId: null,
        terminalFallback: "match_status",
      }),
    );
    assert.equal(withFallback.valid, true);
    assert.equal(withFallback.phase, "match_status");
  }
});

test("stale, contradictory, and unknown canonical state fails closed", () => {
  const cases = [
    [
      { phaseVersion: 5, lastAcceptedPhaseVersion: 6 },
      "STALE_PHASE_VERSION",
    ],
    [{ phaseVersion: 0 }, "INVALID_PHASE_VERSION"],
    [
      { selectorControllerType: "buster", selectorPlayerId: "player-a" },
      "CONTRADICTORY_BUSTER_IDENTITY",
    ],
    [
      { selectorControllerType: null, selectorPlayerId: "player-a" },
      "SELECTOR_IDENTITY_WITHOUT_CONTROLLER",
    ],
    [{ selectedTileId: "tile-7" }, "BOARD_SELECT_HAS_SELECTED_TILE"],
    [
      {
        phase: "transition",
        selectedTileId: null,
        transitionPresentation: "curtain",
      },
      "TRANSITION_MISSING_SELECTED_TILE",
    ],
    [
      {
        phase: "transition",
        selectedTileId: "tile-7",
        transitionPresentation: null,
      },
      "TRANSITION_PRESENTATION_MISSING",
    ],
    [
      {
        phase: "playback",
        selectedTileId: "tile-7",
        transitionPresentation: "film_slate",
      },
      "TRANSITION_PRESENTATION_OUTSIDE_TRANSITION",
    ],
    [
      {
        phase: "invented_phase",
        selectorControllerType: null,
        selectorPlayerId: null,
      },
      "UNKNOWN_CANONICAL_PHASE",
    ],
  ];

  for (const [overrides, reason] of cases) {
    const mapping = mapMovieBuffAuthoritativePhaseToVisualPhase(
      canonicalSource(overrides),
    );
    assert.equal(mapping.valid, false, reason);
    assert.equal(mapping.phase, "error", reason);
    assert.equal(mapping.reason, reason, reason);
  }
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

test("playback presentation derives offset from the shared server epoch", () => {
  assert.equal(
    deriveMovieBuffSharedPlaybackOffsetMs({
      playbackStartsAt: "2026-08-04T12:00:00.000Z",
      serverNow: "2026-08-04T12:00:02.500Z",
      clientNowMs: Date.parse("2026-08-04T12:00:50.000Z"),
    }),
    2500,
  );

  const state = deriveMovieBuffVisualRuntimeState({
    ...baseInput,
    phase: "playback",
    playbackStartsAt: "2026-08-04T12:00:00.000Z",
    serverNow: "2026-08-04T12:00:02.500Z",
  });
  assert.equal(state.playbackOffsetMs, 2500);
});

test("approved Rive packages are exact and synchronized", async () => {
  const manifest = JSON.parse(await source("../package.json"));
  const lock = JSON.parse(await source("../package-lock.json"));

  assert.equal(manifest.dependencies?.["@rive-app/react-webgl2"], "4.30.0");
  assert.equal(
    lock.packages?.[""]?.dependencies?.["@rive-app/react-webgl2"],
    "4.30.0",
  );
  assert.equal(
    lock.packages?.["node_modules/@rive-app/react-webgl2"]?.version,
    "4.30.0",
  );
  assert.equal(
    lock.packages?.["node_modules/@rive-app/webgl2"]?.version,
    "2.39.1",
  );
});

test("declared Rive paths remain placeholders until real assets exist", () => {
  for (const asset of Object.values(movieBuffVisualAssets)) {
    assert.equal(asset.kind, "rive");
    assert.match(asset.source, /^\/movie-buff\/rive\/[a-z-]+\.riv$/);
    assert.equal("artboard" in asset, false);
    assert.equal("stateMachine" in asset, false);
  }
});

test("Rive canvas reports actual load and WebGL context loss", async () => {
  const canvas = await source(
    "../src/components/movie-buff/visual/MovieBuffRiveCanvas.tsx",
  );

  assert.match(canvas, /@rive-app\/react-webgl2/);
  assert.match(canvas, /Fit\.Contain/);
  assert.match(canvas, /Alignment\.Center/);
  assert.match(canvas, /useOffscreenRenderer/);
  assert.match(canvas, /shouldDisableRiveListeners/);
  assert.match(canvas, /onLoad:\s*\(\) => onRuntimeReady\(\)/);
  assert.match(canvas, /onLoadError:/);
  assert.match(canvas, /webglcontextlost/);
  assert.doesNotMatch(canvas, /useStateMachineInput/);
  assert.doesNotMatch(canvas, /onStateChange/);
  assert.doesNotMatch(canvas, /router\.(push|replace)/);
  assert.doesNotMatch(canvas, /window\.location/);
  assert.doesNotMatch(canvas, /supabase/i);
  assert.doesNotMatch(canvas, /\/api\/movie-buff/);
});

test("Rive surface waits for real runtime readiness and fails closed", async () => {
  const riveSurface = await source(
    "../src/components/movie-buff/visual/MovieBuffRiveSurface.tsx",
  );
  assert.match(riveSurface, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(riveSurface, /method:\s*"HEAD"/);
  assert.match(riveSurface, /MovieBuffStaticFallback/);
  assert.match(riveSurface, /MovieBuffRiveCanvas/);
  assert.match(riveSurface, /onRuntimeReady/);
  assert.match(riveSurface, /data-rive-runtime-status/);
  assert.match(riveSurface, /motion_preference_pending/);
  assert.doesNotMatch(riveSurface, /router\.(push|replace)/);
  assert.doesNotMatch(riveSurface, /method:\s*"POST"/);
  assert.doesNotMatch(riveSurface, /supabase/i);
});

test("Game Menu contains focus, Escape, and opener restoration contracts", async () => {
  const menu = await source(
    "../src/components/movie-buff/visual/MovieBuffGameMenu.tsx",
  );
  assert.match(menu, /aria-modal="true"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /event\.key !== "Tab"/);
  assert.match(menu, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(menu, /openerRef\.current\?\.focus\(\)/);
  assert.match(menu, /document\.body\.style\.overflow = "hidden"/);
  assert.doesNotMatch(menu, /leave_movie_buff/i);
  assert.doesNotMatch(menu, /\/api\/movie-buff/);
});

test("Buster and transitions remain passive Rive consumers", async () => {
  const [buster, transition] = await Promise.all([
    source("../src/components/movie-buff/visual/MovieBuffBusterReplacement.tsx"),
    source("../src/components/movie-buff/visual/MovieBuffTransitionSurface.tsx"),
  ]);

  for (const visual of [buster, transition]) {
    assert.match(visual, /MovieBuffRiveSurface/);
    assert.doesNotMatch(visual, /useStateMachineInput/);
    assert.doesNotMatch(visual, /router\.(push|replace)/);
    assert.doesNotMatch(visual, /window\.location/);
    assert.doesNotMatch(visual, /supabase/i);
    assert.doesNotMatch(visual, /\/api\/movie-buff/);
  }

  assert.match(buster, /data-buster-visual-state=\{state\}/);
  assert.match(transition, /authoritative playback timestamp/);
});

test("authoritative visual adapter remains a read-only consumer", async () => {
  const [adapter, component] = await Promise.all([
    source("../src/lib/movie-buff/authoritativeVisualAdapter.ts"),
    source(
      "../src/components/movie-buff/visual/MovieBuffAuthoritativePhaseVisualAdapter.tsx",
    ),
  ]);

  for (const visual of [adapter, component]) {
    assert.doesNotMatch(visual, /router\.(push|replace)/);
    assert.doesNotMatch(visual, /window\.location/);
    assert.doesNotMatch(visual, /supabase/i);
    assert.doesNotMatch(visual, /\/api\/movie-buff/);
    assert.doesNotMatch(visual, /fetch\s*\(/);
  }

  assert.match(adapter, /CONTRADICTORY_ROUTE_AND_PHASE/);
  assert.match(adapter, /TRANSITION_PRESENTATION_MISSING/);
  assert.match(component, /data-movie-buff-authoritative-view="read-only"/);
});

test("isolated preview route cannot call gameplay or hosted APIs", async () => {
  const preview = await source(
    "../src/app/games/movie-buff/visual-runtime-preview/page.tsx",
  );
  assert.doesNotMatch(preview, /supabase/i);
  assert.doesNotMatch(preview, /\/api\/movie-buff/);
  assert.doesNotMatch(preview, /leaveCurrentRoom/);
  assert.match(preview, /Preview only/);
  assert.match(preview, /cannot advance the shared phase/);
});
