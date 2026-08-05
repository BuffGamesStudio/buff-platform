import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const phaseService = fs.readFileSync(
  "src/lib/game/movieBuffPhaseService.ts",
  "utf8",
);
const contract = fs.readFileSync(
  "docs/product/movie-buff-authoritative-phase-vip-participant-leave-v1.md",
  "utf8",
);

test("canonical routes are derived from authoritative phase names", () => {
  assert.match(
    phaseService,
    /phase === "round_intro" \|\| phase === "vip_lock"[\s\S]*return "\/games\/movie-buff\/round-intro"/,
  );
  assert.match(
    phaseService,
    /phase === "board_select"[\s\S]*return "\/games\/movie-buff\/board-preview"/,
  );
  assert.match(
    phaseService,
    /phase === "transition" \|\| phase === "playback" \|\| phase === "answer"[\s\S]*return "\/games\/movie-buff\/play"/,
  );
  assert.match(
    phaseService,
    /phase === "results"[\s\S]*return "\/games\/movie-buff\/round-results"/,
  );
  assert.match(
    phaseService,
    /phase === "finished"[\s\S]*return "\/games\/movie-buff\/final-results"/,
  );
  assert.match(phaseService, /return "\/games\/movie-buff\/match-status"/);
});

test("navigation changes only when canonical route differs", () => {
  assert.match(
    phaseService,
    /const target = getMovieBuffCanonicalRoute\(phase\)/,
  );
  assert.match(phaseService, /return currentPath === target \? null : target/);
  assert.doesNotMatch(phaseService, /setTimeout\([\s\S]*router/i);
});

test("contract forbids browser, local timer, and animation authority", () => {
  assert.match(contract, /browser may render timers, animations, and routes, but it may not create, extend, skip, or advance a phase/i);
  assert.match(contract, /Animation completion callbacks cannot advance the match/i);
  assert.match(contract, /Normal-path controls named `Start Round`/i);
});

test("contract defines human, Buster, and system authority", () => {
  assert.match(contract, /Lobby membership is not active-match authority/i);
  assert.match(contract, /Buster is not a fake user profile/i);
  assert.match(contract, /The `system` is not a seat or player/i);
  assert.match(contract, /`room_players\.left_at is null` alone is not an active-human predicate/i);
});

test("contract defines VIP auto-pass and active leave authority", () => {
  assert.match(contract, /Deadline expiry creates server no-VIP pass records/i);
  assert.match(contract, /Buster never receives a VIP/i);
  assert.match(contract, /get_movie_buff_active_leave_quote/i);
  assert.match(contract, /confirm_movie_buff_active_leave/i);
  assert.match(contract, /cannot double-charge/i);
});

test("launch timing is server-owned", () => {
  for (const requiredText of [
    "round introduction: 4 seconds",
    "VIP lock: 15 seconds",
    "selector window: 20 seconds",
    "reconnect grace: 45 seconds",
    "Buster takeover delay: 2 seconds",
  ]) {
    assert.match(contract, new RegExp(requiredText, "i"));
  }
});
