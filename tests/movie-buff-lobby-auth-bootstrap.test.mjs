import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  "src/app/games/movie-buff/lobby/page.tsx",
  "utf8",
);
const bootstrap = fs.readFileSync(
  "src/app/games/movie-buff/lobby/LobbyAuthBootstrap.tsx",
  "utf8",
);

test("lobby page mounts the persisted-session bootstrap before LobbyClient", () => {
  assert.match(page, /import MovieBuffLobbyAuthBootstrap/);
  assert.match(page, /<MovieBuffLobbyAuthBootstrap/);
  assert.doesNotMatch(page, /<MovieBuffLobbyClient/);
});

test("bootstrap resolves persisted auth before rendering LobbyClient", () => {
  assert.match(bootstrap, /const user = await getCurrentUser\(\)/);
  assert.match(bootstrap, /if \(!user \|\| user\.is_anonymous === true\)/);
  assert.match(bootstrap, /router\.replace\(signInPath\)/);
  assert.match(bootstrap, /setAuthReady\(true\)/);
  assert.match(bootstrap, /if \(!authReady\)/);
  assert.match(bootstrap, /<MovieBuffLobbyClient/);
});

test("bootstrap fails closed and prevents stale async completion", () => {
  assert.match(bootstrap, /let isMounted = true/);
  assert.match(bootstrap, /let authResolved = false/);
  assert.match(bootstrap, /if \(!isMounted \|\| authResolved\)/);
  assert.match(bootstrap, /catch \{/);
  assert.match(bootstrap, /window\.clearTimeout\(retryTimer\)/);
});
