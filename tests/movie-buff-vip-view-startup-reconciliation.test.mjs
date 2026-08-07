import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL(
  "../src/app/api/movie-buff/vip/view/route.ts",
  import.meta.url,
);

test("VIP view route absorbs the bounded round-start unavailable race", async () => {
  const source = await readFile(routePath, "utf8");

  assert.match(source, /const VIP_VIEW_STARTUP_ATTEMPTS = 40;/);
  assert.match(source, /const VIP_VIEW_STARTUP_RETRY_MS = 125;/);
  assert.match(source, /value\.status === "unavailable"/);
  assert.match(
    source,
    /for \(let attempt = 0; attempt < VIP_VIEW_STARTUP_ATTEMPTS; attempt \+= 1\)/,
  );
  assert.match(source, /client\.rpc\("get_movie_buff_vip_round_view"/);
  assert.match(
    source,
    /if \(!isUnavailableVipView\(view\) \|\| attempt === VIP_VIEW_STARTUP_ATTEMPTS - 1\)/,
  );
  assert.match(source, /await waitForVipViewRetry\(\);/);
  assert.match(source, /"Cache-Control": "no-store, max-age=0"/);

  const rpcCalls = source.match(/client\.rpc\("get_movie_buff_vip_round_view"/g) ?? [];
  assert.equal(rpcCalls.length, 1, "the retry loop must wrap one canonical RPC call");

  const authorizationIndex = source.indexOf("requireMovieBuffVipCaller(request)");
  const validationIndex = source.indexOf("isMovieBuffVipUuid(body.roomId)");
  const retryIndex = source.indexOf("for (let attempt = 0;");
  assert.ok(authorizationIndex >= 0 && authorizationIndex < retryIndex);
  assert.ok(validationIndex >= 0 && validationIndex < retryIndex);
});
