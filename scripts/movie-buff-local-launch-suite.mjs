import { spawnSync } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    baseUrl: null,
    includeBuild: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--base-url") {
      args.baseUrl = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--skip-build") {
      args.includeBuild = false;
    }
  }

  return args;
}

function runStep(step, command, commandArgs, extraEnv = {}) {
  const resolvedCommand =
    process.platform === "win32" &&
    command === "npm"
      ? "npm.cmd"
      : command;

  const result = spawnSync(
    resolvedCommand,
    commandArgs,
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...extraEnv,
      },
    },
  );

  return {
    step,
    command: [
      resolvedCommand,
      ...commandArgs,
    ].join(" "),
    ok: result.status === 0,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    exitCode: result.status ?? null,
  };
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = process.cwd();
const env = {};

if (args.baseUrl) {
  env.MOVIE_BUFF_BASE_URL = args.baseUrl;
}

const steps = [
  runStep(
    "launch_migrations",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-launch-migration-check.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "route_health",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-route-health.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "public_smoke",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-public-flow-smoke.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "private_smoke",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-private-flow-smoke.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "leave_smoke",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-leave-smoke.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "public_leave_smoke",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-public-leave-smoke.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "timer_smoke",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-timer-smoke.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "analytics_verifier",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "verify-movie-buff-analytics.mjs",
      ),
    ],
    env,
  ),
  runStep(
    "pool_health",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-pool-health.mjs",
      ),
    ],
    env,
  ),
];

if (args.includeBuild) {
  steps.push(
    runStep(
      "production_build",
      process.execPath,
      [
        path.join(
          repoRoot,
          "node_modules",
          "next",
          "dist",
          "bin",
          "next",
        ),
        "build",
      ],
      env,
    ),
  );
}

const result = {
  ok: steps.every((step) => step.ok),
  baseUrl:
    args.baseUrl ??
    process.env.MOVIE_BUFF_BASE_URL ??
    "http://127.0.0.1:3001",
  includeBuild: args.includeBuild,
  steps,
};

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
