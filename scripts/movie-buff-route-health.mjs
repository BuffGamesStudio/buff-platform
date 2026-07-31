const BASE_URL =
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";

const routes = [
  "/games/movie-buff",
  "/games/movie-buff/lobby",
  "/games/movie-buff/how-to-play",
  "/admin/movies",
  "/admin/analytics/clips",
  "/admin/analytics/rotation",
  "/admin/analytics/qa",
  "/admin/analytics/matches",
];

const attemptsPerRoute = 5;

function hasApplicationError(body) {
  return (
    body.includes("Application error") ||
    body.includes("Unexpected Application Error") ||
    body.includes("SyntaxError: Unexpected end of JSON input")
  );
}

const results = [];

for (const route of routes) {
  for (
    let attempt = 1;
    attempt <= attemptsPerRoute;
    attempt += 1
  ) {
    const url = `${BASE_URL}${route}`;

    try {
      const response = await fetch(url, {
        cache: "no-store",
      });
      const body = await response.text();

      const entry = {
        route,
        attempt,
        status: response.status,
        length: body.length,
        hasApplicationError:
          hasApplicationError(body),
      };

      results.push(entry);

      if (
        response.status !== 200 ||
        entry.hasApplicationError
      ) {
        throw new Error(
          `Health check failed for ${route} on attempt ${attempt}.`,
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            route,
            attempt,
            results,
            error:
              error instanceof Error
                ? error.message
                : String(error),
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
      results,
    },
    null,
    2,
  ),
);
