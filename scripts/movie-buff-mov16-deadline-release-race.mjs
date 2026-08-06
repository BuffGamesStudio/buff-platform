#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-mov16-deadline-release-race.json",
);
const allowLocalMutation = process.env.MOVIE_BUFF_ALLOW_LOCAL_MOV16_RACE;

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  !databaseUrl ||
  !expectedGitSha
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_LOCAL_DATABASE_URL, and MOVIE_BUFF_EXPECTED_GIT_SHA are required.",
  );
}
if (allowLocalMutation !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_MOV16_RACE=YES for disposable localhost fixtures.",
  );
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target.`);
  }
  return parsed;
}
const supabaseTarget = requireLocal(supabaseUrl, "Supabase");
const databaseTarget = requireLocal(databaseUrl, "database");
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(checkoutSha, expectedGitSha, "checkout SHA mismatch");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const createdUsers = [];
const createdRooms = [];
const createdDefinitions = [];

const evidence = {
  schemaVersion: 1,
  lane: "MOV-16",
  classification: "UNKNOWN",
  exitCode: null,
  sourceSha: checkoutSha,
  targets: {
    supabase: supabaseTarget.origin,
    database: `${databaseTarget.protocol}//${databaseTarget.hostname}:${databaseTarget.port}`,
  },
  startedAt: new Date().toISOString(),
  checks: [],
  cleanup: [],
};

function record(name, details = {}) {
  evidence.checks.push({
    name,
    classification: "PASS",
    details,
    observedAt: new Date().toISOString(),
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ownerSql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "--set=ON_ERROR_STOP=1", "-Atq", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function uuid() {
  return crypto.randomUUID();
}

function roomCode() {
  return uuid().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function createContext(playerIds, roundNumber) {
  const roomId = uuid();
  const matchId = uuid();
  const roundId = uuid();
  const now = new Date().toISOString();
  const roomPlayers = playerIds
    .map(
      (playerId, index) =>
        `(${quote(roomId)}::uuid,${quote(playerId)}::uuid,true,${index === 0},null,${quote(now)}::timestamptz,${quote(now)}::timestamptz)`,
    )
    .join(",");
  const matchPlayers = playerIds
    .map(
      (playerId) =>
        `(${quote(matchId)}::uuid,${quote(playerId)}::uuid)`,
    )
    .join(",");
  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,category_id,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${quote(roomId)}::uuid,${quote(roomCode())},${quote(playerIds[0])}::uuid,'private','active',null,'medium',10,4,${roundNumber},false,${quote(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,category_id,difficulty,total_rounds,status,started_at)
    values
      (${quote(matchId)}::uuid,${quote(roomId)}::uuid,null,'medium',10,'active',${quote(now)}::timestamptz);
    insert into public.match_players (match_id,player_id)
    values ${matchPlayers};
    insert into public.match_rounds
      (id,match_id,round_number,time_limit_seconds,started_at)
    values
      (${quote(roundId)}::uuid,${quote(matchId)}::uuid,${roundNumber},30,${quote(now)}::timestamptz);
    commit;
  `);
  createdRooms.push(roomId);
  return { roomId, matchId, roundId, playerIds };
}

function createDefinitionAndInventory(playerIds) {
  const definitionId = uuid();
  const inventoryRows = playerIds
    .map(
      (playerId) =>
        `(${quote(uuid())}::uuid,${quote(playerId)}::uuid,${quote(definitionId)}::uuid,2)`,
    )
    .join(",");
  ownerSql(`
    insert into public.movie_buff_vip_definitions
      (id,code,name,description,effect_scope,activation_window,is_stackable,max_per_round,cooldown_seconds,is_active,eligibility_configured,allowed_room_types,allowed_difficulties,allow_any_category,allowed_category_ids,minimum_round_number,maximum_round_number,allow_ranked,allow_unranked)
    values
      (${quote(definitionId)}::uuid,${quote(`mov16_deadline_${uuid().replaceAll("-", "")}`)},'MOV-16 deadline proof','Disposable local proof definition.','personal','answer',false,1,0,true,true,array['private']::text[],array['medium']::text[],true,array[]::uuid[],1,10,false,true);
    insert into public.movie_buff_vip_inventory
      (id,player_id,vip_id,quantity_remaining)
    values ${inventoryRows};
  `);
  createdDefinitions.push(definitionId);
  return definitionId;
}

async function openWindow(context, requiredIds, deadline) {
  return admin.rpc("open_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_match_id: context.matchId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
    p_required_player_ids: requiredIds,
  });
}

async function finalize(context, deadline) {
  return admin.rpc("finalize_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
  });
}

async function release(context, playerId, reason) {
  return admin.rpc("release_movie_buff_vip_required_player", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_player_id: playerId,
    p_release_reason: reason,
  });
}

async function waitPast(deadline) {
  const delay = Math.max(0, deadline.getTime() - Date.now() + 175);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function activePassCount(roundId) {
  return Number(
    ownerSql(`
      select count(*)
      from public.movie_buff_vip_round_locks as locked
      join public.movie_buff_vip_round_required_players as required
        on required.round_id=locked.round_id
       and required.player_id=locked.player_id
       and required.released_at is null
      where locked.round_id=${quote(roundId)}::uuid
        and locked.vip_id is null
        and locked.inventory_id is null;
    `),
  );
}

function allPassRows(roundId) {
  const raw = ownerSql(`
    select pg_catalog.jsonb_build_object(
      'playerId', player_id,
      'vipId', vip_id,
      'inventoryId', inventory_id,
      'key', idempotency_key
    )::text
    from public.movie_buff_vip_round_locks
    where round_id=${quote(roundId)}::uuid
    order by player_id;
  `);
  return raw ? raw.split("\n").map((line) => JSON.parse(line)) : [];
}

try {
  const runId = `mov16-race-${Date.now()}`;
  const password = "Local-MOV16-Race-A9!";
  const playerIds = [];
  for (let index = 0; index < 4; index += 1) {
    const email = `${runId}-p${index + 1}@example.test`;
    const displayName = `MOV-16 Deadline Player ${index + 1}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) {
      throw error ?? new Error("createUser returned no user");
    }
    createdUsers.push(data.user.id);
    playerIds.push(data.user.id);
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      display_name: displayName,
    });
    if (profileError) throw profileError;
  }
  record("four disposable authenticated identities created");

  const duplicateContext = createContext(playerIds.slice(0, 2), 1);
  const duplicateDeadline = new Date(Date.now() + 10_000);
  const duplicate = await openWindow(
    duplicateContext,
    [playerIds[0], playerIds[0]],
    duplicateDeadline,
  );
  assert.ok(duplicate.error);
  assert.match(duplicate.error.message, /duplicate/i);
  record("duplicate required-human snapshot fails closed");

  const deadlineContext = createContext(playerIds.slice(0, 3), 2);
  const definitionId = createDefinitionAndInventory(
    deadlineContext.playerIds,
  );
  const quantitiesBefore = ownerSql(`
    select player_id::text || ':' || quantity_remaining::text
    from public.movie_buff_vip_inventory
    where vip_id=${quote(definitionId)}::uuid
    order by player_id;
  `);
  const deadline = new Date(Date.now() + 2_500);
  const opened = await openWindow(
    deadlineContext,
    deadlineContext.playerIds,
    deadline,
  );
  assert.equal(opened.error, null);

  const early = await finalize(deadlineContext, deadline);
  assert.equal(early.error, null);
  assert.equal(early.data.advanceReady, false);
  assert.equal(early.data.status, "open");
  assert.equal(allPassRows(deadlineContext.roundId).length, 0);
  record("pre-deadline finalization is not ready and inserts no pass");

  const stale = await admin.rpc("finalize_movie_buff_vip_round_window", {
    p_room_id: deadlineContext.roomId,
    p_round_id: uuid(),
    p_deadline_at: deadline.toISOString(),
  });
  assert.ok(stale.error);
  assert.match(stale.error.message, /not found/i);
  record("stale round ID fails closed");

  await waitPast(deadline);
  const workers = await Promise.all(
    Array.from({ length: 8 }, () => finalize(deadlineContext, deadline)),
  );
  for (const worker of workers) assert.equal(worker.error, null);
  for (const worker of workers.slice(1)) {
    assert.deepEqual(worker.data, workers[0].data);
  }
  assert.equal(workers[0].data.advanceReady, true);
  assert.equal(workers[0].data.requiredPlayerCount, 3);
  assert.equal(workers[0].data.lockedCount, 3);
  const passRows = allPassRows(deadlineContext.roundId);
  assert.equal(passRows.length, 3);
  for (const row of passRows) {
    assert.equal(row.vipId, null);
    assert.equal(row.inventoryId, null);
    assert.equal(
      row.key,
      `deadline-pass:${deadlineContext.roundId}:${row.playerId}`,
    );
  }
  const quantitiesAfter = ownerSql(`
    select player_id::text || ':' || quantity_remaining::text
    from public.movie_buff_vip_inventory
    where vip_id=${quote(definitionId)}::uuid
    order by player_id;
  `);
  assert.equal(quantitiesAfter, quantitiesBefore);
  assert.equal(
    Number(ownerSql("select count(*) from public.movie_buff_vip_consumptions;")),
    0,
  );
  record("eight concurrent finalizers converge on deterministic null passes without inventory consumption");

  const releasedContext = createContext(playerIds.slice(0, 3), 3);
  const releasedDeadline = new Date(Date.now() + 2_500);
  assert.equal(
    (await openWindow(releasedContext, releasedContext.playerIds, releasedDeadline)).error,
    null,
  );
  const earlyRelease = await release(
    releasedContext,
    playerIds[2],
    "reconnect_grace_expired",
  );
  assert.equal(earlyRelease.error, null);
  assert.equal(earlyRelease.data.released, true);
  const beforeReleasedDeadline = await finalize(
    releasedContext,
    releasedDeadline,
  );
  assert.equal(beforeReleasedDeadline.error, null);
  assert.equal(beforeReleasedDeadline.data.advanceReady, false);
  assert.equal(beforeReleasedDeadline.data.requiredPlayerCount, 2);
  await waitPast(releasedDeadline);
  const releasedWorkers = await Promise.all(
    Array.from({ length: 6 }, () =>
      finalize(releasedContext, releasedDeadline),
    ),
  );
  for (const worker of releasedWorkers) assert.equal(worker.error, null);
  assert.equal(releasedWorkers[0].data.requiredPlayerCount, 2);
  assert.equal(activePassCount(releasedContext.roundId), 2);
  assert.equal(
    allPassRows(releasedContext.roundId).some(
      (row) => row.playerId === playerIds[2],
    ),
    false,
  );
  record("released participant is excluded from deadline obligations and receives no pass");

  const raceContext = createContext(playerIds.slice(0, 3), 4);
  const raceDeadline = new Date(Date.now() + 2_500);
  assert.equal(
    (await openWindow(raceContext, raceContext.playerIds, raceDeadline)).error,
    null,
  );
  await waitPast(raceDeadline);
  const [releaseResult, ...raceFinalizers] = await Promise.all([
    release(raceContext, playerIds[2], "reconnect_grace_expired"),
    ...Array.from({ length: 8 }, () => finalize(raceContext, raceDeadline)),
  ]);
  assert.equal(releaseResult.error, null);
  for (const worker of raceFinalizers) assert.equal(worker.error, null);
  const replay = await finalize(raceContext, raceDeadline);
  assert.equal(replay.error, null);
  assert.equal(replay.data.advanceReady, true);
  assert.equal(replay.data.requiredPlayerCount, 2);
  assert.equal(replay.data.lockedCount, 2);
  assert.equal(activePassCount(raceContext.roundId), 2);
  const releaseReplay = await release(
    raceContext,
    playerIds[2],
    "reconnect_grace_expired",
  );
  assert.equal(releaseReplay.error, null);
  assert.equal(releaseReplay.data.idempotent, true);
  const contradictoryRelease = await release(
    raceContext,
    playerIds[2],
    "manual_abandonment",
  );
  assert.ok(contradictoryRelease.error);
  assert.match(contradictoryRelease.error.message, /different reason/i);
  record("concurrent release and finalization converge on one closed active-human result", {
    totalHistoricalPassRows: allPassRows(raceContext.roundId).length,
    activePassRows: activePassCount(raceContext.roundId),
  });

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error =
    error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  for (const roomId of createdRooms.reverse()) {
    try {
      ownerSql(`delete from public.game_rooms where id=${quote(roomId)}::uuid;`);
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({
        kind: "room",
        id: roomId,
        classification: "FAIL",
        error: String(error),
      });
    }
  }
  for (const definitionId of createdDefinitions.reverse()) {
    try {
      ownerSql(`
        delete from public.movie_buff_vip_inventory where vip_id=${quote(definitionId)}::uuid;
        delete from public.movie_buff_vip_definitions where id=${quote(definitionId)}::uuid;
      `);
      evidence.cleanup.push({
        kind: "definition",
        id: definitionId,
        classification: "PASS",
      });
    } catch (error) {
      evidence.cleanup.push({
        kind: "definition",
        id: definitionId,
        classification: "FAIL",
        error: String(error),
      });
    }
  }
  for (const userId of createdUsers.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    evidence.cleanup.push({
      kind: "auth-user",
      id: userId,
      classification: error ? "FAIL" : "PASS",
      error: error?.message ?? null,
    });
  }
  if (evidence.cleanup.some((entry) => entry.classification !== "PASS")) {
    evidence.classification = "FAIL";
    evidence.exitCode = 1;
  }
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(
  JSON.stringify({
    outputPath,
    classification: evidence.classification,
    exitCode: evidence.exitCode,
    checks: evidence.checks.length,
  }),
);
if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
