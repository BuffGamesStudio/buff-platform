import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const board = fs.readFileSync(
  "src/components/movie-buff/MovieBuffBoardRoomClient.tsx",
  "utf8",
);
const play = fs.readFileSync(
  "src/components/movie-buff/MovieBuffAuthoritativePlayClient.tsx",
  "utf8",
);
const transition = fs.readFileSync(
  "src/components/movie-buff/visual/MovieBuffTransitionSurface.tsx",
  "utf8",
);
const usedTile = fs.readFileSync(
  "src/components/movie-buff/visual/MovieBuffUsedTileStamp.tsx",
  "utf8",
);
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("MOV-18 presentation runtime is composed with a pinned dependency", () => {
  assert.equal(packageJson.dependencies["@rive-app/react-webgl2"], "4.30.0");
  assert.match(transition, /MovieBuffRiveSurface/);
  assert.match(transition, /never delays or advances gameplay/);
});

test("authoritative board imports only the passive used-tile stamp", () => {
  assert.match(board, /MovieBuffUsedTileStamp/);
  assert.match(board, /<MovieBuffUsedTileStamp \/>/);
  assert.match(usedTile, /Scene Complete/);
  assert.doesNotMatch(usedTile, /onClick|fetch\(|router|startMatchAction/);
});

test("selector authority and atomic tile lock remain server owned", () => {
  assert.match(board, /selectMovieBuffAuthoritativeTile/);
  assert.match(board, /phase\.phase !== "board_select"/);
  assert.match(board, /!phase\.callerIsSelector/);
  assert.match(board, /phase\.phaseVersion/);
  assert.match(board, /disabled=\{disabled\}/);
  assert.match(board, /const disabled = !isAvailable \|\| pendingTile !== null \|\| !canSelect/);
});

test("board keeps PR #3 cinematic hierarchy without prototype authority", () => {
  assert.match(board, /Shared Game Board/);
  assert.match(board, /Scoreboard/);
  assert.match(board, /bg-gradient-to-b from-red-950\/55/);
  assert.match(board, /text-amber-300/);
  assert.doesNotMatch(board, /startMatchAction|router\.push\(|Continue to Clip Round|Next Round/);
});

test("transition presentation is gated by the authoritative phase", () => {
  assert.match(play, /const isTransition = phase\.phase === "transition"/);
  assert.match(play, /isTransition \? \(/);
  assert.match(play, /<MovieBuffTransitionSurface kind="filmSlate">/);
  assert.doesNotMatch(transition, /setTimeout|setInterval|fetch\("\/api\/movie-buff\/match/);
});

test("shared playback remains bound to one server timestamp", () => {
  assert.match(play, /phase\?\.playbackStartsAt/);
  assert.match(play, /new Date\(startsAt\)\.getTime\(\)/);
  assert.match(play, /Date\.now\(\) \+ serverOffsetMs/);
  assert.match(play, /playAtAuthoritativeOffset/);
  assert.match(play, /media\.currentTime = boundedTarget/);
});

test("answer authority and deadlines remain unchanged", () => {
  assert.match(play, /phase\?\.answerDeadlineAt/);
  assert.match(play, /phase\?\.phase !== "answer"/);
  assert.match(play, /submitMovieBuffAnswer/);
  assert.match(play, /requestMovieBuffRoundHint/);
  assert.doesNotMatch(play, /Next Round|Continue to Clip Round|router\.push\(/);
});

test("visual failures and reduced motion cannot advance gameplay", () => {
  assert.match(transition, /authoritative playback timestamp/);
  assert.doesNotMatch(transition, /advanceMovieBuff|selectMovieBuff|submitMovieBuff|requestMovieBuff/);
  assert.doesNotMatch(usedTile, /advanceMovieBuff|selectMovieBuff|submitMovieBuff|requestMovieBuff/);
});
