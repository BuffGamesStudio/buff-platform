import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { provisionLocalSmokeSession } from "./movie-buff-smoke-auth.mjs";
import { resolveSmokeEnvironment } from "./movie-buff-smoke-env.mjs";

const PLAYWRIGHT_ENTRY =
  process.env.PLAYWRIGHT_ENTRY ??
  "C:/Users/shapa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const APP_URL =
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";

const CHROME_EXECUTABLE =
  process.env.MOVIE_BUFF_CHROME_EXECUTABLE ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const { chromium } = await import(
  pathToFileURL(PLAYWRIGHT_ENTRY).href,
);

const smokeEnvironment = resolveSmokeEnvironment({
  baseUrl: APP_URL,
});
const supabaseUrl = smokeEnvironment.supabaseUrl;
const serviceRoleKey = smokeEnvironment.serviceRoleKey;

const adminSupabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed.\n${
        result.stderr || result.stdout
      }`,
    );
  }

  return result.stdout;
}

function isLocalBaseUrl(url) {
  return /127\.0\.0\.1|localhost/i.test(url);
}

function resolveDbContainerName() {
  const projectId =
    process.env.SUPABASE_LOCAL_PROJECT_ID ??
    "buff-platform";
  const output = runCommand("docker", [
    "ps",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
    "--format",
    "{{.Names}}",
  ]);

  const containerName = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) =>
      line.startsWith("supabase_db_"),
    );

  if (!containerName) {
    throw new Error(
      `Could not find a running Supabase DB container for local project "${projectId}".`,
    );
  }

  return containerName;
}

function runSql(containerName, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
    ],
    {
      encoding: "utf8",
      input: sql,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `SQL verification failed.\n${
        result.stderr || result.stdout
      }`,
    );
  }

  return result.stdout;
}

function extractJsonLine(output) {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const jsonStart = line.indexOf("{");
      return jsonStart >= 0
        ? line.slice(jsonStart)
        : "";
    })
    .find((line) => line.startsWith("{"));

  if (!jsonLine) {
    throw new Error(
      `No JSON payload found in SQL output.\n${output}`,
    );
  }

  return JSON.parse(jsonLine);
}

async function clickUnique(page, role, name) {
  const candidates = [page.getByRole(role, { name })];

  if (role === "link" || role === "button") {
    candidates.push(
      page.getByRole(
        role === "link" ? "button" : "link",
        { name },
      ),
    );
  }

  for (const locator of candidates) {
    const count = await locator.count();

    if (count === 1) {
      await locator.click();
      return;
    }
  }

  const counts = [];

  for (const locator of candidates) {
    counts.push(await locator.count());
  }

  throw new Error(
    `Expected one ${role} named "${name}", found counts ${counts.join(
      ", ",
    )}.`,
  );
}

async function readButtonTexts(page) {
  return page.locator("button").evaluateAll((elements) =>
    elements.map((element) =>
      (element.textContent ?? "").trim(),
    ),
  );
}

async function readBodyText(page) {
  const body = page.locator("body");
  const count = await body.count();

  if (count !== 1) {
    return "";
  }

  return (await body.innerText()).trim();
}

function urlMatchesPattern(url, pattern) {
  return url.includes(
    pattern.replace(/\*\*/g, "").replace(/\*/g, ""),
  );
}

async function waitForEitherUrl(page, patterns) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) =>
      urlMatchesPattern(currentUrl, pattern),
    )
  ) {
    return currentUrl;
  }

  await page.waitForFunction(
    (candidatePatterns) =>
      candidatePatterns.some((pattern) => {
        const normalizedPattern = pattern
          .replace(/\*\*/g, "")
          .replace(/\*/g, "");

        return window.location.href.includes(
          normalizedPattern,
        );
      }),
    patterns,
    { timeout: 30000 },
  );

  return page.url();
}

async function waitForBoardPreviewReady(page) {
  await page.waitForFunction(
    () =>
      window.location.pathname.includes(
        "/games/movie-buff/play",
      ) ||
      (document.body?.innerText?.includes(
        "Live movie board",
      ) &&
        (Array.from(
          document.querySelectorAll("button"),
        ).some((button) =>
          (button.textContent ?? "")
            .trim()
            .includes("Select to lock this round"),
        ) ||
          document.body?.innerText?.includes(
            "Waiting for the current selector to choose a tile.",
          ) ||
          document.body?.innerText?.includes(
            "Choose a category and point value",
          ) ||
          document.body?.innerText?.includes(
            "Preparing the round board",
          ) ||
          document.body?.innerText?.includes(
            "Checking the live Movie Buff phase for this room.",
          ))),
    undefined,
    { timeout: 45000 },
  );
}

async function selectFirstBoardTile(page) {
  await waitForBoardPreviewReady(page);
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    if (page.url().includes("/play")) {
      return;
    }

    const tileButton = page
      .locator("button")
      .filter({
        hasText: "Select to lock this round",
      })
      .first();

    if ((await tileButton.count()) >= 1) {
      await tileButton.click();
      await waitForEitherUrl(page, [
        "**/games/movie-buff/play?**",
        "**/games/movie-buff/round-results?**",
        "**/games/movie-buff/final-results?**",
      ]);
      return;
    }

    if (!page.url().includes("/board-preview")) {
      await waitForEitherUrl(page, [
        "**/games/movie-buff/board-preview?**",
        "**/games/movie-buff/play?**",
        "**/games/movie-buff/round-results?**",
        "**/games/movie-buff/final-results?**",
      ]);

      if (!page.url().includes("/board-preview")) {
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    "Timed out waiting for a selectable board tile or authoritative auto-advance.",
  );
}

async function enterLobbyWithLocalTestAccount(page) {
  const {
    storageKey,
    sessionString,
    session,
  } =
    await provisionLocalSmokeSession(
      "public-leave",
    );
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: storageKey,
      value: sessionString,
    },
  );
  await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Checking your Buff Games account...",
      ) &&
      document.body?.innerText?.includes("Create Room") &&
      document.body?.innerText?.includes("Find Match"),
    undefined,
    { timeout: 45000 },
  );

  return session.user.id;
}

async function waitForWaitingRoomReady(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Loading waiting room...",
      ),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForRoundIntroReady(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Preparing round...",
      ) &&
      !document.body?.innerText?.includes(
        "Loading the next Movie Buff page.",
      ) &&
      (window.location.pathname.includes(
        "/games/movie-buff/play",
      ) ||
        Array.from(
          document.querySelectorAll("button, a"),
        ).some((control) => {
          const text = (control.textContent ?? "").trim();
          return text.includes("Start Round") ||
            text.includes("Continue without VIP");
        })
        ),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForAnswerFormReady(page) {
  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll("input"),
      ).some(
        (input) =>
          input.getAttribute(
            "placeholder",
          ) === "Enter the movie title",
      ),
    undefined,
    { timeout: 30000 },
  );
}

async function ensureReadyForPublicMatch(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!page.url().includes("/waiting-room")) {
      return;
    }

    const readyButton = page.getByRole("button", {
      name: "I'm Ready",
    });

    if ((await readyButton.count()) === 1) {
      await readyButton.click();
      await page.waitForTimeout(1000);
      continue;
    }

    const readyStateDetected =
      (await page
        .getByRole("button", { name: "Ready!" })
        .count()) === 1 ||
      (await page.waitForFunction(
        () =>
          !window.location.pathname.includes(
            "/games/movie-buff/waiting-room",
          ),
        undefined,
        { timeout: 1000 },
      ).then(
        () => true,
        () => false,
      ));

    if (readyStateDetected) {
      return;
    }
  }
}

async function waitForHostedReadyState(
  roomId,
  playerContexts,
) {
  assert(
    adminSupabase,
    "Hosted public leave verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const { data, error } = await adminSupabase
      .from("room_players")
      .select("player_id, is_ready, left_at")
      .eq("room_id", roomId);

    if (error) {
      throw new Error(error.message);
    }

    const activePlayers = (data ?? []).filter(
      (row) => row.left_at == null,
    );
    const readyPlayers = activePlayers.filter(
      (row) => row.is_ready === true,
    );
    const requiredPlayerCount = playerContexts.length;

    if (
      activePlayers.length >= requiredPlayerCount &&
      readyPlayers.length >= requiredPlayerCount
    ) {
      return {
        activePlayerCount: activePlayers.length,
        readyPlayerCount: readyPlayers.length,
      };
    }

    for (const context of playerContexts) {
      const playerRow = activePlayers.find(
        (row) =>
          row.player_id === context.playerId,
      );

      if (
        playerRow &&
        playerRow.is_ready !== true &&
        context.page.url().includes("/waiting-room")
      ) {
        const readyButton =
          context.page.getByRole("button", {
            name: "I'm Ready",
          });

        if ((await readyButton.count()) === 1) {
          await readyButton.click();
        }
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1000),
    );
  }

  throw new Error(
    `Timed out waiting for hosted ready state for room ${roomId}.`,
  );
}

async function enterPublicMatch(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (page.url().includes("/waiting-room")) {
      await waitForWaitingRoomReady(page);
      return page.url();
    }

    if (!page.url().includes("/lobby")) {
      await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
        waitUntil: "domcontentloaded",
      });
    }

    await clickUnique(page, "button", "Find Match");

    try {
      await page.waitForURL(
        "**/games/movie-buff/waiting-room?**",
        { timeout: 15000 },
      );
      await waitForWaitingRoomReady(page);
      return page.url();
    } catch {}
  }

  throw new Error(
    "Could not enter the public waiting room after multiple attempts.",
  );
}

async function resolveIntoPlay(page) {
  await waitForEitherUrl(page, [
    "**/games/movie-buff/round-intro?**",
    "**/games/movie-buff/board-preview?**",
    "**/games/movie-buff/play?**",
  ]);

  if (page.url().includes("/round-intro")) {
    await waitForRoundIntroReady(page);
    const startRoundLink = page.getByRole("link", {
      name: "Start Round",
      exact: true,
    });
    const startRoundButton = page.getByRole("button", {
      name: "Start Round",
      exact: true,
    });
    const continueWithoutVip = page.getByRole("button", {
      name: "Continue without VIP",
      exact: true,
    });

    if ((await startRoundLink.count()) === 1) {
      await startRoundLink.click();
    } else if ((await startRoundButton.count()) === 1) {
      await startRoundButton.click();
    } else {
      await continueWithoutVip.click();
    }
    await waitForEitherUrl(page, [
      "**/games/movie-buff/board-preview?**",
      "**/games/movie-buff/play?**",
    ]);
  }

  if (page.url().includes("/board-preview")) {
    await selectFirstBoardTile(page);
  }
}

function buildVerificationSql(roomId) {
  return `
select json_build_object(
  'roomId', '${roomId}',
  'roomStatus', room.status,
  'finishedAtPresent', (room.finished_at is not null),
  'activePlayerCount', (
    select count(*)::integer
    from public.room_players
    where room_id = room.id
      and left_at is null
  ),
  'readyPlayerCount', (
    select count(*)::integer
    from public.room_players
    where room_id = room.id
      and left_at is null
      and is_ready = true
  ),
  'eventsByType', (
    select json_object_agg(event_type, event_count)
    from (
      select
        event_type,
        count(*)::integer as event_count
      from public.movie_buff_round_events
      where room_id = room.id
      group by event_type
      order by event_type
    ) as grouped_events
  )
)
from public.game_rooms as room
where room.id = '${roomId}'::uuid;
`;
}

async function verifySupabasePublicLeaveState(roomId) {
  assert(
    adminSupabase,
    "Supabase public-leave verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  const [roomResult, playersResult, eventsResult] =
    await Promise.all([
      adminSupabase
        .from("game_rooms")
        .select("id, status, finished_at")
        .eq("id", roomId)
        .maybeSingle(),
      adminSupabase
        .from("room_players")
        .select("player_id, is_ready")
        .eq("room_id", roomId)
        .is("left_at", null),
      adminSupabase
        .from("movie_buff_round_events")
        .select("event_type")
        .eq("room_id", roomId),
    ]);

  for (const response of [
    roomResult,
    playersResult,
    eventsResult,
  ]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  const eventsByType = {};

  for (const row of eventsResult.data ?? []) {
    eventsByType[row.event_type] =
      (eventsByType[row.event_type] ?? 0) + 1;
  }

  return {
    verificationMode: "supabase-api",
    roomId,
    roomStatus: roomResult.data?.status ?? null,
    finishedAtPresent:
      roomResult.data?.finished_at != null,
    activePlayerCount:
      (playersResult.data ?? []).length,
    readyPlayerCount: (playersResult.data ?? [])
      .filter((row) => row.is_ready === true)
      .length,
    eventsByType,
  };
}

async function verifyHostedRemainingPlayerState(page) {
  await page.waitForTimeout(4000);

  const currentUrl = page.url();
  const body = await page.locator("body").innerText();

  assert(
    !currentUrl.includes("/games/movie-buff/lobby"),
    "Remaining public player was unexpectedly returned to the lobby.",
  );

  assert(
    !body.includes("Application error") &&
      !body.includes("Unexpected Application Error"),
    "Remaining public player hit an application error after the other player left.",
  );

  const canContinue =
    currentUrl.includes("/games/movie-buff/play") ||
    currentUrl.includes("/games/movie-buff/round-results") ||
    currentUrl.includes("/games/movie-buff/final-results") ||
    body.includes("Enter the movie title") ||
    body.includes("Round Results") ||
    body.includes("Final Results");

  assert(
    canContinue,
    "Remaining public player did not stay in a playable or post-round state after the other player left.",
  );

  return {
    verificationMode: "hosted-browser",
    remainingUrl: currentUrl,
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_EXECUTABLE,
});

const contextOne = await browser.newContext();
const contextTwo = await browser.newContext();
const contextThree = await browser.newContext();
const pageOne = await contextOne.newPage();
const pageTwo = await contextTwo.newPage();
const pageThree = await contextThree.newPage();

const result = {
  baseUrl: APP_URL,
  checkpoints: {},
  leaveVerification: null,
};

try {
  const [playerOneId, playerTwoId, playerThreeId] =
    await Promise.all([
      enterLobbyWithLocalTestAccount(pageOne),
      enterLobbyWithLocalTestAccount(pageTwo),
      enterLobbyWithLocalTestAccount(pageThree),
    ]);

  await Promise.all([
    enterPublicMatch(pageOne),
    enterPublicMatch(pageTwo),
    enterPublicMatch(pageThree),
  ]);

  const roomUrlOne = pageOne.url();
  const roomUrlTwo = pageTwo.url();
  const roomUrlThree = pageThree.url();
  const roomIdOne = new URL(roomUrlOne).searchParams.get(
    "roomId",
  );
  const roomIdTwo = new URL(roomUrlTwo).searchParams.get(
    "roomId",
  );
  const roomIdThree = new URL(roomUrlThree).searchParams.get(
    "roomId",
  );

  assert(
    roomIdOne &&
      roomIdTwo &&
      roomIdThree &&
      roomIdOne === roomIdTwo &&
      roomIdTwo === roomIdThree,
    "Expected all players to enter the same public room.",
  );

  result.checkpoints.waitingRoom = {
    pageOne: roomUrlOne,
    pageTwo: roomUrlTwo,
    pageThree: roomUrlThree,
    roomId: roomIdOne,
    playerOneId,
    playerTwoId,
    playerThreeId,
  };

  await Promise.all([
    ensureReadyForPublicMatch(pageOne),
    ensureReadyForPublicMatch(pageTwo),
    ensureReadyForPublicMatch(pageThree),
  ]);

  if (!isLocalBaseUrl(APP_URL)) {
    result.checkpoints.readyState = await waitForHostedReadyState(
      roomIdOne,
      [
        {
          playerId: playerOneId,
          page: pageOne,
        },
        {
          playerId: playerTwoId,
          page: pageTwo,
        },
        {
          playerId: playerThreeId,
          page: pageThree,
        },
      ],
    );
  }

  await Promise.all([
    resolveIntoPlay(pageOne),
    resolveIntoPlay(pageTwo),
    resolveIntoPlay(pageThree),
  ]);

  await Promise.all([
    waitForAnswerFormReady(pageOne),
    waitForAnswerFormReady(pageTwo),
    waitForAnswerFormReady(pageThree),
  ]);

  result.checkpoints.play = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    pageThree: pageThree.url(),
  };

  await clickUnique(pageThree, "button", "Leave Match");
  await pageThree.waitForURL("**/games/movie-buff/lobby");

  result.checkpoints.afterLeave = {
    leaverPage: pageThree.url(),
    remainingPageOneBeforeCheck: pageOne.url(),
    remainingPageTwoBeforeCheck: pageTwo.url(),
  };

  await pageOne.waitForTimeout(1500);

  const verification = adminSupabase
    ? await verifySupabasePublicLeaveState(roomIdOne)
    : isLocalBaseUrl(APP_URL)
      ? (() => {
        const containerName =
          resolveDbContainerName();
        const localVerification =
          extractJsonLine(
            runSql(
              containerName,
              buildVerificationSql(roomIdOne),
            ),
          );

        assert(
          localVerification.roomStatus === "active",
          `Expected active room after one public player left, got ${localVerification.roomStatus}.`,
        );
        assert(
          localVerification.activePlayerCount === 2,
          `Expected 2 active players after one public player left, got ${localVerification.activePlayerCount}.`,
        );
        assert(
          Number(
            localVerification.eventsByType?.player_left ??
              0,
          ) >= 1,
          "Expected at least one player_left event.",
        );
        assert(
          Number(
            localVerification.eventsByType
              ?.match_abandoned ?? 0,
          ) === 0,
          "Did not expect match_abandoned while one public player remains.",
        );

          return {
            verificationMode: "local-sql",
            ...localVerification,
          };
        })()
      : {
          remainingPageOne: await verifyHostedRemainingPlayerState(
            pageOne,
          ),
          remainingPageTwo: await verifyHostedRemainingPlayerState(
            pageTwo,
          ),
        };

  result.leaveVerification = verification;

  console.log(
    JSON.stringify(
      {
        ok: true,
        result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        result,
        diagnostics: {
          pageOneUrl: pageOne.url?.() ?? null,
          pageTwoUrl: pageTwo.url?.() ?? null,
          pageThreeUrl: pageThree.url?.() ?? null,
          pageOneButtons: await readButtonTexts(
            pageOne,
          ).catch(() => []),
          pageTwoButtons: await readButtonTexts(
            pageTwo,
          ).catch(() => []),
          pageThreeButtons: await readButtonTexts(
            pageThree,
          ).catch(() => []),
          pageOneBody: await readBodyText(pageOne).catch(
            () => "",
          ),
          pageTwoBody: await readBodyText(pageTwo).catch(
            () => "",
          ),
          pageThreeBody: await readBodyText(
            pageThree,
          ).catch(() => ""),
        },
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await contextOne.close();
  await contextTwo.close();
  await contextThree.close();
  await browser.close();
}
