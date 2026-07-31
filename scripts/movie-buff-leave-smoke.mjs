import { spawnSync } from "node:child_process";
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

const { chromium } = await import(
  pathToFileURL(PLAYWRIGHT_ENTRY).href
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

async function waitForEitherUrl(page, patterns) {
  const currentUrl = page.url();

  if (
    patterns.some((pattern) =>
      currentUrl.includes(
        pattern.replace(/\*\*/g, "").replace(/\*/g, ""),
      ),
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

function buildLeaveVerificationSql(roomId) {
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

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_EXECUTABLE,
});

const context = await browser.newContext();
const page = await context.newPage();

const result = {
  baseUrl: APP_URL,
  checkpoints: {},
  leaveVerification: null,
};

try {
  await page.goto(`${APP_URL}/games/movie-buff`, {
    waitUntil: "domcontentloaded",
  });

  await clickUnique(page, "link", "Play Now");
  await page.waitForURL("**/games/movie-buff/lobby");
  result.checkpoints.lobby = {
    page: page.url(),
  };

  await clickUnique(page, "button", "Create Room");
  await page.waitForURL(
    "**/games/movie-buff/waiting-room?**",
  );
  await waitForWaitingRoomReady(page);

  const waitingRoomUrl = page.url();
  const waitingRoomParams = new URL(waitingRoomUrl)
    .searchParams;
  const roomId =
    waitingRoomParams.get("roomId") ?? "";

  assert(roomId, "Expected a roomId in waiting-room URL.");

  result.checkpoints.waitingRoom = {
    page: waitingRoomUrl,
    roomId,
  };

  await clickUnique(page, "button", "I'm Ready");
  await waitForPrivateStartReady(page);
  await clickUnique(page, "button", "Start Match");

  await waitForEitherUrl(page, [
    "**/games/movie-buff/round-intro?**",
    "**/games/movie-buff/play?**",
  ]);

  if (page.url().includes("/round-intro")) {
    await waitForRoundIntroReady(page);
    await clickUnique(page, "button", "Start Round");
    await page.waitForURL(
      "**/games/movie-buff/play?**",
    );
  }

  await waitForAnswerFormReady(page);
  result.checkpoints.play = {
    page: page.url(),
  };

  await clickUnique(page, "button", "Leave Match");
  await page.waitForURL("**/games/movie-buff/lobby");

  result.checkpoints.afterLeave = {
    page: page.url(),
  };

  const containerName = resolveDbContainerName();
  const verification = extractJsonLine(
    runSql(
      containerName,
      buildLeaveVerificationSql(roomId),
    ),
  );

  assert(
    verification.roomStatus === "cancelled",
    `Expected cancelled room after leave, got ${verification.roomStatus}.`,
  );
  assert(
    verification.activePlayerCount === 0,
    `Expected 0 active players after leave, got ${verification.activePlayerCount}.`,
  );
  assert(
    Number(
      verification.eventsByType?.player_left ?? 0,
    ) >= 1,
    "Expected at least one player_left event.",
  );
  assert(
    Number(
      verification.eventsByType?.match_abandoned ?? 0,
    ) >= 1,
    "Expected at least one match_abandoned event.",
  );

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
  await context.close();
  await browser.close();
}
