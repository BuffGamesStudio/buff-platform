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
  failures: [],
};

function pass(name, details = {}) {
  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });
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

async function createDisposableMatch(label) {
  const roomId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  const now = new Date().toISOString();
  cleanupRoomIds.push(roomId);

  const { error: roomError } = await admin.from("game_rooms").insert({
    id: roomId,
    room_code: crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
    host_id: sessions[0].user.id,
    room_type: "private",
    status: "active",
    difficulty: "medium",
    total_rounds: 2,
    max_players: 3,
    current_round: 1,
    is_ranked: false,
    started_at: now,
  });
  if (roomError) throw roomError;

  const { error: membersError } = await admin.from("room_players").insert(
    sessions.map((session, index) => ({
      room_id: roomId,
      player_id: session.user.id,
      is_ready: true,
      is_host: index === 0,
      left_at: null,
      joined_at: new Date(Date.now() + index).toISOString(),
      last_seen_at: now,
    })),
  );
  if (membersError) throw membersError;

  const { error: matchError } = await admin.from("matches").insert({
    id: matchId,
    room_id: roomId,
    difficulty: "medium",
    total_rounds: 2,
    status: "active",
    started_at: now,
  });
  if (matchError) throw matchError;

  const { error: playersError } = await admin.from("match_players").insert(
    sessions.map((session) => ({ match_id: matchId, player_id: session.user.id })),
  );
  if (playersError) throw playersError;

  const { error: roundError } = await admin.from("match_rounds").insert({
    id: roundId,
    match_id: matchId,
    clip_id: null,
    round_number: 1,
    time_limit_seconds: 5,
    started_at: null,
  });
  if (roundError) throw roundError;

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

async function setReconnectGrace(matchId, playerId, deadlineAt, replacementReadyAt = null) {
  const { error } = await admin
    .from("movie_buff_match_participant_seats")
    .update({
      participant_state: "reconnect_grace",
      controller_type: "human",
      controller_player_id: playerId,
      last_seen_at: new Date(Date.now() - 60_000).toISOString(),
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

  const before = await createDisposableMatch("pre-deadline");
  const subjectId = sessions[0].user.id;
  const beforeDeadline = new Date(Date.now() + 4_000).toISOString();
  await setReconnectGrace(before.matchId, subjectId, beforeDeadline);
  await browserVisit(0, before.roomId);
  const beforeSeat = await seatFor(before.matchId, subjectId);
  assert.equal(beforeSeat.participant_state, "active");
  assert.equal(beforeSeat.controller_type, "human");
  assert.equal(beforeSeat.reconnect_deadline_at, null);
  pass("browser-reconnect-immediately-before-expiry", { deadlineAt: beforeDeadline, finalState: beforeSeat.participant_state });

  const after = await createDisposableMatch("post-deadline");
  const expired = new Date(Date.now() - 250).toISOString();
  await setReconnectGrace(after.matchId, subjectId, expired);
  const postResult = await Promise.allSettled([
    browserVisit(0, after.roomId),
    browserVisit(1, after.roomId),
  ]);
  const afterSeat = await seatFor(after.matchId, subjectId);
  assert.equal(afterSeat.participant_state, "abandoned");
  assert.equal(afterSeat.controller_type, "human", "expired seat must remain staged human before safe boundary");
  assert.ok(afterSeat.replacement_ready_at);
  pass("browser-reconnect-immediately-after-expiry-fails-closed", {
    deadlineAt: expired,
    browserOutcomes: postResult.map((item) => item.status),
    finalState: afterSeat.participant_state,
  });

  const race = await createDisposableMatch("concurrent-expiry-race");
  const raceExpired = new Date(Date.now() - 250).toISOString();
  await setReconnectGrace(race.matchId, subjectId, raceExpired);
  const raceOutcomes = await Promise.allSettled([
    browserVisit(0, race.roomId),
    browserVisit(1, race.roomId),
    browserVisit(2, race.roomId),
  ]);
  const raceSeat = await seatFor(race.matchId, subjectId);
  assert.equal(raceSeat.participant_state, "abandoned");
  assert.equal(raceSeat.controller_type, "human");
  const { data: raceRows, error: raceRowsError } = await admin
    .from("movie_buff_match_participant_seats")
    .select("seat_index")
    .eq("match_id", race.matchId)
    .eq("original_player_id", subjectId);
  if (raceRowsError) throw raceRowsError;
  assert.equal(raceRows.length, 1, "concurrent workers must preserve one stable seat");
  pass("concurrent-browser-reconnect-versus-expiry-finalization", {
    outcomes: raceOutcomes.map((item) => item.status),
    stableSeatRows: raceRows.length,
  });
  pass("duplicate-expiry-workers-converge", { workerCount: 3, finalState: raceSeat.participant_state });

  const buster = await createDisposableMatch("buster-vip-boundary");
  const busterSeatInitial = await seatFor(buster.matchId, subjectId);
  const readyAt = new Date(Date.now() - 1_000).toISOString();
  await setReconnectGrace(buster.matchId, subjectId, new Date(Date.now() - 500).toISOString(), readyAt);
  await Promise.allSettled([browserVisit(1, buster.roomId), browserVisit(2, buster.roomId)]);
  const staged = await seatFor(buster.matchId, subjectId);
  assert.equal(staged.participant_state, "abandoned");
  assert.equal(staged.controller_type, "human");

  const { error: vipUpdateError } = await admin
    .from("movie_buff_match_phase_state")
    .update({
      phase: "vip_lock",
      phase_version: buster.initialViews[1].phaseVersion + 1,
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + 30_000).toISOString(),
    })
    .eq("match_id", buster.matchId);
  if (vipUpdateError) throw vipUpdateError;
  await Promise.allSettled([browserVisit(1, buster.roomId), browserVisit(2, buster.roomId)]);
  const vipSeat = await seatFor(buster.matchId, subjectId);
  assert.equal(vipSeat.controller_type, "human", "Buster must remain inactive throughout vip_lock");
  pass("buster-inactive-during-private-vip", { phase: "vip_lock", controllerType: vipSeat.controller_type });

  const { error: boardUpdateError } = await admin
    .from("movie_buff_match_phase_state")
    .update({
      phase: "board_select",
      phase_version: buster.initialViews[1].phaseVersion + 2,
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + 20_000).toISOString(),
      selector_seat_index: busterSeatInitial.seat_index,
      selector_deadline_at: new Date(Date.now() + 20_000).toISOString(),
    })
    .eq("match_id", buster.matchId);
  if (boardUpdateError) throw boardUpdateError;
  await Promise.allSettled([browserVisit(1, buster.roomId), browserVisit(2, buster.roomId)]);
  const boardSeat = await seatFor(buster.matchId, subjectId);
  assert.equal(boardSeat.controller_type, "buster");
  assert.equal(boardSeat.controller_player_id, null);
  pass("buster-activates-at-authoritative-safe-boundary", {
    phase: "board_select",
    controllerType: boardSeat.controller_type,
    fixtureNote: "phase transition was test-fixture controlled; exact RC trigger performed Buster activation",
  });

  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].screenshot({
      path: path.join(evidenceDir, `player-${index + 1}-resilience-final.png`),
      fullPage: true,
    });
  }

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