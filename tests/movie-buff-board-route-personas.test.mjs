import assert from "node:assert/strict";
import test from "node:test";

const {
  canEnsureMovieBuffBoard,
  canSelectMovieBuffBoardTile,
  isActiveMovieBuffMembership,
  parseBearerToken,
} = await import("../src/lib/server/movieBuffBoardRoutePolicy.ts");

test("anonymous request is rejected before membership lookup", () => {
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(""), null);
  assert.equal(parseBearerToken("Basic abc"), null);
});

test("valid bearer token is accepted exactly", () => {
  assert.equal(parseBearerToken("Bearer token-123"), "token-123");
  assert.equal(parseBearerToken("bearer token-123"), "token-123");
  assert.equal(parseBearerToken("Bearer token extra"), null);
});

test("nonmember and inactive member are denied", () => {
  assert.equal(isActiveMovieBuffMembership(null), false);
  assert.equal(
    isActiveMovieBuffMembership({
      player_id: "inactive",
      is_host: false,
      left_at: "2026-08-03T00:00:00Z",
    }),
    false,
  );
});

test("valid active member may load an existing board", () => {
  assert.equal(
    isActiveMovieBuffMembership({
      player_id: "active",
      is_host: false,
      left_at: null,
    }),
    true,
  );
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: true, isHost: false }),
    true,
  );
});

test("only host may create a missing board", () => {
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: false, isHost: false }),
    false,
  );
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: false, isHost: true }),
    true,
  );
});

test("current selector may select a tile on the same board", () => {
  assert.equal(
    canSelectMovieBuffBoardTile({
      actorPlayerId: "selector",
      selectorPlayerId: "selector",
      tileBelongsToBoard: true,
    }),
    true,
  );
});

test("non-selector and cross-room tile are denied", () => {
  assert.equal(
    canSelectMovieBuffBoardTile({
      actorPlayerId: "other-member",
      selectorPlayerId: "selector",
      tileBelongsToBoard: true,
    }),
    false,
  );
  assert.equal(
    canSelectMovieBuffBoardTile({
      actorPlayerId: "selector",
      selectorPlayerId: "selector",
      tileBelongsToBoard: false,
    }),
    false,
  );
});
