import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { provisionLocalSmokeSession } from "./movie-buff-smoke-auth.mjs";
import {
  isLocalSmokeBaseUrl,
  resolveSmokeEnvironment,
} from "./movie-buff-smoke-env.mjs";

const PLAYWRIGHT_ENTRY =
  process.env.PLAYWRIGHT_ENTRY ??
  "C:/Users/shapa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const APP_URL =
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";

const CHROME_EXECUTABLE =
  process.env.MOVIE_BUFF_CHROME_EXECUTABLE ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const EXPECTED_DEPLOYMENT_ID =
  process.env.MOVIE_BUFF_EXPECTED_DEPLOYMENT_ID ?? null;
const EXPECTED_DEPLOYMENT_SHA =
  process.env.MOVIE_BUFF_EXPECTED_DEPLOYMENT_SHA ?? null;
const EXPECTED_SUPABASE_REF =
  process.env.MOVIE_BUFF_EXPECTED_SUPABASE_REF ?? null;
const ENTRY_ONLY =
  process.argv.includes("--entry-only") ||
  process.env.MOVIE_BUFF_HAT_ENTRY_ONLY === "1";

const smokeEnvironment = resolveSmokeEnvironment({
  baseUrl: APP_URL,
});
const supabaseUrl = smokeEnvironment.supabaseUrl;
const serviceRoleKey = smokeEnvironment.serviceRoleKey;

if (
  !isLocalSmokeBaseUrl(APP_URL) &&
  process.env.MOVIE_BUFF_ALLOW_HOSTED_REGRESSION !== "1"
) {
  throw new Error(
    "Hosted two-player HAT requires MOVIE_BUFF_ALLOW_HOSTED_REGRESSION=1.",
  );
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Two-player HAT requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

if (
  !isLocalSmokeBaseUrl(APP_URL) &&
  (!EXPECTED_DEPLOYMENT_ID || !EXPECTED_DEPLOYMENT_SHA)
) {
  throw new Error(
    "Hosted two-player HAT requires an expected Vercel deployment ID and Git SHA.",
  );
}

if (
  EXPECTED_SUPABASE_REF &&
  new URL(supabaseUrl).hostname.split(".")[0] !== EXPECTED_SUPABASE_REF
) {
  throw new Error(
    `HAT Supabase target mismatch: expected ${EXPECTED_SUPABASE_REF}, got ${new URL(supabaseUrl).hostname.split(".")[0]}.`,
  );
}

const adminSupabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const { chromium } = await import(
  pathToFileURL(PLAYWRIGHT_ENTRY).href,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function urlMatches(url, patterns) {
  return patterns.some((pattern) => {
    const normalized = pattern
      .replace(/\*\*/g, "")
      .replace(/\*/g, "");
    return url.includes(normalized);
  });
}

async function readBody(page) {
  return page.locator("body").innerText().catch(() => "");
}

async function waitForUrl(page, patterns, timeout = 60000) {
  if (urlMatches(page.url(), patterns)) {
    return page.url();
  }

  await page.waitForFunction(
    (candidatePatterns) =>
      candidatePatterns.some((pattern) => {
        const normalized = pattern
          .replace(/\*\*/g, "")
          .replace(/\*/g, "");
        return window.location.href.includes(normalized);
      }),
    patterns,
    { timeout },
  );

  return page.url();
}

async function waitForLobby(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Checking your Buff Games account...",
      ) &&
      document.body?.innerText?.includes("Create Room") &&
      document.body?.innerText?.includes("Find Match"),
    undefined,
    { timeout: 60000 },
  );
}

async function clickUnique(page, role, name) {
  const locator = page.getByRole(role, { name });
  const count = await locator.count();
  assert(
    count === 1,
    `Expected one ${role} named "${name}", found ${count}.`,
  );
  await locator.click();
}

async function installSession(page, label) {
  const session = await provisionLocalSmokeSession(label);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: session.storageKey,
      value: session.sessionString,
    },
  );

  await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
    waitUntil: "domcontentloaded",
  });
  await waitForLobby(page);

  return {
    userId: session.session.user.id,
  };
}

async function waitForWaitingRoom(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Loading waiting room...",
      ) &&
      document.body?.innerText?.includes("Waiting Room"),
    undefined,
    { timeout: 60000 },
  );
}

async function waitForTwoPlayers(page) {
  await page.waitForFunction(
    () => document.body?.innerText?.includes("2 of 6 Joined"),
    undefined,
    { timeout: 60000 },
  );
}

async function waitForStartMatchEnabled(page) {
  await page.waitForFunction(
    () => {
      const button = Array.from(
        document.querySelectorAll("button"),
      ).find((candidate) =>
        (candidate.textContent ?? "").trim().includes("Start Match"),
      );

      return Boolean(button && !button.hasAttribute("disabled"));
    },
    undefined,
    { timeout: 60000 },
  );
}

async function waitForRoundIntro(page) {
  await page.waitForFunction(
    () =>
      window.location.pathname.includes(
        "/games/movie-buff/round-intro",
      ) &&
      !document.body?.innerText?.includes("Preparing round...") &&
      !document.body?.innerText?.includes(
        "Loading the next Movie Buff page.",
      ) &&
      Array.from(document.querySelectorAll("button, a")).some((control) =>
        (control.textContent ?? "").trim().includes("Start Round"),
      ),
    undefined,
    { timeout: 60000 },
  );
}

async function clickStartRound(page) {
  await waitForRoundIntro(page);
  await clickUnique(page, "link", "Start Round").catch(async () => {
    await clickUnique(page, "button", "Start Round");
  });
}

async function waitForBoardOrPlay(page) {
  await waitForUrl(page, [
    "**/games/movie-buff/board-preview?",
    "**/games/movie-buff/play?",
  ]);
}

async function resolveBoardPreview(page) {
  await waitForBoardOrPlay(page);

  if (page.url().includes("/games/movie-buff/play")) {
    return;
  }

  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    if (page.url().includes("/games/movie-buff/play")) {
      return;
    }

    const tile = page
      .locator("button")
      .filter({ hasText: "Select to lock this round" })
      .first();

    if ((await tile.count()) === 1 && (await tile.isEnabled())) {
      await tile.click();
      await waitForUrl(page, [
        "**/games/movie-buff/play?",
        "**/games/movie-buff/round-results?",
        "**/games/movie-buff/final-results?",
      ]);
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Timed out resolving board preview. url=${page.url()} body=${(await readBody(page))
      .replace(/\s+/g, " ")
      .slice(0, 1200)}`,
  );
}

async function waitForPlayReady(page) {
  await page.waitForURL("**/games/movie-buff/play?", {
    timeout: 60000,
  });
  await playButton(page).waitFor({
    state: "visible",
    timeout: 60000,
  });
}

function playButton(page) {
  return page
    .locator(
      'button[aria-label="Play Movie Clip"], button[aria-label="Play Audio Clip"]',
    )
    .first();
}

async function waitForAnswerInput(page, enabled = true) {
  await page.waitForFunction(
    (shouldBeEnabled) => {
      const input = Array.from(document.querySelectorAll("input")).find(
        (candidate) =>
          candidate.getAttribute("placeholder") ===
          "Enter the movie title",
      );

      return Boolean(
        input && (!shouldBeEnabled || !input.hasAttribute("disabled")),
      );
    },
    enabled,
    { timeout: 60000 },
  );
}

async function waitForBodyText(page, text, timeout = 30000) {
  await page.waitForFunction(
    (expectedText) =>
      (document.body?.innerText ?? "").includes(expectedText),
    text,
    { timeout },
  );
}

async function readSnapshot(roomId) {
  const { data: phase, error: phaseError } = await adminSupabase
    .from("movie_buff_match_phase_state")
    .select(
      "match_id,room_id,round_id,phase,phase_version,phase_started_at,phase_ends_at,answer_deadline_at,results_end_at",
    )
    .eq("room_id", roomId)
    .maybeSingle();

  if (phaseError) {
    throw new Error(`Could not read phase state: ${phaseError.message}`);
  }

  if (!phase) {
    return {
      phase: null,
      playback: [],
      answers: [],
      phaseEvents: [],
      roundEvents: [],
    };
  }

  const [playbackResult, answersResult, phaseEventsResult, roundEventsResult] =
    await Promise.all([
      adminSupabase
        .from("match_round_player_playback")
        .select(
          "round_id,player_id,started_at,play_requested_at,playback_started_at",
        )
        .eq("round_id", phase.round_id),
      adminSupabase
        .from("answers")
        .select("id,round_id,player_id,submitted_answer,submitted_at")
        .eq("round_id", phase.round_id),
      adminSupabase
        .from("movie_buff_match_phase_events")
        .select(
          "from_phase,to_phase,source,occurred_at,payload",
        )
        .eq("match_id", phase.match_id)
        .eq("round_id", phase.round_id)
        .order("occurred_at", { ascending: true }),
      adminSupabase
        .from("movie_buff_round_events")
        .select("event_type,player_id,occurred_at,payload")
        .eq("room_id", roomId)
        .eq("round_id", phase.round_id)
        .order("occurred_at", { ascending: true }),
    ]);

  for (const result of [
    playbackResult,
    answersResult,
    phaseEventsResult,
    roundEventsResult,
  ]) {
    if (result.error) {
      throw new Error(`Could not read HAT evidence: ${result.error.message}`);
    }
  }

  return {
    phase,
    playback: playbackResult.data ?? [],
    answers: answersResult.data ?? [],
    phaseEvents: phaseEventsResult.data ?? [],
    roundEvents: roundEventsResult.data ?? [],
  };
}

async function waitForSnapshot(roomId, predicate, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let latest = await readSnapshot(roomId);

  while (Date.now() < deadline) {
    if (predicate(latest)) {
      return latest;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    latest = await readSnapshot(roomId);
  }

  throw new Error(
    `Timed out waiting for authoritative HAT state. last=${JSON.stringify(
      latest,
    )}`,
  );
}

function rowFor(rows, playerId) {
  return rows.find((row) => row.player_id === playerId) ?? null;
}

function secondsBetween(first, second) {
  return (Date.parse(second) - Date.parse(first)) / 1000;
}

async function leaveThroughUi(page) {
  const leave = page.getByRole("button", { name: "Leave Match" });
  if ((await leave.count()) === 1) {
    await Promise.all([
      page
        .waitForURL("**/games/movie-buff/lobby**", {
          timeout: 15000,
        })
        .catch(() => null),
      leave.click().catch(() => {}),
    ]);
    await page.waitForTimeout(1500);
    return;
  }

  await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
    waitUntil: "domcontentloaded",
  }).catch(() => {});

  const current = page.getByRole("button", {
    name: /Leave Current (Room|Match)/,
  });
  if ((await current.count()) === 1) {
    await current.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}

async function waitForNoActiveRoomPlayers(roomId, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const { count, error } = await adminSupabase
      .from("room_players")
      .select("player_id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .is("left_at", null);

    if (!error && (count ?? 0) === 0) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_EXECUTABLE,
  // The HAT must exercise the app's automatic launch path. Without this
  // explicit policy, headless Chrome rejects audible media playback before
  // the app can record the authoritative clip-start event.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const contextOne = await browser.newContext();
const contextTwo = await browser.newContext();
const pageOne = await contextOne.newPage();
const pageTwo = await contextTwo.newPage();
pageOne.setDefaultTimeout(60000);
pageTwo.setDefaultTimeout(60000);
pageOne.setDefaultNavigationTimeout(60000);
pageTwo.setDefaultNavigationTimeout(60000);

const result = {
  baseUrl: APP_URL,
  expectedDeploymentId: EXPECTED_DEPLOYMENT_ID,
  expectedDeploymentSha: EXPECTED_DEPLOYMENT_SHA,
  expectedSupabaseRef: EXPECTED_SUPABASE_REF,
  testMode: ENTRY_ONLY ? "automatic-entry-only" : "full-two-player-hat",
  browserPlaybackPolicy: "autoplay-policy=no-user-gesture-required",
  supabaseUrl,
  automatedWitness: "Codex automated two-client browser witness",
  namedReviewer: null,
  namedReviewerStatus: "PENDING_HUMAN_NAMED_REVIEWER",
  startedAt: new Date().toISOString(),
  cleanup: {
    roomLeftThroughUi: false,
    accountsDeleted: false,
    accountRetention: "retained; deletion requires an explicit retention policy",
  },
  checkpoints: {},
};

let roomId = null;
let playerOneId = null;
let playerTwoId = null;

try {
  const [playerOne, playerTwo] = await Promise.all([
    installSession(pageOne, "mov19-hat-player-one"),
    installSession(pageTwo, "mov19-hat-player-two"),
  ]);
  playerOneId = playerOne.userId;
  playerTwoId = playerTwo.userId;

  await clickUnique(pageOne, "button", "Create Room");
  await waitForUrl(pageOne, ["**/games/movie-buff/waiting-room?"]);
  await waitForWaitingRoom(pageOne);

  const waitingUrl = new URL(pageOne.url());
  roomId = waitingUrl.searchParams.get("roomId");
  const roomCode = waitingUrl.searchParams.get("code");
  assert(roomId, "The waiting-room URL did not contain roomId.");
  assert(roomCode, "The waiting-room URL did not contain room code.");

  await pageTwo.getByRole("textbox", { name: "Room code" }).fill(roomCode);
  await clickUnique(pageTwo, "button", "Join");
  await Promise.all([
    waitForWaitingRoom(pageOne),
    waitForWaitingRoom(pageTwo),
    waitForTwoPlayers(pageOne),
    waitForTwoPlayers(pageTwo),
  ]);

  result.checkpoints.twoPlayerRoom = {
    roomId,
    playerCount: 2,
    sameRoom: true,
  };

  await Promise.all([
    clickUnique(pageOne, "button", "I'm Ready"),
    clickUnique(pageTwo, "button", "I'm Ready"),
  ]);
  await waitForStartMatchEnabled(pageOne);
  await clickUnique(pageOne, "button", "Start Match");
  await Promise.all([waitForRoundIntro(pageOne), waitForRoundIntro(pageTwo)]);

  // Player two intentionally stays on the round-intro surface. The
  // authoritative phase poll must expose the VIP countdown and move that
  // client into the round without a second manual Start Round click.
  await clickStartRound(pageOne);
  await waitForBodyText(pageTwo, "VIP lock is in progress");
  assert(
    !(await readBody(pageTwo)).includes(
      "Active Movie Buff room membership required",
    ),
    "The idle player lost active room membership while waiting for automatic round entry.",
  );

  result.checkpoints.automaticRoundEntry = {
    playerOne: {
      action: "manual Start Round click",
    },
    playerTwo: {
      action: "no manual Start Round click",
      vipCountdownVisible: true,
      remainedOnRoundIntroBeforeAutomaticEntry: true,
    },
    membershipFailure: false,
  };

  await Promise.all([resolveBoardPreview(pageOne), resolveBoardPreview(pageTwo)]);
  await Promise.all([
    waitForUrl(pageOne, ["**/games/movie-buff/play?"]),
    waitForUrl(pageTwo, ["**/games/movie-buff/play?"]),
  ]);

  assert(
    !(await readBody(pageTwo)).includes(
      "Active Movie Buff room membership required",
    ),
    "The automatically entered player reached play with a membership failure.",
  );
  result.checkpoints.automaticRoundEntry.playerTwo.reachedPlayWithoutClick =
    true;

  if (ENTRY_ONLY) {
    // Reload the same authenticated client to exercise the idempotent entry
    // path, rather than relying only on the first navigation.
    await pageTwo.reload({ waitUntil: "domcontentloaded" });
    await waitForUrl(pageTwo, ["**/games/movie-buff/play?"]);
    assert(
      !(await readBody(pageTwo)).includes(
        "Active Movie Buff room membership required",
      ),
      "Reloading the automatically entered player produced a membership failure.",
    );

    const entrySnapshot = await waitForSnapshot(
      roomId,
      (snapshot) =>
        (snapshot.phase?.phase === "transition" ||
          snapshot.phase?.phase === "playback") &&
        Boolean(rowFor(snapshot.playback, playerOneId)) &&
        Boolean(rowFor(snapshot.playback, playerTwoId)),
    );

    result.checkpoints.automaticRoundEntry.authoritative = {
      phase: entrySnapshot.phase?.phase ?? null,
      playerOnePlaybackRow: Boolean(rowFor(entrySnapshot.playback, playerOneId)),
      playerTwoPlaybackRow: Boolean(rowFor(entrySnapshot.playback, playerTwoId)),
      playerTwoPlaybackRowCount: entrySnapshot.playback.filter(
        (row) => row.player_id === playerTwoId,
      ).length,
      idempotentReload: true,
      noMembershipFailure: true,
    };
    assert(
      entrySnapshot.playback.filter(
        (row) => row.player_id === playerTwoId,
      ).length === 1,
      "Reloading the player created a duplicate playback row.",
    );
  } else {
    // Do not wait for the second browser before exercising the first
    // browser's manual-start path. The production launch window is finite;
    // waiting for both media controls can let the server auto-launch both
    // players before this test clicks Player 1.
    await waitForPlayReady(pageOne);

    const initialSnapshot = await waitForSnapshot(
      roomId,
      (snapshot) => snapshot.phase?.phase === "playback",
    );
    const playerOnePlayButton = playButton(pageOne);
    assert(
      (await playerOnePlayButton.count()) === 1,
      "Player 1 must have an independent clip-start control.",
    );

    // Start these waits without awaiting them so Player 1 can act immediately
    // while Player 2 is still loading its own waiting surface.
    const playerTwoReady = waitForPlayReady(pageTwo);
    const playerTwoCountdown = waitForBodyText(pageTwo, "auto-starts in");

    await playerOnePlayButton.click();
    await Promise.all([playerTwoReady, playerTwoCountdown]);

    const playerTwoPlayButton = playButton(pageTwo);
    assert(
      (await playerTwoPlayButton.count()) === 1,
      "Player 2 must have an independent clip-start control.",
    );

    result.checkpoints.waitingStates = {
      beforeManualStart: true,
      phaseBeforeManualStart: initialSnapshot.phase?.phase ?? null,
      playerTwoAutomaticLaunchCountdownVisible: true,
      playerTwoBodyExcerpt: (await readBody(pageTwo))
        .replace(/\s+/g, " ")
        .slice(0, 1000),
    };

    const manualStartSnapshot = await waitForSnapshot(
      roomId,
      (snapshot) =>
        Boolean(
          rowFor(snapshot.playback, playerOneId)?.playback_started_at,
        ),
    );
    const playerOnePlayback = rowFor(
      manualStartSnapshot.playback,
      playerOneId,
    );
    const playerTwoBeforeAutomatic = rowFor(
      manualStartSnapshot.playback,
      playerTwoId,
    );
    assert(
      playerOnePlayback?.playback_started_at,
      "Manual player did not receive an authoritative playback start.",
    );
    assert(
      !playerTwoBeforeAutomatic?.playback_started_at,
      "The waiting player started before the launch window expired.",
    );

    result.checkpoints.independentStarts = {
      playerOne: {
        action: "manual click",
        playbackStartedAt: playerOnePlayback.playback_started_at,
      },
      playerTwo: {
        action: "still waiting",
        playbackStartedAt: null,
      },
      independent: true,
    };

    await waitForBodyText(pageOne, "Your personal clock is running.");

  const automaticStartSnapshot = await waitForSnapshot(
    roomId,
    (snapshot) =>
      Boolean(
        rowFor(snapshot.playback, playerTwoId)?.playback_started_at,
      ),
    60000,
  );
  const playerTwoPlayback = rowFor(
    automaticStartSnapshot.playback,
    playerTwoId,
  );
  assert(
    playerTwoPlayback?.playback_started_at,
    "Automatic launch did not start the waiting player's clock.",
  );
  assert(
    secondsBetween(
      playerOnePlayback.playback_started_at,
      playerTwoPlayback.playback_started_at,
    ) >= 10,
    "Automatic launch occurred too soon to prove the launch-window behavior.",
  );

  await waitForAnswerInput(pageOne, true);
  await waitForAnswerInput(pageTwo, true);
  await waitForBodyText(pageTwo, "Your personal clock is running.");

  result.checkpoints.automaticTimerStart = {
    playerTwoPlaybackStartedAt: playerTwoPlayback.playback_started_at,
    secondsAfterManualStart: secondsBetween(
      playerOnePlayback.playback_started_at,
      playerTwoPlayback.playback_started_at,
    ),
    automatic: true,
    answerInputUnlocked: true,
  };

  await pageOne
    .getByPlaceholder("Enter the movie title", { exact: true })
    .fill("MOV-19 HAT player one");
  await clickUnique(pageOne, "button", "Submit Answer");
  await waitForBodyText(pageOne, "Your answer is locked");

  const firstAnswerSnapshot = await waitForSnapshot(
    roomId,
    (snapshot) => Boolean(rowFor(snapshot.answers, playerOneId)),
  );
  const firstAnswer = rowFor(firstAnswerSnapshot.answers, playerOneId);
  assert(firstAnswer?.submitted_at, "First answer was not persisted.");
  assert(
    pageOne.url().includes("/games/movie-buff/play"),
    "The early-answer player left the play surface before the other player answered.",
  );
  assert(
    await pageTwo.getByPlaceholder("Enter the movie title", { exact: true }).isEnabled(),
    "The second player could not continue answering while the first player waited.",
  );

  result.checkpoints.waitingStates.afterFirstAnswer = {
    playerOneLocked: true,
    playerOneWaitingText: true,
    playerTwoStillAnswering: true,
  };

  await pageOne.waitForTimeout(2500);
  await pageTwo
    .getByPlaceholder("Enter the movie title", { exact: true })
    .fill("MOV-19 HAT player two");
  await clickUnique(pageTwo, "button", "Submit Answer");

  const completedSnapshot = await waitForSnapshot(
    roomId,
    (snapshot) =>
      Boolean(rowFor(snapshot.answers, playerTwoId)) &&
      snapshot.phase?.phase !== "playback",
    60000,
  );
  const secondAnswer = rowFor(completedSnapshot.answers, playerTwoId);
  assert(secondAnswer?.submitted_at, "Second answer was not persisted.");
  assert(
    secondsBetween(firstAnswer.submitted_at, secondAnswer.submitted_at) >= 2,
    "Answer timestamps did not prove different answer times.",
  );

  await Promise.all([
    waitForUrl(pageOne, [
      "**/games/movie-buff/round-results?",
      "**/games/movie-buff/final-results?",
    ]),
    waitForUrl(pageTwo, [
      "**/games/movie-buff/round-results?",
      "**/games/movie-buff/final-results?",
    ]),
  ]);

  const phaseTransitions = completedSnapshot.phaseEvents.map((event) =>
    `${event.from_phase ?? "∅"}->${event.to_phase}`,
  );
  assert(
    completedSnapshot.phase?.phase === "results" ||
      completedSnapshot.phase?.phase === "finished",
    `Expected results/finished phase after both answers, got ${completedSnapshot.phase?.phase ?? "none"}.`,
  );
  assert(
    phaseTransitions.some((transition) =>
      transition.includes("playback->answer"),
    ) ||
      phaseTransitions.some((transition) =>
        transition.includes("playback->results"),
      ),
    `No playback phase advancement was recorded: ${phaseTransitions.join(", ")}`,
  );

  result.checkpoints.differentAnswerTimes = {
    playerOneSubmittedAt: firstAnswer.submitted_at,
    playerTwoSubmittedAt: secondAnswer.submitted_at,
    secondsBetweenAnswers: secondsBetween(
      firstAnswer.submitted_at,
      secondAnswer.submitted_at,
    ),
  };
    result.checkpoints.phaseAdvancement = {
      phaseBeforeAnswers: firstAnswerSnapshot.phase?.phase ?? "playback",
      phaseAfterBothAnswers: completedSnapshot.phase.phase,
      phaseTransitions,
      bothClientsReachedResults: true,
    };
  }

  await Promise.all([leaveThroughUi(pageOne), leaveThroughUi(pageTwo)]);
  result.cleanup.roomLeftThroughUi = await waitForNoActiveRoomPlayers(
    roomId,
  );

  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? error.message : String(error);
  result.diagnostics = {
    roomId,
    pageOneUrl: pageOne.url(),
    pageTwoUrl: pageTwo.url(),
    pageOneBody: (await readBody(pageOne)).replace(/\s+/g, " ").slice(0, 1800),
    pageTwoBody: (await readBody(pageTwo)).replace(/\s+/g, " ").slice(0, 1800),
  };
  if (roomId) {
    result.authoritativeSnapshot = await readSnapshot(roomId).catch(
      () => null,
    );
  }
} finally {
  if (roomId && !result.cleanup.roomLeftThroughUi) {
    await Promise.all([
      leaveThroughUi(pageOne),
      leaveThroughUi(pageTwo),
    ]).catch(() => {});
    result.cleanup.roomLeftThroughUi = await waitForNoActiveRoomPlayers(
      roomId,
    );
  }
  result.finishedAt = new Date().toISOString();
  await contextOne.close();
  await contextTwo.close();
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}
