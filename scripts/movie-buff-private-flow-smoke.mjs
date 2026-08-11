import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
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

const MAX_ROUNDS =
  Number.parseInt(
    process.env.MOVIE_BUFF_PRIVATE_SMOKE_MAX_ROUNDS ??
      "10",
    10,
  ) || 10;

const { chromium } = await import(
  pathToFileURL(PLAYWRIGHT_ENTRY).href
);

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const parsed = {};

  if (!fs.existsSync(envPath)) {
    return parsed;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
}

const localEnv = loadLocalEnv();
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SECRET_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY;

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

async function fillUnique(
  page,
  placeholder,
  value,
) {
  const locator = page.getByPlaceholder(
    placeholder,
    { exact: true },
  );
  const deadline = Date.now() + 5000;
  let count = await locator.count();

  while (count !== 1 && Date.now() < deadline) {
    await page.waitForTimeout(250);
    count = await locator.count();
  }

  assert(
    count === 1,
    `Expected one input with placeholder "${placeholder}", found ${count}.`,
  );
  await locator.fill(value);
}

async function maybeReadText(page, text) {
  const locator = page.getByText(text, {
    exact: true,
  });
  const count = await locator.count();

  if (count !== 1) {
    return false;
  }

  return locator.isVisible();
}

async function readButtonTexts(page) {
  return page.locator("button").evaluateAll((elements) =>
    elements.map((element) =>
      (element.textContent ?? "").trim(),
    ),
  );
}

function urlMatchesPattern(url, pattern) {
  const normalizedPattern = pattern
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");

  return url.includes(normalizedPattern);
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
            "Waiting for the current selector to choose a tile.",
          ) ||
          document.body?.innerText?.includes(
            "Round intro is live. The board unlocks",
          ) ||
          document.body?.innerText?.includes(
            "VIP lock is in progress. The board opens",
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
  const { storageKey, sessionString } =
    await provisionLocalSmokeSession("private");
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

async function enterPrivateRoom(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (
      page.url().includes(
        "/games/movie-buff/waiting-room"
      )
    ) {
      await waitForWaitingRoomReady(page);
      return page.url();
    }

    await clickUnique(page, "button", "Create Room");

    try {
      await page.waitForURL(
        "**/games/movie-buff/waiting-room?**",
        { timeout: 15000 }
      );
      await waitForWaitingRoomReady(page);
      return page.url();
    } catch {
      // Retry once the lobby settles again.
    }
  }

  throw new Error(
    "Could not enter the private waiting room after multiple attempts."
  );
}

async function waitForPrivateStartReady(page) {
  await page.waitForFunction(
    () => {
      const buttons = Array.from(
        document.querySelectorAll("button"),
      );

      const readyButton = buttons.find((button) =>
        (button.textContent ?? "")
          .trim()
          .includes("Ready!"),
      );
      const startButton = buttons.find((button) =>
        (button.textContent ?? "")
          .trim()
          .includes("Start Match"),
      );

      return Boolean(
        readyButton &&
          !readyButton.hasAttribute("disabled") &&
          startButton &&
          !startButton.hasAttribute("disabled"),
      );
    },
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
        ).some((control) =>
          (control.textContent ?? "")
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

async function waitForResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Leave Match",
      ) &&
      document.body?.innerText?.includes(
        "Movie Buff",
      ),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForAuthoritativeAnswerPhase(
  page,
  roomId
) {
  assert(
    adminSupabase,
    "Movie Buff private smoke requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const { data, error } =
      await adminSupabase.rpc(
        "get_movie_buff_match_phase_view",
        {
          p_room_id: roomId,
        },
      );

    if (error) {
      throw new Error(
        `Authoritative phase check failed: ${error.message}`,
      );
    }

    const phase = data?.phase ?? null;
    const phaseRoute =
      data?.phaseRoute ?? null;

    if (phase === "answer") {
      return;
    }

    if (
      phase === "abandoned" ||
      phase === "blocked" ||
      phaseRoute ===
        "/games/movie-buff/round-results" ||
      phaseRoute ===
        "/games/movie-buff/final-results"
    ) {
      throw new Error(
        `Authoritative phase reached ${phase ?? "unknown"} before answer entry.\nphase_route=${phaseRoute ?? "unknown"}\npage_url=${page.url()}`,
      );
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Timed out waiting for authoritative answer phase.\npage_url=${page.url()}`,
  );
}

async function startPlaybackAndWait(page, roomId) {
  const playButton = page.getByRole("button", {
    name: "Play Movie Clip",
  });
  const playButtonCount =
    await playButton.count();

  if (playButtonCount === 0) {
    await waitForAuthoritativeAnswerPhase(
      page,
      roomId
    );
    return;
  }

  assert(
    playButtonCount === 1,
    `Expected one Play Movie Clip button, found ${playButtonCount}.`,
  );

  await playButton.click();

  try {
    await page.waitForFunction(
      () => {
        const bodyText =
          document.body?.innerText ?? "";
        const playStillVisible = Array.from(
          document.querySelectorAll("button"),
        ).some((button) =>
          (button.textContent ?? "")
            .trim()
            .includes("Play Movie Clip"),
        );

        return (
          bodyText.includes(
            "The media could not be played or synced",
          ) ||
          bodyText.includes(
            "Time is up. Loading round results...",
          ) ||
          (!playStillVisible &&
            !bodyText.includes(
              "The clock starts when playback begins.",
            ))
        );
      },
      undefined,
      { timeout: 15000 },
    );
  } catch (error) {
    const bodyText = await page.evaluate(
      () => document.body?.innerText ?? "",
    );

    throw new Error(
      [
        error instanceof Error
          ? error.message
          : String(error),
        `playback_page_url=${page.url()}`,
        `playback_page_excerpt=${bodyText
          .replace(/\s+/g, " ")
          .slice(0, 1200)}`,
      ].join("\n"),
    );
  }

  const bodyText = await page.evaluate(
    () => document.body?.innerText ?? "",
  );

  if (
    bodyText.includes(
      "The media could not be played or synced",
    ) ||
    bodyText.includes(
      "Time is up. Loading round results...",
    )
  ) {
    throw new Error(
      `Playback did not open an answer window.\nplayback_page_url=${page.url()}\nplayback_page_excerpt=${bodyText
        .replace(/\s+/g, " ")
        .slice(0, 1200)}`,
    );
  }

  await waitForAuthoritativeAnswerPhase(
    page,
    roomId
  );
}

async function waitForFinalResultsReady(page) {
  await Promise.all([
    page
      .getByRole("button", {
        name: "Play Again",
      })
      .first()
      .waitFor({ timeout: 30000 }),
    page
      .getByRole("button", {
        name: "Return to Lobby",
      })
      .first()
      .waitFor({ timeout: 30000 }),
  ]);
}

async function waitForPostResultsTransition(page) {
  if (
    page.url().includes("/final-results") ||
    !page.url().includes("/round-results")
  ) {
    return page.url();
  }

  await page.waitForFunction(
    () =>
      !window.location.pathname.includes(
        "/games/movie-buff/round-results",
      ),
    undefined,
    { timeout: 45000 },
  );

  return page.url();
}

async function resolveIntoPlay(page) {
  if (page.url().includes("/waiting-room")) {
    await waitForPrivateStartReady(page);

    const startMatchButton = page.getByRole(
      "button",
      { name: "Start Match" },
    );

    if ((await startMatchButton.count()) === 1) {
      await startMatchButton.click();
      await waitForEitherUrl(page, [
        "**/games/movie-buff/round-intro?**",
        "**/games/movie-buff/board-preview?**",
        "**/games/movie-buff/play?**",
      ]);
    }
  } else {
    await waitForEitherUrl(page, [
      "**/games/movie-buff/round-intro?**",
      "**/games/movie-buff/board-preview?**",
      "**/games/movie-buff/play?**",
    ]);
  }

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

async function playOneRound(
  page,
  roomId,
  guessText
) {
  await waitForAnswerFormReady(page);
  await fillUnique(
    page,
    "Enter the movie title",
    guessText,
  );

  await startPlaybackAndWait(page, roomId);

  await fillUnique(
    page,
    "Enter the movie title",
    guessText,
  );

  await clickUnique(page, "button", "Submit Answer");

  await waitForEitherUrl(page, [
    "**/games/movie-buff/round-results?**",
    "**/games/movie-buff/final-results?**",
  ]);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_EXECUTABLE,
});

const context = await browser.newContext();
const page = await context.newPage();

const result = {
  baseUrl: APP_URL,
  checkpoints: {},
  rounds: [],
};

try {
  assert(
    adminSupabase,
    "Movie Buff private smoke requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  await enterLobbyWithLocalTestAccount(page);

  result.checkpoints.lobby = {
    page: page.url(),
  };

  await enterPrivateRoom(page);

  const roomId =
    new URL(page.url()).searchParams.get(
      "roomId",
    ) ?? "";

  assert(
    roomId,
    "Expected a roomId in private waiting-room URL.",
  );

  result.checkpoints.waitingRoom = {
    page: page.url(),
    roomId,
    buttons: await readButtonTexts(page),
  };

  await clickUnique(page, "button", "I'm Ready");
  await resolveIntoPlay(page);

  result.checkpoints.readyCheck = {
    page: page.url(),
  };

  for (
    let roundNumber = 1;
    roundNumber <= MAX_ROUNDS;
    roundNumber += 1
  ) {
    const roundResult = {
      roundNumber,
      start: {
        page: page.url(),
      },
    };

    await playOneRound(
      page,
      roomId,
      `Private Smoke Guess ${roundNumber}`,
    );

    roundResult.results = {
      page: page.url(),
      correctVisible: await maybeReadText(
        page,
        "Correct",
      ),
      incorrectVisible: await maybeReadText(
        page,
        "Incorrect",
      ),
    };

    result.rounds.push(roundResult);

    if (page.url().includes("/final-results")) {
      await waitForFinalResultsReady(page);
      result.checkpoints.finalResults = {
        page: page.url(),
        roundNumber,
      };
      break;
    }

    await waitForResultsReady(page);
    await waitForPostResultsTransition(page);

    if (page.url().includes("/final-results")) {
      await waitForFinalResultsReady(page);
      result.checkpoints.finalResults = {
        page: page.url(),
        roundNumber,
      };
      break;
    }

    await resolveIntoPlay(page);
    roundResult.nextRound = {
      page: page.url(),
    };
  }

  assert(
    Boolean(result.checkpoints.finalResults),
    "Private flow did not reach final results.",
  );

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
          pageUrl: page.url(),
          pageButtons: await readButtonTexts(
            page,
          ).catch(() => []),
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
  await browser.close();
}
