const CHECK_NAME = "movie-buff-live-broadcast-contract";

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function targetFromEnvironment(values = process.env) {
  const rawOrigin = nonEmpty(
    values.MOVIE_BUFF_BROADCAST_ORIGIN ??
      values.MOVIE_BUFF_PUBLIC_ORIGIN,
  );

  if (!rawOrigin) {
    throw new Error(
      "MOVIE_BUFF_BROADCAST_ORIGIN is required (for example, https://movie-buff.example.com).",
    );
  }

  let origin;

  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new Error("MOVIE_BUFF_BROADCAST_ORIGIN must be a valid URL.");
  }

  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "MOVIE_BUFF_BROADCAST_ORIGIN must be an http(s) origin without credentials, query, or hash.",
    );
  }

  const hostname = origin.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");

  if (origin.protocol !== "https:" && !isLocal) {
    throw new Error(
      "Hosted Movie Buff broadcast contract checks require HTTPS.",
    );
  }

  return {
    origin: origin.toString().replace(/\/$/, ""),
    hostname,
    isLocal,
  };
}

function assertSafePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Host-context response was not a JSON object.");
  }

  const serialized = JSON.stringify(payload).toLowerCase();
  const forbiddenKeys = [
    "service_role",
    "service-role",
    "api_key",
    "api-key",
    "token_secret",
    "stream_key",
    "stream-key",
    "password",
  ];

  for (const forbiddenKey of forbiddenKeys) {
    if (serialized.includes(forbiddenKey)) {
      throw new Error(
        `Host-context response contained a forbidden secret field: ${forbiddenKey}.`,
      );
    }
  }

  if (payload.schemaVersion !== 2) {
    throw new Error("Host-context response has an unsupported schema version.");
  }

  if (payload.showKey !== "main") {
    throw new Error("Host-context response is not for the main show.");
  }

  if (
    payload.host?.hostName !== "Cinephile Cinematic" ||
    payload.host?.mascotName !== "Buster" ||
    payload.host?.mode !== "cue_only"
  ) {
    throw new Error("Host-context response has an invalid host contract.");
  }

  const show = payload.show;

  if (
    !show ||
    typeof show.status !== "string" ||
    !Array.isArray(show.contestants) ||
    typeof show.queueCount !== "number" ||
    typeof show.queueCapacity !== "number"
  ) {
    throw new Error("Host-context response is missing live-show state.");
  }

  if (payload.media !== null) {
    if (
      payload.media?.clipType !== "video" &&
      payload.media?.clipType !== "audio"
    ) {
      throw new Error("Host-context media has an invalid clip type.");
    }

    if (
      typeof payload.media.url !== "string" ||
      !payload.media.url.startsWith("/api/movie-buff/round-media/")
    ) {
      throw new Error("Host-context media is not constrained to the round route.");
    }
  }

  return {
    schemaVersion: payload.schemaVersion,
    showKey: payload.showKey,
    status: show.status,
    episodeNumber: show.episodeNumber ?? 0,
    currentPhase: show.currentPhase ?? null,
    contestantCount: show.contestants.length,
    mediaType: payload.media?.clipType ?? null,
  };
}

async function main() {
  let target;

  try {
    target = targetFromEnvironment();
  } catch (error) {
    console.log(
      JSON.stringify({
        check: CHECK_NAME,
        status: "blocked",
        reason: "configuration_error",
        message: error instanceof Error ? error.message : String(error),
        secretValuesPrinted: false,
      }),
    );
    process.exitCode = 2;
    return;
  }

  const endpoint = `${target.origin}/api/movie-buff/live/host-context?showKey=main`;
  let response;

  try {
    response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
        "user-agent": "movie-buff-live-broadcast-contract/1",
      },
    });
  } catch (error) {
    console.log(
      JSON.stringify({
        check: CHECK_NAME,
        status: "blocked",
        reason: "request_failed",
        targetHost: target.hostname,
        message: error instanceof Error ? error.message : String(error),
        secretValuesPrinted: false,
      }),
    );
    process.exitCode = 2;
    return;
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    console.log(
      JSON.stringify({
        check: CHECK_NAME,
        status: "unhealthy",
        reason: "invalid_json",
        targetHost: target.hostname,
        httpStatus: response.status,
        secretValuesPrinted: false,
      }),
    );
    process.exitCode = 1;
    return;
  }

  try {
    const projection = assertSafePayload(payload);
    console.log(
      JSON.stringify({
        check: CHECK_NAME,
        status: response.ok ? "healthy" : "unhealthy",
        targetHost: target.hostname,
        httpStatus: response.status,
        projection,
        secretValuesPrinted: false,
      }),
    );
    process.exitCode = response.ok ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        check: CHECK_NAME,
        status: "unhealthy",
        reason: "contract_failed",
        targetHost: target.hostname,
        httpStatus: response.status,
        message: error instanceof Error ? error.message : String(error),
        secretValuesPrinted: false,
      }),
    );
    process.exitCode = 1;
  }
}

await main();
