import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  isLocalSmokeBaseUrl,
  resolveSmokeEnvironment,
} from "./movie-buff-smoke-env.mjs";

function parseArgs(argv) {
  const args = {
    envFile: null,
    baseUrl: null,
    expectedSupabaseRef: null,
    repoRoot: null,
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

    if (value === "--expected-supabase-ref") {
      args.expectedSupabaseRef = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--repo-root") {
      args.repoRoot = argv[index + 1] ?? null;
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
    cwd: repoRoot,
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

function buildSyntheticStep(
  step,
  ok,
  stdout,
  stderr = "",
) {
  return {
    step,
    command: "(synthetic)",
    ok,
    stdout,
    stderr,
    exitCode: ok ? 0 : 1,
  };
}

function canUseLocalDockerVerifier() {
  const result = spawnSync(
    "docker",
    ["ps", "--format", "{{.Names}}"],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    return false;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line.startsWith("supabase_db_"));
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(
  args.repoRoot ?? process.cwd(),
);
const resolvedEnvFile = args.envFile
  ? path.resolve(repoRoot, args.envFile)
  : null;
const resolvedBaseUrl =
  args.baseUrl ??
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";
let smokeEnvironment;

try {
  smokeEnvironment = resolveSmokeEnvironment({
    baseUrl: resolvedBaseUrl,
    envFile: resolvedEnvFile,
    expectedSupabaseRef: args.expectedSupabaseRef,
  });
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: resolvedBaseUrl,
        envFile: resolvedEnvFile,
        error: error instanceof Error
          ? error.message
          : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const env = {
  MOVIE_BUFF_BASE_URL: resolvedBaseUrl,
};

if (smokeEnvironment.expectedSupabaseRef) {
  env.MOVIE_BUFF_EXPECTED_SUPABASE_REF =
    smokeEnvironment.expectedSupabaseRef;
}
const forwardedEnvNames = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MOVIE_BUFF_SMOKE_EMAIL_DOMAIN",
];

for (const name of forwardedEnvNames) {
  if (smokeEnvironment.values[name] != null) {
    env[name] = smokeEnvironment.values[name];
  }
}

if (smokeEnvironment.envFilePath) {
  env.MOVIE_BUFF_SMOKE_ENV_FILE =
    smokeEnvironment.envFilePath;
}

const dockerVerifierAvailable =
  canUseLocalDockerVerifier();

const steps = [
  buildSyntheticStep(
    "target_env",
    true,
    JSON.stringify({
      baseUrl: resolvedBaseUrl,
      envFile: smokeEnvironment.envFilePath,
      supabaseProjectRef:
        smokeEnvironment.supabaseProjectRef,
      expectedSupabaseRef:
        smokeEnvironment.expectedSupabaseRef,
    }),
  ),
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
        ...(resolvedEnvFile
        ? ["--env-file", resolvedEnvFile]
        : []),
      ...(smokeEnvironment.expectedSupabaseRef
        ? [
            "--expected-supabase-ref",
            smokeEnvironment.expectedSupabaseRef,
          ]
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
      "pool_health",
      "node",
      [
        path.join(
          repoRoot,
          "scripts",
          "movie-buff-pool-health.mjs"
        ),
      ],
      env
    ),
    isLocalSmokeBaseUrl(resolvedBaseUrl) ||
    dockerVerifierAvailable
      ? runStep(
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
      : buildSyntheticStep(
          "analytics_verifier",
          true,
          "Skipped: verify-movie-buff-analytics.mjs requires a local Docker-backed Supabase runtime. Hosted verification is covered here by route health, auth, public/private/leave/admin/timer smokes, and pool health."
        )
  );
}

const result = {
  ok: steps.every((step) => step.ok),
  baseUrl: resolvedBaseUrl,
  envFile: resolvedEnvFile,
  repoRoot,
  steps,
};

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
