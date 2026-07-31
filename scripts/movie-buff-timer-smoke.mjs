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

async function waitForEitherUrl(page, patterns) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) => {
      const normalizedPattern = pattern
        .replace(/\*\*/g, "")
        .replace(/\*/g, "");

      return currentUrl.includes(
        normalizedPattern,
      );
    })
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
    await provisionLocalSmokeSession("timer");
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

async function waitForPrivateStartReady(page) {
  await page.waitForFunction(
    () => {
      const buttons = Array.from(
        document.querySelectorAll("button"),
      );

      const readyButton = buttons.find((button) =>
        (button.textContent ?? "").trim().includes("Ready!"),
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
          input.getAttribute("placeholder") ===
          "Enter the movie title",
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

async function readTimeLeft(page) {
  const statCard = page
    .locator("div")
    .filter({ hasText: /^Time Left\d+ seconds$/ })
    .first();

  const text = ((await statCard.textContent()) ?? "").trim();
  const match = text.match(/Time Left(\d+) seconds/);
  assert(match, `Could not read timer text from "${text}".`);
  return Number.parseInt(match[1], 10);
}

async function waitForTimerChange(page, initialValue) {
  await page.waitForFunction(
    (startingValue) => {
      const blocks = Array.from(
        document.querySelectorAll("div"),
      );

      for (const block of blocks) {
        const text = (block.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const match = text.match(
          /^Time Left(\d+) seconds$/,
        );

        if (match) {
          return (
            Number.parseInt(match[1], 10) !==
            startingValue
          );
        }
      }

      return false;
    },
    initialValue,
    { timeout: 10000 },
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
};

try {
  await enterLobbyWithLocalTestAccount(page);

  await clickUnique(page, "button", "Create Room");
  await page.waitForURL(
    "**/games/movie-buff/waiting-room?**",
  );
  await waitForWaitingRoomReady(page);

  await clickUnique(page, "button", "I'm Ready");
  await resolveIntoPlay(page);
  await waitForAnswerFormReady(page);

  const initialTimeLeft = await readTimeLeft(page);
  result.initialTimeLeft = initialTimeLeft;

  await page.waitForTimeout(2500);
  const beforeHintTimeLeft = await readTimeLeft(page);
  result.beforeHintTimeLeft = beforeHintTimeLeft;

  await clickUnique(page, "button", "Use Hint (-5s)");
  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "The timer still waits for playback to start.",
      ),
    undefined,
    { timeout: 10000 },
  );

  const afterHintTimeLeft = await readTimeLeft(page);
  result.afterHintTimeLeft = afterHintTimeLeft;

  await page.waitForTimeout(2500);
  const afterHintWaitTimeLeft = await readTimeLeft(page);
  result.afterHintWaitTimeLeft = afterHintWaitTimeLeft;

  await clickUnique(page, "button", "Play Movie Clip");
  await waitForTimerChange(page, afterHintWaitTimeLeft);
  const afterPlaybackStartTimeLeft = await readTimeLeft(page);
  result.afterPlaybackStartTimeLeft =
    afterPlaybackStartTimeLeft;

  await page.waitForTimeout(2200);
  const activePlaybackTimeLeft = await readTimeLeft(page);
  result.activePlaybackTimeLeft =
    activePlaybackTimeLeft;

  assert(
    initialTimeLeft === 30,
    `Expected initial time to be 30, got ${initialTimeLeft}.`,
  );
  assert(
    beforeHintTimeLeft === initialTimeLeft,
    `Timer changed before playback start: ${initialTimeLeft} -> ${beforeHintTimeLeft}.`,
  );
  assert(
    afterHintTimeLeft === 25,
    `Expected hint to deduct to 25, got ${afterHintTimeLeft}.`,
  );
  assert(
    afterHintWaitTimeLeft === afterHintTimeLeft,
    `Timer drifted after hint before playback: ${afterHintTimeLeft} -> ${afterHintWaitTimeLeft}.`,
  );
  assert(
    afterPlaybackStartTimeLeft < afterHintWaitTimeLeft,
    `Timer did not start after playback: ${afterHintWaitTimeLeft} -> ${afterPlaybackStartTimeLeft}.`,
  );
  assert(
    activePlaybackTimeLeft < afterPlaybackStartTimeLeft,
    `Timer did not continue after playback start: ${afterPlaybackStartTimeLeft} -> ${activePlaybackTimeLeft}.`,
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
          bodyText: await page
            .locator("body")
            .innerText()
            .catch(() => ""),
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
