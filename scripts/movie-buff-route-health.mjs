const BASE_URL =
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";

const routes = [
  "/sign-in?next=%2Faccount",
  "/sign-up?next=%2Faccount",
  "/account",
  "/games/movie-buff",
  "/games/movie-buff/lobby",
  "/games/movie-buff/how-to-play",
  "/admin/movies",
  "/admin/sources",
  "/admin/analytics/clips",
  "/admin/analytics/rotation",
  "/admin/analytics/qa",
  "/admin/analytics/matches",
];

const attemptsPerRoute = 5;
const requestTimeoutMs = 15000;
const retriesPerAttempt = 2;

function hasApplicationError(body) {
  return (
    body.includes("Application error") ||
    body.includes("Unexpected Application Error") ||
    body.includes("SyntaxError: Unexpected end of JSON input")
  );
}

function hasAdminAccessGate(body) {
  return (
    body.includes("Admin access required") ||
    body.includes("Checking access") ||
    body.includes("Return to Movie Buff")
  );
}

function hasMovieLibraryShell(body) {
  return (
    body.includes("Movie Library") ||
    body.includes("Reading from the Buff Games Content Engine.") ||
    body.includes("Manage published, draft and archived Movie Buff records from one library.")
  );
}

function hasAnalyticsShell(body) {
  return (
    body.includes("Clip Analytics") ||
    body.includes("Rotation Control") ||
    body.includes("QA / Content Health") ||
    body.includes("Match Analytics")
  );
}

function hasSourceRegistryShell(body) {
  return (
    body.includes("Source Registry") ||
    body.includes("REGISTERED SOURCES") ||
    body.includes("Control which movie-source lanes are trusted for discovery, watch access, and gameplay clip ingestion.")
  );
}

function hasAuthShell(body) {
  return (
    body.includes("Buff Games Account") ||
    body.includes("Enter Buff Games") ||
    body.includes("Create Buff Games Account") ||
    body.includes("No Buff Games account session is active yet.")
  );
}

function getRouteExpectation(route) {
  if (!route.startsWith("/admin")) {
    if (
      route.startsWith("/sign-in") ||
      route.startsWith("/sign-up") ||
      route === "/account"
    ) {
      return {
        type: "public",
        contentCheck: hasAuthShell,
      };
    }

    return {
      type: "public",
    };
  }

  if (route === "/admin/movies") {
    return {
      type: "admin",
      contentCheck: hasMovieLibraryShell,
    };
  }

  if (route === "/admin/sources") {
    return {
      type: "admin",
      contentCheck: hasSourceRegistryShell,
    };
  }

  return {
    type: "admin",
    contentCheck: hasAnalyticsShell,
  };
}

const results = [];

for (const route of routes) {
  for (
    let attempt = 1;
    attempt <= attemptsPerRoute;
    attempt += 1
  ) {
    const url = `${BASE_URL}${route}`;

    let lastError = null;
    let attemptPassed = false;

    for (
      let retry = 1;
      retry <= retriesPerAttempt;
      retry += 1
    ) {
      const controller =
        new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, requestTimeoutMs);

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const body = await response.text();
        const expectation =
          getRouteExpectation(route);
        const accessGateDetected =
          expectation.type === "admin"
            ? hasAdminAccessGate(body)
            : false;
        const contentLoaded =
          expectation.type === "admin"
            ? expectation.contentCheck(body)
            : expectation.contentCheck
              ? expectation.contentCheck(body)
              : true;
        const leakedAdminPayload =
          expectation.type === "admin" &&
          accessGateDetected &&
          contentLoaded;
        const unauthenticatedAdminRoute =
          expectation.type === "admin" &&
          accessGateDetected;

        const entry = {
          route,
          attempt,
          retry,
          status: response.status,
          length: body.length,
          hasApplicationError:
            hasApplicationError(body),
          accessGateDetected,
          contentLoaded,
          leakedAdminPayload,
          unauthenticatedAdminRoute,
        };

        results.push(entry);

        if (
          response.status !== 200 ||
          entry.hasApplicationError ||
          leakedAdminPayload
        ) {
          throw new Error(
            `Health check failed for ${route} on attempt ${attempt}, retry ${retry}.`,
          );
        }

        attemptPassed = true;
        lastError = null;
        break;
      } catch (error) {
        clearTimeout(timeout);
        lastError =
          error instanceof Error
            ? error.message
            : String(error);
      }
    }

    if (!attemptPassed) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            route,
            attempt,
            results,
            error: lastError,
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl: BASE_URL,
      attemptsPerRoute,
      note: "A 200 response only proves route stability. For protected admin routes, check accessGateDetected vs contentLoaded before treating the route as authenticated admin proof.",
      results,
    },
    null,
    2,
  ),
);
