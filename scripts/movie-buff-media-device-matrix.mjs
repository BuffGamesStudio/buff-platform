import fs from "node:fs";
import { pathToFileURL } from "node:url";

const mediaUrl =
  process.env.MOVIE_BUFF_MEDIA_URL ??
  "https://movie-buff-sigma.vercel.app/media/movie-buff/public-domain/west-of-hot-dog/west-of-hot-dog-montage-30s.mp4";
const playwrightEntry =
  process.env.PLAYWRIGHT_ENTRY ??
  "C:/Users/shapa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const chromeExecutable =
  process.env.MOVIE_BUFF_CHROME_EXECUTABLE ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const profiles = [
  {
    name: "iPhone Safari",
    engine: "webkit",
    deviceNames: ["iPhone 13", "iPhone 14"],
  },
  {
    name: "iPad Safari",
    engine: "webkit",
    deviceNames: ["iPad Pro 11", "iPad (gen 7)"],
  },
  {
    name: "Android Chrome",
    engine: "chromium",
    deviceNames: ["Pixel 7", "Pixel 5"],
  },
  {
    name: "Tablet Chrome",
    engine: "chromium",
    deviceNames: ["Galaxy Tab S7", "Pixel C"],
  },
  {
    name: "Desktop Chrome",
    engine: "chromium",
    deviceNames: ["Desktop Chrome"],
  },
];

function resolveDevice(devices, names) {
  for (const name of names) {
    if (devices[name]) {
      return { name, descriptor: devices[name] };
    }
  }

  return {
    name: "custom fallback",
    descriptor: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    },
  };
}

function headerSnapshot(response) {
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    acceptRanges: response.headers.get("accept-ranges"),
    cacheControl: response.headers.get("cache-control"),
    vercelCache: response.headers.get("x-vercel-cache"),
  };
}

async function verifyCacheableMedia() {
  const response = await fetch(mediaUrl, { method: "HEAD" });
  const snapshot = headerSnapshot(response);
  const contentType = snapshot.contentType ?? "";
  const cacheControl = snapshot.cacheControl ?? "";

  if (!(response.ok || response.status === 206)) {
    throw new Error(`media HEAD returned HTTP ${response.status}`);
  }

  if (!contentType.toLowerCase().startsWith("video/")) {
    throw new Error(`media content type is not video: ${contentType || "missing"}`);
  }

  if (snapshot.acceptRanges?.toLowerCase() !== "bytes") {
    throw new Error("media endpoint does not advertise byte ranges");
  }

  if (!cacheControl.toLowerCase().includes("public")) {
    throw new Error("media endpoint is not publicly cacheable");
  }

  const cacheAges = Array.from(
    cacheControl.matchAll(/(?:s-)?max-age=(\d+)/gi),
    (match) => Number.parseInt(match[1], 10),
  );
  if (!cacheAges.some((age) => Number.isFinite(age) && age > 0)) {
    throw new Error(
      "media endpoint has no positive max-age or s-maxage cache lifetime",
    );
  }

  return snapshot;
}

async function installHarness(page, { forceAutoplayBlocked = false } = {}) {
  await page.goto("about:blank");

  await page.evaluate(({ source, forceAutoplayBlocked: shouldBlock }) => {
    document.body.innerHTML = `
      <main>
        <button id="tap" type="button">Tap to play</button>
        <video id="clip" playsinline preload="auto" width="2" height="2"></video>
        <output id="status">Loading clip</output>
      </main>`;

    const video = document.querySelector("#clip");
    const tap = document.querySelector("#tap");
    const output = document.querySelector("#status");
    const nativePlay = video.play.bind(video);
    const state = (window.__movieBuffMediaState = {
      metadataLoaded: false,
      canPlay: false,
      autoplayBlocked: false,
      autoplayStarted: false,
      manualPlaybackStarted: false,
      mediaError: null,
      readyState: 0,
      elapsed: 0,
    });

    if (shouldBlock) {
      let blockNextPlay = true;
      video.play = async () => {
        if (blockNextPlay) {
          blockNextPlay = false;
          throw new DOMException(
            "The play() request was interrupted by a user agent.",
            "NotAllowedError",
          );
        }
        return nativePlay();
      };
    }
    const sync = (label) => {
      state.readyState = video.readyState;
      state.elapsed = video.currentTime || 0;
      output.textContent = label;
    };

    video.addEventListener("loadedmetadata", () => {
      state.metadataLoaded = true;
      sync("Metadata ready");
    });
    video.addEventListener("canplay", () => {
      state.canPlay = true;
      sync("Playable");
    });
    video.addEventListener("playing", () => sync("Playing"));
    video.addEventListener("timeupdate", () => sync("Playing"));
    video.addEventListener("error", () => {
      state.mediaError = video.error?.code || "media_error";
      sync("Media error");
    });
    tap.addEventListener("click", async () => {
      try {
        await video.play();
        state.manualPlaybackStarted = true;
        sync("Playing after tap");
      } catch (error) {
        state.mediaError = error?.message || "tap_play_failed";
        sync("Tap failed");
      }
    });

    video.src = source;
    video.load();
  }, { source: mediaUrl, forceAutoplayBlocked });
}

async function waitForMedia(page) {
  try {
    await page.waitForFunction(
      () => {
        const state = window.__movieBuffMediaState;
        return state?.canPlay || state?.mediaError;
      },
      undefined,
      { timeout: 20000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const video = document.querySelector("#clip");
      const state = window.__movieBuffMediaState;
      return {
        state,
        readyState: video?.readyState ?? null,
        networkState: video?.networkState ?? null,
        currentSrc: video?.currentSrc ?? null,
        errorCode: video?.error?.code ?? null,
        errorMessage: video?.error?.message ?? null,
      };
    });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
}

async function runProfile({ chromium, webkit, devices }, profile) {
  const browserType = profile.engine === "webkit" ? webkit : chromium;
  const browser = await browserType.launch({
    headless: true,
    ...(profile.engine === "chromium" && fs.existsSync(chromeExecutable)
      ? { executablePath: chromeExecutable }
      : {}),
  });

  try {
    const { name: deviceName, descriptor } = resolveDevice(
      devices,
      profile.deviceNames,
    );
    const context = await browser.newContext(descriptor);
    const results = [];
    for (const scenario of [
      { name: "native-autoplay", forceAutoplayBlocked: false },
      { name: "autoplay-blocked-fallback", forceAutoplayBlocked: true },
    ]) {
      const page = await context.newPage();
      await installHarness(page, scenario);
      await waitForMedia(page);

      const autoplayOutcome = await page.evaluate(async () => {
        const video = document.querySelector("#clip");
        try {
          await video.play();
          window.__movieBuffMediaState.autoplayStarted = true;
          return "started";
        } catch (error) {
          const message = error?.message || "autoplay_failed";
          window.__movieBuffMediaState.autoplayBlocked =
            error?.name === "NotAllowedError" ||
            /autoplay|user.?gesture|not allowed/i.test(message);
          window.__movieBuffMediaState.autoplayError = message;
          return window.__movieBuffMediaState.autoplayBlocked
            ? "blocked"
            : "failed";
        }
      });

      if (autoplayOutcome !== "started") {
        try {
          await page.locator("#tap").click({ timeout: 10000 });
        } catch (error) {
          const diagnostics = await page.evaluate(() => ({
            url: location.href,
            html: document.body.innerHTML.slice(0, 500),
            state: window.__movieBuffMediaState,
          }));
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}`);
        }
        try {
          await page.waitForFunction(
            () => window.__movieBuffMediaState?.manualPlaybackStarted,
            undefined,
            { timeout: 10000 },
          );
        } catch (error) {
          const diagnostics = await page.evaluate(() => ({
            state: window.__movieBuffMediaState,
            videoError: document.querySelector("#clip")?.error?.code ?? null,
            status: document.querySelector("#status")?.textContent ?? null,
          }));
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}`);
        }
      }

      const state = await page.evaluate(() => ({
        ...window.__movieBuffMediaState,
        tapToPlayVisible: Boolean(document.querySelector("#tap")),
      }));

      if (!state.canPlay || !state.tapToPlayVisible) {
        throw new Error("media did not reach a playable state with fallback UI");
      }

      if (scenario.forceAutoplayBlocked && autoplayOutcome !== "blocked") {
        throw new Error("forced autoplay-blocked scenario did not block autoplay");
      }

      if (scenario.forceAutoplayBlocked && !state.manualPlaybackStarted) {
        throw new Error("tap-to-play fallback did not start media");
      }

      results.push({
        profile: profile.name,
        scenario: scenario.name,
        engine: profile.engine,
        device: deviceName,
        autoplayOutcome,
        ...state,
      });
      await page.close();
    }
    await context.close();
    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  const report = {
    mediaUrl,
    cache: null,
    profiles: [],
    failures: [],
  };

  try {
    report.cache = await verifyCacheableMedia();
  } catch (error) {
    report.failures.push({
      scope: "cache",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let playwright;
  try {
    playwright = await import(
      pathToFileURL(playwrightEntry).href,
    );
  } catch (error) {
    report.failures.push({
      scope: "playwright",
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  for (const profile of profiles) {
    try {
      report.profiles.push(...await runProfile(playwright, profile));
    } catch (error) {
      report.failures.push({
        scope: profile.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failures.length > 0 ? 1 : 0;
}

await main();
