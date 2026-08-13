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

async function enterLobbyWithSmokeAccount(page) {
  const {
    storageKey,
    sessionString,
    session,
  } = await provisionLocalSmokeSession("answer-submit");

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

async function enterPrivateRoom(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (
      page.url().includes(
        "/games/movie-buff/waiting-room",
      )
    ) {
      await waitForWaitingRoomReady(page);
      return page.url();
    }

    await clickUnique(page, "button", "Create Room");

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
    "Could not enter the private waiting room after multiple attempts.",
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
    { timeout: 90000 },
  );
}

async function waitForAuthoritativeAnswerPhase(
  page,
  roomId
) {
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

async function maybeReadText(page, text) {
  const locator = page.getByText(text, {
    exact: true,
  });
  const count = await locator.count();

  if (count < 1) {
    return false;
  }

  return locator.first().isVisible();
}

async function submitOneAnswer(
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

  await startPlaybackAndWait(
    page,
    roomId
  );

  await clickUnique(page, "button", "Submit Answer");

  try {
    await waitForEitherUrl(page, [
      "**/games/movie-buff/round-results?**",
      "**/games/movie-buff/final-results?**",
    ]);
  } catch (error) {
    const bodyText = await page.evaluate(
      () => document.body?.innerText ?? ""
    );

    throw new Error(
      [
        error instanceof Error
          ? error.message
          : String(error),
        `submit_page_url=${page.url()}`,
        `submit_page_excerpt=${bodyText
          .replace(/\\s+/g, " ")
          .slice(0, 1200)}`,
      ].join("\n")
    );
  }
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
};

try {
  assert(
    adminSupabase,
    "Movie Buff answer submit smoke requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  const playerId = await enterLobbyWithSmokeAccount(page);
  result.checkpoints.lobby = {
    page: page.url(),
    playerId,
  };

  await enterPrivateRoom(page);
  const roomId = new URL(page.url()).searchParams.get(
    "roomId",
  );
  assert(roomId, "Expected a roomId in waiting-room URL.");

  result.checkpoints.waitingRoom = {
    page: page.url(),
    roomId,
  };

  await clickUnique(page, "button", "I'm Ready");
  await resolveIntoPlay(page);

  const guessText = `Answer Submit Smoke ${Date.now()}`;
  await submitOneAnswer(
    page,
    roomId,
    guessText
  );

  const pageUrl = page.url();
  const roundId =
    new URL(pageUrl).searchParams.get("roundId");

  assert(
    roundId,
    "Expected a roundId after submitting the answer.",
  );

  result.checkpoints.submissionUi = {
    page: pageUrl,
    guessText,
    roundId,
    correctVisible: await maybeReadText(
      page,
      "Correct",
    ),
    incorrectVisible: await maybeReadText(
      page,
      "Incorrect",
    ),
  };

  await page.waitForTimeout(1500);

  const [{ data: answerRows, error: answerError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      adminSupabase
        .from("answers")
        .select(
          "id, round_id, player_id, submitted_answer, is_correct, base_points, speed_bonus, streak_bonus, total_points, submitted_at"
        )
        .eq("round_id", roundId)
        .eq("player_id", playerId),
      adminSupabase
        .from("movie_buff_round_events")
        .select(
          "event_type, player_id, room_id, round_id, occurred_at, payload"
        )
        .eq("round_id", roundId)
        .eq("player_id", playerId)
        .in("event_type", [
          "answer_submitted",
          "answer_correct",
          "answer_wrong",
        ]),
    ]);

  if (answerError) {
    throw new Error(answerError.message);
  }

  if (eventError) {
    throw new Error(eventError.message);
  }

  assert(
    Array.isArray(answerRows) &&
      answerRows.length === 1,
    `Expected exactly 1 answer row, got ${answerRows?.length ?? 0}.`,
  );

  const answerRow = answerRows[0];
  assert(
    answerRow.submitted_answer === guessText,
    `Expected submitted answer to match guess text. Got "${answerRow.submitted_answer}".`,
  );

  const typedEvents = eventRows ?? [];
  const submittedEvent = typedEvents.find(
    (eventRow) =>
      eventRow.event_type === "answer_submitted",
  );
  const outcomeEvent = typedEvents.find(
    (eventRow) =>
      eventRow.event_type === "answer_correct" ||
      eventRow.event_type === "answer_wrong",
  );

  assert(
    Boolean(submittedEvent),
    "Expected answer_submitted event for the round.",
  );
  assert(
    Boolean(outcomeEvent),
    "Expected answer_correct or answer_wrong event for the round.",
  );

  result.checkpoints.database = {
    answerRow,
    eventTypes: typedEvents.map(
      (eventRow) => eventRow.event_type,
    ),
  };

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
  await context.close();
  await browser.close();
}
