import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersJson = process.env.MOVIE_BUFF_VIP_TEST_USERS;
const outputPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-vip-authority-persona-evidence.json",
);

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !appUrl || !usersJson) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_APP_URL, and MOVIE_BUFF_VIP_TEST_USERS are required.",
  );
}

function requireLocal(urlValue, label) {
  const parsed = new URL(urlValue);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed.origin;
}

const localSupabaseOrigin = requireLocal(supabaseUrl, "Supabase");
const localAppOrigin = requireLocal(appUrl, "application");
const users = JSON.parse(usersJson);
assert.equal(users.length, 4, "exactly four distinct local test credentials are required");
assert.equal(new Set(users.map((user) => user.email)).size, 4);

function browserClient() {
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clients = users.map(() => browserClient());
const sessions = [];
const cleanupRoomIds = new Set();
const cleanupDefinitionIds = new Set();

const evidence = {
  schemaVersion: 1,
  target: {
    kind: "local",
    supabase: localSupabaseOrigin,
    application: localAppOrigin,
  },
  startedAt: new Date().toISOString(),
  checks: [],
};

function record(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });
}

function randomCode(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function roomCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

async function routePost(index, pathname, body, expectedStatus = 200) {
  const token = sessions[index]?.access_token;
  assert.ok(token, `missing access token for test user ${index + 1}`);
  const response = await fetch(`${localAppOrigin}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expectedStatus,
    `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function expectRouteFailure(index, pathname, body, pattern) {
  const token = sessions[index]?.access_token;
  const response = await fetch(`${localAppOrigin}${pathname}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  assert.ok(response.status >= 400, `${pathname} unexpectedly succeeded`);
  assert.match(String(payload?.error ?? ""), pattern);
  return { status: response.status, error: payload?.error };
}

async function createRoomContext({ participantIndexes, roundNumber = 1 }) {
  const hostId = sessions[participantIndexes[0]].user.id;
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: roomCode(),
    host_id: hostId,
    room_type: "private",
    status: "active",
    category_id: null,
    difficulty: "medium",
    total_rounds: 10,
    max_players: 4,
    current_round: roundNumber,
    is_ranked: false,
    started_at: new Date().toISOString(),
  });
  if (roomError) throw roomError;
  cleanupRoomIds.add(roomId);

  const { error: membersError } = await admin.from("room_players").insert(
    participantIndexes.map((index, position) => ({
      room_id: roomId,
      player_id: sessions[index].user.id,
      is_ready: true,
      is_host: position === 0,
      left_at: null,
      last_seen_at: new Date().toISOString(),
    })),
  );
  if (membersError) throw membersError;

  const { error: matchError } = await admin.from("matches").insert({
    id: matchId,
    room_id: roomId,
    category_id: null,
    difficulty: "medium",
    total_rounds: 10,
    status: "active",
    started_at: new Date().toISOString(),
  });
  if (matchError) throw matchError;

  const { error: matchPlayersError } = await admin.from("match_players").insert(
    participantIndexes.map((index) => ({
      match_id: matchId,
      player_id: sessions[index].user.id,
    })),
  );
  if (matchPlayersError) throw matchPlayersError;

  const { error: roundError } = await admin.from("match_rounds").insert({
    id: roundId,
    match_id: matchId,
    round_number: roundNumber,
    time_limit_seconds: 30,
    started_at: new Date().toISOString(),
  });
  if (roundError) throw roundError;

  return { roomId, matchId, roundId, participantIndexes };
}

async function createDefinition(overrides = {}) {
  const definition = {
    id: crypto.randomUUID(),
    code: randomCode("mov16_test"),
    name: overrides.name ?? "MOV-16 Test VIP",
    description: "Local disposable VIP authority test definition.",
    effect_scope: overrides.effectScope ?? "personal",
    activation_window: overrides.activationWindow ?? "answer",
    is_stackable: false,
    max_per_round: 1,
    cooldown_seconds: overrides.cooldownSeconds ?? 0,
    is_active: overrides.isActive ?? true,
    eligibility_configured: overrides.eligibilityConfigured ?? true,
    allowed_room_types: overrides.allowedRoomTypes ?? ["private"],
    allowed_difficulties: overrides.allowedDifficulties ?? ["medium"],
    allow_any_category: true,
    allowed_category_ids: [],
    minimum_round_number: overrides.minimumRoundNumber ?? 1,
    maximum_round_number: overrides.maximumRoundNumber ?? 10,
    allow_ranked: false,
    allow_unranked: true,
  };
  const { error } = await admin.from("movie_buff_vip_definitions").insert(definition);
  if (error) throw error;
  cleanupDefinitionIds.add(definition.id);
  return definition;
}

async function grantInventory(playerIndex, definitionId, quantity, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    player_id: sessions[playerIndex].user.id,
    vip_id: definitionId,
    quantity_remaining: quantity,
    expires_at: overrides.expiresAt ?? null,
    cooldown_until: overrides.cooldownUntil ?? null,
  };
  const { error } = await admin.from("movie_buff_vip_inventory").insert(row);
  if (error) throw error;
  return row;
}

async function openWindow(context, participantIndexes, deadline = new Date(Date.now() + 60_000)) {
  const requiredIds = participantIndexes.map((index) => sessions[index].user.id);
  const { data, error } = await admin.rpc("open_movie_buff_vip_round_window", {
    p_room_id: context.roomId,
    p_match_id: context.matchId,
    p_round_id: context.roundId,
    p_deadline_at: deadline.toISOString(),
    p_required_player_ids: requiredIds,
  });
  if (error) throw error;
  return data;
}

async function setActivationPhase(context, phase) {
  const { error } = await admin.rpc("set_movie_buff_vip_activation_phase", {
    p_room_id: context.roomId,
    p_round_id: context.roundId,
    p_activation_phase: phase,
  });
  if (error) throw error;
}

try {
  await Promise.all(
    clients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(users[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(`Unable to authenticate test user ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );

  const { error: profileError } = await admin.from("profiles").upsert(
    sessions.map((session, index) => ({
      id: session.user.id,
      display_name: `MOV-16 Test Player ${index + 1}`,
    })),
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  const context = await createRoomContext({ participantIndexes: [0, 1] });
  const otherContext = await createRoomContext({ participantIndexes: [3] });
  const owned = await createDefinition({ activationWindow: "answer" });
  const secondOwned = await createDefinition({ activationWindow: "playback", name: "Second Test VIP" });
  const exhausted = await createDefinition({ activationWindow: "answer", name: "Exhausted Test VIP" });
  const unconfigured = await createDefinition({
    activationWindow: "answer",
    name: "Unconfigured Test VIP",
    eligibilityConfigured: false,
    allowedRoomTypes: [],
    allowedDifficulties: [],
  });

  const ownedInventory = await grantInventory(0, owned.id, 2);
  await grantInventory(0, secondOwned.id, 1);
  await grantInventory(0, exhausted.id, 0);
  await grantInventory(0, unconfigured.id, 1);

  const deadline = new Date(Date.now() + 60_000);
  const [firstOpen, duplicateOpen] = await Promise.all([
    openWindow(context, [0, 1], deadline),
    openWindow(context, [0, 1], deadline),
  ]);
  assert.deepEqual(firstOpen, duplicateOpen);
  record("concurrent identical window open is idempotent", { roundId: context.roundId });

  const user1View = await routePost(0, "/api/movie-buff/vip/view", {
    roomId: context.roomId,
    roundId: context.roundId,
  });
  assert.ok(user1View.view.inventory.some((item) => item.vipId === owned.id && item.available));
  assert.ok(user1View.view.inventory.some((item) => item.vipId === exhausted.id && !item.available));
  assert.ok(user1View.view.inventory.some((item) => item.vipId === unconfigured.id && !item.available));
  record("player sees owned eligibility only", { inventoryCount: user1View.view.inventory.length });

  const user2View = await routePost(1, "/api/movie-buff/vip/view", {
    roomId: context.roomId,
    roundId: context.roundId,
  });
  assert.equal(user2View.view.inventory.length, 0);
  record("another player cannot enumerate private inventory");

  await expectRouteFailure(
    1,
    "/api/movie-buff/vip/lock",
    {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: owned.id,
      idempotencyKey: randomCode("unowned"),
    },
    /not owned/i,
  );
  record("unowned VIP is rejected");

  await expectRouteFailure(
    0,
    "/api/movie-buff/vip/lock",
    {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: exhausted.id,
      idempotencyKey: randomCode("exhausted"),
    },
    /(quantity|remaining|eligible)/i,
  );
  record("exhausted quantity is rejected");

  await expectRouteFailure(
    0,
    "/api/movie-buff/vip/view",
    { roomId: otherContext.roomId, roundId: context.roundId },
    /(membership|room|access)/i,
  );
  record("wrong room is rejected");

  await expectRouteFailure(
    0,
    "/api/movie-buff/vip/lock",
    {
      roomId: context.roomId,
      roundId: otherContext.roundId,
      vipId: owned.id,
      idempotencyKey: randomCode("wrong_round"),
    },
    /(unavailable|membership|round)/i,
  );
  record("wrong round is rejected");

  await expectRouteFailure(
    2,
    "/api/movie-buff/vip/view",
    { roomId: context.roomId, roundId: context.roundId },
    /membership/i,
  );
  record("nonmember is rejected");

  const lockKey = randomCode("lock");
  const [lockA, lockB] = await Promise.all([
    routePost(0, "/api/movie-buff/vip/lock", {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: owned.id,
      idempotencyKey: lockKey,
      playerId: sessions[1].user.id,
      quantityRemaining: 999,
    }),
    routePost(0, "/api/movie-buff/vip/lock", {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: owned.id,
      idempotencyKey: lockKey,
    }),
  ]);
  assert.equal(lockA.lock.lockId, lockB.lock.lockId);

  const { data: storedLock, error: storedLockError } = await admin
    .from("movie_buff_vip_round_locks")
    .select("id,player_id,vip_id")
    .eq("id", lockA.lock.lockId)
    .single();
  if (storedLockError) throw storedLockError;
  assert.equal(storedLock.player_id, sessions[0].user.id);
  assert.equal(storedLock.vip_id, owned.id);
  record("identity is bearer-derived and concurrent identical lock is idempotent");

  await expectRouteFailure(
    0,
    "/api/movie-buff/vip/lock",
    {
      roomId: context.roomId,
      roundId: context.roundId,
      vipId: secondOwned.id,
      idempotencyKey: randomCode("contradictory"),
    },
    /different choice/i,
  );
  record("contradictory duplicate lock fails safely");

  const user2AfterLock = await routePost(1, "/api/movie-buff/vip/view", {
    roomId: context.roomId,
    roundId: context.roundId,
  });
  assert.equal(user2AfterLock.view.lock, null);
  assert.equal(user2AfterLock.view.lockedCount, 1);
  assert.doesNotMatch(JSON.stringify(user2AfterLock), new RegExp(owned.name, "i"));
  record("private unused selection does not leak");

  const reconnectClient = browserClient();
  try {
    const { data: reconnectData, error: reconnectError } =
      await reconnectClient.auth.signInWithPassword(users[0]);
    if (reconnectError || !reconnectData.session) throw reconnectError;
    const reconnectResponse = await fetch(`${localAppOrigin}/api/movie-buff/vip/view`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${reconnectData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomId: context.roomId, roundId: context.roundId }),
    });
    const reconnectPayload = await reconnectResponse.json();
    assert.equal(reconnectResponse.status, 200);
    assert.equal(reconnectPayload.view.lock.lockId, lockA.lock.lockId);
    assert.equal(reconnectPayload.view.deadlineAt, deadline.toISOString());
    record("reconnect restores lock and immutable deadline");
  } finally {
    await reconnectClient.auth.signOut();
  }

  const { data: inventoryBeforeActivation, error: beforeError } = await admin
    .from("movie_buff_vip_inventory")
    .select("quantity_remaining")
    .eq("id", ownedInventory.id)
    .single();
  if (beforeError) throw beforeError;
  assert.equal(inventoryBeforeActivation.quantity_remaining, 2);
  record("temporary disconnect does not consume inventory");

  await routePost(1, "/api/movie-buff/vip/lock", {
    roomId: context.roomId,
    roundId: context.roundId,
    vipId: null,
    idempotencyKey: randomCode("pass"),
  });
  const closedView = await routePost(0, "/api/movie-buff/vip/view", {
    roomId: context.roomId,
    roundId: context.roundId,
  });
  assert.equal(closedView.view.advanceReady, true);
  assert.equal(closedView.view.status, "closed");
  record("all required players locked causes early readiness");

  const { data: roundBeforeActivation, error: roundBeforeError } = await admin
    .from("match_rounds")
    .select("started_at,playback_started_at,hint_used_at,hint_penalty_seconds")
    .eq("id", context.roundId)
    .single();
  if (roundBeforeError) throw roundBeforeError;

  await setActivationPhase(context, "answer");
  const activationKey = randomCode("activation");
  const firstActivation = await routePost(0, "/api/movie-buff/vip/activate", {
    roomId: context.roomId,
    roundId: context.roundId,
    activationKey,
  });
  const duplicateActivation = await routePost(0, "/api/movie-buff/vip/activate", {
    roomId: context.roomId,
    roundId: context.roundId,
    activationKey,
  });
  assert.equal(firstActivation.activation.lockId, duplicateActivation.activation.lockId);

  await expectRouteFailure(
    0,
    "/api/movie-buff/vip/activate",
    {
      roomId: context.roomId,
      roundId: context.roundId,
      activationKey: randomCode("different_activation"),
    },
    /different request/i,
  );

  const { data: inventoryAfterActivation, error: afterError } = await admin
    .from("movie_buff_vip_inventory")
    .select("quantity_remaining")
    .eq("id", ownedInventory.id)
    .single();
  if (afterError) throw afterError;
  assert.equal(inventoryAfterActivation.quantity_remaining, 1);
  record("activation consumes exactly once and contradictory replay fails");

  const { data: roundAfterActivation, error: roundAfterError } = await admin
    .from("match_rounds")
    .select("started_at,playback_started_at,hint_used_at,hint_penalty_seconds")
    .eq("id", context.roundId)
    .single();
  if (roundAfterError) throw roundAfterError;
  assert.deepEqual(roundAfterActivation, roundBeforeActivation);
  record("VIP activation does not reset shared round or hint timers");

  const deadlineContext = await createRoomContext({ participantIndexes: [0, 1], roundNumber: 2 });
  await openWindow(deadlineContext, [0, 1], new Date(Date.now() + 60_000));
  await routePost(0, "/api/movie-buff/vip/lock", {
    roomId: deadlineContext.roomId,
    roundId: deadlineContext.roundId,
    vipId: null,
    idempotencyKey: randomCode("deadline_lock"),
  });
  const { error: expireWindowError } = await admin
    .from("movie_buff_vip_round_windows")
    .update({ deadline_at: new Date(Date.now() - 1000).toISOString() })
    .eq("round_id", deadlineContext.roundId);
  if (expireWindowError) throw expireWindowError;

  await expectRouteFailure(
    1,
    "/api/movie-buff/vip/lock",
    {
      roomId: deadlineContext.roomId,
      roundId: deadlineContext.roundId,
      vipId: null,
      idempotencyKey: randomCode("late"),
    },
    /deadline/i,
  );
  const deadlineView = await routePost(0, "/api/movie-buff/vip/view", {
    roomId: deadlineContext.roomId,
    roundId: deadlineContext.roundId,
  });
  assert.equal(deadlineView.view.status, "closed");
  assert.equal(deadlineView.view.advanceReady, true);
  record("deadline rejects late lock and inactive client cannot stall");

  const noModelContext = await createRoomContext({ participantIndexes: [0, 1], roundNumber: 3 });
  const noModelView = await routePost(0, "/api/movie-buff/vip/view", {
    roomId: noModelContext.roomId,
    roundId: noModelContext.roundId,
  });
  assert.equal(noModelView.view.status, "unavailable");
  assert.equal(noModelView.view.inventory.length, 0);
  record("missing window and inventory model fails closed");

  evidence.classification = "PASS";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, classification: "PASS", checks: evidence.checks.length }, null, 2));
} catch (error) {
  evidence.classification = "FAIL";
  evidence.finishedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  for (const roomId of cleanupRoomIds) {
    await admin.from("game_rooms").delete().eq("id", roomId);
  }
  for (const definitionId of cleanupDefinitionIds) {
    await admin.from("movie_buff_vip_inventory").delete().eq("vip_id", definitionId);
    await admin.from("movie_buff_vip_definitions").delete().eq("id", definitionId);
  }
  await Promise.all(clients.map((client) => client.auth.signOut()));
}
