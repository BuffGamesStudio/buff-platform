import { pathToFileURL } from "node:url";

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
  const count = await locator.count();
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

  for (const pattern of patterns) {
    try {
      await page.waitForURL(pattern, {
        timeout: 15000,
      });
      return page.url();
    } catch {}
  }

  throw new Error(
    `Timed out waiting for any URL in: ${patterns.join(
      ", ",
    )}`,
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

async function waitForResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Leave Match",
      ) &&
      (document.body?.innerText?.includes(
        "Next Round",
      ) ||
        document.body?.innerText?.includes(
          "View Final Results",
        )),
    undefined,
    { timeout: 30000 },
  );
}

async function waitForFinalResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Play Again",
      ) &&
      document.body?.innerText?.includes(
        "Return to Lobby",
      ),
    undefined,
    { timeout: 30000 },
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
        "**/games/movie-buff/play?**",
      ]);
    }
  } else {
    await waitForEitherUrl(page, [
      "**/games/movie-buff/round-intro?**",
      "**/games/movie-buff/play?**",
    ]);
  }

  if (page.url().includes("/round-intro")) {
    await waitForRoundIntroReady(page);
    await clickUnique(page, "button", "Start Round");
    await page.waitForURL(
      "**/games/movie-buff/play?**",
    );
  }
}

async function playOneRound(page, guessText) {
  await waitForAnswerFormReady(page);

  const playButton = page.getByRole("button", {
    name: "Play Movie Clip",
  });

  if ((await playButton.count()) === 1) {
    await playButton.click();
  }

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
  await page.goto(`${APP_URL}/games/movie-buff`, {
    waitUntil: "domcontentloaded",
  });

  await clickUnique(page, "link", "PLAY NOW");
  await page.waitForURL("**/games/movie-buff/lobby");

  result.checkpoints.lobby = {
    page: page.url(),
  };

  await enterPrivateRoom(page);

  result.checkpoints.waitingRoom = {
    page: page.url(),
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

    const nextRoundButton = page.getByRole(
      "button",
      { name: "Next Round" },
    );
    const finalResultsButton =
      page.getByRole("button", {
        name: "View Final Results",
      });

    if ((await nextRoundButton.count()) === 1) {
      await nextRoundButton.click();
      await resolveIntoPlay(page);
      roundResult.nextRound = {
        page: page.url(),
      };
      continue;
    }

    if ((await finalResultsButton.count()) === 1) {
      await finalResultsButton.click();
      await page.waitForURL(
        "**/games/movie-buff/final-results?**",
      );
      await waitForFinalResultsReady(page);
      result.checkpoints.finalResults = {
        page: page.url(),
        roundNumber,
      };
      break;
    }

    throw new Error(
      "Could not find a next-step button on round results.",
    );
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
