import { createClient } from "@supabase/supabase-js";

const CHECK_NAME = "movie-buff-live-health";
const DEFAULT_SHOW_KEY = "main";
const DEFAULT_HEARTBEAT_MAX_AGE_SECONDS = 30;
const DEFAULT_LEASE_GRACE_SECONDS = 0;
const DEFAULT_STUCK_CASTING_MINUTES = 5;
const DEFAULT_STUCK_LIVE_MINUTES = 30;
const WEBHOOK_TIMEOUT_MS = 5000;

// These are the statuses defined by
// supabase/migrations/20260822072017_movie_buff_live_show_runner.sql.
const WORKER_ACTIVE_SHOW_STATUSES = new Set([
  "waiting_for_contestants",
  "casting",
  "live",
  "cooldown",
]);
const ACTIVE_EPISODE_STATUSES = new Set(["casting", "live"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function parsePositiveNumber(values, key, fallback, { allowZero = false } = {}) {
  const raw = nonEmpty(values[key]);

  if (raw === null) {
    return fallback;
  }

  const parsed = Number(raw);
  const valid = Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);

  if (!valid) {
    throw new Error(`${key} must be ${allowZero ? "zero or a positive" : "a positive"} number.`);
  }

  return parsed;
}

function redactMessage(value) {
  return String(value)
    .replace(/https?:\/\/[^\s"']+/gi, "<redacted-url>")
    .replace(/(bearer\s+)[^\s]+/gi, "$1<redacted>")
    .replace(/(apikey|api[_-]?key|token|secret|password)[=:]\s*[^\s,;]+/gi, "$1=<redacted>");
}

function safeError(value) {
  return redactMessage(value instanceof Error ? value.message : value);
}

function parseTarget(values) {
  const rawUrl = nonEmpty(values.NEXT_PUBLIC_SUPABASE_URL);

  if (rawUrl === null) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use http or https.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must not contain credentials.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local");
  const expectedRef = nonEmpty(
    values.MOVIE_BUFF_EXPECTED_SUPABASE_REF ??
      values.MOVIE_BUFF_LIVE_EXPECTED_SUPABASE_REF,
  );

  if (!isLocal && expectedRef === null) {
    throw new Error(
      "Hosted Movie Buff health checks require MOVIE_BUFF_EXPECTED_SUPABASE_REF.",
    );
  }

  if (expectedRef !== null && !/^[a-z0-9][a-z0-9-]*$/i.test(expectedRef)) {
    throw new Error("MOVIE_BUFF_EXPECTED_SUPABASE_REF is not a valid project reference.");
  }

  if (expectedRef !== null && hostname.endsWith(".supabase.co")) {
    const actualRef = hostname.slice(0, -".supabase.co".length);

    if (actualRef !== expectedRef.toLowerCase()) {
      throw new Error("Supabase URL does not match MOVIE_BUFF_EXPECTED_SUPABASE_REF.");
    }
  }

  return {
    url: parsed.toString(),
    hostname,
    isLocal,
    expectedRef,
  };
}

function loadConfig(values = process.env) {
  if (values.MOVIE_BUFF_LIVE_HEALTH_ENABLED !== "true") {
    throw new Error(
      "Movie Buff Live health check is fail-closed. Set MOVIE_BUFF_LIVE_HEALTH_ENABLED=true.",
    );
  }

  const serviceRoleKey =
    nonEmpty(values.SUPABASE_SECRET_KEY) ??
    nonEmpty(values.SUPABASE_SERVICE_ROLE_KEY);

  if (serviceRoleKey === null) {
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  }

  return {
    target: parseTarget(values),
    serviceRoleKey,
    showKey: nonEmpty(values.MOVIE_BUFF_LIVE_SHOW_KEY) ?? DEFAULT_SHOW_KEY,
    heartbeatMaxAgeSeconds: parsePositiveNumber(
      values,
      "MOVIE_BUFF_LIVE_HEARTBEAT_MAX_AGE_SECONDS",
      DEFAULT_HEARTBEAT_MAX_AGE_SECONDS,
    ),
    leaseGraceSeconds: parsePositiveNumber(
      values,
      "MOVIE_BUFF_LIVE_LEASE_GRACE_SECONDS",
      DEFAULT_LEASE_GRACE_SECONDS,
      { allowZero: true },
    ),
    stuckCastingMinutes: parsePositiveNumber(
      values,
      "MOVIE_BUFF_LIVE_STUCK_CASTING_MINUTES",
      DEFAULT_STUCK_CASTING_MINUTES,
    ),
    stuckLiveMinutes: parsePositiveNumber(
      values,
      "MOVIE_BUFF_LIVE_STUCK_LIVE_MINUTES",
      DEFAULT_STUCK_LIVE_MINUTES,
    ),
    alertWebhookUrl: nonEmpty(values.MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL),
  };
}

function ageSeconds(timestamp, nowMs) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, (nowMs - parsed) / 1000);
}

function makeFinding(code, message, details = {}) {
  return {
    code,
    severity: "critical",
    message,
    ...details,
  };
}

function getAlertKey(showKey, finding) {
  const episodePart = finding.episodeId ? `:${finding.episodeId}` : "";
  return `movie-buff-live-health:${encodeURIComponent(showKey)}:${finding.code}${episodePart}`;
}

function normalizeFinding(showKey, finding) {
  return {
    ...finding,
    alertKey: getAlertKey(showKey, finding),
  };
}

function buildBaseResult(config, observedAt) {
  return {
    check: CHECK_NAME,
    healthy: false,
    status: "unhealthy",
    observedAt,
    target: {
      showKey: config.showKey,
      supabaseHost: config.target.hostname,
      hosted: !config.target.isLocal,
      expectedProjectRef: config.target.expectedRef,
    },
    thresholds: {
      heartbeatMaxAgeSeconds: config.heartbeatMaxAgeSeconds,
      leaseGraceSeconds: config.leaseGraceSeconds,
      stuckCastingMinutes: config.stuckCastingMinutes,
      stuckLiveMinutes: config.stuckLiveMinutes,
    },
    findings: [],
  };
}

async function queryLiveState(config, nowMs) {
  const supabase = createClient(config.target.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: show, error: showError } = await supabase
    .from("movie_buff_live_shows")
    .select(
      "id,show_key,status,episode_number,current_episode_id,current_phase,current_phase_ends_at,next_tick_at,worker_id,lease_expires_at,last_heartbeat_at,last_error,updated_at",
    )
    .eq("show_key", config.showKey)
    .maybeSingle();

  if (showError) {
    throw new Error(`Live show query failed: ${safeError(showError)}`);
  }

  if (!show) {
    return {
      show: null,
      episode: null,
      nowMs,
    };
  }

  let episode = null;

  if (show.current_episode_id) {
    const { data, error: episodeError } = await supabase
      .from("movie_buff_live_show_episodes")
      .select(
        "id,show_id,episode_number,room_id,match_id,status,started_at,ended_at,created_at",
      )
      .eq("id", show.current_episode_id)
      .maybeSingle();

    if (episodeError) {
      throw new Error(`Live episode query failed: ${safeError(episodeError)}`);
    }

    episode = data;
  }

  return { show, episode, nowMs };
}

function evaluateState(config, state) {
  const { show, episode, nowMs } = state;
  const result = buildBaseResult(config, new Date(nowMs).toISOString());

  if (!show) {
    result.findings.push(
      makeFinding("show_missing", `Movie Buff Live show '${config.showKey}' was not found.`),
    );
    result.findings = result.findings.map((finding) =>
      normalizeFinding(config.showKey, finding),
    );
    result.alertKey = result.findings[0].alertKey;
    return result;
  }

  const episodeExpectedActive =
    episode !== null && ACTIVE_EPISODE_STATUSES.has(episode.status);
  const workerExpectedActive =
    WORKER_ACTIVE_SHOW_STATUSES.has(show.status) || episodeExpectedActive;
  const heartbeatAgeSeconds = ageSeconds(show.last_heartbeat_at, nowMs);
  const leaseAgeSeconds = ageSeconds(show.lease_expires_at, nowMs);
  const leaseExpiresAtMs = show.lease_expires_at
    ? Date.parse(show.lease_expires_at)
    : null;

  result.show = {
    id: show.id,
    status: show.status,
    episodeNumber: show.episode_number,
    currentEpisodeId: show.current_episode_id,
    currentPhase: show.current_phase,
    workerExpectedActive,
    workerIdPresent: Boolean(nonEmpty(show.worker_id)),
    heartbeatAgeSeconds,
    leaseExpiresAt: show.lease_expires_at,
    leaseAgeSeconds,
  };

  if (!show.last_heartbeat_at || heartbeatAgeSeconds === null) {
    if (workerExpectedActive) {
      result.findings.push(
        makeFinding(
          "heartbeat_stale_or_missing",
          "The live worker is expected to be active, but last_heartbeat_at is missing or invalid.",
        ),
      );
    }
  } else if (
    workerExpectedActive &&
    heartbeatAgeSeconds > config.heartbeatMaxAgeSeconds
  ) {
    result.findings.push(
      makeFinding(
        "heartbeat_stale_or_missing",
        `The live worker heartbeat is ${heartbeatAgeSeconds.toFixed(1)} seconds old, exceeding the ${config.heartbeatMaxAgeSeconds}-second threshold.`,
        { heartbeatAgeSeconds },
      ),
    );
  }

  if (workerExpectedActive && !nonEmpty(show.worker_id)) {
    result.findings.push(
      makeFinding(
        "lease_expired_or_missing",
        "The live worker is expected to be active, but worker_id is missing.",
      ),
    );
  } else if (workerExpectedActive && !show.lease_expires_at) {
    result.findings.push(
      makeFinding(
        "lease_expired_or_missing",
        "The live worker is expected to be active, but lease_expires_at is missing.",
      ),
    );
  } else if (
    workerExpectedActive &&
    Number.isFinite(leaseExpiresAtMs) &&
    leaseExpiresAtMs <= nowMs - config.leaseGraceSeconds * 1000
  ) {
    result.findings.push(
      makeFinding(
        "lease_expired_or_missing",
        "The live worker lease has expired while the worker or an active episode is expected.",
        { leaseExpiresAt: show.lease_expires_at },
      ),
    );
  }

  if (show.current_episode_id && !episode) {
    result.findings.push(
      makeFinding(
        "current_episode_missing",
        "The show points at a current episode that is not present in movie_buff_live_show_episodes.",
        { episodeId: show.current_episode_id },
      ),
    );
  }

  if (episode) {
    result.episode = {
      id: episode.id,
      status: episode.status,
      episodeNumber: episode.episode_number,
      createdAt: episode.created_at,
      startedAt: episode.started_at,
      ageSeconds:
        episode.status === "casting"
          ? ageSeconds(episode.created_at, nowMs)
          : ageSeconds(episode.started_at, nowMs),
    };

    if (episode.status === "casting") {
      const castingAgeSeconds = ageSeconds(episode.created_at, nowMs);

      if (castingAgeSeconds === null) {
        result.findings.push(
          makeFinding(
            "stuck_casting_episode",
            "The current casting episode has no valid created_at timestamp.",
            { episodeId: episode.id },
          ),
        );
      } else if (
        castingAgeSeconds > config.stuckCastingMinutes * 60
      ) {
        result.findings.push(
          makeFinding(
            "stuck_casting_episode",
            `The casting episode is ${(
              castingAgeSeconds / 60
            ).toFixed(1)} minutes old, exceeding the ${config.stuckCastingMinutes}-minute threshold.`,
            { episodeId: episode.id, ageSeconds: castingAgeSeconds },
          ),
        );
      }
    } else if (episode.status === "live") {
      const liveAgeSeconds = ageSeconds(episode.started_at, nowMs);

      if (liveAgeSeconds === null) {
        result.findings.push(
          makeFinding(
            "stuck_live_episode",
            "The current live episode has no valid started_at timestamp.",
            { episodeId: episode.id },
          ),
        );
      } else if (liveAgeSeconds > config.stuckLiveMinutes * 60) {
        result.findings.push(
          makeFinding(
            "stuck_live_episode",
            `The live episode is ${(liveAgeSeconds / 60).toFixed(
              1,
            )} minutes old, exceeding the ${config.stuckLiveMinutes}-minute threshold.`,
            { episodeId: episode.id, ageSeconds: liveAgeSeconds },
          ),
        );
      }
    } else if (!ACTIVE_EPISODE_STATUSES.has(episode.status)) {
      result.findings.push(
        makeFinding(
          "current_episode_status_mismatch",
          `The show points at a current episode with terminal status '${episode.status}'.`,
          { episodeId: episode.id },
        ),
      );
    }
  }

  result.findings = result.findings.map((finding) =>
    normalizeFinding(config.showKey, finding),
  );
  result.healthy = result.findings.length === 0;
  result.status = result.healthy ? "healthy" : "unhealthy";

  if (result.findings.length > 0) {
    result.alertKey = result.findings.map((finding) => finding.alertKey).join(",");
  }

  return result;
}

async function deliverAlert(config, result) {
  if (result.healthy || !config.alertWebhookUrl) {
    return {
      attempted: false,
      configured: Boolean(config.alertWebhookUrl),
      delivered: false,
    };
  }

  let webhook;

  try {
    webhook = new URL(config.alertWebhookUrl);
  } catch {
    return {
      attempted: true,
      configured: true,
      delivered: false,
      error: "MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL is not a valid URL.",
    };
  }

  if (!/^https?:$/.test(webhook.protocol) || webhook.username || webhook.password) {
    return {
      attempted: true,
      configured: true,
      delivered: false,
      error: "MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL must be an http(s) URL without credentials.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "movie-buff-live-health/1",
      },
      body: JSON.stringify({
        alertKey: result.alertKey,
        check: result.check,
        status: result.status,
        observedAt: result.observedAt,
        target: result.target,
        findings: result.findings,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        attempted: true,
        configured: true,
        delivered: false,
        error: `Alert webhook returned HTTP ${response.status}.`,
      };
    }

    return { attempted: true, configured: true, delivered: true };
  } catch (error) {
    return {
      attempted: true,
      configured: true,
      delivered: false,
      error: error?.name === "AbortError" ? "Alert webhook timed out." : safeError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function emit(result) {
  console.log(JSON.stringify(result));
}

async function main() {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    emit({
      check: CHECK_NAME,
      healthy: false,
      status: "blocked",
      reason: "configuration_error",
      message: safeError(error),
      findings: [],
    });
    process.exitCode = 2;
    return;
  }

  let result;

  try {
    const state = await queryLiveState(config, Date.now());
    result = evaluateState(config, state);
  } catch (error) {
    result = buildBaseResult(config, new Date().toISOString());
    result.status = "blocked";
    result.reason = "health_query_error";
    result.message = safeError(error);
    result.findings = [
      normalizeFinding(
        config.showKey,
        makeFinding("health_query_failed", "The read-only live-state query failed."),
      ),
    ];
    result.alertKey = result.findings[0].alertKey;
  }

  result.alert = await deliverAlert(config, result);
  emit(result);

  if (!result.healthy) {
    process.exitCode = result.status === "blocked" ? 2 : 1;
  }
}

await main();
