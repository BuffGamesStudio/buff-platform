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
    process.env.MOVIE_BUFF_SMOKE_MAX_ROUNDS ??
      "10",
    10
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
  const count = await locator.count();
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

async function waitForEitherUrl(page, patterns) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) =>
      urlMatchesPattern(currentUrl, pattern)
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
      ", "
    )}`
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
          document.querySelectorAll("button")
        ).some(
          (button) =>
            (button.textContent ?? "")
              .trim()
              .includes("Start Round")
        )),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForAnswerFormReady(page) {
  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll("input")
      ).some(
        (input) =>
          input.getAttribute(
            "placeholder"
          ) === "Enter the movie title"
      ),
    undefined,
    { timeout: 30000 }
  );
}

async function waitForResultsReady(page) {
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Leave Match"
      ) &&
      (document.body?.innerText?.includes(
        "Next Round"
      ) ||
        document.body?.innerText?.includes(
          "View Final Results"
        ) ||
        document.body?.innerText?.includes(
          "Waiting for host..."
        )),
    undefined,
    { timeout: 30000 }
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

async function clickNextStepFromHost(
  primaryPage,
  secondaryPage
) {
  const primaryNextRound =
    primaryPage.getByRole("button", {
      name: "Next Round",
    });
  const secondaryNextRound =
    secondaryPage.getByRole("button", {
      name: "Next Round",
    });

  if ((await primaryNextRound.count()) === 1) {
    await primaryNextRound.click();
    return "primary";
  }

  if ((await secondaryNextRound.count()) === 1) {
    await secondaryNextRound.click();
    return "secondary";
  }

  const primaryFinalResults =
    primaryPage.getByRole("button", {
      name: "View Final Results",
    });
  const secondaryFinalResults =
    secondaryPage.getByRole("button", {
      name: "View Final Results",
    });

  if ((await primaryFinalResults.count()) === 1) {
    await primaryFinalResults.click();
    return "primary-final";
  }

  if ((await secondaryFinalResults.count()) === 1) {
    await secondaryFinalResults.click();
    return "secondary-final";
  }

  throw new Error(
    "No host-side next-step control was visible on either results page."
  );
}

async function resolveIntoPlay(page) {
  await waitForEitherUrl(page, [
    "**/games/movie-buff/round-intro?**",
    "**/games/movie-buff/play?**",
  ]);

  if (page.url().includes("/round-intro")) {
    await waitForRoundIntroReady(page);
    await clickUnique(page, "button", "Start Round");
    await page.waitForURL(
      "**/games/movie-buff/play?**"
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
    guessText
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
    pageOne.goto(`${APP_URL}/games/movie-buff`, {
      waitUntil: "domcontentloaded",
    }),
    pageTwo.goto(`${APP_URL}/games/movie-buff`, {
      waitUntil: "domcontentloaded",
    }),
  ]);

  await Promise.all([
    clickUnique(pageOne, "link", "PLAY NOW"),
    clickUnique(pageTwo, "link", "PLAY NOW"),
  ]);

  await Promise.all([
    pageOne.waitForURL("**/games/movie-buff/lobby"),
    pageTwo.waitForURL("**/games/movie-buff/lobby"),
  ]);

  result.checkpoints.lobby = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
  };

  await Promise.all([
    enterPublicMatch(pageOne),
    enterPublicMatch(pageTwo),
  ]);

  result.checkpoints.waitingRoom = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
    sameRoom:
      new URL(pageOne.url()).searchParams.get(
        "roomId"
      ) ===
      new URL(pageTwo.url()).searchParams.get(
        "roomId"
      ),
    pageOneButtons: await readButtonTexts(pageOne),
    pageTwoButtons: await readButtonTexts(pageTwo),
  };

  assert(
    result.checkpoints.waitingRoom.sameRoom,
    "Players did not land in the same public room."
  );

  await Promise.all([
    clickUnique(pageOne, "button", "I'm Ready"),
    clickUnique(pageTwo, "button", "I'm Ready"),
  ]);

  await Promise.all([
    resolveIntoPlay(pageOne),
    resolveIntoPlay(pageTwo),
  ]);

  result.checkpoints.readyCheck = {
    pageOne: pageOne.url(),
    pageTwo: pageTwo.url(),
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
      },
    });

    await Promise.all([
      playOneRound(
        pageOne,
        `Smoke Guess ${roundNumber}A`
      ),
      playOneRound(
        pageTwo,
        `Smoke Guess ${roundNumber}B`
      ),
    ]);

    const currentRound =
      result.rounds[result.rounds.length - 1];

    currentRound.results = {
      pageOne: pageOne.url(),
      pageTwo: pageTwo.url(),
      pageOneCorrectVisible:
        await maybeReadText(pageOne, "Correct"),
      pageOneIncorrectVisible:
        await maybeReadText(pageOne, "Incorrect"),
      pageTwoCorrectVisible:
        await maybeReadText(pageTwo, "Correct"),
      pageTwoIncorrectVisible:
        await maybeReadText(pageTwo, "Incorrect"),
    };

    const pageOneFinal =
      pageOne.url().includes("/final-results");
    const pageTwoFinal =
      pageTwo.url().includes("/final-results");

    if (pageOneFinal || pageTwoFinal) {
      await Promise.all([
        waitForFinalResultsReady(pageOne),
        waitForFinalResultsReady(pageTwo),
      ]);

      result.checkpoints.finalResults = {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
        roundNumber,
      };

      break;
    }

    await Promise.all([
      waitForResultsReady(pageOne),
      waitForResultsReady(pageTwo),
    ]);

    const stepSource =
      await clickNextStepFromHost(
        pageOne,
        pageTwo
      );

    currentRound.stepSource = stepSource;

    if (
      stepSource === "primary" ||
      stepSource === "secondary"
    ) {

      await Promise.all([
        waitForEitherUrl(pageOne, [
          "**/games/movie-buff/round-intro?**",
          "**/games/movie-buff/play?**",
          "**/games/movie-buff/final-results?**",
        ]),
        waitForEitherUrl(pageTwo, [
          "**/games/movie-buff/round-intro?**",
          "**/games/movie-buff/play?**",
          "**/games/movie-buff/final-results?**",
        ]),
      ]);

      const nextPageOneFinal =
        pageOne.url().includes("/final-results");
      const nextPageTwoFinal =
        pageTwo.url().includes("/final-results");

      if (
        nextPageOneFinal ||
        nextPageTwoFinal
      ) {
        await Promise.all([
          waitForFinalResultsReady(pageOne),
          waitForFinalResultsReady(pageTwo),
        ]);

        result.checkpoints.finalResults = {
          pageOne: pageOne.url(),
          pageTwo: pageTwo.url(),
          roundNumber,
        };

        break;
      }

      await Promise.all([
        resolveIntoPlay(pageOne),
        resolveIntoPlay(pageTwo),
      ]);

      currentRound.nextRound = {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
      };

      continue;
    }

    if (
      stepSource === "primary-final" ||
      stepSource === "secondary-final"
    ) {
      await Promise.all([
        pageOne.waitForURL(
          "**/games/movie-buff/final-results?**"
        ),
        pageTwo.waitForURL(
          "**/games/movie-buff/final-results?**"
        ),
      ]);

      await Promise.all([
        waitForFinalResultsReady(pageOne),
        waitForFinalResultsReady(pageTwo),
      ]);

      result.checkpoints.finalResults = {
        pageOne: pageOne.url(),
        pageTwo: pageTwo.url(),
        roundNumber,
      };

      break;
    }
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
          pageOneButtons:
            await readButtonTexts(pageOne).catch(
              () => []
            ),
          pageTwoButtons:
            await readButtonTexts(pageTwo).catch(
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
  await browser.close();
}
