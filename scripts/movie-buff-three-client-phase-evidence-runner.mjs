import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const exactSha = process.env.MOVIE_BUFF_EXPECTED_GIT_SHA?.trim();
const commandLabel = process.env.MOVIE_BUFF_EVIDENCE_COMMAND?.trim();
const mutationConsent = process.env.MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.MOVIE_BUFF_APP_URL;
const usersJson = process.env.MOVIE_BUFF_PHASE_TEST_USERS;
const evidencePath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_OUTPUT ??
    "movie-buff-three-client-phase-evidence.json",
);
const reconnectEvidencePath = path.resolve(
  process.env.MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT ??
    `${evidencePath}.reconnect-race.json`,
);
const manifestPath = path.resolve(
  process.env.MOVIE_BUFF_EVIDENCE_MANIFEST ?? `${evidencePath}.manifest.json`,
);

if (
  !exactSha ||
  !/^[0-9a-f]{40}$/i.test(exactSha) ||
  !commandLabel ||
  !supabaseUrl ||
  !publishableKey ||
  !serviceRoleKey ||
  !appUrl ||
  !usersJson
) {
  throw new Error(
    "MOVIE_BUFF_EXPECTED_GIT_SHA, MOVIE_BUFF_EVIDENCE_COMMAND, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, MOVIE_BUFF_APP_URL, and MOVIE_BUFF_PHASE_TEST_USERS are required.",
  );
}

if (mutationConsent !== "YES") {
  throw new Error(
    "Set MOVIE_BUFF_ALLOW_LOCAL_PHASE_MUTATION=YES to authorize only the disposable localhost proofs and reversible test-profile display-name changes.",
  );
}

function requireLocal(value, label) {
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local ${label} target ${parsed.origin}.`);
  }
  return parsed.origin;
}

const localSupabaseOrigin = requireLocal(supabaseUrl, "Supabase");
const localAppOrigin = requireLocal(appUrl, "application");
const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (checkoutSha !== exactSha) {
  throw new Error(
    `Checkout HEAD ${checkoutSha} does not match MOVIE_BUFF_EXPECTED_GIT_SHA ${exactSha}.`,
  );
}

const users = JSON.parse(usersJson);
if (!Array.isArray(users) || users.length !== 3) {
  throw new Error("Exactly three disposable local test credentials are required.");
}
if (new Set(users.map((user) => user.email)).size !== 3) {
  throw new Error("The three local test credentials must be distinct.");
}

const sourceFiles = [
  "supabase/migrations/20260804083000_movie_buff_server_phase_machine.sql",
  "supabase/migrations/20260804083100_movie_buff_server_phase_machine_hardening.sql",
  "supabase/migrations/20260804083200_movie_buff_buster_safe_boundary.sql",
  "supabase/migrations/20260804083300_movie_buff_phase_tile_mutation_guard.sql",
  "supabase/migrations/20260804083400_movie_buff_phase_contract_alignment.sql",
  "supabase/migrations/20260804083500_movie_buff_reconnect_buster_boundary_repair.sql",
  "supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql",
  "scripts/movie-buff-three-client-phase-proof.mjs",
  "scripts/movie-buff-reconnect-race-proof.mjs",
  "scripts/movie-buff-three-client-phase-evidence-runner.mjs",
  "tests/movie-buff-server-phase-machine.test.mjs",
  "tests/movie-buff-authoritative-phase-runtime.test.mjs",
  "tests/movie-buff-buster-safe-boundary.test.mjs",
  "tests/movie-buff-phase-tile-mutation-guard.test.mjs",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(file) {
  return sha256(fs.readFileSync(file));
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browserClients = users.map(() =>
  createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
);
const profileSnapshot = [];
let profilesRestored = false;
let stdout = "";
let stderr = "";
const startedAt = new Date().toISOString();
const childResults = [];

async function snapshotProfiles() {
  const userIds = [];
  for (let index = 0; index < browserClients.length; index += 1) {
    const { data, error } = await browserClients[index].auth.signInWithPassword(
      users[index],
    );
    if (error || !data.user || data.user.is_anonymous) {
      throw new Error(
        `Unable to authenticate disposable player ${index + 1}: ${error?.message ?? "unknown"}`,
      );
    }
    userIds.push(data.user.id);
  }

  if (new Set(userIds).size !== 3) {
    throw new Error("Disposable credentials do not resolve to three distinct users.");
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id,display_name")
    .in("id", userIds);
  if (error) throw error;
  if (!profiles || profiles.length !== 3) {
    throw new Error(
      "All disposable test users must already have profiles; refusing to create or delete identity records.",
    );
  }

  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const id of userIds) {
    const profile = byId.get(id);
    if (!profile) throw new Error(`Profile ${id} is missing.`);
    profileSnapshot.push({ id, display_name: profile.display_name ?? null });
  }
}

async function restoreProfiles() {
  const failures = [];
  for (const profile of profileSnapshot) {
    const { error } = await admin
      .from("profiles")
      .update({ display_name: profile.display_name })
      .eq("id", profile.id);
    if (error) failures.push({ id: profile.id, error: error.message });
  }
  profilesRestored = failures.length === 0;
  return failures;
}

async function runChild(name, script, outputEnvironment) {
  const command = [process.execPath, path.resolve(script)];
  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...outputEnvironment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let childStdout = "";
  let childStderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    childStdout += chunk;
    stdout += `[${name}] ${chunk}`;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    childStderr += chunk;
    stderr += `[${name}] ${chunk}`;
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const result = {
    name,
    command,
    exitCode,
    stdoutSha256: sha256(childStdout),
    stderrSha256: sha256(childStderr),
  };
  childResults.push(result);
  return result;
}

try {
  await snapshotProfiles();
  await runChild(
    "three-client-phase",
    "scripts/movie-buff-three-client-phase-proof.mjs",
    { MOVIE_BUFF_EVIDENCE_OUTPUT: evidencePath },
  );
  await runChild(
    "reconnect-race",
    "scripts/movie-buff-reconnect-race-proof.mjs",
    { MOVIE_BUFF_RECONNECT_EVIDENCE_OUTPUT: reconnectEvidencePath },
  );
} finally {
  const restoreFailures = await restoreProfiles();
  await Promise.allSettled(browserClients.map((client) => client.auth.signOut()));

  const evidencePresent = fs.existsSync(evidencePath);
  const reconnectEvidencePresent = fs.existsSync(reconnectEvidencePath);
  const evidenceBytes = evidencePresent
    ? fs.readFileSync(evidencePath)
    : Buffer.alloc(0);
  const reconnectEvidenceBytes = reconnectEvidencePresent
    ? fs.readFileSync(reconnectEvidencePath)
    : Buffer.alloc(0);
  const exitCode = childResults.some((result) => result.exitCode !== 0) ? 1 : 0;
  const manifest = {
    schemaVersion: 2,
    lane: "MOV-17",
    exactSha,
    checkoutSha,
    command: commandLabel,
    childCommand: childResults[0]?.command ?? null,
    childCommands: childResults,
    nodeVersion: process.version,
    target: {
      kind: "local",
      supabase: localSupabaseOrigin,
      application: localAppOrigin,
    },
    mutationConsent,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    evidencePresent,
    evidencePath,
    evidenceSha256: evidencePresent ? sha256(evidenceBytes) : null,
    reconnectEvidencePresent,
    reconnectEvidencePath,
    reconnectEvidenceSha256: reconnectEvidencePresent
      ? sha256(reconnectEvidenceBytes)
      : null,
    sourceHashes: Object.fromEntries(
      sourceFiles.map((file) => [file, fileSha256(file)]),
    ),
    profileSnapshotCount: profileSnapshot.length,
    profilesRestored,
    profileRestoreFailures: restoreFailures,
    classification:
      exitCode === 0 &&
      evidencePresent &&
      reconnectEvidencePresent &&
      profileSnapshot.length === 3 &&
      profilesRestored
        ? "PASS"
        : "FAIL",
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        manifestPath,
        exactSha,
        checkoutSha,
        exitCode,
        childExitCodes: Object.fromEntries(
          childResults.map((result) => [result.name, result.exitCode]),
        ),
        classification: manifest.classification,
        profilesRestored,
        evidenceSha256: manifest.evidenceSha256,
        reconnectEvidenceSha256: manifest.reconnectEvidenceSha256,
      },
      null,
      2,
    ),
  );

  if (manifest.classification !== "PASS") process.exitCode = 1;
}
