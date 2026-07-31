import { pathToFileURL } from "node:url";

import {
  provisionLocalSmokeAccount,
  provisionLocalSmokeSession,
} from "./movie-buff-smoke-auth.mjs";

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
  await locator.click();
  await locator.press("ControlOrMeta+A");
  await locator.press("Backspace");
  await locator.type(value);
}

async function expectUniqueText(page, text) {
  const locator = page.getByText(text, {
    exact: true,
  });
  const first = locator.first();
  await first.waitFor({ timeout: 60000 });
  const count = await locator.count();
  assert(count >= 1, `Expected text "${text}" to appear.`);
}

async function expectRole(page, role, name) {
  const locator = page.getByRole(role, {
    name,
  });
  const first = locator.first();
  await first.waitFor({ timeout: 60000 });
  const count = await locator.count();
  assert(
    count >= 1,
    `Expected at least one ${role} named "${name}".`,
  );
}

async function expectSignedOutAccountState(page) {
  await page.waitForFunction(
    () => {
      const bodyText =
        document.body?.innerText ?? "";

      return (
        bodyText.includes(
          "No Buff Games account session is active yet.",
        ) ||
        (bodyText.includes("Sign In") &&
          bodyText.includes("Sign Up"))
      );
    },
    undefined,
    { timeout: 60000 },
  );
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_EXECUTABLE,
});

const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);

const result = {
  baseUrl: APP_URL,
  checkpoints: {},
};

try {
  await page.goto(`${APP_URL}/sign-in?next=%2Faccount`, {
    waitUntil: "domcontentloaded",
  });

  await expectUniqueText(page, "Sign in");
  await expectRole(page, "button", "Enter Buff Games");
  result.checkpoints.signInPage = {
    url: page.url(),
    ok: true,
  };

  await page.goto(`${APP_URL}/sign-up?next=%2Faccount`, {
    waitUntil: "domcontentloaded",
  });

  await expectUniqueText(page, "Sign up");
  await expectRole(
    page,
    "button",
    "Create Buff Games Account",
  );
  result.checkpoints.signUpPage = {
    url: page.url(),
    ok: true,
  };

  const createdAccount =
    await provisionLocalSmokeAccount(
      "auth-flow-smoke",
    );

  result.checkpoints.accountProvision = {
    email: createdAccount.email,
    ok: true,
  };

  const {
    storageKey,
    sessionString,
    email,
  } = await provisionLocalSmokeSession(
    "auth-flow-session",
  );

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    {
      key: storageKey,
      value: sessionString,
    },
  );

  result.checkpoints.sessionProvision = {
    email,
    ok: true,
  };

  await page.goto(`${APP_URL}/account`, {
    waitUntil: "domcontentloaded",
  });

  await expectUniqueText(page, "Launch Movie Buff");
  const accountBody = await page
    .locator("body")
    .innerText();
  assert(
    accountBody.includes("Signed in"),
    "Account page did not show a signed-in state.",
  );

  result.checkpoints.accountSignedIn = {
    url: page.url(),
    ok: true,
  };

  await page.reload({
    waitUntil: "domcontentloaded",
  });
  await expectUniqueText(page, "Launch Movie Buff");
  result.checkpoints.sessionPersistence = {
    url: page.url(),
    ok: true,
  };

  await Promise.all([
    page.waitForURL(`${APP_URL}/`, {
      timeout: 60000,
    }),
    page
      .locator("section")
      .getByRole("button", {
        name: "Sign Out",
      })
      .first()
      .click(),
  ]);

  await expectRole(page, "link", "Sign Up");
  await expectRole(page, "link", "Sign In");
  result.checkpoints.signOut = {
    url: page.url(),
    ok: true,
  };

  await context.close();

  const signedOutContext =
    await browser.newContext();
  const signedOutPage =
    await signedOutContext.newPage();
  signedOutPage.setDefaultTimeout(60000);
  signedOutPage.setDefaultNavigationTimeout(60000);

  await signedOutPage.goto(`${APP_URL}/account`, {
    waitUntil: "domcontentloaded",
  });
  await expectSignedOutAccountState(
    signedOutPage,
  );
  result.checkpoints.accountSignedOut = {
    url: signedOutPage.url(),
    ok: true,
  };

  await signedOutContext.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
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
        ...result,
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
  await context.close().catch(() => {});
  await browser.close();
}
