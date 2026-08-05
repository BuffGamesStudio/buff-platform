import assert from "node:assert/strict";
import test from "node:test";

const {
  getMovieBuffVipCanonicalNavigationTarget,
  isMovieBuffVipCanonicalPhase,
} = await import("../src/lib/game/movieBuffVipPhasePolicy.ts");

const baseView = {
  roomId: "room-a",
  roundId: "round-a",
  roundNumber: 2,
  phase: "board_select",
  phaseVersion: 7,
  phaseRoute: "/games/movie-buff/board-preview",
};

test("canonical phase names are validated", () => {
  assert.equal(isMovieBuffVipCanonicalPhase("vip_lock"), true);
  assert.equal(isMovieBuffVipCanonicalPhase("board_select"), true);
  assert.equal(isMovieBuffVipCanonicalPhase("vip_selection"), false);
  assert.equal(isMovieBuffVipCanonicalPhase("external"), false);
});

test("missing canonical view never navigates", () => {
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: null,
    }),
    null,
  );
});

test("matching board phase and route produce an internal destination", () => {
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: baseView,
    }),
    "/games/movie-buff/board-preview?roomId=room-a&round=2",
  );
});

test("room mismatch, current route, and external routes fail closed", () => {
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-b",
      phaseView: baseView,
    }),
    null,
  );
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/board-preview",
      roomId: "room-a",
      phaseView: baseView,
    }),
    null,
  );
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: { ...baseView, phaseRoute: "https://example.com" },
    }),
    null,
  );
});

test("allowlisted but phase-contradictory route fails closed", () => {
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: {
        ...baseView,
        phase: "vip_lock",
        phaseRoute: "/games/movie-buff/board-preview",
      },
    }),
    null,
  );
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: {
        ...baseView,
        phase: "results",
        phaseRoute: "/games/movie-buff/play",
      },
    }),
    null,
  );
});
