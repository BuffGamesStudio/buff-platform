import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
const usersJson = process.env.MOVIE_BUFF_PHASE_TEST_USERS;
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-combined-race-residual.json",
);

for (const [key, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  MOVIE_BUFF_LOCAL_DATABASE_URL: databaseUrl,
  MOVIE_BUFF_PHASE_TEST_USERS: usersJson,
  MOVIE_BUFF_EXPECTED_GIT_SHA: expectedSha,
})) {
  if (!value) throw new Error(`${key} is required.`);
}

for (const [label, value] of [
  ["Supabase", supabaseUrl],
  ["database", databaseUrl],
]) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
}

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedSha);

const users = JSON.parse(usersJson);
assert.equal(users.length, 3);
assert.equal(new Set(users.map((user) => user.email)).size, 3);

const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sessions = [];
const ownedRooms = new Set();

const evidence = {
  schemaVersion: 2,
  classification: "UNKNOWN",
  sourceSha: checkoutSha,
  target: "disposable-localhost",
  startedAt: new Date().toISOString(),
  checks: [],
  cleanup: [],
};

function record(name, classification, details = {}) {
  evidence.checks.push({
    name,
    classification,
    details,
    observedAt: new Date().toISOString(),
  });
}
function hasCheck(name) {
  return evidence.checks.some((item) => item.name === name);
}
function recordMissing(names, error) {
  const details = {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
  };
  for (const name of names) {
    if (!hasCheck(name)) record(name, "FAIL", details);
  }
}
function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function ownerSql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "--set=ON_ERROR_STOP=1", "-Atq", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
async function rpc(index, name, args) {
  return clients[index].rpc(name, args);
}
async function view(index, roomId) {
  const { data, error } = await rpc(index, "get_movie_buff_match_phase_view", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

function createContext() {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  const playerIds = sessions.map((session) => session.user.id);
  const roomPlayers = playerIds
    .map(
      (id, index) =>
        `(${q(roomId)}::uuid,${q(id)}::uuid,true,${index === 0},null,${q(now)}::timestamptz,${q(now)}::timestamptz)`,
    )
    .join(",");
  const matchPlayers = playerIds
    .map((id) => `(${q(matchId)}::uuid,${q(id)}::uuid)`)
    .join(",");
  const roomCode = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();

  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${q(roomId)}::uuid,${q(roomCode)},${q(playerIds[0])}::uuid,'private','active','medium',2,3,1,false,${q(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,difficulty,total_rounds,status,started_at)
    values
      (${q(matchId)}::uuid,${q(roomId)}::uuid,'medium',2,'active',${q(now)}::timestamptz);
    insert into public.match_players (match_id,player_id) values ${matchPlayers};
    insert into public.match_rounds
      (id,match_id,round_number,time_limit_seconds,started_at)
    values
      (${q(roundId)}::uuid,${q(matchId)}::uuid,1,5,null);
    commit;
  `);
  ownedRooms.add(roomId);
  return { roomId, matchId, roundId, playerIds };
}

function phaseState(matchId) {
  return JSON.parse(
    ownerSql(`
      select row_to_json(s)::text
      from public.movie_buff_match_phase_state s
      where s.match_id=${q(matchId)}::uuid;
    `),
  );
}
function transitionEventCount(matchId, fromPhase, toPhase) {
  return Number(
    ownerSql(`
      select count(*)
      from public.movie_buff_match_phase_events
      where match_id=${q(matchId)}::uuid
        and from_phase=${q(fromPhase)}
        and to_phase=${q(toPhase)};
    `),
  );
}
function expirePhase(matchId) {
  ownerSql(`
    update public.movie_buff_match_phase_state
    set phase_started_at=clock_timestamp()-interval '2 seconds',
        phase_ends_at=clock_timestamp()-interval '1 second'
    where match_id=${q(matchId)}::uuid;
  `);
}
function expireVipWindow(matchId, roundId) {
  const deadline = new Date(Date.now() - 1000).toISOString();
  ownerSql(`
    update public.movie_buff_vip_round_windows
    set deadline_at=${q(deadline)}::timestamptz,
        updated_at=clock_timestamp()
    where round_id=${q(roundId)}::uuid;
    update public.movie_buff_match_phase_state
    set phase_started_at=${q(new Date(Date.now() - 2000).toISOString())}::timestamptz,
        phase_ends_at=${q(deadline)}::timestamptz
    where match_id=${q(matchId)}::uuid;
  `);
}
async function advanceMany(roomId, expectedVersion, count, workerIndexes) {
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      rpc(workerIndexes[index % workerIndexes.length], "advance_movie_buff_match_phase", {
        p_room_id: roomId,
        p_expected_version: expectedVersion,
      }),
    ),
  );
}
function assertNoRpcErrors(results, allowed = null) {
  for (const result of results) {
    if (!result.error) continue;
    if (allowed && allowed.test(result.error.message)) continue;
    throw result.error;
  }
}

async function runPhaseAndVipRace() {
  const names = [
    "exactly-once round_intro to vip_lock transition",
    "private VIP required-human snapshot",
    "private VIP deadline finalization",
    "exactly-once vip_lock to board_select transition",
  ];
  try {
    const context = createContext();
    const initial = await view(0, context.roomId);
    assert.equal(initial.phase, "round_intro");
    expirePhase(context.matchId);

    const introWorkers = await advanceMany(
      context.roomId,
      initial.phaseVersion,
      15,
      [0, 1, 2],
    );
    assertNoRpcErrors(introWorkers);
    const vip = phaseState(context.matchId);
    assert.equal(vip.phase, "vip_lock");
    assert.equal(Number(vip.phase_version), Number(initial.phaseVersion) + 1);
    assert.equal(transitionEventCount(context.matchId, "round_intro", "vip_lock"), 1);
    record("exactly-once round_intro to vip_lock transition", "PASS", {
      concurrentWorkers: introWorkers.length,
      phaseVersion: vip.phase_version,
      transitionEvents: 1,
    });

    const required = Number(
      ownerSql(`
        select count(*)
        from public.movie_buff_vip_round_required_players
        where round_id=${q(context.roundId)}::uuid
          and released_at is null;
      `),
    );
    assert.equal(required, 3);
    assert.equal(
      Number(
        ownerSql(`
          select count(*)
          from public.movie_buff_vip_round_windows
          where round_id=${q(context.roundId)}::uuid;
        `),
      ),
      1,
    );
    record("private VIP required-human snapshot", "PASS", {
      requiredHumans: required,
      privateWindowRows: 1,
    });

    expireVipWindow(context.matchId, context.roundId);
    const vipWorkers = await advanceMany(
      context.roomId,
      vip.phase_version,
      15,
      [0, 1, 2],
    );
    assertNoRpcErrors(vipWorkers);
    const board = phaseState(context.matchId);
    assert.equal(board.phase, "board_select");
    assert.equal(Number(board.phase_version), Number(vip.phase_version) + 1);
    assert.equal(transitionEventCount(context.matchId, "vip_lock", "board_select"), 1);
    const passCount = Number(
      ownerSql(`
        select count(*)
        from public.movie_buff_vip_round_locks
        where round_id=${q(context.roundId)}::uuid
          and vip_id is null
          and inventory_id is null;
      `),
    );
    assert.equal(passCount, 3);
    assert.equal(
      Number(
        ownerSql(`
          select count(distinct player_id)
          from public.movie_buff_vip_round_locks
          where round_id=${q(context.roundId)}::uuid;
        `),
      ),
      3,
    );
    record("private VIP deadline finalization", "PASS", {
      concurrentWorkers: vipWorkers.length,
      explicitNoVipPasses: passCount,
    });
    record("exactly-once vip_lock to board_select transition", "PASS", {
      phaseVersion: board.phase_version,
      transitionEvents: 1,
    });
  } catch (error) {
    recordMissing(names, error);
  }
}

async function runExpiryAndBusterRace() {
  const names = [
    "duplicate reconnect-expiry workers",
    "Buster inactivity during VIP",
    "Buster activation only at board-safe boundary",
  ];
  try {
    const context = createContext();
    const initial = await view(1, context.roomId);
    expirePhase(context.matchId);
    const intro = await rpc(1, "advance_movie_buff_match_phase", {
      p_room_id: context.roomId,
      p_expected_version: initial.phaseVersion,
    });
    if (intro.error) throw intro.error;
    const vip = phaseState(context.matchId);
    assert.equal(vip.phase, "vip_lock");

    const expiredPlayerId = context.playerIds[0];
    ownerSql(`
      update public.movie_buff_match_participant_seats
      set participant_state='reconnect_grace',
          controller_type='human',
          controller_player_id=original_player_id,
          last_seen_at=clock_timestamp()-interval '60 seconds',
          reconnect_deadline_at=clock_timestamp()-interval '1 second',
          abandoned_at=null,
          replacement_ready_at=null
      where match_id=${q(context.matchId)}::uuid
        and original_player_id=${q(expiredPlayerId)}::uuid;
    `);

    const expiryWorkers = await Promise.all([
      ...Array.from({ length: 16 }, (_, index) =>
        rpc((index % 2) + 1, "advance_movie_buff_match_phase", {
          p_room_id: context.roomId,
          p_expected_version: vip.phase_version,
        }),
      ),
      rpc(0, "touch_movie_buff_match_participant", {
        p_room_id: context.roomId,
      }),
    ]);
    assertNoRpcErrors(expiryWorkers, /abandoned|access denied/i);

    const seat = JSON.parse(
      ownerSql(`
        select row_to_json(s)::text
        from public.movie_buff_match_participant_seats s
        where s.match_id=${q(context.matchId)}::uuid
          and s.original_player_id=${q(expiredPlayerId)}::uuid;
      `),
    );
    assert.equal(seat.participant_state, "abandoned");
    assert.ok(seat.abandoned_at);
    assert.ok(seat.replacement_ready_at);
    const leftRows = Number(
      ownerSql(`
        select count(*)
        from public.room_players
        where room_id=${q(context.roomId)}::uuid
          and player_id=${q(expiredPlayerId)}::uuid
          and left_at is not null;
      `),
    );
    const releasedRows = Number(
      ownerSql(`
        select count(*)
        from public.movie_buff_vip_round_required_players
        where round_id=${q(context.roundId)}::uuid
          and player_id=${q(expiredPlayerId)}::uuid
          and released_at is not null;
      `),
    );
    assert.equal(leftRows, 1);
    assert.equal(releasedRows, 1);
    record("duplicate reconnect-expiry workers", "PASS", {
      concurrentWorkers: expiryWorkers.length,
      stableSeatRows: 1,
      membershipRowsMarkedLeft: leftRows,
      releasedVipRequirementRows: releasedRows,
    });

    const vipAfterExpiry = phaseState(context.matchId);
    assert.equal(vipAfterExpiry.phase, "vip_lock");
    assert.equal(seat.controller_type, "human");
    record("Buster inactivity during VIP", "PASS", {
      phase: vipAfterExpiry.phase,
      controllerType: seat.controller_type,
    });

    expireVipWindow(context.matchId, context.roundId);
    const boardWorkers = await advanceMany(
      context.roomId,
      vipAfterExpiry.phase_version,
      16,
      [1, 2],
    );
    assertNoRpcErrors(boardWorkers);
    const boardView = await view(1, context.roomId);
    assert.equal(boardView.phase, "board_select");
    const activatedSeat = JSON.parse(
      ownerSql(`
        select row_to_json(s)::text
        from public.movie_buff_match_participant_seats s
        where s.match_id=${q(context.matchId)}::uuid
          and s.original_player_id=${q(expiredPlayerId)}::uuid;
      `),
    );
    assert.equal(activatedSeat.controller_type, "buster");
    record("Buster activation only at board-safe boundary", "PASS", {
      concurrentWorkers: boardWorkers.length,
      phase: boardView.phase,
      controllerType: activatedSeat.controller_type,
    });
  } catch (error) {
    recordMissing(names, error);
  }
}

function runLeaveSurfaceProbe() {
  try {
    const functions = JSON.parse(
      ownerSql(`
        select coalesce(json_agg(p.proname order by p.proname)::text,'[]')
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname in (
            'get_movie_buff_active_leave_quote',
            'confirm_movie_buff_active_leave'
          );
      `),
    );
    const ready =
      functions.includes("get_movie_buff_active_leave_quote") &&
      functions.includes("confirm_movie_buff_active_leave");
    if (!ready) {
      record("exactly-once leave penalties", "FAIL", {
        reason: "authoritative active-leave quote/confirm RPC surface is absent",
        discoveredFunctions: functions,
      });
      return;
    }
    record("exactly-once leave penalties", "UNKNOWN", {
      reason:
        "active-leave RPC surface exists, but no approved penalty policy/ledger fixture was discoverable for safe duplicate-confirm execution",
      discoveredFunctions: functions,
    });
  } catch (error) {
    recordMissing(["exactly-once leave penalties"], error);
  }
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw error ?? new Error(`Unable to authenticate player ${index + 1}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );

  await runPhaseAndVipRace();
  await runExpiryAndBusterRace();
  runLeaveSurfaceProbe();

  const classifications = evidence.checks.map((item) => item.classification);
  evidence.classification = classifications.includes("FAIL")
    ? "FAIL"
    : classifications.includes("UNKNOWN")
      ? "UNKNOWN"
      : "PASS";
} catch (error) {
  record("residual laboratory setup", "FAIL", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
  });
  evidence.classification = "FAIL";
} finally {
  for (const roomId of [...ownedRooms].reverse()) {
    try {
      ownerSql(`delete from public.game_rooms where id=${q(roomId)}::uuid;`);
      evidence.cleanup.push({ roomId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({
        roomId,
        classification: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(
  JSON.stringify({
    outputPath,
    classification: evidence.classification,
    checks: evidence.checks.length,
  }),
);
if (evidence.classification === "FAIL") process.exitCode = 1;
