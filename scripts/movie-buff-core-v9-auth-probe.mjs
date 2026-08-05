import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const expectedSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const compositionSha = process.env.MOVIE_BUFF_COMPOSITION_SHA?.trim();
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const usersPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const evidenceDir = process.env.MOVIE_BUFF_EVIDENCE_DIR;
const playwrightRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT;

if (!expectedSha || !compositionSha || !appUrl || !supabaseUrl || !publishableKey || !usersPath || !evidenceDir || !playwrightRoot) {
  throw new Error("Exact identity, localhost targets, users, evidence directory, and Playwright root are required.");
}
for (const value of [expectedSha, compositionSha]) assert.match(value, /^[0-9a-f]{40}$/i);
for (const [value, label] of [[appUrl, "application"], [supabaseUrl, "Supabase"]]) {
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
}
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(checkoutSha, expectedSha);
execFileSync("git", ["merge-base", "--is-ancestor", compositionSha, expectedSha]);

fs.mkdirSync(evidenceDir, { recursive: true });
const users = JSON.parse(fs.readFileSync(usersPath, "utf8")).slice(0, 3);
assert.equal(users.length, 3);
const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
const { chromium } = requireFromPlaywright("playwright");

const evidence = {
  schemaVersion: 1,
  laboratory: "three-browser-sign-in-session-probe",
  classification: "UNKNOWN",
  exactHarnessSha: expectedSha,
  compositionSha,
  checkoutSha,
  target: { kind: "localhost", application: new URL(appUrl).origin, supabase: new URL(supabaseUrl).origin },
  startedAt: new Date().toISOString(),
  browsers: [],
};

function safePath(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin === new URL(appUrl).origin) return `${parsed.pathname}${parsed.search}`;
    if (parsed.origin === new URL(supabaseUrl).origin) return `${parsed.pathname}${parsed.search ? "?" : ""}`;
    return "external";
  } catch {
    return "invalid";
  }
}

const browserInstances = [];
try {
  for (let index = 0; index < users.length; index += 1) {
    const browser = await chromium.launch({ headless: true });
    browserInstances.push(browser);
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    const record = {
      player: index + 1,
      navigationRequests: [],
      tokenResponses: [],
      pageErrors: [],
      consoleErrors: [],
      initialUrl: null,
      finalUrl: null,
      bodyText: null,
      storage: null,
      userEndpointStatus: null,
      lobbyReached: false,
    };
    evidence.browsers.push(record);
    page.on("request", (request) => {
      if (request.isNavigationRequest()) record.navigationRequests.push(safePath(request.url()));
    });
    page.on("response", (response) => {
      if (response.url().includes("/auth/v1/token")) {
        record.tokenResponses.push({ path: safePath(response.url()), status: response.status() });
      }
    });
    page.on("pageerror", (error) => record.pageErrors.push(error.message.slice(0, 500)));
    page.on("console", (message) => {
      if (message.type() === "error") record.consoleErrors.push(message.text().slice(0, 500));
    });

    await page.goto(`${new URL(appUrl).origin}/sign-in?next=${encodeURIComponent("/games/movie-buff/lobby")}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    record.initialUrl = safePath(page.url());
    await page.locator('input[type="email"]').fill(users[index].email);
    await page.locator('input[type="password"]').fill(users[index].password);
    await page.locator('form button[type="submit"]').click();

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (new URL(page.url()).pathname === "/games/movie-buff/lobby") {
        record.lobbyReached = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    record.finalUrl = safePath(page.url());
    record.bodyText = (await page.locator("body").innerText()).slice(0, 1200);
    record.storage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const authKeys = keys.filter((key) => /auth-token/i.test(key));
      let parsed = null;
      for (const key of authKeys) {
        try {
          const value = JSON.parse(localStorage.getItem(key) ?? "null");
          const session = value?.currentSession ?? value;
          parsed = {
            hasAccessToken: typeof session?.access_token === "string" && session.access_token.length > 20,
            hasRefreshToken: typeof session?.refresh_token === "string" && session.refresh_token.length > 20,
            hasUser: Boolean(session?.user),
            expiresAtPresent: Boolean(session?.expires_at),
          };
          break;
        } catch {}
      }
      return {
        keyCount: keys.length,
        authKeyCount: authKeys.length,
        authKeySuffixes: authKeys.map((key) => key.split("-").slice(-2).join("-")).slice(0, 5),
        sessionShape: parsed,
      };
    });

    const tokenStatus = await page.evaluate(
      async ({ target, key }) => {
        const authKey = Object.keys(localStorage).find((name) => /auth-token/i.test(name));
        if (!authKey) return null;
        try {
          const value = JSON.parse(localStorage.getItem(authKey) ?? "null");
          const session = value?.currentSession ?? value;
          const token = session?.access_token;
          if (typeof token !== "string") return null;
          const response = await fetch(`${target}/auth/v1/user`, {
            headers: { apikey: key, Authorization: `Bearer ${token}` },
          });
          return response.status;
        } catch {
          return -1;
        }
      },
      { target: new URL(supabaseUrl).origin, key: publishableKey },
    );
    record.userEndpointStatus = tokenStatus;
    await page.screenshot({ path: path.join(evidenceDir, `auth-probe-player-${index + 1}.png`), fullPage: true });
    await context.close();
  }

  const allLobby = evidence.browsers.every((record) => record.lobbyReached);
  evidence.classification = allLobby ? "PASS" : "FAIL";
  if (!allLobby) process.exitCode = 1;
} catch (error) {
  evidence.classification = "FAIL";
  evidence.failure = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(evidenceDir, "auth-session-probe.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  await Promise.allSettled(browserInstances.map((browser) => browser.close()));
}
