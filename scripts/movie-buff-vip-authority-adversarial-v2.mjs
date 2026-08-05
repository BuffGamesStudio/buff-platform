import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MOVIE_BUFF_LOCAL_DATABASE_URL",
  "MOVIE_BUFF_APP_URL",
  "MOVIE_BUFF_EXPECTED_GIT_SHA",
];
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const expectedGitSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA.trim();
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ?? "movie-buff-vip-authority-adversarial-v2.json",
);
const runId = (process.env.MOVIE_BUFF_LOCAL_RUN_ID ?? "mov16-v2")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 36);

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed;
}
const supabaseTarget = requireLocal(supabaseUrl, "Supabase");
const databaseTarget = requireLocal(databaseUrl, "database");
const appTarget = requireLocal(appUrl, "application");
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, expectedGitSha);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clients = Array.from({ length: 4 }, () =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];
const createdUsers = [];
const createdRooms = new Set();
const createdDefinitions = new Set();

function serializeError(error) {
  if (error instanceof Error) {
    return {
      kind: "Error",
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  if (error && typeof error === "object") {
    const safe = {};
    for (const key of ["name", "message", "code", "details", "hint", "status", "statusCode"]) {
      const value = error[key];
      if (["string", "number", "boolean"].includes(typeof value) || value === null) safe[key] = value;
    }
    return {
      kind: "object",
      constructor: error.constructor?.name ?? null,
      keys: Object.keys(error).sort(),
      safe,
    };
  }
  return { kind: typeof error, value: String(error) };
}

const evidence = {
  schemaVersion: 3,
  classification: "UNKNOWN",
  exitCode: null,
  repository: "BuffGamesStudio/buff-platform",
  sourceBranch: process.env.GITHUB_REF_NAME ?? null,
  sourceSha: checkoutSha,
  targets: {
    supabase: supabaseTarget.origin,
    database: `${databaseTarget.protocol}//${databaseTarget.hostname}:${databaseTarget.port}`,
    application: appTarget.origin,
  },
  startedAt: new Date().toISOString(),
  checks: [],
  cleanup: [],
};
function record(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", details, observedAt: new Date().toISOString() });
}
function ownerSql(sql) {
  return execFileSync(
    "psql",
    [databaseUrl, "-X", "--set=ON_ERROR_STOP=1", "-Atq", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function uuid() {
  return crypto.randomUUID();
}
function roomCode() {
  return uuid().replaceAll("-", "").slice(0, 8).toUpperCase();
}
function randomKey(prefix) {
  return `${prefix}-${uuid()}`;
}

async function routeCall(index, pathname, body) {
  const token = sessions[index]?.access_token;
  assert.ok(token, `missing bearer token for player ${index + 1}`);
  const response = await fetch(`${appTarget.origin}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}
async function routeOk(index, pathname, body) {
  const result = await routeCall(index, pathname, body);
  assert.equal(result.status, 200, `${pathname}: ${result.status} ${JSON.stringify(result.payload)}`);
  return result.payload;
}
async function routeFails(index, pathname, body, pattern) {
  const result = await routeCall(index, pathname, body);
  assert.ok(result.status >= 400, `${pathname} unexpectedly succeeded`);
  assert.match(String(result.payload?.error ?? ""), pattern);
  return result;
}

function createContext(participantIndexes, roundNumber) {
  const roomId = uuid();
  const matchId = uuid();
  const roundId = uuid();
  const now = new Date().toISOString();
  const hostId = sessions[participantIndexes[0]].user.id;
  const roomPlayers = participantIndexes
    .map((index, position) =>
      `(${quote(roomId)}::uuid,${quote(sessions[index].user.id)}::uuid,true,${position === 0},null,${quote(now)}::timestamptz,${quote(now)}::timestamptz)`,
    )
    .join(",");
  const matchPlayers = participantIndexes
    .map((index) => `(${quote(matchId)}::uuid,${quote(sessions[index].user.id)}::uuid)`)
    .join(",");
  ownerSql(`
    begin;
    insert into public.game_rooms
      (id,room_code,host_id,room_type,status,category_id,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
    values
      (${quote(roomId)}::uuid,${quote(roomCode())},${quote(hostId)}::uuid,'private','active',null,'medium',10,4,${roundNumber},false,${quote(now)}::timestamptz);
    insert into public.room_players
      (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
    values ${roomPlayers};
    insert into public.matches
      (id,room_id,category_id,difficulty,total_rounds,status,started_at)
    values
      (${quote(matchId)}::uuid,${quote(roomId)}::uuid,null,'medium',10,'active',${quote(now)}::timestamptz);
    insert into public.match_players (match_id,player_id) values ${matchPlayers};
    insert into public.match_rounds (id,match_id,round_number,time_limit_seconds,started_at)
    values (${quote(roundId)}::uuid,${quote(matchId)}::uuid,${roundNumber},30,${quote(now)}::timestamptz);
    commit;
  `);
  createdRooms.add(roomId);
  return { roomId, matchId, roundId, participantIndexes };
}
function closeContext(context) {
  ownerSql(`delete from public.game_rooms where id=${quote(context.roomId)}::uuid;`);
  createdRooms.delete(context.roomId);
}
function createDefinition(name, activationWindow = "answer") {
  const id = uuid();
  ownerSql(`
    insert into public.movie_buff_vip_definitions
      (id,code,name,description,effect_scope,activation_window,is_stackable,max_per_round,cooldown_seconds,is_active,eligibility_configured,allowed_room_types,allowed_difficulties,allow_any_category,allowed_category_ids,minimum_round_number,maximum_round_number,allow_ranked,allow_unranked)
    values
      (${quote(id)}::uuid,${quote(`mov16_${uuid().replaceAll("-", "")}`)},${quote(name)},'Disposable exact-core MOV-16 proof VIP.','personal',${quote(activationWindow)},false,1,0,true,true,array['private']::text[],array['medium']::text[],true,array[]::uuid[],1,10,false,true);
  `);
  createdDefinitions.add(id);
  return id;
}
function grantInventory(playerIndex, vipId, quantity = 2) {
  const id = uuid();
  ownerSql(`insert into public.movie_buff_vip_inventory (id,player_id,vip_id,quantity_remaining)
    values (${quote(id)}::uuid,${quote(sessions[playerIndex].user.id)}::uuid,${quote(vipId)}::uuid,${quantity});`);
  return id;
}
async function openWindow(context, indexes, deadline) {
  return admin.rpc("open_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_match_id: context.matchId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
    p_required_player_ids: indexes.map((index) => sessions[index].user.id),
  });
}
async function releaseRequired(context, playerIndex, reason) {
  return admin.rpc("release_movie_buff_vip_required_player", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_player_id: sessions[playerIndex].user.id,
    p_release_reason: reason,
  });
}
async function setActivationPhase(context, phase) {
  const { error } = await admin.rpc("set_movie_buff_vip_activation_phase", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_activation_phase: phase,
  });
  if (error) throw error;
}

async function cleanup() {
  for (const roomId of [...createdRooms].reverse()) {
    try {
      ownerSql(`delete from public.game_rooms where id=${quote(roomId)}::uuid;`);
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({ kind: "room", id: roomId, classification: "FAIL", error: serializeError(error) });
    }
  }
  for (const vipId of [...createdDefinitions].reverse()) {
    try {
      ownerSql(`delete from public.movie_buff_vip_inventory where vip_id=${quote(vipId)}::uuid;
        delete from public.movie_buff_vip_definitions where id=${quote(vipId)}::uuid;`);
      evidence.cleanup.push({ kind: "vip", id: vipId, classification: "PASS" });
    } catch (error) {
      evidence.cleanup.push({ kind: "vip", id: vipId, classification: "FAIL", error: serializeError(error) });
    }
  }
  for (const userId of [...createdUsers].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    evidence.cleanup.push({
      kind: "auth-user",
      id: userId,
      classification: error ? "FAIL" : "PASS",
      error: error ? serializeError(error) : null,
    });
  }
}

try {
  const password = `Local-${runId}-A9!`;
  for (let index = 0; index < 4; index += 1) {
    const email = `movie-buff-${runId}-p${index + 1}@example.test`;
    const displayName = `MOV-16 Exact Player ${index + 1}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    createdUsers.push(data.user.id);
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      display_name: displayName,
    });
    if (profileError) throw profileError;
    const { data: authData, error: authError } = await clients[index].auth.signInWithPassword({ email, password });
    if (authError || !authData.session || !authData.user || authData.user.is_anonymous) {
      throw authError ?? new Error(`Unable to authenticate player ${index + 1}`);
    }
    sessions[index] = { ...authData.session, user: authData.user };
  }
  assert.equal(new Set(sessions.map((session) => session.user.id)).size, 4);
  record("four distinct authenticated personas");
  assert.equal(Number(ownerSql(`select count(*) from public.room_players where player_id in (${sessions.map((s) => `${quote(s.user.id)}::uuid`).join(",")}) and left_at is null;`)), 0);
  record("clean active-membership preflight");

  const noWindow = createContext([3], 1);
  const noWindowRelease = await releaseRequired(noWindow, 3, "reconnect_grace_expired");
  assert.equal(noWindowRelease.error, null);
  assert.equal(noWindowRelease.data.status, "unavailable");
  assert.equal(noWindowRelease.data.released, false);
  closeContext(noWindow);
  record("release before window is safe and idempotent");

  const invalidContext = createContext([2], 2);
  const invalidOpen = await openWindow(invalidContext, [2, 3], new Date(Date.now() + 90_000));
  assert.ok(invalidOpen.error);
  assert.match(invalidOpen.error.message, /nonmember|nonparticipant/i);
  closeContext(invalidContext);
  record("required snapshot rejects nonparticipants");

  const windowRace = createContext([0, 1], 3);
  const deadline = new Date(Date.now() + 90_000);
  const [openA, openB] = await Promise.all([
    openWindow(windowRace, [0, 1], deadline),
    openWindow(windowRace, [0, 1], deadline),
  ]);
  assert.equal(openA.error, null);
  assert.equal(openB.error, null);
  assert.deepEqual(openA.data, openB.data);
  const conflictingWindow = await openWindow(windowRace, [0], deadline);
  assert.ok(conflictingWindow.error);
  assert.match(conflictingWindow.error.message, /contradictory/i);
  const requiredIds = ownerSql(`select player_id::text from public.movie_buff_vip_round_required_players where round_id=${quote(windowRace.roundId)}::uuid order by player_id;`)
    .split("\n").filter(Boolean);
  assert.deepEqual(requiredIds, [sessions[0].user.id, sessions[1].user.id].sort());
  record("concurrent window open preserves one immutable required-human snapshot");

  const vipA = createDefinition("MOV-16 Exact VIP A");
  const vipB = createDefinition("MOV-16 Exact VIP B");
  grantInventory(0, vipA, 3);
  grantInventory(0, vipB, 2);
  const identicalKey = randomKey("identical-lock");
  const [lockA, lockB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: windowRace.roomId,
      roundId: windowRace.roundId,
      vipId: vipA,
      idempotencyKey: identicalKey,
      playerId: sessions[1].user.id,
      quantityRemaining: 999,
    }),
    routeCall(0, "/api/movie-buff/vip/lock", {
      roomId: windowRace.roomId,
      roundId: windowRace.roundId,
      vipId: vipA,
      idempotencyKey: identicalKey,
    }),
  ]);
  assert.equal(lockA.status, 200, JSON.stringify(lockA.payload));
  assert.equal(lockB.status, 200, JSON.stringify(lockB.payload));
  assert.equal(lockA.payload.lock.lockId, lockB.payload.lock.lockId);
  record("identical lock replay is stable and caller-supplied identity is ignored");

  const firstRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");
  assert.equal(firstRelease.error, null);
  assert.equal(firstRelease.data.released, true);
  const repeatedRelease = await releaseRequired(windowRace, 0, "reconnect_grace_expired");
  assert.equal(repeatedRelease.error, null);
  assert.equal(repeatedRelease.data.idempotent, true);
  const contradictoryRelease = await releaseRequired(windowRace, 0, "manual_abandonment");
  assert.ok(contradictoryRelease.error);
  assert.match(contradictoryRelease.error.message, /different reason/i);
  await routeFails(0, "/api/movie-buff/vip/view", { roomId: windowRace.roomId, roundId: windowRace.roundId }, /not required/i);
  const remainingView = await routeOk(1, "/api/movie-buff/vip/view", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
  });
  assert.equal(remainingView.view.requiredPlayerCount, 1);
  assert.equal(remainingView.view.lockedCount, 0);
  await routeOk(1, "/api/movie-buff/vip/lock", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
    vipId: null,
    idempotencyKey: randomKey("remaining-pass"),
  });
  const closedView = await routeOk(1, "/api/movie-buff/vip/view", {
    roomId: windowRace.roomId,
    roundId: windowRace.roundId,
  });
  assert.equal(closedView.view.status, "closed");
  assert.equal(closedView.view.advanceReady, true);
  closeContext(windowRace);
  record("release excludes departed identity and remaining player closes window");

  grantInventory(2, vipA, 2);
  grantInventory(2, vipB, 2);
  const contradictoryContext = createContext([2], 4);
  await openWindow(contradictoryContext, [2], new Date(Date.now() + 90_000));
  const contradictory = await Promise.all([
    routeCall(2, "/api/movie-buff/vip/lock", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipA,
      idempotencyKey: randomKey("choice-a"),
    }),
    routeCall(2, "/api/movie-buff/vip/lock", {
      roomId: contradictoryContext.roomId,
      roundId: contradictoryContext.roundId,
      vipId: vipB,
      idempotencyKey: randomKey("choice-b"),
    }),
  ]);
  assert.equal(contradictory.filter((result) => result.status === 200).length, 1);
  assert.equal(contradictory.filter((result) => result.status >= 400).length, 1);
  assert.match(String(contradictory.find((result) => result.status >= 400)?.payload?.error ?? ""), /different choice/i);
  closeContext(contradictoryContext);
  record("contradictory lock race permits one authoritative choice");

  const activationContext = createContext([0], 5);
  await openWindow(activationContext, [0], new Date(Date.now() + 90_000));
  const activationVip = createDefinition("MOV-16 Exact Activation VIP", "answer");
  const activationInventory = grantInventory(0, activationVip, 2);
  await routeOk(0, "/api/movie-buff/vip/lock", {
    roomId: activationContext.roomId,
    roundId: activationContext.roundId,
    vipId: activationVip,
    idempotencyKey: randomKey("activation-lock"),
  });
  await setActivationPhase(activationContext, "playback");
  await routeFails(0, "/api/movie-buff/vip/activate", {
    roomId: activationContext.roomId,
    roundId: activationContext.roundId,
    activationKey: randomKey("wrong-phase"),
  }, /current server phase/i);
  await setActivationPhase(activationContext, "answer");
  const activationKey = randomKey("activation");
  const [activationA, activationB] = await Promise.all([
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationContext.roomId,
      roundId: activationContext.roundId,
      activationKey,
    }),
    routeCall(0, "/api/movie-buff/vip/activate", {
      roomId: activationContext.roomId,
      roundId: activationContext.roundId,
      activationKey,
    }),
  ]);
  assert.equal(activationA.status, 200, JSON.stringify(activationA.payload));
  assert.equal(activationB.status, 200, JSON.stringify(activationB.payload));
  assert.equal(activationA.payload.activation.lockId, activationB.payload.activation.lockId);
  assert.equal(Number(ownerSql(`select quantity_remaining from public.movie_buff_vip_inventory where id=${quote(activationInventory)}::uuid;`)), 1);
  assert.equal(Number(ownerSql(`select count(*) from public.movie_buff_vip_consumptions c join public.movie_buff_vip_round_locks l on l.id=c.lock_id where l.round_id=${quote(activationContext.roundId)}::uuid and l.player_id=${quote(sessions[0].user.id)}::uuid;`)), 1);
  record("wrong phase fails and concurrent activation consumes exactly once");

  evidence.classification = "PASS";
  evidence.exitCode = 0;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.exitCode = 1;
  evidence.error = serializeError(error);
} finally {
  await cleanup();
  await Promise.allSettled(clients.map((client) => client.auth.signOut()));
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify({ outputPath, classification: evidence.classification, exitCode: evidence.exitCode, checks: evidence.checks.length }));
if (evidence.exitCode !== 0) process.exitCode = evidence.exitCode;
