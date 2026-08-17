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

const smokeEnvironment = resolveSmokeEnvironment({
  baseUrl: APP_URL,
});

if (
  !isLocalSmokeBaseUrl(APP_URL) &&
  process.env.MOVIE_BUFF_ALLOW_HOSTED_REGRESSION !== "1"
) {
  throw new Error(
    "Hosted board-concurrency regression requires MOVIE_BUFF_ALLOW_HOSTED_REGRESSION=1.",
  );
}

const supabaseUrl = smokeEnvironment.supabaseUrl;
const serviceRoleKey = smokeEnvironment.serviceRoleKey;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Board-concurrency regression requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
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

function pageUrlMatches(url, patterns) {
  return patterns.some((pattern) => {
    const normalizedPattern = pattern
      .replace(/\*\*/g, "")
      .replace(/\*/g, "");

    return url.includes(normalizedPattern);
  });
}

async function waitForUrl(page, patterns, timeout = 45000) {
  if (pageUrlMatches(page.url(), patterns)) {
    return page.url();
  }

  await page.waitForFunction(
    (candidatePatterns) =>
      candidatePatterns.some((pattern) => {
        const normalizedPattern = pattern
          .replace(/\*\*/g, "")
          .replace(/\*/g, "");

        return window.location.href.includes(normalizedPattern);
      }),
    patterns,
    { timeout },
  );

  return page.url();
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

async function waitForLobby(page) {
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

  return session;
}

async function waitForWaitingRoom(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Loading waiting room...",
      ) &&
      document.body?.innerText?.includes("Waiting Room"),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForTwoPlayers(page) {
  await page.waitForFunction(
    () => document.body?.innerText?.includes("2 of 6 Joined"),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForStartMatchEnabled(page) {
  await page.waitForFunction(
    () => {
      const button = Array.from(
        document.querySelectorAll("button"),
      ).find((candidate) =>
        (candidate.textContent ?? "")
          .trim()
          .includes("Start Match"),
      );

      return Boolean(button && !button.hasAttribute("disabled"));
    },
    undefined,
    { timeout: 30000 },
  );
}

async function clickStartRound(page) {
  await page.waitForFunction(
    () =>
      !window.location.pathname.includes(
        "/games/movie-buff/round-intro",
      ) ||
      Array.from(
        document.querySelectorAll("a, button"),
      ).some((candidate) =>
        ["Start Round", "Continue without VIP"].some((label) =>
          (candidate.textContent ?? "").trim().includes(label),
        ),
      ),
    undefined,
    { timeout: 30000 },
  );

  if (!page.url().includes("/round-intro")) {
    return;
  }

  const link = page.getByRole("link", { name: "Start Round" });
  if ((await link.count()) === 1) {
    await link.click();
    return;
  }

  const button = page.getByRole("button", { name: "Start Round" });
  if ((await button.count()) === 1) {
    await button.click();
    return;
  }

  const continueWithoutVip = page.getByRole("button", {
    name: "Continue without VIP",
  });
  if ((await continueWithoutVip.count()) === 1) {
    await continueWithoutVip.click();
    return;
  }

  throw new Error(
    `Start Round control was not found at ${page.url()}.`,
  );
}

async function leaveThroughUi(page) {
  const leaveButton = page.getByRole("button", {
    name: "Leave Match",
  });

  if ((await leaveButton.count()) === 1) {
    await leaveButton.click();
    return true;
  }

  await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
    waitUntil: "domcontentloaded",
  });
  await waitForLobby(page);

  const leaveCurrentButton = page.getByRole("button", {
    name: /Leave Current (Room|Match)/,
  });

  if ((await leaveCurrentButton.count()) === 1) {
    await leaveCurrentButton.click();
    return true;
  }

  return false;
}

async function waitForBoardRender(page) {
  await page.waitForFunction(
    () =>
      window.location.pathname.includes(
        "/games/movie-buff/play",
      ) ||
      (document.body?.innerText?.includes(
        "Live movie board",
      ) &&
        !document.body?.innerText?.includes(
          "Loading the next Movie Buff page.",
        )),
    undefined,
    { timeout: 45000 },
  );
}

async function waitForBoardRows(roomId) {
  const deadline = Date.now() + 30000;
  let lastError = null;

  while (Date.now() < deadline) {
    const { data, error } = await adminSupabase
      .from("movie_buff_boards")
      .select("id, room_id, status, total_tiles_count")
      .eq("room_id", roomId);

    if (error) {
      lastError = new Error(error.message);
    } else if (data?.length === 1) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    lastError?.message ??
      `Expected exactly one board for ${roomId}, got none.`,
  );
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
};

try {
  await Promise.all([
    installSession(pageOne, "board-race-host"),
    installSession(pageTwo, "board-race-guest"),
  ]);

  await clickUnique(pageOne, "button", "Create Room");
  await waitForUrl(pageOne, [
    "**/games/movie-buff/waiting-room?",
  ]);
  await waitForWaitingRoom(pageOne);

  const waitingRoomUrl = new URL(pageOne.url());
  const roomId = waitingRoomUrl.searchParams.get("roomId");
  const roomCode = waitingRoomUrl.searchParams.get("code");

  assert(roomId, "Expected roomId in the waiting-room URL.");
  assert(roomCode, "Expected room code in the waiting-room URL.");

  await pageTwo.getByRole("textbox", { name: "Room code" }).fill(roomCode);
  await clickUnique(pageTwo, "button", "Join");
  await Promise.all([
    waitForWaitingRoom(pageOne),
    waitForWaitingRoom(pageTwo),
    waitForTwoPlayers(pageOne),
    waitForTwoPlayers(pageTwo),
  ]);

  await Promise.all([
    clickUnique(pageOne, "button", "I'm Ready"),
    clickUnique(pageTwo, "button", "I'm Ready"),
  ]);
  await waitForStartMatchEnabled(pageOne);
  await clickUnique(pageOne, "button", "Start Match");
  await Promise.all([
    waitForUrl(pageOne, [
      "**/games/movie-buff/round-intro?",
      "**/games/movie-buff/board-preview?",
      "**/games/movie-buff/play?",
    ]),
    waitForUrl(pageTwo, [
      "**/games/movie-buff/round-intro?",
      "**/games/movie-buff/board-preview?",
      "**/games/movie-buff/play?",
    ]),
  ]);

  await Promise.all([
    waitForUrl(pageOne, [
      "**/games/movie-buff/round-intro?",
    ]),
    waitForUrl(pageTwo, [
      "**/games/movie-buff/round-intro?",
    ]),
  ]);

  result.checkpoints.roundIntro = {
    roomId,
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
  };

  const startRoundAt = new Date().toISOString();
  await Promise.all([
    clickStartRound(pageOne),
    clickStartRound(pageTwo),
  ]);

  await Promise.all([
    waitForUrl(pageOne, [
      "**/games/movie-buff/board-preview?",
      "**/games/movie-buff/play?",
      "**/games/movie-buff/round-results?",
      "**/games/movie-buff/final-results?",
    ]),
    waitForUrl(pageTwo, [
      "**/games/movie-buff/board-preview?",
      "**/games/movie-buff/play?",
      "**/games/movie-buff/round-results?",
      "**/games/movie-buff/final-results?",
    ]),
  ]);

  await Promise.all([
    waitForBoardRender(pageOne),
    waitForBoardRender(pageTwo),
  ]);

  const [pageOneBody, pageTwoBody] = await Promise.all([
    pageOne.locator("body").innerText(),
    pageTwo.locator("body").innerText(),
  ]);
  const combinedBody = `${pageOneBody}\n${pageTwoBody}`;

  if (
    /duplicate key.*movie_buff_boards_room_id_key/i.test(
      combinedBody,
    )
  ) {
    throw new Error(
      [
        "Concurrent board start surfaced movie_buff_boards_room_id_key.",
        `pageOne=${pageOneBody.replace(/\s+/g, " ").slice(0, 1600)}`,
        `pageTwo=${pageTwoBody.replace(/\s+/g, " ").slice(0, 1600)}`,
      ].join("\n"),
    );
  }

  if (
    /Board (?:created|already exists) but could not be reloaded/.test(
      combinedBody,
    )
  ) {
    throw new Error(
      [
        "Concurrent board start left a board reload error visible.",
        `pageOne=${pageOneBody.replace(/\s+/g, " ").slice(0, 1600)}`,
        `pageTwo=${pageTwoBody.replace(/\s+/g, " ").slice(0, 1600)}`,
      ].join("\n"),
    );
  }

  const boardRows = await waitForBoardRows(roomId);

  const boardId = boardRows[0].id;
  const [{ count: categoryCount, error: categoryError }, { count: tileCount, error: tileError }] =
    await Promise.all([
      adminSupabase
        .from("movie_buff_board_categories")
        .select("id", { count: "exact", head: true })
        .eq("board_id", boardId),
      adminSupabase
        .from("movie_buff_board_tiles")
        .select("id", { count: "exact", head: true })
        .eq("board_id", boardId),
    ]);

  if (categoryError) {
    throw new Error(categoryError.message);
  }

  if (tileError) {
    throw new Error(tileError.message);
  }

  assert(
    (categoryCount ?? 0) > 0,
    `Expected board ${boardId} to have categories.`,
  );
  assert(
    (tileCount ?? 0) > 0,
    `Expected board ${boardId} to have tiles.`,
  );

  result.checkpoints.concurrentBoardStart = {
    startRoundAt,
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    boardId,
    boardCount: boardRows.length,
    categoryCount,
    tileCount,
  };

  await Promise.all([
    leaveThroughUi(pageOne),
    leaveThroughUi(pageTwo),
  ]);

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
        error:
          error instanceof Error
            ? error.message
            : String(error),
        stack:
          error instanceof Error
            ? error.stack
            : undefined,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await contextOne.close();
  await contextTwo.close();
  await browser.close();
}
