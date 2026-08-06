import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const wrapper = fs.readFileSync(
  "src/lib/server/movieBuffBoardRaceSafe.ts",
  "utf8",
);
const route = fs.readFileSync(
  "src/app/api/movie-buff/match/view/route.ts",
  "utf8",
);

test("match view uses the race-safe board bootstrap", () => {
  assert.match(
    route,
    /ensureMovieBuffBoardForRoomRaceSafe\(body\.roomId\)/,
  );
  assert.doesNotMatch(
    route,
    /from "@\/lib\/server\/movieBuffBoard"/,
  );
});

test("only the exact one-board-per-room unique conflict enters recovery", () => {
  assert.match(wrapper, /candidate\.code === "23505"/);
  assert.match(wrapper, /duplicate key value violates unique constraint/);
  assert.match(wrapper, /movie_buff_boards_room_id_key/);
  assert.match(wrapper, /namesExactRoomConstraint && identifiesUniqueViolation/);
  assert.match(wrapper, /if \(!isBoardCreationRace\(error\)\) throw error/);
});

test("losing requests wait for complete categories and tiles", () => {
  assert.match(wrapper, /movie_buff_board_categories/);
  assert.match(wrapper, /movie_buff_board_tiles/);
  assert.match(wrapper, /categoryCount > 0 && tileCount === board\.total_tiles_count/);
  assert.match(wrapper, /BOARD_READY_ATTEMPTS = 60/);
  assert.match(wrapper, /BOARD_READY_DELAY_MS = 100/);
});

test("recovery reuses the persisted winner instead of mutating grants", () => {
  const calls = wrapper.match(/ensureMovieBuffBoardForRoomUnsafe\(roomId\)/g) ?? [];
  assert.equal(calls.length, 2);
  assert.doesNotMatch(wrapper, /grant\s|revoke\s|security definer/i);
});
