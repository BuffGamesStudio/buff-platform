import { spawnSync } from "node:child_process";
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

function runDockerSql(sql) {
  const psResult = spawnSync(
    "docker",
    ["ps", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );

  if (psResult.status !== 0) {
    throw new Error(
      psResult.stderr || psResult.stdout,
    );
  }

  const containerName = psResult.stdout
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

  const sqlResult = spawnSync(
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

  if (sqlResult.status !== 0) {
    throw new Error(
      sqlResult.stderr || sqlResult.stdout,
    );
  }

  return sqlResult.stdout.trim();
}

async function grantAdminRole(userId) {
  if (adminSupabase) {
    const { error } = await adminSupabase
      .from("profiles")
      .update({
        platform_role: "admin",
      })
      .eq("id", userId);

    if (!error) {
      return "service-role-profile";
    }

    const normalizedMessage =
      error.message.toLowerCase();

    if (
      normalizedMessage.includes("platform_role") &&
      normalizedMessage.includes("schema cache")
    ) {
      const {
        data: userData,
        error: userLookupError,
      } = await adminSupabase.auth.admin.getUserById(
        userId,
      );

      if (userLookupError || !userData.user) {
        throw new Error(
          `Hosted admin role lookup failed: ${
            userLookupError?.message ??
            "User not found."
          }`,
        );
      }

      const currentAppMetadata =
        userData.user.app_metadata ?? {};

      const { error: metadataError } =
        await adminSupabase.auth.admin.updateUserById(
          userId,
          {
            app_metadata: {
              ...currentAppMetadata,
              platform_role: "admin",
            },
          },
        );

      if (metadataError) {
        throw new Error(
          `Hosted admin metadata grant failed: ${metadataError.message}`,
        );
      }

      return "service-role-app-metadata";
    }

    throw new Error(
      `Hosted admin role grant failed: ${error.message}`,
    );
  }

  runDockerSql(
    [
      `update public.profiles`,
      `set platform_role = 'admin'`,
      `where id = '${userId}'::uuid;`,
    ].join(" "),
  );

  return "docker";
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

async function waitForAdminPageReady(page) {
  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Checking access",
      ),
    undefined,
    { timeout: 60000 },
  );

  return page.locator("body").innerText();
}

async function waitForBodyPattern(
  page,
  pattern,
  timeout = 60000,
) {
  await page.waitForFunction(
    ({ source, flags }) => {
      const bodyText =
        document.body?.innerText ?? "";
      return new RegExp(source, flags).test(
        bodyText,
      );
    },
    {
      source: pattern.source,
      flags: pattern.flags,
    },
    { timeout },
  );

  return page.locator("body").innerText();
}

async function verifyAdminPage(
  page,
  checkpointKey,
  route,
  markers,
) {
  await page.goto(`${APP_URL}${route}`, {
    waitUntil: "domcontentloaded",
  });

  const body = await waitForAdminPageReady(page);

  assert(
    !body.includes("Admin access required"),
    `Admin access gate was shown for ${route}.`,
  );

  for (const marker of markers) {
    assert(
      body.includes(marker),
      `Expected marker "${marker}" on ${route}. Body excerpt: ${body.slice(0, 400)}`,
    );
  }

  result.checkpoints[checkpointKey] = {
    url: page.url(),
    hasAdminAccessGate: false,
    markers,
  };
}

function parseFirstIntegerMatch(
  body,
  pattern,
  message,
) {
  const match = body.match(pattern);

  assert(match, message);

  return Number.parseInt(match[1], 10);
}

function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

try {
  const {
    storageKey,
    session,
    sessionString,
  } = await provisionLocalSmokeSession(
    "admin-smoke",
  );

  const userId = session.user.id;
  const grantMethod = await grantAdminRole(userId);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: storageKey,
      value: sessionString,
    },
  );

  await page.goto(`${APP_URL}/account`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForFunction(
    () =>
      document.body?.innerText?.includes(
        "Launch Movie Buff",
      ),
    undefined,
    { timeout: 60000 },
  );

  result.checkpoints.accountSignedIn = {
    url: page.url(),
    ok: true,
  };

  await page.goto(`${APP_URL}/admin/movies`, {
    waitUntil: "domcontentloaded",
  });

  const moviesBody = await waitForAdminPageReady(page);
  const moviesDataBody = await waitForBodyPattern(
    page,
    /\d+\s+of\s+\d+\s+movies?\s+visible/i,
  );

  assert(
    moviesBody.includes("Movie Library"),
    "Movie Library heading was not rendered for the admin session.",
  );

  assert(
    !moviesBody.includes(
      "Admin access required",
    ),
    "Admin access gate was shown for /admin/movies.",
  );

  result.checkpoints.movies = {
    url: page.url(),
    hasMovieLibrary: true,
    hasAdminAccessGate: false,
    grantMethod,
    visibleMovies: parseFirstIntegerMatch(
      moviesDataBody,
      /(\d+)\s+of\s+(\d+)\s+movies?\s+visible/i,
      "Movie Library did not render a visible movie count.",
    ),
  };

  await page.goto(`${APP_URL}/admin/sources`, {
    waitUntil: "domcontentloaded",
  });

  const sourcesBody = await waitForAdminPageReady(page);
  const sourcesDataBody = await waitForBodyPattern(
    page,
    /REGISTERED SOURCES\s+\d+/i,
  );

  assert(
    sourcesBody.includes("Source Registry"),
    "Source Registry heading was not rendered for the admin session.",
  );

  assert(
    sourcesBody.includes("REGISTERED SOURCES"),
    "Source Registry metrics did not render.",
  );

  assert(
    !sourcesBody.includes(
      "Admin access required",
    ),
    "Admin access gate was shown for /admin/sources.",
  );

  result.checkpoints.sources = {
    url: page.url(),
    hasSourceRegistry: true,
    hasRegistryMetrics: true,
    hasAdminAccessGate: false,
    registeredSources: parseFirstIntegerMatch(
      sourcesDataBody,
      /REGISTERED SOURCES\s+(\d+)/i,
      "Source Registry did not render the registered-sources metric.",
    ),
  };

  await verifyAdminPage(
    page,
    "clipAnalytics",
    "/admin/analytics/clips",
    ["Clip Analytics", "Clip-level scoring"],
  );

  result.checkpoints.clipAnalytics.trackedClips =
    parseFirstIntegerMatch(
      await waitForBodyPattern(
        page,
        /\d+\s+tracked playable clips/i,
      ),
      /(\d+)\s+tracked playable clips/i,
      "Clip Analytics did not render a tracked-clip count.",
    );

  await verifyAdminPage(
    page,
    "rotationControl",
    "/admin/analytics/rotation",
    [
      "Rotation Control",
      "Rotation is weighted, not purely random.",
    ],
  );

  const rotationApi = await page.evaluate(
    async () => {
      const authStorageKey = Object.keys(
        window.localStorage,
      ).find((key) =>
        key.includes("-auth-token"),
      );

      const raw =
        authStorageKey &&
        window.localStorage.getItem(
          authStorageKey,
        );
      const sessionPayload = raw
        ? JSON.parse(raw)
        : null;
      const accessToken =
        sessionPayload?.access_token ?? null;

      const response = await fetch(
        "/api/admin/analytics/rotation",
        {
          headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : {},
        },
      );

      return {
        status: response.status,
        payload: await response.json(),
      };
    },
  );

  assert(
    rotationApi.status === 200,
    `Expected /api/admin/analytics/rotation to return 200, got ${rotationApi.status}.`,
  );

  const apiEligibleClips = Number(
    rotationApi.payload?.poolStatus
      ?.totalEligibleClips ?? NaN,
  );
  const apiPrimaryReadyAssets = Number(
    rotationApi.payload?.poolStatus
      ?.totalPrimaryReadyAssets ?? NaN,
  );

  assert(
    Number.isFinite(apiEligibleClips),
    "Rotation API did not return a numeric eligible clip count.",
  );
  assert(
    Number.isFinite(apiPrimaryReadyAssets),
    "Rotation API did not return a numeric primary ready asset count.",
  );

  const rotationBody = await waitForBodyPattern(
    page,
    new RegExp(
      `Primary ready:\\s+${escapeRegExp(
        apiPrimaryReadyAssets,
      )}\\.\\s+Secondary ready:\\s+\\d+\\.\\s+Eligible clips:\\s+${escapeRegExp(
        apiEligibleClips,
      )}\\.`,
      "i",
    ),
  );

  result.checkpoints.rotationControl.eligibleClips =
    parseFirstIntegerMatch(
      rotationBody,
      /Eligible clips:\s+(\d+)/i,
      "Rotation Control did not render eligible clip counts.",
    );
  result.checkpoints.rotationControl.primaryReadyAssets =
    parseFirstIntegerMatch(
      rotationBody,
      /Primary ready:\s+(\d+)/i,
      "Rotation Control did not render primary ready asset counts.",
    );
  result.checkpoints.rotationControl.apiEligibleClips =
    apiEligibleClips;
  result.checkpoints.rotationControl.apiPrimaryReadyAssets =
    apiPrimaryReadyAssets;

  await verifyAdminPage(
    page,
    "qaContentHealth",
    "/admin/analytics/qa",
    ["QA / Content Health", "WATCHLIST SIZE"],
  );

  result.checkpoints.qaContentHealth.watchlistSize =
    parseFirstIntegerMatch(
      await waitForBodyPattern(
        page,
        /WATCHLIST SIZE\s+\d+/i,
      ),
      /WATCHLIST SIZE\s+(\d+)/i,
      "QA / Content Health did not render a watchlist-size count.",
    );

  await verifyAdminPage(
    page,
    "matchAnalytics",
    "/admin/analytics/matches",
    ["Match Analytics", "Recent room summaries"],
  );

  result.checkpoints.matchAnalytics.hasRecentRoomSummaries =
    true;

  const apiAccess = await page.evaluate(
    async () => {
      const authStorageKey = Object.keys(
        window.localStorage,
      ).find((key) =>
        key.includes("-auth-token"),
      );

      const raw =
        authStorageKey &&
        window.localStorage.getItem(
          authStorageKey,
        );
      const sessionPayload = raw
        ? JSON.parse(raw)
        : null;
      const accessToken =
        sessionPayload?.access_token ?? null;

      const response = await fetch(
        "/api/admin/access",
        {
          headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : {},
        },
      );

      return {
        status: response.status,
        body: await response.text(),
      };
    },
  );

  assert(
    apiAccess.status === 200,
    `Expected /api/admin/access to return 200, got ${apiAccess.status}.`,
  );

  result.checkpoints.apiAccess = apiAccess;

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
