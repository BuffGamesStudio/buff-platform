import assert from "node:assert/strict";
import test from "node:test";

const {
  getMovieBuffVipRemainingSeconds,
  isMovieBuffVipDeadlineExpired,
  isMovieBuffVipUuid,
  isSameMovieBuffVipSelection,
  normalizeMovieBuffVipIdempotencyKey,
  parseMovieBuffVipBearerToken,
  shouldAdvanceMovieBuffVipWindow,
} = await import("../src/lib/server/movieBuffVipRoutePolicy.ts");

test("bearer identity is strict and caller supplied identity is unnecessary", () => {
  assert.equal(parseMovieBuffVipBearerToken(null), null);
  assert.equal(parseMovieBuffVipBearerToken("Basic token"), null);
  assert.equal(parseMovieBuffVipBearerToken("Bearer token extra"), null);
  assert.equal(parseMovieBuffVipBearerToken("bearer access-token"), "access-token");
});

test("room, round, and VIP identifiers must be UUIDs", () => {
  assert.equal(isMovieBuffVipUuid("not-a-room"), false);
  assert.equal(isMovieBuffVipUuid("00000000-0000-4000-8000-000000000001"), true);
});

test("idempotency keys reject missing, tiny, or oversized values", () => {
  assert.equal(normalizeMovieBuffVipIdempotencyKey(null), null);
  assert.equal(normalizeMovieBuffVipIdempotencyKey("short"), null);
  assert.equal(normalizeMovieBuffVipIdempotencyKey("x".repeat(129)), null);
  assert.equal(normalizeMovieBuffVipIdempotencyKey(" lock-key-123 "), "lock-key-123");
});

test("identical duplicate lock is idempotent", () => {
  assert.equal(isSameMovieBuffVipSelection("vip-a", "vip-a"), true);
  assert.equal(isSameMovieBuffVipSelection(null, null), true);
});

test("contradictory duplicate lock is rejected by selection comparison", () => {
  assert.equal(isSameMovieBuffVipSelection("vip-a", "vip-b"), false);
  assert.equal(isSameMovieBuffVipSelection(null, "vip-b"), false);
});

test("browser refresh cannot extend a server deadline", () => {
  const deadline = "2026-08-04T12:00:00.000Z";
  assert.equal(getMovieBuffVipRemainingSeconds("2026-08-04T11:59:50.000Z", deadline), 10);
  assert.equal(getMovieBuffVipRemainingSeconds("2026-08-04T11:59:55.000Z", deadline), 5);
});

test("lock after deadline is classified expired", () => {
  assert.equal(
    isMovieBuffVipDeadlineExpired(
      "2026-08-04T12:00:00.000Z",
      "2026-08-04T12:00:00.000Z",
    ),
    true,
  );
});

test("missing deadline fails closed", () => {
  assert.equal(isMovieBuffVipDeadlineExpired(new Date(), null), true);
  assert.equal(getMovieBuffVipRemainingSeconds(new Date(), null), 0);
});

test("all required locks cause early advancement", () => {
  assert.equal(
    shouldAdvanceMovieBuffVipWindow({
      status: "open",
      lockedCount: 3,
      requiredPlayerCount: 3,
      deadlineExpired: false,
    }),
    true,
  );
});

test("inactive player cannot stall an expired window", () => {
  assert.equal(
    shouldAdvanceMovieBuffVipWindow({
      status: "open",
      lockedCount: 1,
      requiredPlayerCount: 3,
      deadlineExpired: true,
    }),
    true,
  );
});

test("missing inventory/window remains unavailable rather than advanceable", () => {
  assert.equal(
    shouldAdvanceMovieBuffVipWindow({
      status: "unavailable",
      lockedCount: 0,
      requiredPlayerCount: 0,
      deadlineExpired: true,
    }),
    false,
  );
});
