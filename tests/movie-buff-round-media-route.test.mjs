import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(
  new URL(
    "../src/app/api/movie-buff/round-media/[roundId]/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("round media resolves the authoritative asset and redirects GET playback", () => {
  assert.match(routeSource, /getRoundGeneratedClip\(roundId\)/);
  assert.match(routeSource, /if \(!headOnly \|\| !summary\.assetPath\)/);
  assert.match(routeSource, /NextResponse\.redirect/);
  assert.match(routeSource, /new URL\(assetUrl, internalRequestUrl\)/);
  assert.match(routeSource, /X-Movie-Buff-Asset-Url/);
});

test("loopback redirects preserve the browser-facing forwarded or Host origin", () => {
  assert.match(routeSource, /getRequestOrigin/);
  assert.match(routeSource, /x-forwarded-host/);
  assert.match(routeSource, /request\.headers\.get\("host"\)/);
  assert.match(routeSource, /x-forwarded-proto/);
  assert.match(routeSource, /browserOrigin/);
  assert.match(routeSource, /resolvedAsset\.pathname/);
  assert.match(routeSource, /resolvedAsset\.search/);
});

test("round media delegates browser range delivery to the concrete public asset", () => {
  assert.doesNotMatch(routeSource, /createReadStream/);
  assert.doesNotMatch(routeSource, /Readable\.toWeb/);
  assert.doesNotMatch(routeSource, /Content-Range/);
  assert.doesNotMatch(routeSource, /request\.headers\.get\("range"\)/);
});

test("HEAD still reports concrete generated asset metadata", () => {
  assert.match(routeSource, /await fsp\.stat\(summary\.assetPath\)/);
  assert.match(routeSource, /"Accept-Ranges": "bytes"/);
  assert.match(routeSource, /"Content-Length": stats\.size\.toString\(\)/);
  assert.match(routeSource, /headOnly/);
});
