import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  deriveMovieBuffVisualRuntimeState,
  mayMovieBuffVisualRuntimeAdvanceGameplay,
} = await import("../src/lib/movie-buff/visualRuntime.ts");
const { movieBuffVisualAssets } = await import(
  "../src/lib/movie-buff/visualAssetMap.ts"
);

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

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

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

test("all declared Rive assets use public absolute paths", () => {
  for (const asset of Object.values(movieBuffVisualAssets)) {
    assert.equal(asset.kind, "rive");
    assert.match(asset.source, /^\/movie-buff\/rive\/[a-z-]+\.riv$/);
  }
});

test("Rive canvas is isolated, passive, and WebGL2 bounded", async () => {
  const canvas = await source(
    "../src/components/movie-buff/visual/MovieBuffRiveCanvas.tsx",
  );

  assert.match(canvas, /@rive-app\/react-webgl2/);
  assert.match(canvas, /Fit\.Contain/);
  assert.match(canvas, /Alignment\.Center/);
  assert.match(canvas, /useOffscreenRenderer/);
  assert.match(canvas, /shouldDisableRiveListeners/);
  assert.match(canvas, /onLoadError:\s*onRuntimeError/);
  assert.doesNotMatch(canvas, /useStateMachineInput/);
  assert.doesNotMatch(canvas, /onStateChange/);
  assert.doesNotMatch(canvas, /router\.(push|replace)/);
  assert.doesNotMatch(canvas, /window\.location/);
  assert.doesNotMatch(canvas, /supabase/i);
  assert.doesNotMatch(canvas, /\/api\/movie-buff/);
});

test("Rive surface checks assets, honors reduced motion, and fails closed", async () => {
  const riveSurface = await source(
    "../src/components/movie-buff/visual/MovieBuffRiveSurface.tsx",
  );
  assert.match(riveSurface, /prefers-reduced-motion: reduce/);
  assert.match(riveSurface, /method: "HEAD"/);
  assert.match(riveSurface, /MovieBuffStaticFallback/);
  assert.match(riveSurface, /MovieBuffRiveCanvas/);
  assert.match(riveSurface, /onRuntimeError=\{\(\) => setAssetStatus\("failed"\)\}/);
  assert.doesNotMatch(riveSurface, /router\.(push|replace)/);
  assert.doesNotMatch(riveSurface, /method: "POST"/);
  assert.doesNotMatch(riveSurface, /supabase/i);
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
