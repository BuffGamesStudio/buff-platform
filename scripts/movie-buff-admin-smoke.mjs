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
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
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

  await page.goto(`${APP_URL}/admin/movies`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Checking access",
      ),
    undefined,
    { timeout: 60000 },
  );

  const moviesBody = await page
    .locator("body")
    .innerText();

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
  };

  await page.goto(`${APP_URL}/admin/sources`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForFunction(
    () =>
      !document.body?.innerText?.includes(
        "Checking access",
      ),
    undefined,
    { timeout: 60000 },
  );

  const sourcesBody = await page
    .locator("body")
    .innerText();

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
  };

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
