import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const productSha = process.env.MOVIE_BUFF_PRODUCT_SHA?.trim();
const productTree = process.env.MOVIE_BUFF_PRODUCT_TREE?.trim();
const controllerSha = process.env.MOVIE_BUFF_CONTROLLER_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR;
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;

for (const [name, value] of Object.entries({
  MOVIE_BUFF_PRODUCT_SHA: productSha,
  MOVIE_BUFF_PRODUCT_TREE: productTree,
  MOVIE_BUFF_CONTROLLER_SHA: controllerSha,
})) {
  if (!value || !/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error(`${name} must be a full 40-character Git identity.`);
  }
}
for (const [name, value] of Object.entries({
  MOVIE_BUFF_APP_URL: appUrl,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  MOVIE_BUFF_LOCAL_USERS_OUTPUT: usersPath,
  MOVIE_BUFF_EVIDENCE_DIR: evidenceDir,
  PLAYWRIGHT_PACKAGE_ROOT: playwrightRoot,
})) {
  if (!value) throw new Error(`${name} is required.`);
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed.origin;
}

const appOrigin = requireLocal(appUrl, "application");
const supabaseOrigin = requireLocal(supabaseUrl, "Supabase");
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const checkoutTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, controllerSha, "controller checkout SHA mismatch");
assert.equal(
  execFileSync("git", ["rev-parse", `${productSha}^{tree}`], { encoding: "utf8" }).trim(),
  productTree,
  "product tree mismatch",
);

fs.mkdirSync(evidenceDir, { recursive: true });
const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
assert.ok(Array.isArray(users) && users.length >= 3, "at least three local users are required");
const players = users.slice(0, 3);
assert.equal(new Set(players.map((item) => item.email)).size, 3, "three distinct local users are required");

const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const apiClients = players.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const sessions = [];
const browsers = [];
const contexts = [];
const pages = [];
const cleanupRoomIds = [];

function redact(value) {
  return String(value)
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED_SUPABASE_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_LOCAL_DB_URL]")
    .replace(/(password|token|secret|key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 3000);
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: redact(error.name),
      message: redact(error.message),
      stack: redact(error.stack ?? ""),
    };
  }
  if (error && typeof error === "object") {
    const record = {};
    for (const key of ["name", "message", "details", "hint", "code", "status", "statusCode"]) {
      if (key in error && error[key] != null) record[key] = redact(error[key]);
    }
    if (Object.keys(record).length > 0) return record;
    try {
      return { value: redact(JSON.stringify(error)) };
    } catch {
      return { value: redact(String(error)) };
    }
  }
  return { value: redact(error) };
}

const evidence = {
  schemaVersion: 1,
  laboratory: "movie-buff-rc1-resilience-browser-v1",
  classification: "UNKNOWN",
  product: { sha: productSha, tree: productTree },
  controller: { sha: controllerSha, tree: checkoutTree },
  composition: "RC-1 product bytes plus validation-only scripts/workflow",
  targets: { application: appOrigin, supabase: supabaseOrigin, kind: "localhost-only" },
  browserProcessCount: 0,
  browserContextCount: 0,
  startedAt: new Date().toISOString(),
  checks: [],
  cases: [],
  failures: [],
};

function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });
}

function addCase(caseRecord) {
  evidence.cases.push(caseRecord);
}

async function touchParticipant(index, roomId) {
  const { data, error } = await apiClients[index].rpc("touch_movie_buff_match_participant", { p_room_id: roomId });
  if (error) throw error;
  assert.ok(data?.serverNow, "touch_movie_buff_match_participant did not return serverNow");
  return data;
}

async function advancePhase(index, roomId, expectedVersion) {
  const { data, error } = await apiClients[index].rpc("advance_movie_buff_match_phase", {
    p_room_id: roomId,
    p_expected_version: expectedVersion,
  });
  if (error) throw error;
  return data;
}

async function armSubjectSeat(matchId, playerId, deadlineAt, anchorNow, replacementReadyAt = null) {
  const lastSeenAt = new Date(Date.parse(anchorNow) - 60_000).toISOString();
  const { error } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      controller_type: "human",
      controller_player_id: playerId,
      last_seen_at: lastSeenAt,
      reconnect_deadline_at: deadlineAt,
      abandoned_at: null,
      replacement_ready_at: replacementReadyAt,
    })
    .eq("match_id", matchId)
    .eq("original_player_id", playerId);
  if (error) throw error;
}

function supportOutcome(result) {
  if (result.status === "fulfilled") {
    return {
      status: "fulfilled",
      value: result.value,
    };
  }
  return {
    status: "rejected",
    reason: serializeError(result.reason),
  };
}

async function seatFor(matchId, playerId) {
  const { data, error } = await admin
    .from("movie_buff_match_participant_seats")
    .select("seat_index,original_player_id,controller_type,controller_player_id,participant_state,reconnect_deadline_at,replacement_ready_at,abandoned_at")
    .eq("match_id", matchId)
    .eq("original_player_id", playerId)
    .single();
  if (error) throw error;
  return data;
}

async function phaseView(index, roomId) {
  const { data, error } = await apiClients[index].rpc("get_movie_buff_match_phase_view", { p_room_id: roomId });
  if (error) throw error;
  assert.ok(data);
  return data;
}

async function cleanupPriorDisposableRooms() {
  for (const roomId of cleanupRoomIds.splice(0)) {
    const { error } = await admin.from("game_rooms").delete().eq("id", roomId);
    if (error) throw error;
  }
}

async function createDisposableMatch(label) {
  await cleanupPriorDisposableRooms();
  const roomId = crypto.randomUUID();
  const now = new Date().toISOString();
  cleanupRoomIds.push(roomId);

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
    host_id: sessions[0].user.id,
    room_type: "private",
    status: "waiting",
    difficulty: "medium",
    total_rounds: 2,
    max_players: 3,
    current_round: 1,
    is_ranked: false,
    started_at: null,
  });
  if (roomError) throw roomError;

  const { error: membersError } = await admin.from("room_players").insert(
    sessions.map((session, index) => ({
      room_id: roomId,
      player_id: session.user.id,
      is_ready: true,
      is_host: index === 0,
      left_at: null,
      joined_at: new Date(Date.parse(now) + index).toISOString(),
      last_seen_at: now,
    })),
  );
  if (membersError) throw membersError;

  const { data: startRows, error: startError } = await admin.rpc(
    "start_movie_buff_match",
    { p_room_id: roomId },
  );
  if (startError) throw startError;
  assert.ok(Array.isArray(startRows) && startRows.length === 1, `${label}: expected one authoritative match-start result`);
  const matchId = startRows[0].created_match_id;
  const roundId = startRows[0].created_round_id;
  assert.ok(matchId && roundId, `${label}: authoritative match-start identities are required`);

  const initialViews = await Promise.all(apiClients.map((_client, index) => phaseView(index, roomId)));
  assert.ok(initialViews.every((view) => view.phase === "round_intro"), `${label}: expected round_intro bootstrap`);
  return { label, roomId, matchId, roundId, initialViews };
}

async function browserVisit(index, roomId) {
  const page = pages[index];
  await page.goto(`${appOrigin}/games/movie-buff/round-intro?roomId=${encodeURIComponent(roomId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(800);
  return { url: page.url(), text: (await page.locator("body").innerText()).slice(0, 600) };
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function randomCode(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function routePost(index, pathname, body, expectedStatus = 200) {
  const token = sessions[index]?.access_token;
  assert.ok(token, `missing access token for player ${index + 1}`);
  const response = await fetch(`${appOrigin}${pathname}`, {
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

async function setReconnectGrace(matchId, playerId, deadlineAt, replacementReadyAt = null) {
  const { error } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      controller_type: "human",
      controller_player_id: playerId,
      last_seen_at: new Date(Date.parse(deadlineAt) - 60_000).toISOString(),
      reconnect_deadline_at: deadlineAt,
      abandoned_at: null,
      replacement_ready_at: replacementReadyAt,
    })
    .eq("match_id", matchId)
    .eq("original_player_id", playerId);
  if (error) throw error;
}

try {
  await Promise.all(
    apiClients.map(async (client, index) => {
      const { data, error } = await client.auth.signInWithPassword(players[index]);
      if (error || !data.session || !data.user || data.user.is_anonymous) {
        throw new Error(`API authentication failed for player ${index + 1}: ${error?.message ?? "unknown"}`);
      }
      sessions[index] = { ...data.session, user: data.user };
    }),
  );

  for (let index = 0; index < players.length; index += 1) {
    const browser = await chromium.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    pages.push(page);
    await page.goto(`${appOrigin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.getByPlaceholder("you@example.com").fill(players[index].email);
    await page.getByPlaceholder("Password").fill(players[index].password);
    await Promise.all([
      page.waitForURL(/\/games\/movie-buff\/lobby/, { timeout: 60_000 }),
      page.getByRole("button", { name: "Enter Buff Games" }).click(),
    ]);
  }
  evidence.browserProcessCount = browsers.length;
  evidence.browserContextCount = contexts.length;
  pass("three-authenticated-browser-processes", { count: browsers.length });

  const subjectIndex = 0;
  const subjectId = sessions[subjectIndex].user.id;
  const nonSubjectIndex = 1;
  const otherIndex = 2;

  const before = await createDisposableMatch("pre-deadline");
  const beforeAnchor = await touchParticipant(nonSubjectIndex, before.roomId);
  const beforeDeadline = new Date(Date.parse(beforeAnchor.serverNow) + 4_000).toISOString();
  await armSubjectSeat(before.matchId, subjectId, beforeDeadline, beforeAnchor.serverNow);
  const beforePhase = await phaseView(nonSubjectIndex, before.roomId);
  const beforeSeat = await seatFor(before.matchId, subjectId);
  assert.equal(beforeSeat.participant_state, "reconnect_grace");

  await browserVisit(subjectIndex, before.roomId);
  const afterReconnectPhase = await phaseView(nonSubjectIndex, before.roomId);
  const afterReconnectSeat = await seatFor(before.matchId, subjectId);
  assert.equal(afterReconnectSeat.participant_state, "active");
  assert.equal(afterReconnectSeat.controller_type, "human");
  assert.equal(afterReconnectSeat.reconnect_deadline_at, null);

  addCase({
    name: "browser-reconnect-immediately-before-expiry",
    classification: "PASS",
    matchId: before.matchId,
    roomId: before.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: beforeDeadline,
    before: {
      serverNow: beforeAnchor.serverNow,
      phase: beforePhase.phase,
      phaseVersion: beforePhase.phaseVersion,
      seat: beforeSeat,
    },
    operation: {
      action: "subject_browser_reconnect_before_expiry",
      outcomes: ["browserVisit"],
    },
    after: {
      serverNow: afterReconnectPhase.serverNow,
      phase: afterReconnectPhase.phase,
      phaseVersion: afterReconnectPhase.phaseVersion,
      seat: afterReconnectSeat,
    },
  });
  pass("browser-reconnect-immediately-before-expiry", { deadlineAt: beforeDeadline, finalState: afterReconnectSeat.participant_state });

  const after = await createDisposableMatch("post-deadline");
  const afterAnchor = await touchParticipant(nonSubjectIndex, after.roomId);
  const expired = new Date(Date.parse(afterAnchor.serverNow) - 250).toISOString();
  const afterBeforePhase = await phaseView(nonSubjectIndex, after.roomId);
  await armSubjectSeat(after.matchId, subjectId, expired, afterAnchor.serverNow);
  const afterSeatBefore = await seatFor(after.matchId, subjectId);
  assert.equal(afterSeatBefore.participant_state, "reconnect_grace");

  const postResult = await Promise.allSettled([
    browserVisit(subjectIndex, after.roomId),
    browserVisit(nonSubjectIndex, after.roomId),
  ]);
  const afterPhaseFinal = await phaseView(nonSubjectIndex, after.roomId);
  const afterSeat = await seatFor(after.matchId, subjectId);
  assert.equal(afterSeat.participant_state, "abandoned");
  assert.equal(afterSeat.controller_type, "human", "expired seat must remain staged human before safe boundary");
  assert.ok(afterSeat.replacement_ready_at);

  addCase({
    name: "browser-reconnect-immediately-after-expiry-fails-closed",
    classification: "PASS",
    matchId: after.matchId,
    roomId: after.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: expired,
    before: {
      serverNow: afterAnchor.serverNow,
      phase: afterBeforePhase.phase,
      phaseVersion: afterBeforePhase.phaseVersion,
      seat: afterSeatBefore,
    },
    operation: {
      action: "subject_browser_reconnect_after_expiry",
      outcomes: postResult.map(supportOutcome),
    },
    after: {
      serverNow: afterPhaseFinal.serverNow,
      phase: afterPhaseFinal.phase,
      phaseVersion: afterPhaseFinal.phaseVersion,
      seat: afterSeat,
    },
  });
  pass("browser-reconnect-immediately-after-expiry-fails-closed", {
    deadlineAt: expired,
    browserOutcomes: postResult.map((item) => item.status),
    finalState: afterSeat.participant_state,
  });

  const race = await createDisposableMatch("concurrent-expiry-race");
  const raceAnchor = await touchParticipant(nonSubjectIndex, race.roomId);
  const raceExpired = new Date(Date.parse(raceAnchor.serverNow) - 250).toISOString();
  const raceBeforePhase = await phaseView(nonSubjectIndex, race.roomId);
  await armSubjectSeat(race.matchId, subjectId, raceExpired, raceAnchor.serverNow);
  const raceBeforeSeat = await seatFor(race.matchId, subjectId);
  assert.equal(raceBeforeSeat.participant_state, "reconnect_grace");

  const raceOutcomes = await Promise.allSettled([
    browserVisit(subjectIndex, race.roomId),
    advancePhase(otherIndex, race.roomId, raceBeforePhase.phaseVersion),
  ]);
  const raceFinalPhase = await phaseView(nonSubjectIndex, race.roomId);
  const raceFinalSeat = await seatFor(race.matchId, subjectId);
  assert.equal(raceFinalSeat.participant_state, "abandoned");
  assert.equal(raceFinalSeat.controller_type, "human");
  const { data: raceRows, error: raceRowsError } = await admin
    .from("movie_buff_match_participant_seats")
    .select("seat_index")
    .eq("match_id", race.matchId)
    .eq("original_player_id", subjectId);
  if (raceRowsError) throw raceRowsError;
  assert.equal(raceRows.length, 1, "concurrent workers must preserve one stable seat");

  addCase({
    name: "concurrent-browser-reconnect-versus-expiry-finalization",
    classification: "PASS",
    matchId: race.matchId,
    roomId: race.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: raceExpired,
    before: {
      serverNow: raceAnchor.serverNow,
      phase: raceBeforePhase.phase,
      phaseVersion: raceBeforePhase.phaseVersion,
      seat: raceBeforeSeat,
    },
    operation: {
      action: "subject_browser_reconnect_vs_authoritative_advance",
      outcomes: raceOutcomes.map(supportOutcome),
    },
    after: {
      serverNow: raceFinalPhase.serverNow,
      phase: raceFinalPhase.phase,
      phaseVersion: raceFinalPhase.phaseVersion,
      seat: raceFinalSeat,
    },
  });
  pass("concurrent-browser-reconnect-versus-expiry-finalization", {
    outcomes: raceOutcomes.map((item) => item.status),
    stableSeatRows: raceRows.length,
  });

  const duplicate = await createDisposableMatch("duplicate-expiry-workers");
  const duplicateAnchor = await touchParticipant(nonSubjectIndex, duplicate.roomId);
  const duplicateExpired = new Date(Date.parse(duplicateAnchor.serverNow) - 250).toISOString();
  const duplicateBeforePhase = await phaseView(nonSubjectIndex, duplicate.roomId);
  await armSubjectSeat(duplicate.matchId, subjectId, duplicateExpired, duplicateAnchor.serverNow);
  const duplicateBeforeSeat = await seatFor(duplicate.matchId, subjectId);
  assert.equal(duplicateBeforeSeat.participant_state, "reconnect_grace");

  const duplicateWorkerOutcomes = await Promise.allSettled([
    advancePhase(nonSubjectIndex, duplicate.roomId, duplicateBeforePhase.phaseVersion),
    advancePhase(otherIndex, duplicate.roomId, duplicateBeforePhase.phaseVersion),
    advancePhase(otherIndex, duplicate.roomId, duplicateBeforePhase.phaseVersion),
  ]);
  const duplicateFinalPhase = await phaseView(nonSubjectIndex, duplicate.roomId);
  const duplicateFinalSeat = await seatFor(duplicate.matchId, subjectId);
  assert.equal(duplicateFinalSeat.participant_state, "abandoned");
  assert.equal(duplicateFinalSeat.controller_type, "human");

  const { data: duplicateRows, error: duplicateRowsError } = await admin
    .from("movie_buff_match_participant_seats")
    .select("seat_index")
    .eq("match_id", duplicate.matchId)
    .eq("original_player_id", subjectId);
  if (duplicateRowsError) throw duplicateRowsError;
  assert.equal(duplicateRows.length, 1, "concurrent workers must preserve one stable seat");

  addCase({
    name: "duplicate-expiry-workers-converge",
    classification: "PASS",
    matchId: duplicate.matchId,
    roomId: duplicate.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: duplicateExpired,
    before: {
      serverNow: duplicateAnchor.serverNow,
      phase: duplicateBeforePhase.phase,
      phaseVersion: duplicateBeforePhase.phaseVersion,
      seat: duplicateBeforeSeat,
    },
    operation: {
      action: "concurrent_advance_movie_buff_match_phase",
      workerOutcomes: duplicateWorkerOutcomes.map(supportOutcome),
    },
    after: {
      serverNow: duplicateFinalPhase.serverNow,
      phase: duplicateFinalPhase.phase,
      phaseVersion: duplicateFinalPhase.phaseVersion,
      seat: duplicateFinalSeat,
    },
  });
  pass("duplicate-expiry-workers-converge", {
    workerOutcomes: duplicateWorkerOutcomes.map((item) => item.status),
    stableSeatRows: duplicateRows.length,
  });

  const buster = await createDisposableMatch("buster-vip-boundary");
  await wait(4_250);
  const vipView = await phaseView(nonSubjectIndex, buster.roomId);
  assert.equal(vipView.phase, "vip_lock");
  const busterAnchor = await touchParticipant(nonSubjectIndex, buster.roomId);
  const busterDeadline = new Date(Date.parse(busterAnchor.serverNow) - 500).toISOString();
  const readyAt = new Date(Date.parse(busterAnchor.serverNow) - 1_000).toISOString();
  await armSubjectSeat(buster.matchId, subjectId, busterDeadline, busterAnchor.serverNow, readyAt);
  const busterBeforePhase = await phaseView(nonSubjectIndex, buster.roomId);
  const busterBeforeSeat = await seatFor(buster.matchId, subjectId);
  assert.equal(busterBeforePhase.phase, "vip_lock");
  assert.equal(busterBeforeSeat.controller_type, "human");

  const busterInactiveResults = await Promise.allSettled([
    browserVisit(nonSubjectIndex, buster.roomId),
    browserVisit(otherIndex, buster.roomId),
  ]);
  const busterInactivePhase = await phaseView(nonSubjectIndex, buster.roomId);
  const busterInactiveSeat = await seatFor(buster.matchId, subjectId);
  assert.equal(busterInactiveSeat.participant_state, "abandoned");
  assert.equal(busterInactiveSeat.controller_type, "human");

  addCase({
    name: "buster-inactive-during-private-vip",
    classification: "PASS",
    matchId: buster.matchId,
    roomId: buster.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: busterDeadline,
    before: {
      serverNow: busterAnchor.serverNow,
      phase: busterBeforePhase.phase,
      phaseVersion: busterBeforePhase.phaseVersion,
      seat: busterBeforeSeat,
    },
    operation: {
      action: "subject_abandoned_during_vip_lock",
      outcomes: busterInactiveResults.map(supportOutcome),
    },
    after: {
      serverNow: busterInactivePhase.serverNow,
      phase: busterInactivePhase.phase,
      phaseVersion: busterInactivePhase.phaseVersion,
      seat: busterInactiveSeat,
    },
  });
  pass("buster-inactive-during-private-vip", {
    phase: busterInactivePhase.phase,
    controllerType: busterInactiveSeat.controller_type,
  });

  await Promise.all([
    routePost(nonSubjectIndex, "/api/movie-buff/vip/lock", {
      roomId: buster.roomId,
      roundId: vipView.roundId,
      vipId: null,
      idempotencyKey: randomCode("buster_no_vip_1"),
    }),
    routePost(otherIndex, "/api/movie-buff/vip/lock", {
      roomId: buster.roomId,
      roundId: vipView.roundId,
      vipId: null,
      idempotencyKey: randomCode("buster_no_vip_2"),
    }),
  ]);
  const boardView = await phaseView(nonSubjectIndex, buster.roomId);
  assert.equal(boardView.phase, "board_select");
  const boardSeat = await seatFor(buster.matchId, subjectId);
  assert.equal(boardSeat.controller_type, "buster");
  assert.equal(boardSeat.controller_player_id, null);

  addCase({
    name: "buster-activates-at-authoritative-safe-boundary",
    classification: "PASS",
    matchId: buster.matchId,
    roomId: buster.roomId,
    clockSource: "touch_movie_buff_match_participant",
    deadlineAt: busterDeadline,
    before: {
      serverNow: busterInactivePhase.serverNow,
      phase: busterInactivePhase.phase,
      phaseVersion: busterInactivePhase.phaseVersion,
      seat: busterInactiveSeat,
    },
    operation: {
      action: "authoritative_vip_lock_to_board_select_transition",
      outcomes: [
        { actor: "vip_lock_no_vip_1", status: "submitted" },
        { actor: "vip_lock_no_vip_2", status: "submitted" },
      ],
    },
    after: {
      serverNow: boardView.serverNow,
      phase: boardView.phase,
      phaseVersion: boardView.phaseVersion,
      seat: boardSeat,
    },
  });
  pass("buster-activates-at-authoritative-safe-boundary", {
    phase: boardView.phase,
    controllerType: boardSeat.controller_type,
    controllerPlayerId: boardSeat.controller_player_id,
  });

  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].screenshot({
      path: path.join(evidenceDir, `player-${index + 1}-resilience-final.png`),
      fullPage: true,
    });
  }

  assert.equal(evidence.cases.length, 6);
  assert.equal(evidence.checks.length, 7);
  evidence.classification = "PASS";
} catch (error) {
  evidence.classification = "FAIL";
  evidence.failures.push(serializeError(error));
  process.exitCode = 1;
} finally {
  for (const roomId of cleanupRoomIds.reverse()) {
    try {
      await admin.from("game_rooms").delete().eq("id", roomId);
    } catch (error) {
      evidence.failures.push({ cleanup: roomId, ...serializeError(error) });
      evidence.classification = "FAIL";
      process.exitCode = 1;
    }
  }
  await Promise.allSettled(apiClients.map((client) => client.auth.signOut()));
  await Promise.allSettled(browsers.map((browser) => browser.close()));
  evidence.cleanupRoomCount = cleanupRoomIds.length;
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(evidenceDir, "resilience-browser-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
