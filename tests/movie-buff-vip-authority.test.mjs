import assert from "node:assert/strict";
import fs from "node:fs";
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

const migration = fs.readFileSync(
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "utf8",
);
const roundIntro = fs.readFileSync(
  "src/app/games/movie-buff/round-intro/page.tsx",
  "utf8",
);
const personaHarness = fs.readFileSync(
  "scripts/movie-buff-vip-authority-personas.mjs",
  "utf8",
);

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

test("identical and contradictory choices are distinguished", () => {
  assert.equal(isSameMovieBuffVipSelection("vip-a", "vip-a"), true);
  assert.equal(isSameMovieBuffVipSelection(null, null), true);
  assert.equal(isSameMovieBuffVipSelection("vip-a", "vip-b"), false);
  assert.equal(isSameMovieBuffVipSelection(null, "vip-b"), false);
});

test("browser refresh cannot extend a server deadline", () => {
  const deadline = "2026-08-04T12:00:00.000Z";
  assert.equal(
    getMovieBuffVipRemainingSeconds("2026-08-04T11:59:50.000Z", deadline),
    10,
  );
  assert.equal(
    getMovieBuffVipRemainingSeconds("2026-08-04T11:59:55.000Z", deadline),
    5,
  );
});

test("deadline and missing-model conditions fail closed", () => {
  assert.equal(
    isMovieBuffVipDeadlineExpired(
      "2026-08-04T12:00:00.000Z",
      "2026-08-04T12:00:00.000Z",
    ),
    true,
  );
  assert.equal(isMovieBuffVipDeadlineExpired(new Date(), null), true);
  assert.equal(getMovieBuffVipRemainingSeconds(new Date(), null), 0);
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

test("all required locks or an expired deadline make the VIP window ready", () => {
  assert.equal(
    shouldAdvanceMovieBuffVipWindow({
      status: "open",
      lockedCount: 3,
      requiredPlayerCount: 3,
      deadlineExpired: false,
    }),
    true,
  );
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

test("window and lock creation are transaction-serialized", () => {
  assert.match(migration, /movie-buff-vip-window\|/);
  assert.match(migration, /movie-buff-vip-lock\|/);
  assert.match(migration, /movie-buff-vip-activation\|/);
  assert.ok((migration.match(/pg_advisory_xact_lock/gi) ?? []).length >= 4);
});

test("required humans are persisted by identity, not count alone", () => {
  assert.match(migration, /movie_buff_vip_round_required_players/);
  assert.match(
    migration,
    /p_required_player_ids\s+uuid\[\]/,
  );
  assert.match(migration, /Explicit required-human participant IDs are required/i);
  assert.match(migration, /release_movie_buff_vip_required_player/);
});

test("selection eligibility is separate from later activation phase", () => {
  const lockSection = migration.split(
    /create or replace function public\.lock_movie_buff_round_vip/i,
  )[1];
  assert.ok(lockSection);
  assert.doesNotMatch(
    lockSection.split(/create or replace function public\.activate_movie_buff_round_vip/i)[0],
    /activation_window\s*<>\s*'round_intro'/i,
  );
  assert.match(migration, /eligibility_configured/);
  assert.match(migration, /allowed_room_types/);
  assert.match(migration, /allowed_difficulties/);
  assert.match(migration, /minimum_round_number/);
});

test("activation revalidates definition, inventory, context, and phase", () => {
  const activation = migration.split(
    /create or replace function public\.activate_movie_buff_round_vip/i,
  )[1];
  assert.match(activation, /movie_buff_vip_ineligibility_reason/);
  assert.match(activation, /expires_at/);
  assert.match(activation, /cooldown_until/);
  assert.match(activation, /activation_phase/);
  assert.match(activation, /quantity_remaining\s*>\s*0/);
  assert.match(activation, /different request/i);
});

test("Round Intro never routes from VIP readiness or invokes legacy leave", () => {
  assert.doesNotMatch(roundIntro, /board-preview/);
  assert.doesNotMatch(roundIntro, /leaveCurrentRoom/);
  assert.match(roundIntro, /Waiting for the authoritative shared phase/i);
});

test("persona harness is local-only and covers required adversarial families", () => {
  assert.match(personaHarness, /Refusing non-local Supabase/i);
  assert.match(personaHarness, /Refusing non-local application/i);
  for (const term of [
    "unowned VIP is rejected",
    "exhausted quantity is rejected",
    "wrong room is rejected",
    "wrong round is rejected",
    "nonmember is rejected",
    "private unused selection does not leak",
    "reconnect restores lock",
    "activation consumes exactly once",
    "inactive client cannot stall",
    "missing window and inventory model fails closed",
  ]) {
    assert.match(personaHarness, new RegExp(term, "i"));
  }
});
