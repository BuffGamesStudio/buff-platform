import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const playPage = fs.readFileSync(
  path.join(
    repoRoot,
    "src/app/games/movie-buff/play/page.tsx",
  ),
  "utf8",
);
const timerMigration = fs.readFileSync(
  path.join(
    repoRoot,
    "supabase/migrations/20260816140000_movie_buff_playback_timer_gate.sql",
  ),
  "utf8",
);

assert.match(
  playPage,
  /media\.readyState\s+>=\s+HTMLMediaElement\.HAVE_CURRENT_DATA/,
  "timeupdate fallback must require media data before starting the clock",
);
assert.match(
  playPage,
  /const displayedTimeValue[\s\S]*Waiting for playback/,
  "pre-play UI must not display answer seconds",
);
assert.match(
  timerMigration,
  /get_movie_buff_round_player_time_left\(/,
  "round RPC must use the caller's player clock",
);
assert.doesNotMatch(
  playPage,
  /await media\.play\(\);[\s\S]{0,240}syncPlaybackStarted\(/,
  "a resolved play() promise must not start the answer clock",
);
assert.doesNotMatch(
  playPage,
  /if \(!media\.paused\) \{\s*void syncPlaybackStarted\(/,
  "beginMedia must wait for playing/timeupdate instead of play() resolution",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      test: "movie-buff-playback-timer-regression",
      checks: [
        "playable media gate",
        "pre-play timer display",
        "per-player round RPC clock",
        "no play-promise clock start",
      ],
    },
    null,
    2,
  ),
);
