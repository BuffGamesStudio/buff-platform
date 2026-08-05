import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const databaseUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
const usersJson = process.env.MOVIE_BUFF_TEST_USERS;
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-pr64-concurrency.json",
);

for (const [key, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MOVIE_BUFF_LOCAL_DATABASE_URL: databaseUrl,
  MOVIE_BUFF_TEST_USERS: usersJson,
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
assert.equal(checkoutSha, expectedSha, "exact checkout SHA mismatch");

const users = JSON.parse(usersJson);
assert.equal(users.length, 4, "four disposable users are required");
assert.equal(new Set(users.map((user) => user.email)).size, 4);

const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];
const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  sourceSha: checkoutSha,
  productCompositionSha: "0093e72777ebf48754b32e98306f705edec66321",
  productCompositionTree: "083e1ebb0190fc48865ccc2fce406a3ad454c552",
  target: "disposable-localhost",
  startedAt: new Date().toISOString(),
  checks: [],
};
let activeStage = "authentication";

function record(name, classification, details = {}) {
  evidence.checks.push({ name, classification, details });
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
async function phaseView(index, roomId) {
  const { data, error } = await rpc(index, "get_movie_buff_match_phase_view", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}
function phaseState(matchId) {
  return JSON.parse(
    ownerSql(`select row_to_json(s)::text from public.movie_buff_match_phase_state s where s.match_id=${q(matchId)}::uuid;`),
  );
}
function seatState(matchId, playerId) {
  return JSON.parse(
    ownerSql(`select row_to_json(s)::text from public.movie_buff_match_participant_seats s where s.match_id=${q(matchId)}::uuid and s.original_player_id=${q(playerId)}::uuid;`),
  );
}
function count(sql) {
  return Number(ownerSql(sql));
}
function roomScore(roomId, playerId) {
  return Number(ownerSql(`select score from public.room_players where room_id=${q(roomId)}::uuid and player_id=${q(playerId)}::uuid;`));
}
function createContext(playerIndexes = [0, 1, 2], score = 25) {
  const roomId = randomUUID();
  const matchId = randomUUID();
  const roundId = randomUUID();
  const now = new Date().toISOString();
  const playerIds = playerIndexes.map((index) => sessions[index].user.id);
  const roomCode = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const roomPlayers = playerIds.map((id, index) =>
    `(${q(roomId)}::uuid,${q(id)}::uuid,true,${index === 0},${score},null,${q(now)}::timestamptz,${q(now)}::timestamptz)`,
  ).join(",");
  const matchPlayers = playerIds.map((id) =>
    `(${q(matchId)}::uuid,${q(id)}::uuid,${score})`,
  ).join(",");
  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${q(roomId)}::uuid,${q(roomCode)},${q(playerIds[0])}::uuid,'private','active','medium',2,${playerIds.length},1,false,${q(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,score,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,difficulty,total_rounds,status,started_at)
    values
      (${q(matchId)}::uuid,${q(roomId)}::uuid,'medium',2,'active',${q(now)}::timestamptz);
    insert into public.match_players (match_id,player_id,final_score)
    values ${matchPlayers};
    insert into public.match_rounds
      (id,match_id,round_number,time_limit_seconds,started_at)
    values
      (${q(roundId)}::uuid,${q(matchId)}::uuid,1,5,null);
    commit;
  `);
  return { roomId, matchId, roundId, playerIds, playerIndexes };
}
function expirePhase(matchId) {
  ownerSql(`
    update public.movie_buff_match_phase_state
    set phase_started_at=clock_timestamp()-interval '2 seconds',
        phase_ends_at=clock_timestamp()-interval '1 second'
    where match_id=${q(matchId)}::uuid;
  `);
}
function expireVip(matchId, roundId) {
  ownerSql(`
    update public.movie_buff_vip_round_windows
    set opens_at=clock_timestamp()-interval '3 seconds',
        deadline_at=clock_timestamp()-interval '1 second',
        updated_at=clock_timestamp()
    where round_id=${q(roundId)}::uuid;
    update public.movie_buff_match_phase_state
    set phase_started_at=clock_timestamp()-interval '3 seconds',
        phase_ends_at=clock_timestamp()-interval '1 second'
    where match_id=${q(matchId)}::uuid;
  `);
}
function configurePolicy(reason, version, penalty, ttl = 120) {
  ownerSql(`
    update public.movie_buff_leave_penalty_policies
    set is_active=false,
        effective_until=coalesce(effective_until,clock_timestamp()),
        updated_at=clock_timestamp()
    where reason=${q(reason)} and is_active;
    insert into public.movie_buff_leave_penalty_policies
      (policy_version,reason,penalty_points,quote_ttl_seconds,effective_from,is_active)
    values
      (${q(version)},${q(reason)},${penalty},${ttl},clock_timestamp()-interval '1 minute',true);
  `);
}
function completeVipPasses(context, activePlayerIndexes) {
  const values = activePlayerIndexes.map((index) => {
    const playerId = context.playerIds[index];
    return `(${q(context.roomId)}::uuid,${q(context.matchId)}::uuid,${q(context.roundId)}::uuid,${q(playerId)}::uuid,null,null,${q(`validation-no-vip-${randomUUID()}`)},clock_timestamp())`;
  }).join(",");
  ownerSql(`
    insert into public.movie_buff_vip_round_locks
      (room_id,match_id,round_id,player_id,vip_id,inventory_id,idempotency_key,locked_at)
    values ${values}
    on conflict (round_id,player_id) do nothing;
  `);
}
async function advanceMany(context, expectedVersion, amount, allowedIndexes) {
  return Promise.all(Array.from({ length: amount }, (_, offset) =>
    rpc(allowedIndexes[offset % allowedIndexes.length], "advance_movie_buff_match_phase", {
      p_room_id: context.roomId,
      p_expected_version: expectedVersion,
    }),
  ));
}
function assertNoUnexpectedErrors(results, allowed = null) {
  for (const result of results) {
    if (!result.error) continue;
    if (allowed?.test(result.error.message)) continue;
    throw result.error;
  }
}
async function quote(index, roomId) {
  return rpc(index, "get_movie_buff_active_leave_quote", { p_room_id: roomId });
}
async function confirm(index, token, idempotencyKey) {
  return rpc(index, "confirm_movie_buff_active_leave", {
    p_quote_token: token,
    p_idempotency_key: idempotencyKey,
  });
}

async function runBusterBoundaryRace() {
  const context = createContext([0, 1, 2], 25);
  const disconnectPolicy = `validation-disconnect-${randomUUID()}`;
  configurePolicy("disconnect_grace_expired", disconnectPolicy, 3, 120);

  const initial = await phaseView(1, context.roomId);
  assert.equal(initial.phase, "round_intro");
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
    rpc(0, "touch_movie_buff_match_participant", { p_room_id: context.roomId }),
  ]);
  assertNoUnexpectedErrors(
    expiryWorkers,
    /abandoned|access denied|reconnect|active room membership/i,
  );

  const abandoned = seatState(context.matchId, expiredPlayerId);
  assert.equal(abandoned.participant_state, "abandoned");
  assert.equal(abandoned.controller_type, "human");
  assert.ok(abandoned.replacement_ready_at);
  assert.equal(
    count(`select count(*) from public.movie_buff_leave_penalty_ledger where match_id=${q(context.matchId)}::uuid and player_id=${q(expiredPlayerId)}::uuid and reason='disconnect_grace_expired';`),
    1,
  );
  assert.equal(roomScore(context.roomId, expiredPlayerId), 22);
  assert.equal(
    count(`select count(*) from public.movie_buff_match_phase_events where match_id=${q(context.matchId)}::uuid and event_type='participant_abandoned' and actor_player_id=${q(expiredPlayerId)}::uuid and payload->>'reason'='disconnect_grace_expired';`),
    1,
  );

  completeVipPasses(context, [1, 2]);
  expireVip(context.matchId, context.roundId);
  const boardWorkers = await advanceMany(context, vip.phase_version, 16, [1, 2]);
  assertNoUnexpectedErrors(boardWorkers, /phase version|already advanced|stale/i);
  const board = await phaseView(1, context.roomId);
  const activated = seatState(context.matchId, expiredPlayerId);
  assert.equal(board.phase, "board_select");
  assert.equal(activated.controller_type, "buster");
  assert.equal(
    count(`select count(*) from public.movie_buff_match_phase_events where match_id=${q(context.matchId)}::uuid and event_type='buster_activated_at_safe_boundary' and payload->>'originalPlayerId'=${q(expiredPlayerId)};`),
    1,
  );

  record("disconnect expiry charges once and stages Buster during VIP", "PASS", {
    concurrentWorkers: expiryWorkers.length,
    ledgerRows: 1,
    scoreBefore: 25,
    scoreAfter: 22,
    controllerDuringVip: abandoned.controller_type,
  });
  record("Buster activates atomically on concurrent VIP-to-board entry", "PASS", {
    concurrentWorkers: boardWorkers.length,
    controllerAfterBoundary: activated.controller_type,
    phase: board.phase,
  });
}

async function runLeaveConcurrency() {
  const context = createContext([0, 1, 2], 25);
  await phaseView(0, context.roomId);

  const absent = await quote(0, context.roomId);
  assert.ok(absent.error);
  assert.match(absent.error.message, /voluntary-leave policy is configured/i);
  record("leave quote fails closed without operator policy", "PASS");

  const policy = `validation-voluntary-${randomUUID()}`;
  configurePolicy("voluntary_active_leave", policy, 7, 120);
  const quoted = await quote(0, context.roomId);
  if (quoted.error) throw quoted.error;
  assert.equal(quoted.data.policyVersion, policy);
  assert.equal(quoted.data.penaltyPoints, 7);

  const idem = `leave-${randomUUID()}`;
  const confirmations = await Promise.all(
    Array.from({ length: 17 }, () =>
      confirm(0, quoted.data.quoteToken, idem),
    ),
  );
  assertNoUnexpectedErrors(confirmations);
  const serialized = confirmations.map((item) => JSON.stringify(item.data));
  assert.equal(new Set(serialized).size, 1);
  assert.equal(confirmations[0].data.scoreBefore, 25);
  assert.equal(confirmations[0].data.scoreAfter, 18);

  assert.equal(
    count(`select count(*) from public.movie_buff_active_leave_quotes where match_id=${q(context.matchId)}::uuid and player_id=${q(context.playerIds[0])}::uuid and confirmed_at is not null and idempotency_key=${q(idem)};`),
    1,
  );
  assert.equal(
    count(`select count(*) from public.movie_buff_leave_penalty_ledger where match_id=${q(context.matchId)}::uuid and player_id=${q(context.playerIds[0])}::uuid and reason='voluntary_active_leave';`),
    1,
  );
  assert.equal(
    count(`select count(*) from public.movie_buff_match_phase_events where match_id=${q(context.matchId)}::uuid and event_type='participant_abandoned' and actor_player_id=${q(context.playerIds[0])}::uuid and payload->>'reason'='voluntary_active_leave';`),
    1,
  );
  assert.equal(roomScore(context.roomId, context.playerIds[0]), 18);
  assert.equal(
    count(`select count(*) from public.room_players where room_id=${q(context.roomId)}::uuid and player_id=${q(context.playerIds[0])}::uuid and left_at is not null;`),
    1,
  );

  const contradictory = await confirm(
    0,
    quoted.data.quoteToken,
    `different-${randomUUID()}`,
  );
  assert.ok(contradictory.error);
  assert.match(contradictory.error.message, /contradictory duplicate/i);

  const rejoin = await rpc(0, "touch_movie_buff_match_participant", {
    p_room_id: context.roomId,
  });
  assert.ok(rejoin.error);

  record("17 concurrent leave confirmations converge exactly once", "PASS", {
    concurrentConfirmations: confirmations.length,
    quoteRows: 1,
    penaltyLedgerRows: 1,
    abandonmentEvents: 1,
    scoreBefore: 25,
    scoreAfter: 18,
  });
  record("contradictory replay and same-match resume fail closed", "PASS", {
    contradictoryMessage: contradictory.error.message,
    resumeMessage: rejoin.error.message,
  });
}

async function runNoHumanCancellation() {
  const context = createContext([0, 1, 2], 10);
  await phaseView(0, context.roomId);
  const policy = `validation-cancel-${randomUUID()}`;
  configurePolicy("voluntary_active_leave", policy, 1, 120);

  for (let index = 0; index < 3; index += 1) {
    const quoted = await quote(index, context.roomId);
    if (quoted.error) throw quoted.error;
    const confirmed = await confirm(
      index,
      quoted.data.quoteToken,
      `cancel-${index}-${randomUUID()}`,
    );
    if (confirmed.error) throw confirmed.error;
  }

  assert.equal(
    ownerSql(`select status from public.matches where id=${q(context.matchId)}::uuid;`),
    "cancelled",
  );
  assert.equal(
    ownerSql(`select status from public.game_rooms where id=${q(context.roomId)}::uuid;`),
    "cancelled",
  );
  assert.equal(
    ownerSql(`select phase from public.movie_buff_match_phase_state where match_id=${q(context.matchId)}::uuid;`),
    "abandoned",
  );
  assert.equal(
    count(`select count(*) from public.movie_buff_leave_penalty_ledger where match_id=${q(context.matchId)}::uuid and reason='voluntary_active_leave';`),
    3,
  );
  assert.equal(
    count(`select count(*) from public.movie_buff_match_phase_events where match_id=${q(context.matchId)}::uuid and event_type='no_humans_remaining';`),
    1,
  );

  record("last human leave cancels match and room exactly once", "PASS", {
    penaltyLedgerRows: 3,
    finalPhase: "abandoned",
    matchStatus: "cancelled",
    roomStatus: "cancelled",
  });
}

try {
  await Promise.all(clients.map(async (client, index) => {
    const { data, error } = await client.auth.signInWithPassword(users[index]);
    if (error || !data.session || !data.user || data.user.is_anonymous) {
      throw error ?? new Error(`Unable to authenticate player ${index + 1}`);
    }
    sessions[index] = { ...data.session, user: data.user };
  }));

  activeStage = "buster-boundary";
  await runBusterBoundaryRace();
  activeStage = "leave-concurrency";
  await runLeaveConcurrency();
  activeStage = "no-human-cancellation";
  await runNoHumanCancellation();

  evidence.classification = evidence.checks.every(
    (item) => item.classification === "PASS",
  ) ? "PASS" : "FAIL";
} catch (error) {
  const structuredError = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error && typeof error === "object"
      ? { ...error, message: error.message ?? JSON.stringify(error) }
      : { message: String(error) };
  record("runtime laboratory", "FAIL", {
    stage: activeStage,
    error: structuredError,
  });
  evidence.classification = "FAIL";
} finally {
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  evidence.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(JSON.stringify({
  outputPath,
  classification: evidence.classification,
  checks: evidence.checks.length,
}));
if (evidence.classification !== "PASS") process.exitCode = 1;
