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
  assert.match(bootstrap, /subscribeToAuthChanges/);
  assert.match(bootstrap, /resolveUser\(session\?\.user \?\? null\)/);
  assert.match(bootstrap, /if \(user\.is_anonymous === true\)/);
  assert.match(bootstrap, /router\.replace\(signInPath\)/);
  assert.match(bootstrap, /setAuthReady\(true\)/);
  assert.match(bootstrap, /if \(!authReady\)/);
  assert.match(bootstrap, /<MovieBuffLobbyClient/);
});

test("null initial session waits for bounded restoration before redirect", () => {
  assert.match(bootstrap, /if \(user === null\) \{\s*return false;/s);
  assert.match(bootstrap, /persistedSessionGraceMs = 1500/);
  assert.match(bootstrap, /const retryUser = await getCurrentUser\(\)/);
  assert.match(bootstrap, /if \(resolveUser\(retryUser\)\)/);
  assert.match(bootstrap, /redirectFailClosed\(\)/);
  assert.doesNotMatch(bootstrap, /if \(!user \|\| user\.is_anonymous === true\)/);
});

test("bootstrap fails closed and prevents stale async completion", () => {
  assert.match(bootstrap, /let isMounted = true/);
  assert.match(bootstrap, /let authResolved = false/);
  assert.match(bootstrap, /if \(!isMounted \|\| authResolved\)/);
  assert.match(bootstrap, /clearRetryTimer\(\)/);
  assert.match(bootstrap, /unsubscribe\?\.\(\)/);
  assert.match(bootstrap, /catch \{/);
});
