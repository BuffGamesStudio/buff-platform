import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const lobby = fs.readFileSync(
  "src/app/games/movie-buff/lobby/LobbyClient.tsx",
  "utf8",
);

test("lobby defers an empty INITIAL_SESSION until explicit session lookup", () => {
  assert.match(
    lobby,
    /event\s*===\s*"INITIAL_SESSION"\s*&&\s*!session\?\.user/,
  );
  assert.match(
    lobby,
    /\.then\(\(user\)\s*=>\s*\{\s*void resolveAuthenticatedUser\(user\);\s*\}\)/s,
  );
  assert.doesNotMatch(
    lobby,
    /\.then\(\(user\)\s*=>\s*\{\s*if\s*\(user\)/s,
  );
});

test("lobby still resolves signed-out and authenticated auth events", () => {
  assert.match(lobby, /subscribeToAuthChanges\(\s*\(event, session\)/s);
  assert.match(lobby, /session\?\.user\s*\?\?\s*null/);
  assert.match(lobby, /!user\s*\|\|\s*user\.is_anonymous\s*===\s*true/);
  assert.match(lobby, /router\.replace\(/);
});
