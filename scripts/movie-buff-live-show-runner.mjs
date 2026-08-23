import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { readSmokeEnvFile } from "./movie-buff-smoke-env.mjs";
import { createMovieBuffLiveProviderBridge } from "./movie-buff-live-provider-bridge.mjs";

function loadEnvironment() {
  const explicitEnvFile =
    process.env.MOVIE_BUFF_LIVE_ENV_FILE ??
    process.env.MOVIE_BUFF_ENV_FILE ??
    null;
  const envFilePath = explicitEnvFile
    ? path.resolve(process.cwd(), explicitEnvFile)
    : path.join(process.cwd(), ".env.local");
  const fileEnv = fs.existsSync(envFilePath)
    ? readSmokeEnvFile(envFilePath)
    : {};

  return {
    ...fileEnv,
    ...process.env,
  };
}

function requiredValue(values, key) {
  const value = values[key]?.trim();

  if (!value) {
    throw new Error(`Movie Buff Live runner requires ${key}.`);
  }

  return value;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const values = loadEnvironment();

if (values.MOVIE_BUFF_LIVE_RUNNER_ENABLED !== "true") {
  throw new Error(
    "Movie Buff Live runner is fail-closed. Set MOVIE_BUFF_LIVE_RUNNER_ENABLED=true to start it.",
  );
}

const supabaseUrl = requiredValue(values, "NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey =
  values.SUPABASE_SECRET_KEY?.trim() ??
  values.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!serviceRoleKey) {
  throw new Error(
    "Movie Buff Live runner requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const showKey = values.MOVIE_BUFF_LIVE_SHOW_KEY?.trim() || "main";
const pollMilliseconds = Math.max(
  250,
  Number.parseInt(values.MOVIE_BUFF_LIVE_RUNNER_POLL_MS ?? "1000", 10) ||
    1000,
);
const runOnce = values.MOVIE_BUFF_LIVE_RUNNER_ONCE === "true";
const workerId =
  values.MOVIE_BUFF_LIVE_WORKER_ID?.trim() ||
  `movie-buff-live-${os.hostname()}-${process.pid}`;

const egressSupervisorEnabled =
  values.MOVIE_BUFF_BROADCAST_EGRESS_SUPERVISOR_ENABLED === "true";
const egressSupervisorRequired =
  values.MOVIE_BUFF_BROADCAST_EGRESS_REQUIRED === "true";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const providerBridge = createMovieBuffLiveProviderBridge({
  values,
  supabase,
  showKey,
});

let stopping = false;
let egressSupervisor = null;

function redact(value) {
  return String(value)
    .replace(/(?:https?|wss?|rtmps?):\/\/[^\s"']+/gi, "<redacted-url>")
    .replace(/(bearer\s+)[^\s]+/gi, "$1<redacted>")
    .replace(
      /(apikey|api[_-]?key|token|secret|password|stream[_-]?key)[=:]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    );
}

function startEgressSupervisor() {
  if (!egressSupervisorEnabled) {
    return null;
  }

  const supervisorPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "movie-buff-live-broadcast-egress-supervisor.mjs",
  );
  const child = spawn(process.execPath, [supervisorPath], {
    env: values,
    stdio: ["ignore", "pipe", "pipe"],
  });

  function forward(stream, chunk) {
    const text = chunk.toString().trim();

    if (!text) {
      return;
    }

    for (const line of text.split(/\r?\n/)) {
      console.log(
        JSON.stringify({
          event: "broadcast_egress_supervisor_output",
          stream,
          line: redact(line),
          workerId,
          showKey,
          at: new Date().toISOString(),
        }),
      );
    }
  }

  child.stdout.on("data", (chunk) => forward("stdout", chunk));
  child.stderr.on("data", (chunk) => forward("stderr", chunk));
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "broadcast_egress_supervisor_failed",
        workerId,
        showKey,
        required: egressSupervisorRequired,
        error: redact(error),
        at: new Date().toISOString(),
      }),
    );

    if (egressSupervisorRequired) {
      stopping = true;
    }
  });
  child.once("close", (code, signal) => {
    egressSupervisor = null;

    if (!stopping) {
      console.error(
        JSON.stringify({
          event: "broadcast_egress_supervisor_stopped",
          workerId,
          showKey,
          required: egressSupervisorRequired,
          code,
          signal,
          at: new Date().toISOString(),
        }),
      );

      if (egressSupervisorRequired) {
        stopping = true;
      }
    }
  });

  return child;
}

function requestStop(signal) {
  stopping = true;

  if (egressSupervisor && !egressSupervisor.killed) {
    egressSupervisor.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  }

  console.log(
    JSON.stringify({
      event: "runner_stop_requested",
      signal,
      workerId,
      showKey,
      at: new Date().toISOString(),
    }),
  );
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

async function tick() {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("tick_movie_buff_live_show", {
    p_show_key: showKey,
    p_worker_id: workerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  let providerSync = null;

  if (providerBridge) {
    try {
      providerSync = await providerBridge.sync();
    } catch (providerError) {
      console.error(
        JSON.stringify({
          event: "provider_bridge_failed",
          workerId,
          showKey,
          roomName: providerBridge.roomName,
          agentName: providerBridge.agentName,
          error:
            providerError instanceof Error
              ? providerError.message
              : String(providerError),
          at: new Date().toISOString(),
        }),
      );

      if (providerBridge.required) {
        throw providerError;
      }
    }
  }

  console.log(
    JSON.stringify({
      event: "show_tick",
      workerId,
      showKey,
      durationMs: Date.now() - startedAt,
      result: data,
      providerSync,
      at: new Date().toISOString(),
    }),
  );
}

async function run() {
  console.log(
    JSON.stringify({
      event: "runner_started",
      workerId,
      showKey,
      pollMilliseconds,
      runOnce,
      providerBridge: providerBridge
        ? {
            enabled: true,
            required: providerBridge.required,
            roomName: providerBridge.roomName,
            agentName: providerBridge.agentName,
          }
        : { enabled: false },
      broadcastEgressSupervisor: egressSupervisorEnabled
        ? { enabled: true, required: egressSupervisorRequired }
        : { enabled: false },
      at: new Date().toISOString(),
    }),
  );

  egressSupervisor = startEgressSupervisor();

  while (!stopping) {
    const startedAt = Date.now();

    try {
      await tick();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "show_tick_failed",
          workerId,
          showKey,
          error: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        }),
      );
    }

    if (runOnce) {
      break;
    }

    const remainingDelay = Math.max(0, pollMilliseconds - (Date.now() - startedAt));
    await sleep(remainingDelay);
  }

  console.log(
    JSON.stringify({
      event: "runner_stopped",
      workerId,
      showKey,
      at: new Date().toISOString(),
    }),
  );
}

await run();
