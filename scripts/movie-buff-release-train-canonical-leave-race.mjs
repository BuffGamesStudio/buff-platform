import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const databaseUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
const usersJson = process.env.MOVIE_BUFF_PHASE_TEST_USERS;
const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-canonical-leave-race.json",
);

for (const [key, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  MOVIE_BUFF_LOCAL_DATABASE_URL: databaseUrl,
  MOVIE_BUFF_PHASE_TEST_USERS: usersJson,
  MOVIE_BUFF_EXPECTED_GIT_SHA: expectedSha,
})) {
  if (!value) throw new Error(`${key} is required.`);
}

for (const [label, value] of [["Supabase", supabaseUrl], ["database", databaseUrl]]) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
}

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, expectedSha, "exact checkout SHA mismatch");

const users = JSON.parse(usersJson);
assert.equal(users.length, 3, "exactly three local users required");

const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];

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

const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  sourceSha: checkoutSha,
  target: "disposable-localhost",
  startedAt: new Date().toISOString(),
  checks: [],
};

function record(name, classification, details = {}) {
  evidence.checks.push({ name, classification, details, observedAt: new Date().toISOString() });
}

async function main() {
  for (let i = 0; i < users.length; i += 1) {
    const { data, error } = await clients[i].auth.signInWithPassword({
      email: users[i].email,
      password: users[i].password,
    });
    if (error || !data.session) throw error ?? new Error(`local sign-in ${i} failed`);
    sessions.push(data.session);
  }

  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const policyVersion = `validation-${crypto.randomUUID()}`;
  const roomCode = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  const playerIds = sessions.map((session) => session.user.id);
  const roomPlayers = playerIds.map((id, index) =>
    `(${q(roomId)}::uuid,${q(id)}::uuid,true,${index === 0},null,${q(now)}::timestamptz,${q(now)}::timestamptz)`
  ).join(",");
  const matchPlayers = playerIds.map((id) =>
    `(${q(matchId)}::uuid,${q(id)}::uuid)`
  ).join(",");

  ownerSql(`
    begin;
    update public.movie_buff_active_leave_policies
      set active=false, retired_at=coalesce(retired_at,clock_timestamp())
      where active;
    insert into public.movie_buff_active_leave_policies
      (policy_version,penalty_points,quote_ttl_seconds,active)
    values (${q(policyVersion)},7,120,true);
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
    update public.room_players set score=25 where room_id=${q(roomId)}::uuid;
    update public.match_players set final_score=25 where match_id=${q(matchId)}::uuid;
    commit;
  `);

  const view = await rpc(0, "get_movie_buff_match_phase_view", { p_room_id: roomId });
  if (view.error) throw view.error;

  const quote = await rpc(0, "get_movie_buff_active_leave_quote", { p_room_id: roomId });
  if (quote.error) throw quote.error;
  assert.ok(quote.data?.quoteToken, "quote token missing");
  assert.equal(Number(quote.data.penaltyPoints), 7);

  const idempotencyKey = `leave-${crypto.randomUUID()}`;
  const results = await Promise.all(
    Array.from({ length: 17 }, () =>
      rpc(0, "confirm_movie_buff_active_leave", {
        p_room_id: roomId,
        p_quote_token: quote.data.quoteToken,
        p_idempotency_key: idempotencyKey,
      }),
    ),
  );
  for (const result of results) {
    if (result.error) throw result.error;
  }
  const canonicalResult = JSON.stringify(results[0].data);
  assert.ok(results.every((result) => JSON.stringify(result.data) === canonicalResult));

  const counts = JSON.parse(ownerSql(`
    select json_build_object(
      'actions', (select count(*) from public.movie_buff_match_phase_actions
        where room_id=${q(roomId)}::uuid
          and actor_player_id=${q(playerIds[0])}::uuid
          and action_type='leave_confirm'
          and idempotency_key=${q(idempotencyKey)}),
      'ledger', (select count(*) from public.movie_buff_active_leave_penalty_ledger
        where room_id=${q(roomId)}::uuid and player_id=${q(playerIds[0])}::uuid),
      'abandonment', (select count(*) from public.movie_buff_match_abandonment_events
        where room_id=${q(roomId)}::uuid and player_id=${q(playerIds[0])}::uuid
          and reason='voluntary_active_leave'),
      'consumedQuotes', (select count(*) from public.movie_buff_active_leave_quotes
        where room_id=${q(roomId)}::uuid and player_id=${q(playerIds[0])}::uuid
          and consumed_at is not null),
      'leftMemberships', (select count(*) from public.room_players
        where room_id=${q(roomId)}::uuid and player_id=${q(playerIds[0])}::uuid
          and left_at is not null),
      'abandonedSeats', (select count(*) from public.movie_buff_match_participant_seats
        where match_id=${q(matchId)}::uuid and original_player_id=${q(playerIds[0])}::uuid
          and participant_state='abandoned'),
      'roomScore', (select score from public.room_players
        where room_id=${q(roomId)}::uuid and player_id=${q(playerIds[0])}::uuid),
      'matchScore', (select final_score from public.match_players
        where match_id=${q(matchId)}::uuid and player_id=${q(playerIds[0])}::uuid)
    )::text;
  `));

  assert.deepEqual(
    {
      actions: Number(counts.actions),
      ledger: Number(counts.ledger),
      abandonment: Number(counts.abandonment),
      consumedQuotes: Number(counts.consumedQuotes),
      leftMemberships: Number(counts.leftMemberships),
      abandonedSeats: Number(counts.abandonedSeats),
      roomScore: Number(counts.roomScore),
      matchScore: Number(counts.matchScore),
    },
    {
      actions: 1,
      ledger: 1,
      abandonment: 1,
      consumedQuotes: 1,
      leftMemberships: 1,
      abandonedSeats: 1,
      roomScore: 18,
      matchScore: 18,
    },
  );

  const contradictory = await rpc(0, "confirm_movie_buff_active_leave", {
    p_room_id: roomId,
    p_quote_token: quote.data.quoteToken,
    p_idempotency_key: `different-${crypto.randomUUID()}`,
  });
  assert.ok(contradictory.error, "contradictory replay must fail closed");

  record("exactly-once leave penalties", "PASS", {
    concurrentConfirmations: results.length,
    identicalResults: true,
    penaltyPoints: 7,
    counts,
    contradictoryReplay: "rejected",
  });
  evidence.classification = "PASS";
}

try {
  await main();
} catch (error) {
  record("exactly-once leave penalties", "FAIL", {
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) },
  });
  evidence.classification = "FAIL";
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    try { await client.auth.signOut(); } catch {}
  }
  evidence.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}
