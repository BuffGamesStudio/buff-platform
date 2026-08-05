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
const { getMovieBuffVipCanonicalNavigationTarget } = await import(
  "../src/lib/game/movieBuffVipPhasePolicy.ts"
);

const migration = fs.readFileSync(
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
  "utf8",
);
const releaseHardening = fs.readFileSync(
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "utf8",
);
const roundIntro = fs.readFileSync(
  "src/app/games/movie-buff/round-intro/page.tsx",
  "utf8",
);
const roundIntroLayout = fs.readFileSync(
  "src/app/games/movie-buff/round-intro/layout.tsx",
  "utf8",
);
const vipService = fs.readFileSync(
  "src/lib/game/movieBuffVipService.ts",
  "utf8",
);
const personaHarness = fs.readFileSync(
  "scripts/movie-buff-vip-authority-personas.mjs",
  "utf8",
);
const adversarialHarness = fs.readFileSync(
  "scripts/movie-buff-vip-authority-adversarial.mjs",
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

test("all required locks or an expired deadline make only the VIP condition ready", () => {
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
  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: null,
    }),
    null,
  );
});

test("window, lock, and activation creation are transaction serialized", () => {
  assert.match(migration, /movie-buff-vip-window\|/);
  assert.match(migration, /movie-buff-vip-lock\|/);
  assert.match(migration, /movie-buff-vip-activation\|/);
  assert.ok((migration.match(/pg_advisory_xact_lock/gi) ?? []).length >= 4);
});

test("required humans are persisted and compared by exact identity", () => {
  assert.match(migration, /movie_buff_vip_round_required_players/);
  assert.match(migration, /p_required_player_ids\s+uuid\[\]/);
  assert.match(migration, /v_existing_ids\s+is distinct from\s+v_required_ids/i);
  assert.match(migration, /nonmember or nonparticipant/i);
  assert.match(migration, /Explicit required-human participant IDs are required/i);
});

test("required-player release is idempotent but contradictory release fails", () => {
  assert.match(releaseHardening, /status', 'unavailable'/i);
  assert.match(releaseHardening, /'released', false/i);
  assert.match(releaseHardening, /'idempotent', true/i);
  assert.match(releaseHardening, /already released with a different reason/i);
  assert.match(releaseHardening, /released_at is null/i);
  assert.match(releaseHardening, /required\.released_at is null/i);
  assert.match(releaseHardening, /to service_role/i);
  assert.doesNotMatch(releaseHardening, /to authenticated/i);
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

test("VIP readiness cannot navigate; only an allowlisted canonical phase route can", () => {
  const boardTarget = getMovieBuffVipCanonicalNavigationTarget({
    currentPath: "/games/movie-buff/round-intro",
    roomId: "room-a",
    phaseView: {
      roomId: "room-a",
      roundId: "round-a",
      roundNumber: 2,
      phase: "board_select",
      phaseVersion: 7,
      phaseRoute: "/games/movie-buff/board-preview",
    },
  });
  assert.equal(
    boardTarget,
    "/games/movie-buff/board-preview?roomId=room-a&round=2",
  );

  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: {
        roomId: "room-a",
        roundId: "round-a",
        roundNumber: 2,
        phase: "vip_lock",
        phaseVersion: 6,
        phaseRoute: "/games/movie-buff/round-intro",
      },
    }),
    null,
  );

  assert.equal(
    getMovieBuffVipCanonicalNavigationTarget({
      currentPath: "/games/movie-buff/round-intro",
      roomId: "room-a",
      phaseView: {
        roomId: "room-a",
        roundId: "round-a",
        roundNumber: 2,
        phase: "board_select",
        phaseVersion: 7,
        phaseRoute: "https://example.com/escape",
      },
    }),
    null,
  );
});

test("Round Intro consumes the canonical view read-only", () => {
  assert.doesNotMatch(roundIntro, /board-preview/);
  assert.doesNotMatch(roundIntro, /leaveCurrentRoom/);
  assert.match(roundIntro, /Waiting for the authoritative shared phase/i);
  assert.match(roundIntroLayout, /getMovieBuffVipCanonicalPhaseView/);
  assert.match(roundIntroLayout, /getMovieBuffVipCanonicalNavigationTarget/);
  assert.match(roundIntroLayout, /phaseVersion < latestVersion\.current/);
  assert.match(roundIntroLayout, /router\.replace\(target\)/);
  assert.doesNotMatch(roundIntroLayout, /advanceReady/);
  assert.doesNotMatch(roundIntroLayout, /match\/advance/);
  assert.match(vipService, /\/api\/movie-buff\/match\/view/);
  assert.match(vipService, /response\.status === 404/);
  assert.doesNotMatch(vipService, /\/api\/movie-buff\/match\/advance/);
});

test("original persona harness covers core API and reconnect behavior", () => {
  assert.match(personaHarness, /Refusing non-local \$\{label\} target/i);
  assert.match(personaHarness, /requireLocal\(supabaseUrl, "Supabase"\)/);
  assert.match(personaHarness, /requireLocal\(appUrl, "application"\)/);
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

test("adversarial harness is exact-SHA local-only and covers repaired gaps", () => {
  assert.match(adversarialHarness, /MOVIE_BUFF_EXPECTED_GIT_SHA/);
  assert.match(adversarialHarness, /MOVIE_BUFF_EVIDENCE_COMMAND/);
  assert.match(adversarialHarness, /MOVIE_BUFF_ALLOW_LOCAL_DELETIONS/);
  assert.match(adversarialHarness, /git["'], \["rev-parse", "HEAD"\]/);
  assert.match(adversarialHarness, /createHash\("sha256"\)/);
  assert.match(adversarialHarness, /Refusing non-local \$\{label\} target/i);
  assert.match(adversarialHarness, /requireLocal\(supabaseUrl, "Supabase"\)/);
  assert.match(adversarialHarness, /requireLocal\(appUrl, "application"\)/);
  assert.match(adversarialHarness, /concurrent|Promise\.all/);
  for (const term of [
    "safe idempotent no-op",
    "immutable identity snapshot",
    "identical and contradictory lock races",
    "different reason",
    "old lock no longer count",
    "wrong phase fails",
    "concurrent activation consumes exactly once",
  ]) {
    assert.match(adversarialHarness, new RegExp(term, "i"));
  }
});
