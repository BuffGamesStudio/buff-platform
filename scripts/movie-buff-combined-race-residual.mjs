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

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  MOVIE_BUFF_LOCAL_DATABASE_URL: databaseUrl,
  MOVIE_BUFF_PHASE_TEST_USERS: usersJson,
  MOVIE_BUFF_EXPECTED_GIT_SHA: expectedSha,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed;
}
requireLocal(supabaseUrl, "Supabase");
requireLocal(databaseUrl, "database");

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedSha);

const users = JSON.parse(usersJson);
assert.equal(users.length, 3);
assert.equal(new Set(users.map((user) => user.email)).size, 3);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];
const roomIds = new Set();

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  sourceSha: checkoutSha,
  target: "disposable-localhost",
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
  cleanup: [],
};

function record(name, classification, details = {}) {
  const item = {
    name,
    classification,
    observedAt: new Date().toISOString(),
    details,
  };
  evidence.checks.push(item);
  if (classification === "FAIL") evidence.failures.push(item);
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function uuid() {
  return crypto.randomUUID();
}
function ownerSql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "--set=ON_ERROR_STOP=1", "-Atq", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

async function rpc(index, name, args) {
  const result = await clients[index].rpc(name, args);
  return result;
}

async function view(index, roomId) {
  const { data, error } = await rpc(index, "get_movie_buff_match_phase_view", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

function createContext(roundNumber = 1) {
  const roomId = uuid();
  const matchId = uuid();
  const roundId = uuid();
  const now = new Date().toISOString();
  const roomCode = uuid().replaceAll("-", "").slice(0, 8).toUpperCase();
  const playerIds = sessions.map((session) => session.user.id);
  const roomPlayers = playerIds
    .map(
      (playerId, index) =>
        `(${quote(roomId)}::uuid,${quote(playerId)}::uuid,true,${index === 0},null,${quote(now)}::timestamptz,${quote(now)}::timestamptz)`,
    )
    .join(",");
  const matchPlayers = playerIds
    .map((playerId) => `(${quote(matchId)}::uuid,${quote(playerId)}::uuid)`)
    .join(",");

  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${quote(roomId)}::uuid,${quote(roomCode)},${quote(playerIds[0])}::uuid,'private','active','medium',2,3,${roundNumber},false,${quote(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,difficulty,total_rounds,status,started_at)
    values
      (${quote(matchId)}::uuid,${quote(roomId)}::uuid,'medium',2,'active',${quote(now)}::timestamptz);
    insert into public.match_players (match_id,player_id) values ${matchPlayers};
    insert into public.match_rounds
      (id,match_id,round_number,time_limit_seconds,started_at)
    values
      (${quote(roundId)}::uuid,${quote(matchId)}::uuid,${roundNumber},5,null);
    commit;
  `);
  roomIds.add(roomId);
  return { roomId, matchId, roundId, playerIds };
}

function stateRow(matchId) {
  return JSON.parse(
    ownerSql(`
      select row_to_json(state)::text
      from public.movie_buff_match_phase_state as state
      where state.match_id=${quote(matchId)}::uuid;
    `),
  );
}

function countEvents(matchId, fromPhase, toPhase) {
  return Number(
    ownerSql(`
      select count(*)
      from public.movie_buff_match_phase_events
      where match_id=${quote(matchId)}::uuid
        and from_phase=${quote(fromPhase)}
        and to_phase=${quote(toPhase)};
    `),
  );
}

async function advanceMany(roomId, expectedVersion, count = 12) {
  const promises = Array.from({ length: count }, (_, index) =>
    rpc(index % clients.length, "advance_movie_buff_match_phase", {
      p_room_id: roomId,
      p_expected_version: expectedVersion,
    }),
  );
  return Promise.all(promises);
}

async function testExactlyOncePhaseAndVipDeadline() {
  const context = createContext();
  const initial = await view(0, context.roomId);
  assert.equal(initial.phase, "round_intro");
  ownerSql(`
    update public.movie_buff_match_phase_state
    set phase_ends_at=pg_catalog.clock_timestamp()-interval '1 second'
    where match_id=${quote(context.matchId)}::uuid;
  `);

  const introRace = await advanceMany(context.roomId, initial.phaseVersion, 15);
  for (const result of introRace) {
    if (result.error) throw result.error;
  }
  const vipState = stateRow(context.matchId);
  assert.equal(vipState.phase, "vip_lock");
  assert.equal(Number(vipState.phase_version), Number(initial.phaseVersion) + 1);
  assert.equal(countEvents(context.matchId, "round_intro", "vip_lock"), 1);
  assert.equal(
    Number(
      ownerSql(`select count(*) from public.movie_buff_vip_round_windows where round_id=${quote(context.roundId)}::uuid;`),
    ),
    1,
  );
  assert.equal(
    Number(
      ownerSql(`select count(*) from public.movie_buff_vip_round_required_players where round_id=${quote(context.roundId)}::uuid and released_at is null;`),
    ),
    3,
  );
  record("exactly-once round_intro to vip_lock transition", "PASS", {
    concurrentWorkers: introRace.length,
    phaseVersion: vipState.phase_version,
  });
  record("private VIP required-human snapshot", "PASS", {
    requiredHumans: 3,
  });

  const deadline = new Date(Date.now() - 1000).toISOString();
  ownerSql(`
    update public.movie_buff_vip_round_windows
    set deadline_at=${quote(deadline)}::timestamptz, updated_at=pg_catalog.clock_timestamp()
    where round_id=${quote(context.roundId)}::uuid;
    update public.movie_buff_match_phase_state
    set phase_ends_at=${quote(deadline)}::timestamptz
    where match_id=${quote(context.matchId)}::uuid;
  `);

  const vipRace = await advanceMany(context.roomId, vipState.phase_version, 15);
  for (const result of vipRace) {
    if (result.error) throw result.error;
  }
  const boardState = stateRow(context.matchId);
  assert.equal(boardState.phase, "board_select");
  assert.equal(Number(boardState.phase_version), Number(vipState.phase_version) + 1);
  assert.equal(countEvents(context.matchId, "vip_lock", "board_select"), 1);
  const passCount = Number(
    ownerSql(`
      select count(*)
      from public.movie_buff_vip_round_locks
      where round_id=${quote(context.roundId)}::uuid
        and vip_id is null
        and inventory_id is null;
    `),
  );
  assert.equal(passCount, 3);
  assert.equal(
    Number(
      ownerSql(`select count(distinct player_id) from public.movie_buff_vip_round_locks where round_id=${quote(context.roundId)}::uuid;`),
    ),
    3,
  );
  record("private VIP deadline finalization", "PASS", {
    concurrentWorkers: vipRace.length,
    explicitNoVipPasses: passCount,
  });
  record("exactly-once vip_lock to board_select transition", "PASS", {
    eventCount: 1,
    phaseVersion: boardState.phase_version,
  });
}

async function testDuplicateExpiryWorkers() {
  const context = createContext();
  const initial = await view(1, context.roomId);
  ownerSql(`
    update public.movie_buff_match_phase_state
    set phase_ends_at=pg_catalog.clock_timestamp()-interval '1 second'
    where match_id=${quote(context.matchId)}::uuid;
  `);
  const introAdvance = await rpc(1, "advance_movie_buff_match_phase", {
    p_room_id: context.roomId,
    p_expected_version: initial.phaseVersion,
  });
  if (introAdvance.error) throw introAdvance.error;
  const vipState = stateRow(context.matchId);
  assert.equal(vipState.phase, "vip_lock");

  const expiredPlayerId = context.playerIds[0];
  ownerSql(`
    update public.movie_buff_match_participant_seats
    set participant_state='reconnect_grace',
        controller_type='human',
        controller_player_id=original_player_id,
        last_seen_at=pg_catalog.clock_timestamp()-interval '60 seconds',
        reconnect_deadline_at=pg_catalog.clock_timestamp()-interval '1 second',
        abandoned_at=null,
        replacement_ready_at=null
    where match_id=${quote(context.matchId)}::uuid
      and original_player_id=${quote(expiredPlayerId)}::uuid;
  `);

  const workers = await Promise.all([
    ...Array.from({ length: 12 }, (_, index) =>
      rpc((index % 2) + 1, "advance_movie_buff_match_phase", {
        p_room_id: context.roomId,
        p_expected_version: vipState.phase_version,
      }),
    ),
    rpc(0, "touch_movie_buff_match_participant", {
      p_room_id: context.roomId,
    }),
  ]);
  for (const result of workers) {
    if (result.error && !/abandoned|access denied/i.test(result.error.message)) {
      throw result.error;
    }
  }

  const seat = JSON.parse(
    ownerSql(`
      select row_to_json(seat)::text
      from public.movie_buff_match_participant_seats as seat
      where seat.match_id=${quote(context.matchId)}::uuid
        and seat.original_player_id=${quote(expiredPlayerId)}::uuid;
    `),
  );
  assert.equal(seat.participant_state, "abandoned");
  assert.ok(seat.abandoned_at);
  assert.ok(seat.replacement_ready_at);
  const memberLeftCount = Number(
    ownerSql(`
      select count(*) from public.room_players
      where room_id=${quote(context.roomId)}::uuid
        and player_id=${quote(expiredPlayerId)}::uuid
        and left_at is not null;
    `),
  );
  assert.equal(memberLeftCount, 1);
  const requiredRows = Number(
    ownerSql(`
      select count(*) from public.movie_buff_vip_round_required_players
      where round_id=${quote(context.roundId)}::uuid
        and player_id=${quote(expiredPlayerId)}::uuid;
    `),
  );
  const releasedRows = Number(
    ownerSql(`
      select count(*) from public.movie_buff_vip_round_required_players
      where round_id=${quote(context.roundId)}::uuid
        and player_id=${quote(expiredPlayerId)}::uuid
        and released_at is not null;
    `),
  );
  assert.equal(requiredRows, 1);
  assert.equal(releasedRows, 1);
  record("duplicate reconnect-expiry workers", "PASS", {
    concurrentWorkers: workers.length,
    stableSeatRows: 1,
    releasedVipRequirementRows: releasedRows,
    roomMembershipRowsMarkedLeft: memberLeftCount,
  });

  const currentState = stateRow(context.matchId);
  assert.equal(currentState.phase, "vip_lock");
  assert.equal(seat.controller_type, "human");
  record("Buster inactivity during VIP", "PASS", {
    phase: currentState.phase,
    controllerType: seat.controller_type,
  });

  const deadline = new Date(Date.now() - 1000).toISOString();
  ownerSql(`
    update public.movie_buff_vip_round_windows
    set deadline_at=${quote(deadline)}::timestamptz
    where round_id=${quote(context.roundId)}::uuid;
    update public.movie_buff_match_phase_state
    set phase_ends_at=${quote(deadline)}::timestamptz
    where match_id=${quote(context.matchId)}::uuid;
  `);
  const boardAdvance = await advanceMany(
    context.roomId,
    currentState.phase_version,
    10,
  );
  for (const result of boardAdvance) {
    if (result.error) throw result.error;
  }
  const boardView = await view(1, context.roomId);
  assert.equal(boardView.phase, "board_select");
  const activatedSeat = JSON.parse(
    ownerSql(`
      select row_to_json(seat)::text
      from public.movie_buff_match_participant_seats as seat
      where seat.match_id=${quote(context.matchId)}::uuid
        and seat.original_player_id=${quote(expiredPlayerId)}::uuid;
    `),
  );
  assert.equal(activatedSeat.controller_type, "buster");
  record("Buster activation only at board-safe boundary", "PASS", {
    phase: boardView.phase,
    controllerType: activatedSeat.controller_type,
  });
}

function testLeaveAuthoritySurface() {
  const functions = ownerSql(`
    select coalesce(json_agg(p.proname order by p.proname)::text,'[]')
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'get_movie_buff_active_leave_quote',
        'confirm_movie_buff_active_leave',
        'finalize_movie_buff_reconnect_expiry'
      );
  `);
  const names = JSON.parse(functions);
  const hasQuote = names.includes("get_movie_buff_active_leave_quote");
  const hasConfirm = names.includes("confirm_movie_buff_active_leave");
  if (!hasQuote || !hasConfirm) {
    record("exactly-once leave penalties", "FAIL", {
      reason: "authoritative active-leave quote/confirm RPC surface is absent",
      discoveredFunctions: names,
    });
    return;
  }
  record("exactly-once leave penalties", "UNKNOWN", {
    reason:
      "leave RPCs exist but this residual probe requires an owning policy/ledger fixture before duplicate confirmation can be safely executed",
    discoveredFunctions: names,
  });
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

  await testExactlyOncePhaseAndVipDeadline();
  await testDuplicateExpiryWorkers();
  testLeaveAuthoritySurface();

  evidence.classification = evidence.failures.length > 0 ? "FAIL" : "PASS";
} catch (error) {
  record("residual laboratory execution", "FAIL", {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
  });
  evidence.classification = "FAIL";
} finally {
  for (const roomId of [...roomIds].reverse()) {
    try {
      ownerSql(`delete from public.game_rooms where id=${quote(roomId)}::uuid;`);
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
    failures: evidence.failures.length,
  }),
);
if (evidence.classification === "FAIL") process.exitCode = 1;
