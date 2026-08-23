import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_NAME = "movie-buff-live-broadcast-egress-supervisor";
const DEFAULT_POLL_MS = 30_000;
const MIN_POLL_MS = 5_000;
const MAX_POLL_MS = 300_000;

function redact(value) {
  return String(value)
    .replace(/(?:https?|wss?|rtmps?):\/\/[^\s"']+/gi, "<redacted-url>")
    .replace(/(bearer\s+)[^\s]+/gi, "$1<redacted>")
    .replace(
      /(apikey|api[_-]?key|token|secret|password|stream[_-]?key)[=:]\s*[^\s,;]+/gi,
      "$1=<redacted>",
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

function parsePollMs(value) {
  const parsed = Number.parseInt(value ?? String(DEFAULT_POLL_MS), 10);

  if (!Number.isFinite(parsed)) {
    throw new Error("MOVIE_BUFF_BROADCAST_EGRESS_POLL_MS must be an integer.");
  }

  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, parsed));
}

const values = process.env;

if (values.MOVIE_BUFF_BROADCAST_EGRESS_SUPERVISOR_ENABLED !== "true") {
  output({
    status: "blocked",
    reason: "supervisor_opt_in_required",
    message:
      "Broadcast egress supervision is fail-closed. Set MOVIE_BUFF_BROADCAST_EGRESS_SUPERVISOR_ENABLED=true to start the supervisor.",
  });
  process.exitCode = 2;
} else if (values.MOVIE_BUFF_BROADCAST_EGRESS_ENABLED !== "true") {
  output({
    status: "blocked",
    reason: "egress_opt_in_required",
    message:
      "The egress supervisor will not start until MOVIE_BUFF_BROADCAST_EGRESS_ENABLED=true.",
  });
  process.exitCode = 2;
} else if (values.MOVIE_BUFF_BROADCAST_EGRESS_APPLY !== "true") {
  output({
    status: "blocked",
    reason: "egress_apply_opt_in_required",
    message:
      "The egress supervisor will not start until MOVIE_BUFF_BROADCAST_EGRESS_APPLY=true is explicitly authorized.",
  });
  process.exitCode = 2;
} else {
  const pollMs = parsePollMs(values.MOVIE_BUFF_BROADCAST_EGRESS_POLL_MS);
  const controllerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "movie-buff-live-broadcast-egress.mjs",
  );
  let stopping = false;
  let child = null;
  let wake = null;

  function requestStop(signal) {
    if (stopping) {
      return;
    }

    stopping = true;

    if (wake) {
      wake();
      wake = null;
    }

    if (child && !child.killed) {
      child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    }

    output({
      status: "stopping",
      signal,
      at: new Date().toISOString(),
    });
  }

  process.on("SIGINT", () => requestStop("SIGINT"));
  process.on("SIGTERM", () => requestStop("SIGTERM"));

  function waitForNextPoll() {
    if (stopping) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, pollMs);

      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  function runController() {
    return new Promise((resolve) => {
      child = spawn(process.execPath, [controllerPath], {
        env: values,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const buffers = new Map([
        ["stdout", ""],
        ["stderr", ""],
      ]);

      function forward(stream, chunk) {
        const key = stream === child.stderr ? "stderr" : "stdout";
        const previous = buffers.get(key) ?? "";
        const lines = `${previous}${chunk.toString()}`.split(/\r?\n/);
        buffers.set(key, lines.pop() ?? "");

        for (const line of lines) {
          if (!line) {
            continue;
          }

          output({
            event: "egress_controller_output",
            stream: key,
            line: redact(line),
            at: new Date().toISOString(),
          });
        }
      }

      child.stdout.on("data", (chunk) => forward(child.stdout, chunk));
      child.stderr.on("data", (chunk) => forward(child.stderr, chunk));
      child.once("error", (error) => {
        output({
          event: "egress_controller_spawn_failed",
          error: redact(error),
          at: new Date().toISOString(),
        });
      });
      child.once("close", (code, signal) => {
        for (const [stream, remainder] of buffers) {
          if (remainder) {
            output({
              event: "egress_controller_output",
              stream,
              line: redact(remainder),
              at: new Date().toISOString(),
            });
          }
        }

        child = null;
        resolve({ code, signal });
      });
    });
  }

  async function run() {
    output({
      status: "running",
      pollMs,
      at: new Date().toISOString(),
    });

    while (!stopping) {
      const result = await runController();

      if (stopping) {
        break;
      }

      output({
        event: "egress_controller_exit",
        code: result.code,
        signal: result.signal,
        retryInMs: pollMs,
        at: new Date().toISOString(),
      });

      await waitForNextPoll();
    }

    output({
      status: "stopped",
      at: new Date().toISOString(),
    });
  }

  await run();
}
