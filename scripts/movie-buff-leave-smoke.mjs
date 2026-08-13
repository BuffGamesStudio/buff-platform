import { spawnSync } from "node:child_process";
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
  const projectId =
    process.env.SUPABASE_LOCAL_PROJECT_ID ??
    "buff-platform";
  const output = runCommand("docker", [
    "ps",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
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
      `Could not find a running Supabase DB container for local project "${projectId}".`,
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

async function enterLobbyWithLocalTestAccount(page) {
  const { storageKey, sessionString } =
    await provisionLocalSmokeSession("leave");
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

function isLocalBaseUrl(url) {
  return /127\.0\.0\.1|localhost/i.test(url);
}

async function verifyHostedLeaveState(roomId) {
  assert(
    adminSupabase,
    "Hosted leave verification requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );

  const [
    roomResult,
    playersResult,
    eventsResult,
  ] = await Promise.all([
    adminSupabase
      .from("game_rooms")
      .select("id, status, finished_at")
      .eq("id", roomId)
      .maybeSingle(),
    adminSupabase
      .from("room_players")
      .select("player_id")
      .eq("room_id", roomId)
      .is("left_at", null),
    adminSupabase
      .from("movie_buff_round_events")
      .select("event_type")
      .eq("room_id", roomId),
  ]);

  if (roomResult.error) {
    throw new Error(roomResult.error.message);
  }

  if (playersResult.error) {
    throw new Error(playersResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const eventsByType = {};

  for (const row of eventsResult.data ?? []) {
    const key = row.event_type;
    eventsByType[key] = (eventsByType[key] ?? 0) + 1;
  }

  return {
    roomId,
    roomStatus: roomResult.data?.status ?? null,
    finishedAtPresent:
      roomResult.data?.finished_at != null,
    activePlayerCount:
      (playersResult.data ?? []).length,
    eventsByType,
  };
}

async function verifySupabaseLeaveState(roomId) {
  const verification = await verifyHostedLeaveState(roomId);

  return {
    verificationMode: "supabase-api",
    ...verification,
  };
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
  await enterLobbyWithLocalTestAccount(page);
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

  await waitForAnswerFormReady(page);
  result.checkpoints.play = {
    page: page.url(),
  };

  await clickUnique(page, "button", "Leave Match");
  await page.waitForURL("**/games/movie-buff/lobby");

  result.checkpoints.afterLeave = {
    page: page.url(),
  };

  const verification = adminSupabase
    ? await verifySupabaseLeaveState(roomId)
    : isLocalBaseUrl(APP_URL)
      ? extractJsonLine(
          runSql(
            resolveDbContainerName(),
            buildLeaveVerificationSql(roomId),
          ),
        )
      : await verifyHostedLeaveState(roomId);

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
