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

const MAX_ROUNDS =
  Number.parseInt(
    process.env.MOVIE_BUFF_PRIVATE_SMOKE_MAX_ROUNDS ??
      "10",
    10,
  ) || 10;

const { chromium } = await import(
  pathToFileURL(PLAYWRIGHT_ENTRY).href
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

async function fetchRoomTotalRounds(roomId) {
  assert(
    adminSupabase,
    "Movie Buff private smoke requires an admin Supabase client to inspect room settings."
  );

  const { data, error } = await adminSupabase
    .from("game_rooms")
    .select("total_rounds")
    .eq("id", roomId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not read private room settings for ${roomId}: ${error?.message ?? "missing row"}`
    );
  }

  const totalRounds = Number.parseInt(
    String(data.total_rounds ?? ""),
    10
  );

  assert(
    Number.isFinite(totalRounds) && totalRounds > 0,
    `Private room ${roomId} returned invalid total_rounds: ${data.total_rounds}`
  );

  return totalRounds;
}

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
    () => {
      if (
        !window.location.pathname.includes(
          "/games/movie-buff/play"
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
    { timeout: 45000 }
  );
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
  const readyButton = page.getByRole("button", {
    name: "Ready!",
    exact: true,
  });
  const startButton = page.getByRole("button", {
    name: "Start Match",
    exact: true,
  });
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (
      (await readyButton.count()) === 1 &&
      (await startButton.count()) === 1 &&
      (await readyButton.isEnabled()) &&
      (await startButton.isEnabled())
    ) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    `Timed out waiting for private start controls. page_url=${page.url()}`,
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
          ["Start Round", "Continue without VIP"].some((label) =>
            (control.textContent ?? "").trim().includes(label),
          ),
        )),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForAnswerFormReady(page) {
  await waitForPlayRouteReady(page);
  const answerInput = page.getByPlaceholder(
    "Enter the movie title",
    { exact: true },
  );
  const deadline = Date.now() + 75000;

  while (Date.now() < deadline) {
    if (
      (await answerInput.count()) === 1 &&
      (await answerInput.isEnabled())
    ) {
      return;
    }

    const currentUrl = page.url();
    const bodyText = await readBodyText(page);

    if (
      currentUrl.includes("/round-results") ||
      currentUrl.includes("/final-results") ||
      bodyShowsLoadingResults(bodyText)
    ) {
      throw new Error(
        `Answer form did not unlock before results.
page_url=${currentUrl}
page_excerpt=${bodyText.replace(/\s+/g, " ").slice(0, 1200)}`,
      );
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for an enabled answer form.
page_url=${page.url()}`,
  );
}

async function waitForPlaybackOrAnswerReady(page, roomId) {
  await waitForPlayRouteReady(page);

  const playButton = page.getByRole("button", {
    name: "Play Movie Clip",
  });
  const answerInput = page.getByPlaceholder(
    "Enter the movie title",
    { exact: true },
  );
  const deadline = Date.now() + 75000;

  while (Date.now() < deadline) {
    const playButtonCount = await playButton.count();
    const answerInputCount = await answerInput.count();
    const answerInputEnabled =
      answerInputCount === 1 &&
      (await answerInput.isEnabled());

    if (
      playButtonCount === 1 &&
      (await playButton.isEnabled())
    ) {
      return;
    }

    if (
      answerInputCount === 1 &&
      answerInputEnabled
    ) {
      return;
    }

    const currentUrl = page.url();
    const bodyText = await readBodyText(page);

    if (
      currentUrl.includes("/round-results") ||
      currentUrl.includes("/final-results") ||
      bodyShowsLoadingResults(bodyText)
    ) {
      throw new Error(
        `Round reached results before playback or answer entry.
page_url=${currentUrl}
page_excerpt=${bodyText.replace(/\s+/g, " ").slice(0, 1200)}`,
      );
    }

    if (adminSupabase) {
      const { data, error } =
        await adminSupabase.rpc(
          "get_movie_buff_match_phase_view",
          { p_room_id: roomId },
        );

      if (error) {
        throw new Error(
          `Authoritative phase check failed: ${error.message}`,
        );
      }

      const phase = data?.phase ?? null;
      const phaseRoute = data?.phaseRoute ?? null;

      if (phase === "answer") {
        continue;
      }

      if (
        phase === "abandoned" ||
        phase === "blocked" ||
        phaseRoute === "/games/movie-buff/round-results" ||
        phaseRoute === "/games/movie-buff/final-results"
      ) {
        throw new Error(
          `Authoritative phase reached ${phase ?? "unknown"} before playback or answer entry.\nphase_route=${phaseRoute ?? "unknown"}\npage_url=${page.url()}`,
        );
      }
    }

    await page.waitForTimeout(500);
  }

  throw new Error(
    `Timed out waiting for playback or an enabled answer form.\npage_url=${page.url()}`,
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

async function startPlaybackAndWait(page) {
  const playButton = page.getByRole("button", {
    name: "Play Movie Clip",
  });
  const playButtonCount =
    await playButton.count();

  if (playButtonCount === 0) {
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
    await clickUnique(page, "link", "Start Round").catch(async () => {
      await clickUnique(page, "button", "Start Round").catch(async () => {
        await clickUnique(page, "button", "Continue without VIP");
      });
    });
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

  await waitForPlaybackOrAnswerReady(page, roomId);
  await startPlaybackAndWait(page);
  await waitForAnswerFormReady(page);

  await fillUnique(
    page,
    "Enter the movie title",
    guessText,
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

  const totalRounds = await fetchRoomTotalRounds(
    roomId
  );

  result.checkpoints.roomSettings = {
    roomId,
    totalRounds,
    configuredMaxRounds: MAX_ROUNDS,
    cappedRun: MAX_ROUNDS < totalRounds,
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

  if (!result.checkpoints.finalResults) {
    if (MAX_ROUNDS < totalRounds) {
      result.checkpoints.partialRun = {
        configuredMaxRounds: MAX_ROUNDS,
        totalRounds,
        nextPage: page.url(),
      };
    } else {
      throw new Error(
        `Private flow did not reach final results after ${MAX_ROUNDS} rounds (room total ${totalRounds}).`
      );
    }
  }

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
          pageInputs: await page
            .locator("input")
            .evaluateAll((elements) =>
              elements.map((element) => ({
                placeholder: element.getAttribute("placeholder"),
                disabled:
                  element instanceof HTMLInputElement
                    ? element.disabled
                    : null,
              })),
            )
            .catch(() => []),
          pageExcerpt: (await readBodyText(page).catch(() => ""))
            .replace(/\s+/g, " ")
            .slice(0, 1600),
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
