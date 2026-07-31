import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { provisionLocalSmokeSession } from "./movie-buff-smoke-auth.mjs";

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
  const output = runCommand("docker", [
    "ps",
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
      "Could not find a running Supabase DB container.",
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

async function fillUnique(page, placeholder, value) {
  const locator = page.getByPlaceholder(
    placeholder,
    { exact: true },
  );
  const count = await locator.count();
  assert(
    count === 1,
    `Expected one input with placeholder "${placeholder}", found ${count}.`,
  );
  await locator.click();
  await locator.press("ControlOrMeta+A");
  await locator.press("Backspace");
  await locator.type(value);
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

  for (const pattern of patterns) {
    try {
      await page.waitForURL(pattern, {
        timeout: 15000,
      });
      return page.url();
    } catch {}
  }

  throw new Error(
    `Timed out waiting for any URL in: ${patterns.join(", ")}`,
  );
}

async function waitForBoardPreviewReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Prototype board",
      ) &&
      (Array.from(
        document.querySelectorAll("button"),
      ).some((button) =>
        (button.textContent ?? "")
          .trim()
          .includes("Select to lock this round"),
      ) ||
        document.body?.innerText?.includes(
          "Board persistence is temporarily unavailable for this room.",
        ) ||
        document.body?.innerText?.includes(
          "Continue to Clip Round",
        )),
    undefined,
    { timeout: 30000 },
  );
}

async function selectFirstBoardTile(page) {
  await waitForBoardPreviewReady(page);

  const continueButton = page.getByRole("link", {
    name: "Continue to Clip Round",
  });

  if ((await continueButton.count()) === 1) {
    await continueButton.click();
    await page.waitForURL(
      "**/games/movie-buff/play?**",
    );
    return;
  }

  const tileButton = page
    .locator("button")
    .filter({
      hasText: "Select to lock this round",
    })
    .first();

  const count = await tileButton.count();
  assert(
    count >= 1,
    "No selectable board tile was available.",
  );

  await tileButton.click();
  await page.waitForURL(
    "**/games/movie-buff/play?**",
  );
}

async function enterLobbyWithLocalTestAccount(page) {
  const { storageKey, sessionString } =
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
          document.querySelectorAll("button"),
        ).some((button) =>
          (button.textContent ?? "")
            .trim()
            .includes("Start Round"),
        )),
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
    await clickUnique(page, "button", "Start Round");
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
const pageOne = await contextOne.newPage();
const pageTwo = await contextTwo.newPage();

const result = {
  baseUrl: APP_URL,
  checkpoints: {},
  leaveVerification: null,
};

try {
  await Promise.all([
    enterLobbyWithLocalTestAccount(pageOne),
    enterLobbyWithLocalTestAccount(pageTwo),
  ]);

  await Promise.all([
    enterPublicMatch(pageOne),
    enterPublicMatch(pageTwo),
  ]);

  const roomUrlOne = pageOne.url();
  const roomUrlTwo = pageTwo.url();
  const roomIdOne = new URL(roomUrlOne).searchParams.get(
    "roomId",
  );
  const roomIdTwo = new URL(roomUrlTwo).searchParams.get(
    "roomId",
  );

  assert(
    roomIdOne &&
      roomIdTwo &&
      roomIdOne === roomIdTwo,
    "Expected both players to enter the same public room.",
  );

  result.checkpoints.waitingRoom = {
    pageOne: roomUrlOne,
    pageTwo: roomUrlTwo,
    roomId: roomIdOne,
  };

  await Promise.all([
    clickUnique(pageOne, "button", "I'm Ready"),
    clickUnique(pageTwo, "button", "I'm Ready"),
  ]);

  await Promise.all([
    resolveIntoPlay(pageOne),
    resolveIntoPlay(pageTwo),
  ]);

  await Promise.all([
    waitForAnswerFormReady(pageOne),
    waitForAnswerFormReady(pageTwo),
  ]);

  result.checkpoints.play = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
  };

  await clickUnique(pageTwo, "button", "Leave Match");
  await pageTwo.waitForURL("**/games/movie-buff/lobby");

  result.checkpoints.afterLeave = {
    leaverPage: pageTwo.url(),
    remainingPageBeforeCheck: pageOne.url(),
  };

  await pageOne.waitForTimeout(1500);

  const verification = isLocalBaseUrl(APP_URL)
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
          localVerification.activePlayerCount === 1,
          `Expected 1 active player after one public player left, got ${localVerification.activePlayerCount}.`,
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
    : await verifyHostedRemainingPlayerState(pageOne);

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
} finally {
  await contextOne.close();
  await contextTwo.close();
  await browser.close();
}
