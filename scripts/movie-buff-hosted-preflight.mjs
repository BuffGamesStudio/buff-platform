import { spawnSync } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    envFile: null,
    baseUrl: null,
    fullSmoke: false,
    fullSuite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--env-file") {
      args.envFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--base-url") {
      args.baseUrl = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--full-smoke") {
      args.fullSmoke = true;
      continue;
    }

    if (value === "--full-suite") {
      args.fullSuite = true;
    }
  }

  return args;
}

function runStep(step, command, commandArgs, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  return {
    step,
    command: [command, ...commandArgs].join(" "),
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
        "movie-buff-launch-migration-check.mjs"
      ),
    ],
    env
  ),
  runStep(
    "bootstrap_artifacts",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-bootstrap-artifact-check.mjs"
      ),
    ],
    env
  ),
  runStep(
    "deploy_env",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-deployment-env-check.mjs"
      ),
      ...(args.envFile
        ? ["--env-file", args.envFile]
        : []),
    ],
    env
  ),
  runStep(
    "route_health",
    "node",
    [
      path.join(
        repoRoot,
        "scripts",
        "movie-buff-route-health.mjs"
      ),
    ],
    env
  ),
];

if (args.fullSmoke) {
  steps.push(
    runStep(
      "public_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-public-flow-smoke.mjs"
        ),
      ],
      env
    )
  );
}

if (args.fullSuite) {
  steps.push(
    runStep(
      "public_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-public-flow-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "auth_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-auth-flow-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "private_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-private-flow-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "leave_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-leave-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "public_leave_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-public-leave-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "admin_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-admin-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "timer_smoke",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-timer-smoke.mjs"
        ),
      ],
      env
    ),
    runStep(
      "analytics_verifier",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "verify-movie-buff-analytics.mjs"
        ),
      ],
      env
    )
  );
}

const result = {
  ok: steps.every((step) => step.ok),
  baseUrl:
    args.baseUrl ??
    process.env.MOVIE_BUFF_BASE_URL ??
    "http://127.0.0.1:3001",
  envFile: args.envFile ?? null,
  steps,
};

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
