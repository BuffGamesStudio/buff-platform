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
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ?? "movie-buff-buster-leave-supplement.json",
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
for (const [label, value] of [["Supabase", supabaseUrl], ["database", databaseUrl]]) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
}
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  expectedSha,
);

const users = JSON.parse(usersJson);
assert.equal(users.length, 3);
const clients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sessions = [];
let roomId = null;
const evidence = {
  schemaVersion: 1,
  classification: "UNKNOWN",
  sourceSha: expectedSha,
  target: "disposable-localhost",
  startedAt: new Date().toISOString(),
  checks: [],
  cleanup: [],
};
function record(name, classification, details = {}) {
  evidence.checks.push({ name, classification, details, observedAt: new Date().toISOString() });
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
async function phaseView(index) {
  const { data, error } = await rpc(index, "get_movie_buff_match_phase_view", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return data;
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw error ?? new Error(`Authentication failed for player ${index + 1}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );

  roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  const playerIds = sessions.map((session) => session.user.id);
  const roomPlayers = playerIds
    .map((id, index) => `(${q(roomId)}::uuid,${q(id)}::uuid,true,${index === 0},null,${q(now)}::timestamptz,${q(now)}::timestamptz)`)
    .join(",");
  const matchPlayers = playerIds
    .map((id) => `(${q(matchId)}::uuid,${q(id)}::uuid)`)
    .join(",");
  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${q(roomId)}::uuid,${q(crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase())},${q(playerIds[0])}::uuid,'private','active','medium',2,3,1,false,${q(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,difficulty,total_rounds,status,started_at)
    values (${q(matchId)}::uuid,${q(roomId)}::uuid,'medium',2,'active',${q(now)}::timestamptz);
    insert into public.match_players (match_id,player_id) values ${matchPlayers};
    insert into public.match_rounds
      (id,match_id,round_number,time_limit_seconds,started_at)
    values (${q(roundId)}::uuid,${q(matchId)}::uuid,1,5,null);
    commit;
  `);

  const intro = await phaseView(1);
  ownerSql(`update public.movie_buff_match_phase_state set phase_ends_at=clock_timestamp()-interval '1 second' where match_id=${q(matchId)}::uuid;`);
  const { error: introError } = await rpc(1, "advance_movie_buff_match_phase", {
    p_room_id: roomId,
    p_expected_version: intro.phaseVersion,
  });
  if (introError) throw introError;

  const vip = await phaseView(1);
  assert.equal(vip.phase, "vip_lock");
  ownerSql(`
    update public.movie_buff_match_participant_seats
    set participant_state='reconnect_grace',
        controller_type='human',
        controller_player_id=original_player_id,
        last_seen_at=clock_timestamp()-interval '60 seconds',
        reconnect_deadline_at=clock_timestamp()-interval '1 second',
        abandoned_at=null,
        replacement_ready_at=null
    where match_id=${q(matchId)}::uuid and original_player_id=${q(playerIds[0])}::uuid;
  `);
  const expiryWorkers = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      rpc((index % 2) + 1, "advance_movie_buff_match_phase", {
        p_room_id: roomId,
        p_expected_version: vip.phaseVersion,
      }),
    ),
  );
  for (const result of expiryWorkers) if (result.error) throw result.error;

  const vipSeat = JSON.parse(
    ownerSql(`select row_to_json(s)::text from public.movie_buff_match_participant_seats s where s.match_id=${q(matchId)}::uuid and s.original_player_id=${q(playerIds[0])}::uuid;`),
  );
  assert.equal(vipSeat.participant_state, "abandoned");
  assert.equal(vipSeat.controller_type, "human");
  record("Buster inactivity during VIP", "PASS", {
    concurrentExpiryWorkers: expiryWorkers.length,
    phase: "vip_lock",
    controllerType: vipSeat.controller_type,
  });

  const deadline = new Date(Date.now() - 1000).toISOString();
  ownerSql(`
    update public.movie_buff_vip_round_windows set deadline_at=${q(deadline)}::timestamptz where round_id=${q(roundId)}::uuid;
    update public.movie_buff_match_phase_state set phase_ends_at=${q(deadline)}::timestamptz where match_id=${q(matchId)}::uuid;
  `);
  const currentVersion = Number(
    ownerSql(`select phase_version from public.movie_buff_match_phase_state where match_id=${q(matchId)}::uuid;`),
  );
  const boardWorkers = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      rpc((index % 2) + 1, "advance_movie_buff_match_phase", {
        p_room_id: roomId,
        p_expected_version: currentVersion,
      }),
    ),
  );
  for (const result of boardWorkers) if (result.error) throw result.error;
  const boardView = await phaseView(1);
  assert.equal(boardView.phase, "board_select");
  const boardSeat = JSON.parse(
    ownerSql(`select row_to_json(s)::text from public.movie_buff_match_participant_seats s where s.match_id=${q(matchId)}::uuid and s.original_player_id=${q(playerIds[0])}::uuid;`),
  );
  assert.equal(boardSeat.controller_type, "buster");
  record("Buster activation only at the safe boundary", "PASS", {
    concurrentBoardWorkers: boardWorkers.length,
    phase: boardView.phase,
    controllerType: boardSeat.controller_type,
  });

  const leaveFunctions = JSON.parse(
    ownerSql(`
      select coalesce(json_agg(p.proname order by p.proname)::text,'[]')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in ('get_movie_buff_active_leave_quote','confirm_movie_buff_active_leave');
    `),
  );
  if (
    !leaveFunctions.includes("get_movie_buff_active_leave_quote") ||
    !leaveFunctions.includes("confirm_movie_buff_active_leave")
  ) {
    record("exactly-once leave penalties", "FAIL", {
      reason: "authoritative active-leave quote/confirm RPC surface is absent",
      discoveredFunctions: leaveFunctions,
    });
    evidence.classification = "FAIL";
  } else {
    record("exactly-once leave penalties", "UNKNOWN", {
      reason: "RPC surface exists but no approved penalty-policy fixture was discoverable",
      discoveredFunctions: leaveFunctions,
    });
    evidence.classification = "UNKNOWN";
  }
} catch (error) {
  record("supplement execution", "FAIL", {
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  });
  evidence.classification = "FAIL";
} finally {
  if (roomId) {
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

console.log(JSON.stringify({ outputPath, classification: evidence.classification, checks: evidence.checks.length }));
if (evidence.classification === "FAIL") process.exitCode = 1;
