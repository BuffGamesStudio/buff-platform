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
    process.env.MOVIE_BUFF_SMOKE_MAX_ROUNDS ??
      "10",
    10
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
        { name }
      )
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
      ", "
    )}.`
  );
}

async function fillUnique(
  page,
  placeholder,
  value
) {
  const locator = page.getByPlaceholder(
    placeholder,
    { exact: true }
  );
  const deadline = Date.now() + 5000;
  let count = await locator.count();

  while (count !== 1 && Date.now() < deadline) {
    await page.waitForTimeout(250);
    count = await locator.count();
  }

  assert(
    count === 1,
    `Expected one input with placeholder "${placeholder}", found ${count}.`
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
      (element.textContent ?? "").trim()
    )
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
  const normalizedPattern = pattern
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");

  return url.includes(normalizedPattern);
}

const PLAY_ROUTE_TRANSITION_TEXT = [
  "Loading round...",
  "Loading round results...",
  "Preparing round...",
  "Loading the next Movie Buff page.",
  "Checking the live Movie Buff phase for this room.",
];

function bodyShowsLoadingResults(bodyText) {
  return (
    bodyText.includes("Loading round results") ||
    bodyText.includes("Round Results") ||
    bodyText.includes("Final Results")
  );
}

async function waitForEitherUrl(page, patterns) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) =>
      urlMatchesPattern(currentUrl, pattern)
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
          normalizedPattern
        );
      }),
    patterns,
    { timeout: 30000 }
  );

  return page.url();
}

async function waitForResultsSurface(
  page,
  patterns
) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) =>
      urlMatchesPattern(currentUrl, pattern)
    )
  ) {
    return currentUrl;
  }

  const currentBodyText =
    await readBodyText(page);

  if (bodyShowsLoadingResults(currentBodyText)) {
    return currentUrl;
  }

  await page.waitForFunction(
    (candidatePatterns) => {
      const href = window.location.href;
      const bodyText =
        document.body?.innerText ?? "";

      const onResultsUrl =
        candidatePatterns.some((pattern) => {
          const normalizedPattern = pattern
            .replace(/\*\*/g, "")
            .replace(/\*/g, "");

          return href.includes(
            normalizedPattern
          );
        });

      return (
        onResultsUrl ||
        bodyText.includes(
          "Loading round results"
        ) ||
        bodyText.includes("Round Results") ||
        bodyText.includes("Final Results")
      );
    },
    patterns,
    { timeout: 30000 }
  );

  return page.url();
}

async function waitForPlayRouteReady(page) {
  await page.waitForFunction(
    (transitionSnippets) => {
      if (
        !window.location.pathname.includes(
          "/games/movie-buff/play"
        )
      ) {
        return false;
      }

      const bodyText =
        document.body?.innerText ?? "";

      if (
        transitionSnippets.some((snippet) =>
          bodyText.includes(snippet)
        )
      ) {
        return false;
      }

      const hasAnswerInput = Array.from(
        document.querySelectorAll("input")
      ).some(
        (input) =>
          input.getAttribute(
            "placeholder"
          ) === "Enter the movie title"
      );

      const hasPlayButton = Array.from(
        document.querySelectorAll("button")
      ).some((button) =>
        (button.textContent ?? "")
          .trim()
          .includes("Play Movie Clip")
      );

      return hasAnswerInput || hasPlayButton;
    },
    PLAY_ROUTE_TRANSITION_TEXT,
    { timeout: 45000 }
  );
}

async function waitForBoardPreviewReady(page) {
  await page.waitForFunction(
    () =>
      window.location.pathname.includes(
        "/games/movie-buff/play"
      ) ||
      (document.body?.innerText?.includes(
        "Prototype board"
      ) &&
        (Array.from(
          document.querySelectorAll("button")
        ).some((button) =>
          (button.textContent ?? "")
            .trim()
            .includes("Select to lock this round")
        ) ||
          document.body?.innerText?.includes(
            "Waiting for the current selector to choose a tile."
          ) ||
          document.body?.innerText?.includes(
            "Round intro is live. The board unlocks"
          ) ||
          document.body?.innerText?.includes(
            "VIP lock is in progress. The board opens"
          ) ||
          document.body?.innerText?.includes(
            "Checking the live Movie Buff phase for this room."
          ))),
    undefined,
    { timeout: 45000 }
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
    "Timed out waiting for a selectable board tile or authoritative auto-advance."
  );
}

async function enterLobbyWithLocalTestAccount(page) {
  const { storageKey, sessionString } =
    await provisionLocalSmokeSession("public");
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

async function enterPublicMatch(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentUrl = page.url();

    if (currentUrl.includes("/waiting-room")) {
      await waitForWaitingRoomReady(page);
      return page.url();
    }

    if (!currentUrl.includes("/lobby")) {
      await page.goto(`${APP_URL}/games/movie-buff/lobby`, {
        waitUntil: "domcontentloaded",
      });
    }

    await clickUnique(page, "button", "Find Match");

    try {
      await page.waitForURL(
        "**/games/movie-buff/waiting-room?**",
        { timeout: 15000 }
      );
      await waitForWaitingRoomReady(page);
      return page.url();
    } catch {
      // Retry once the page has settled.
    }
  }

  throw new Error(
    "Could not enter the public waiting room after multiple attempts."
  );
}

async function waitForWaitingRoomReady(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Loading waiting room..."
      ),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForRoundIntroReady(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Preparing round..."
      ) &&
      !document.body?.innerText?.includes(
        "Loading the next Movie Buff page."
      ) &&
      (window.location.pathname.includes(
        "/games/movie-buff/play"
      ) ||
        Array.from(
          document.querySelectorAll(
            "button, a"
          )
        ).some(
          (control) =>
            (control.textContent ?? "")
              .trim()
              .includes("Start Round")
        )),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForAnswerFormReady(page) {
  await waitForPlayRouteReady(page);
  await page.waitForFunction(
    (transitionSnippets) => {
      const bodyText =
        document.body?.innerText ?? "";

      if (
        transitionSnippets.some((snippet) =>
          bodyText.includes(snippet)
        )
      ) {
        return false;
      }

      return Array.from(
        document.querySelectorAll("input")
      ).some(
        (input) =>
          input.getAttribute(
            "placeholder"
          ) === "Enter the movie title"
      );
    },
    PLAY_ROUTE_TRANSITION_TEXT,
    { timeout: 45000 }
  );
}

async function waitForResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Leave Match"
      ) &&
      document.body?.innerText?.includes(
        "Movie Buff"
      ),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForAuthoritativeAnswerPhase(
  page,
  roomId
) {
  assert(
    adminSupabase,
    "Movie Buff public smoke requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
  );

  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const { data, error } =
      await adminSupabase.rpc(
        "get_movie_buff_match_phase_view",
        {
          p_room_id: roomId,
        }
      );

    if (error) {
      throw new Error(
        `Authoritative phase check failed: ${error.message}`
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
        `Authoritative phase reached ${phase ?? "unknown"} before answer entry.\nphase_route=${phaseRoute ?? "unknown"}\npage_url=${page.url()}`
      );
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Timed out waiting for authoritative answer phase.\npage_url=${page.url()}`
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
    `Expected one Play Movie Clip button, found ${playButtonCount}.`
  );

  await playButton.click();

  try {
    await page.waitForFunction(
      () => {
        const bodyText =
          document.body?.innerText ?? "";
        const playStillVisible = Array.from(
          document.querySelectorAll("button")
        ).some((button) =>
          (button.textContent ?? "")
            .trim()
            .includes("Play Movie Clip")
        );

        return (
          bodyText.includes(
            "The media could not be played or synced"
          ) ||
          bodyText.includes(
            "Time is up. Loading round results..."
          ) ||
          (!playStillVisible &&
            !bodyText.includes(
              "The clock starts when playback begins."
            ))
        );
      },
      undefined,
      { timeout: 15000 }
    );
  } catch (error) {
    const bodyText = await page.evaluate(
      () => document.body?.innerText ?? ""
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
      ].join("\n")
    );
  }

  const bodyText = await page.evaluate(
    () => document.body?.innerText ?? ""
  );

  if (
    bodyText.includes(
      "The media could not be played or synced"
    ) ||
    bodyText.includes(
      "Time is up. Loading round results..."
    )
  ) {
    throw new Error(
      `Playback did not open an answer window.\nplayback_page_url=${page.url()}\nplayback_page_excerpt=${bodyText
        .replace(/\s+/g, " ")
        .slice(0, 1200)}`
    );
  }

  await waitForAuthoritativeAnswerPhase(
    page,
    roomId
  );
}

async function waitForFinalResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Play Again"
      ) &&
      document.body?.innerText?.includes(
        "Return to Lobby"
      ),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForPostResultsTransition(page) {
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const currentUrl = page.url();

    if (currentUrl.includes("/final-results")) {
      return currentUrl;
    }

    const bodyText = await readBodyText(page);
    const onRoundResultsRoute =
      currentUrl.includes("/round-results");
    const loadingResultsOnPlayRoute =
      currentUrl.includes("/play") &&
      bodyShowsLoadingResults(bodyText);

    if (
      !onRoundResultsRoute &&
      !loadingResultsOnPlayRoute
    ) {
      return currentUrl;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for post-results transition.\npage_url=${page.url()}\npage_excerpt=${(await readBodyText(page))
      .replace(/\s+/g, " ")
      .slice(0, 1200)}`
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

  if (page.url().includes("/play")) {
    await waitForPlayRouteReady(page);
  }
}

async function playOneRound(
  page,
  roomId,
  guessText
) {
  const resultPatterns = [
    "**/games/movie-buff/round-results?**",
    "**/games/movie-buff/final-results?**",
  ];

  await waitForAnswerFormReady(page);
  await fillUnique(
    page,
    "Enter the movie title",
    guessText
  );

  await startPlaybackAndWait(page, roomId);
  await waitForAnswerFormReady(page);

  await fillUnique(
    page,
    "Enter the movie title",
    guessText
  );

  const submitButton = page.getByRole("button", {
    name: "Submit Answer",
  });
  const submitCount = await submitButton.count();

  assert(
    submitCount === 1,
    `Expected one Submit Answer button, found ${submitCount}.`
  );

  try {
    await submitButton.click({ timeout: 5000 });
  } catch (error) {
    const currentUrl = page.url();
    const bodyText = await readBodyText(page);

    if (
      resultPatterns.some((pattern) =>
        urlMatchesPattern(currentUrl, pattern)
      )
    ) {
      return;
    }

    if (bodyShowsLoadingResults(bodyText)) {
      return;
    }

    try {
      await page
        .getByPlaceholder(
          "Enter the movie title",
          { exact: true }
        )
        .evaluate((input) => {
          if (
            !(input instanceof HTMLInputElement)
          ) {
            return false;
          }

          input.form?.requestSubmit();
          return true;
        });
    } catch {}

    await waitForResultsSurface(
      page,
      resultPatterns
    ).catch(() => null);

    const recoveredBodyText =
      await readBodyText(page);

    if (
      resultPatterns.some((pattern) =>
        urlMatchesPattern(page.url(), pattern)
      ) ||
      bodyShowsLoadingResults(
        recoveredBodyText
      )
    ) {
      return;
    }

    throw new Error(
      [
        error instanceof Error
          ? error.message
          : String(error),
        `submit_page_url=${page.url()}`,
        `submit_page_excerpt=${recoveredBodyText
          .replace(/\s+/g, " ")
          .slice(0, 1200)}`,
      ].join("\n")
    );
  }

  await waitForResultsSurface(
    page,
    resultPatterns
  );
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
};

try {
  assert(
    adminSupabase,
    "Movie Buff public smoke requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY."
  );

  await Promise.all([
    enterLobbyWithLocalTestAccount(pageOne),
    enterLobbyWithLocalTestAccount(pageTwo),
    enterLobbyWithLocalTestAccount(pageThree),
  ]);

  result.checkpoints.lobby = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    pageThree: pageThree.url(),
  };

  await Promise.all([
    enterPublicMatch(pageOne),
    enterPublicMatch(pageTwo),
    enterPublicMatch(pageThree),
  ]);

  const roomIdOne =
    new URL(pageOne.url()).searchParams.get(
      "roomId"
    ) ?? "";
  const roomIdTwo =
    new URL(pageTwo.url()).searchParams.get(
      "roomId"
    ) ?? "";
  const roomIdThree =
    new URL(pageThree.url()).searchParams.get(
      "roomId"
    ) ?? "";

  assert(
    roomIdOne &&
      roomIdTwo &&
      roomIdThree &&
      roomIdOne === roomIdTwo &&
      roomIdTwo === roomIdThree,
    "Players did not land in the same public room."
  );

  result.checkpoints.waitingRoom = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    pageThree: pageThree.url(),
    roomId: roomIdOne,
    sameRoom: true,
    pageOneButtons: await readButtonTexts(pageOne),
    pageTwoButtons: await readButtonTexts(pageTwo),
    pageThreeButtons: await readButtonTexts(pageThree),
  };

  await Promise.all([
    clickUnique(pageOne, "button", "I'm Ready"),
    clickUnique(pageTwo, "button", "I'm Ready"),
    clickUnique(pageThree, "button", "I'm Ready"),
  ]);

  await Promise.all([
    resolveIntoPlay(pageOne),
    resolveIntoPlay(pageTwo),
    resolveIntoPlay(pageThree),
  ]);

  result.checkpoints.readyCheck = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    pageThree: pageThree.url(),
  };

  result.rounds = [];

  for (
    let roundNumber = 1;
    roundNumber <= MAX_ROUNDS;
    roundNumber += 1
  ) {
    result.rounds.push({
      roundNumber,
      start: {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
        pageThree: pageThree.url(),
      },
    });

    await Promise.all([
      playOneRound(
        pageOne,
        roomIdOne,
        `Smoke Guess ${roundNumber}A`
      ),
      playOneRound(
        pageTwo,
        roomIdOne,
        `Smoke Guess ${roundNumber}B`
      ),
      playOneRound(
        pageThree,
        roomIdOne,
        `Smoke Guess ${roundNumber}C`
      ),
    ]);

    const currentRound =
      result.rounds[result.rounds.length - 1];

    currentRound.results = {
      pageOne: pageOne.url(),
      pageTwo: pageTwo.url(),
      pageThree: pageThree.url(),
      pageOneCorrectVisible:
        await maybeReadText(pageOne, "Correct"),
      pageOneIncorrectVisible:
        await maybeReadText(pageOne, "Incorrect"),
      pageTwoCorrectVisible:
        await maybeReadText(pageTwo, "Correct"),
      pageTwoIncorrectVisible:
        await maybeReadText(pageTwo, "Incorrect"),
      pageThreeCorrectVisible:
        await maybeReadText(pageThree, "Correct"),
      pageThreeIncorrectVisible:
        await maybeReadText(pageThree, "Incorrect"),
    };

    const pageOneFinal =
      pageOne.url().includes("/final-results");
    const pageTwoFinal =
      pageTwo.url().includes("/final-results");
    const pageThreeFinal =
      pageThree.url().includes("/final-results");

    if (pageOneFinal || pageTwoFinal || pageThreeFinal) {
      await Promise.all([
        waitForFinalResultsReady(pageOne),
        waitForFinalResultsReady(pageTwo),
        waitForFinalResultsReady(pageThree),
      ]);

      result.checkpoints.finalResults = {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
        pageThree: pageThree.url(),
        roundNumber,
      };

      break;
    }

    await Promise.all([
      waitForResultsReady(pageOne),
      waitForResultsReady(pageTwo),
      waitForResultsReady(pageThree),
    ]);

    await Promise.all([
      waitForPostResultsTransition(pageOne),
      waitForPostResultsTransition(pageTwo),
      waitForPostResultsTransition(pageThree),
    ]);

    const nextPageOneFinal =
      pageOne.url().includes("/final-results");
    const nextPageTwoFinal =
      pageTwo.url().includes("/final-results");
    const nextPageThreeFinal =
      pageThree.url().includes("/final-results");

    if (
      nextPageOneFinal ||
      nextPageTwoFinal ||
      nextPageThreeFinal
    ) {
      await Promise.all([
        waitForFinalResultsReady(pageOne),
        waitForFinalResultsReady(pageTwo),
        waitForFinalResultsReady(pageThree),
      ]);

      result.checkpoints.finalResults = {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
        pageThree: pageThree.url(),
        roundNumber,
      };

      break;
    }

    await Promise.all([
      resolveIntoPlay(pageOne),
      resolveIntoPlay(pageTwo),
      resolveIntoPlay(pageThree),
    ]);

    currentRound.nextRound = {
      pageOne: pageOne.url(),
      pageTwo: pageTwo.url(),
      pageThree: pageThree.url(),
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        result,
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        result,
        diagnostics: {
          pageOneUrl:
            pageOne.url?.() ?? null,
          pageTwoUrl:
            pageTwo.url?.() ?? null,
          pageThreeUrl:
            pageThree.url?.() ?? null,
          pageOneButtons:
            await readButtonTexts(pageOne).catch(
              () => []
            ),
          pageTwoButtons:
            await readButtonTexts(pageTwo).catch(
              () => []
            ),
          pageThreeButtons:
            await readButtonTexts(pageThree).catch(
              () => []
            ),
          pageOneBody:
            await readBodyText(pageOne).catch(
              () => ""
            ),
          pageTwoBody:
            await readBodyText(pageTwo).catch(
              () => ""
            ),
          pageThreeBody:
            await readBodyText(pageThree).catch(
              () => ""
            ),
        },
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await contextOne.close();
  await contextTwo.close();
  await contextThree.close();
  await browser.close();
}
