import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  adaptMovieBuffAuthoritativePhaseViewToVisualSource,
  MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
} = await import("../src/lib/movie-buff/authoritativeVisualAdapter.ts");

const authoritativeView = (overrides = {}) => ({
  roomId: "00000000-0000-4000-8000-000000000001",
  matchId: "00000000-0000-4000-8000-000000000002",
  roundId: "00000000-0000-4000-8000-000000000003",
  roundNumber: 1,
  totalRounds: 5,
  phase: "board_select",
  phaseVersion: 7,
  phaseStartedAt: "2026-08-06T11:00:00.000Z",
  phaseEndsAt: "2026-08-06T11:00:20.000Z",
  phaseRoute: "/games/movie-buff/board-preview",
  selectorSeatIndex: 1,
  selectorPlayerId: "player-a",
  selectorControllerType: "human",
  callerIsSelector: true,
  selectorDeadlineAt: "2026-08-06T11:00:20.000Z",
  selectedTileId: null,
  selectedClipId: null,
  selectionSource: null,
  playbackStartsAt: null,
  answerDeadlineAt: null,
  resultsEndAt: null,
  blockedReason: null,
  serverNow: "2026-08-06T11:00:05.000Z",
  ...overrides,
});

const activeSceneView = (phase, overrides = {}) =>
  authoritativeView({
    phase,
    phaseVersion: 8,
    phaseRoute:
      phase === "results"
        ? "/games/movie-buff/round-results"
        : "/games/movie-buff/play",
    callerIsSelector: false,
    selectedTileId: "tile-7",
    selectedClipId: "clip-7",
    selectionSource: "human",
    playbackStartsAt: "2026-08-06T11:00:08.000Z",
    answerDeadlineAt: "2026-08-06T11:00:38.000Z",
    resultsEndAt: "2026-08-06T11:00:46.000Z",
    ...overrides,
  });

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("exact current MOV-17 timing shape remains passively adaptable as pinned schema v1", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView(),
    lastAcceptedPhaseVersion: 6,
  });

  assert.equal(MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION, 1);
  assert.equal(adapted.valid, true);
  assert.equal(adapted.reason, null);
  assert.equal(adapted.source.phase, "board_select");
  assert.equal(adapted.source.phaseVersion, 7);
  assert.equal(adapted.source.lastAcceptedPhaseVersion, 6);
});

test("unknown authoritative visual schema versions fail closed", () => {
  for (const schemaVersion of [0, 2, 999]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView(),
      lastAcceptedPhaseVersion: 6,
      schemaVersion,
    });

    assert.equal(adapted.valid, false);
    assert.equal(adapted.reason, "UNKNOWN_AUTHORITATIVE_SCHEMA_VERSION");
    assert.equal(adapted.source, null);
  }
});

test("missing or malformed authoritative server time fails closed", () => {
  for (const serverNow of [undefined, null, "", "not-a-timestamp"]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView({ serverNow }),
      lastAcceptedPhaseVersion: 6,
    });

    assert.equal(adapted.valid, false);
    assert.equal(adapted.reason, "SERVER_NOW_MISSING_OR_INVALID");
    assert.equal(adapted.source, null);
  }
});

test("missing or malformed phase start time fails closed", () => {
  for (const phaseStartedAt of [undefined, null, "", "not-a-timestamp"]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView({ phaseStartedAt }),
      lastAcceptedPhaseVersion: 6,
    });

    assert.equal(adapted.valid, false);
    assert.equal(adapted.reason, "PHASE_STARTED_AT_MISSING_OR_INVALID");
  }
});

test("every supplied authoritative deadline must parse as a timestamp", () => {
  const cases = [
    ["phaseEndsAt", "PHASE_ENDS_AT_INVALID"],
    ["selectorDeadlineAt", "SELECTOR_DEADLINE_AT_INVALID"],
    ["playbackStartsAt", "PLAYBACK_STARTS_AT_INVALID"],
    ["answerDeadlineAt", "ANSWER_DEADLINE_AT_INVALID"],
    ["resultsEndAt", "RESULTS_END_AT_INVALID"],
  ];

  for (const [field, reason] of cases) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView({ [field]: "not-a-timestamp" }),
      lastAcceptedPhaseVersion: 6,
    });

    assert.equal(adapted.valid, false, field);
    assert.equal(adapted.reason, reason, field);
  }
});

test("playback requires the authoritative shared playback epoch", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: activeSceneView("playback", { playbackStartsAt: null }),
    lastAcceptedPhaseVersion: 7,
  });

  assert.equal(adapted.valid, false);
  assert.equal(adapted.reason, "PLAYBACK_STARTS_AT_MISSING");
});

test("answer requires the authoritative answer deadline", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: activeSceneView("answer", { answerDeadlineAt: null }),
    lastAcceptedPhaseVersion: 7,
  });

  assert.equal(adapted.valid, false);
  assert.equal(adapted.reason, "ANSWER_DEADLINE_AT_MISSING");
});

test("results requires authoritative results state", () => {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: activeSceneView("results", { resultsEndAt: null }),
    lastAcceptedPhaseVersion: 7,
  });

  assert.equal(adapted.valid, false);
  assert.equal(adapted.reason, "AUTHORITATIVE_RESULTS_STATE_MISSING");
});

test("active scene phases require a canonical clip identity", () => {
  for (const phase of ["transition", "playback", "answer", "results"]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: activeSceneView(phase, { selectedClipId: null }),
      lastAcceptedPhaseVersion: 7,
      transitionPresentation: phase === "transition" ? "curtain" : null,
    });

    assert.equal(adapted.valid, false, phase);
    assert.equal(adapted.reason, "ACTIVE_SCENE_CLIP_MISSING", phase);
  }
});

test("transition presentation distinguishes missing and invalid values", () => {
  const missing = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: activeSceneView("transition"),
    lastAcceptedPhaseVersion: 7,
    transitionPresentation: null,
  });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "TRANSITION_PRESENTATION_MISSING");

  for (const transitionPresentation of ["fade", "unknown"]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: activeSceneView("transition"),
      lastAcceptedPhaseVersion: 7,
      transitionPresentation,
    });

    assert.equal(adapted.valid, false);
    assert.equal(adapted.reason, "TRANSITION_PRESENTATION_INVALID");
  }
});

test("stale and selected-tile contradictions fail in the first adapter", () => {
  const stale = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view: authoritativeView({ phaseVersion: 5 }),
    lastAcceptedPhaseVersion: 6,
  });
  assert.equal(stale.valid, false);
  assert.equal(stale.reason, "STALE_PHASE_VERSION");

  const selectedBeforeTransition =
    adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView({ selectedTileId: "tile-7" }),
      lastAcceptedPhaseVersion: 6,
    });
  assert.equal(selectedBeforeTransition.valid, false);
  assert.equal(selectedBeforeTransition.reason, "BOARD_SELECT_HAS_SELECTED_TILE");
});

test("caller selector state cannot contradict the authoritative controller", () => {
  for (const overrides of [
    { callerIsSelector: true, selectorControllerType: null },
    { callerIsSelector: true, selectorPlayerId: null },
    {
      callerIsSelector: true,
      selectorControllerType: "buster",
      selectorPlayerId: null,
    },
  ]) {
    const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
      view: authoritativeView(overrides),
      lastAcceptedPhaseVersion: 6,
    });

    assert.equal(adapted.valid, false);
    assert.ok(
      [
        "CONTRADICTORY_CALLER_SELECTOR_STATE",
        "CONTRADICTORY_BUSTER_IDENTITY",
      ].includes(adapted.reason),
    );
  }
});

test("the rendered browser workflow is bound to both visual contract suites", async () => {
  const workflow = await source(
    "../.github/workflows/movie-buff-mov18-browser-evidence.yml",
  );

  assert.match(
    workflow,
    /tests\/movie-buff-authoritative-visual-adapter\.test\.mjs/,
  );
  assert.match(workflow, /tests\/movie-buff-visual-runtime\.test\.mjs/);
  assert.match(workflow, /Run focused visual contracts/);
});

test("the authoritative visual adapter remains read-only", async () => {
  const [adapter, component] = await Promise.all([
    source("../src/lib/movie-buff/authoritativeVisualAdapter.ts"),
    source(
      "../src/components/movie-buff/visual/MovieBuffAuthoritativePhaseVisualAdapter.tsx",
    ),
  ]);

  for (const implementation of [adapter, component]) {
    assert.doesNotMatch(implementation, /fetch\s*\(/);
    assert.doesNotMatch(implementation, /\/api\/movie-buff/);
    assert.doesNotMatch(implementation, /supabase/i);
    assert.doesNotMatch(implementation, /router\.(push|replace)/);
    assert.doesNotMatch(implementation, /window\.location/);
    assert.doesNotMatch(implementation, /useStateMachineInput/);
  }

  assert.match(component, /data-movie-buff-authoritative-schema-version/);
  assert.match(component, /data-movie-buff-authoritative-server-now/);
});
