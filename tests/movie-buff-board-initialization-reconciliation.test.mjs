import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helperPath = new URL(
  "../src/lib/server/movieBuffBoardInitialization.ts",
  import.meta.url,
);
const routePath = new URL(
  "../src/app/api/movie-buff/match/view/route.ts",
  import.meta.url,
);

test("match view reconciles concurrent board initialization", async () => {
  const helper = await readFile(helperPath, "utf8");
  const route = await readFile(routePath, "utf8");

  assert.match(helper, /BOARD_RECONCILIATION_ATTEMPTS = 80/);
  assert.match(helper, /BOARD_RECONCILIATION_RETRY_MS = 125/);
  assert.match(helper, /__movieBuffBoardInitializations/);
  assert.match(helper, /initializations\.get\(roomId\)/);
  assert.match(helper, /initializations\.set\(roomId, initialization\)/);
  assert.match(helper, /initializations\.delete\(roomId\)/);
  assert.match(helper, /movie_buff_boards_room_id_key/);
  assert.match(helper, /duplicate key value/);
  assert.match(helper, /preview\.categories\.length > 0/);
  assert.match(helper, /category\.tiles\.length > 0/);
  assert.match(helper, /await waitForBoardRetry\(\)/);
  assert.match(helper, /Movie Buff board initialization did not converge/);

  assert.match(
    route,
    /ensureReconciledMovieBuffBoardForRoom\(body\.roomId\)/,
  );
  assert.doesNotMatch(route, /ensureMovieBuffBoardForRoom\(body\.roomId\)/);

  const authorizationIndex = route.indexOf("requireMovieBuffPhaseMember(");
  const initializationIndex = route.indexOf(
    "ensureReconciledMovieBuffBoardForRoom(body.roomId)",
  );
  assert.ok(authorizationIndex >= 0 && authorizationIndex < initializationIndex);
});
