import assert from "node:assert/strict";
import test from "node:test";

import {
  canEnsureMovieBuffBoard,
  canSelectMovieBuffBoardTile,
  isActiveMovieBuffMembership,
  parseBearerToken,
} from "../src/lib/server/movieBuffBoardRoutePolicy.ts";

test("anonymous requests have no bearer token", () => {
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(""), null);
  assert.equal(parseBearerToken("Basic abc"), null);
});

test("valid bearer tokens are parsed exactly", () => {
  assert.equal(parseBearerToken("Bearer token-123"), "token-123");
  assert.equal(parseBearerToken("bearer token-123"), "token-123");
  assert.equal(parseBearerToken("Bearer token extra"), null);
});

test("nonmember and inactive member fail active membership", () => {
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

test("valid active member passes active membership", () => {
  assert.equal(
    isActiveMovieBuffMembership({
      player_id: "active",
      is_host: false,
      left_at: null,
    }),
    true,
  );
});

test("existing board may be loaded by any active member", () => {
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: true, isHost: false }),
    true,
  );
});

test("missing board may only be created by host", () => {
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: false, isHost: false }),
    false,
  );
  assert.equal(
    canEnsureMovieBuffBoard({ boardExists: false, isHost: true }),
    true,
  );
});

test("valid selector may select a tile on the room board", () => {
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
