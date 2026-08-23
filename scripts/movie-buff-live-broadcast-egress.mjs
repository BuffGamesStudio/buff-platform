import {
  EgressClient,
  EgressStatus,
  EncodingOptionsPreset,
  StreamOutput,
  StreamProtocol,
} from "livekit-server-sdk";

const CHECK_NAME = "movie-buff-live-broadcast-egress";
const DEFAULT_SHOW_KEY = "main";

function nonEmpty(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function required(values, name) {
  const value = nonEmpty(values[name]);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function normalizeLiveKitHost(value) {
  const normalized = required({ LIVEKIT_URL: value }, "LIVEKIT_URL");
  const parsed = new URL(normalized);

  if (parsed.protocol === "wss:") {
    parsed.protocol = "https:";
  } else if (parsed.protocol === "ws:") {
    parsed.protocol = "http:";
  }

  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(
      "LIVEKIT_URL must be a websocket or HTTP(S) URL without credentials.",
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

function requireHttpsUrl(value, name) {
  const normalized = required({ [name]: value }, name);
  const parsed = new URL(normalized);

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${name} must be an HTTPS URL without credentials.`);
  }

  return parsed.toString();
}

function requireRtmpUrl(value, name) {
  const normalized = required({ [name]: value }, name);
  const parsed = new URL(normalized);

  if (!["rtmp:", "rtmps:"].includes(parsed.protocol)) {
    throw new Error(`${name} must be an RTMP or RTMPS URL.`);
  }

  return parsed.toString();
}

function activeEgressStatus(status) {
  return status === EgressStatus.EGRESS_STARTING ||
    status === EgressStatus.EGRESS_ACTIVE;
}

function isMatchingCompositionEgress(egress, compositionUrl) {
  const request = egress?.request;

  return Boolean(
    activeEgressStatus(egress?.status) &&
      request?.case === "web" &&
      request.value?.url === compositionUrl,
  );
}

function output(result) {
  console.log(
    JSON.stringify({
      check: CHECK_NAME,
      ...result,
      secretValuesPrinted: false,
    }),
  );
}

const values = process.env;

if (values.MOVIE_BUFF_BROADCAST_EGRESS_ENABLED !== "true") {
  output({
    status: "blocked",
    reason: "opt_in_required",
    message:
      "Broadcast egress is fail-closed. Set MOVIE_BUFF_BROADCAST_EGRESS_ENABLED=true to inspect the provider state.",
  });
  process.exitCode = 2;
} else {
  try {
    const showKey = nonEmpty(values.MOVIE_BUFF_LIVE_SHOW_KEY) ?? DEFAULT_SHOW_KEY;
    const compositionUrl = requireHttpsUrl(
      values.MOVIE_BUFF_BROADCAST_COMPOSITION_URL,
      "MOVIE_BUFF_BROADCAST_COMPOSITION_URL",
    );
    const ingestUrl = requireRtmpUrl(
      values.MUX_LIVE_STREAM_INGEST_URL,
      "MUX_LIVE_STREAM_INGEST_URL",
    );
    const host = normalizeLiveKitHost(values.LIVEKIT_URL);
    const apiKey = required(values, "LIVEKIT_API_KEY");
    const apiSecret = required(values, "LIVEKIT_API_SECRET");
    const egressClient = new EgressClient(host, apiKey, apiSecret, {
      requestTimeout: 10,
    });
    const activeEgresses = await egressClient.listEgress({ active: true });
    const matchingEgress = activeEgresses.find((egress) =>
      isMatchingCompositionEgress(egress, compositionUrl),
    );

    if (matchingEgress) {
      output({
        status: "ready",
        action: "already_active",
        showKey,
        egressId: matchingEgress.egressId,
      });
    } else if (values.MOVIE_BUFF_BROADCAST_EGRESS_APPLY !== "true") {
      output({
        status: "ready_to_apply",
        action: "no_active_egress",
        showKey,
        activeEgressCount: activeEgresses.length,
        message:
          "No matching egress is active. Set MOVIE_BUFF_BROADCAST_EGRESS_APPLY=true only after production egress authorization.",
      });
      process.exitCode = 2;
    } else {
      const streamOutput = new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [ingestUrl],
      });
      const egress = await egressClient.startWebEgress(
        compositionUrl,
        streamOutput,
        {
          awaitStartSignal: false,
          encodingOptions: EncodingOptionsPreset.H264_1080P_30,
        },
      );

      output({
        status: "started",
        action: "started_web_egress",
        showKey,
        egressId: egress.egressId,
        egressStatus: egress.status,
      });
    }
  } catch (error) {
    output({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}
