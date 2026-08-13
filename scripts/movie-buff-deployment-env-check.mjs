import fs from "node:fs";
import path from "node:path";
import { supabaseProjectRef } from "./movie-buff-smoke-env.mjs";

const requiredEnv = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const adminKeyEnv = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const localMarkers = [
  "127.0.0.1",
  "localhost",
];

const placeholderMarkers = [
  "example.com",
  "your-production-",
  "your_",
  "changeme",
  "replace-me",
  "replace_with",
];

function parseArgs(argv) {
  const args = {
    envFile: null,
    expectedSupabaseRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--env-file") {
      args.envFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--expected-supabase-ref") {
      args.expectedSupabaseRef = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return args;
}

function readEnvFile(envPath) {
  const values = {};
  const content = fs.readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed
      .slice(separatorIndex + 1)
      .trim();

    values[key] = rawValue.replace(
      /^['"]|['"]$/g,
      ""
    );
  }

  return values;
}

function isMissing(value) {
  return !value || !value.trim();
}

function hasLocalMarker(name, value) {
  if (!value) {
    return false;
  }

  const loweredValue = value.toLowerCase();

  if (
    name === "NEXT_PUBLIC_SUPABASE_URL" &&
    loweredValue.includes(".supabase.co")
  ) {
    return false;
  }

  return localMarkers.some((marker) =>
    loweredValue.includes(marker)
  );
}

function hasPlaceholderMarker(value) {
  if (!value) {
    return false;
  }

  const loweredValue = value.toLowerCase();

  return placeholderMarkers.some((marker) =>
    loweredValue.includes(marker)
  );
}

const args = parseArgs(process.argv.slice(2));
const envSource = args.envFile
  ? path.resolve(process.cwd(), args.envFile)
  : null;

const sourcedEnv = envSource
  ? readEnvFile(envSource)
  : {};

const result = {
  ok: true,
  source: envSource ?? "process.env",
  checked: [],
  missing: [],
  localOnlyValues: [],
  placeholderValues: [],
};

for (const name of requiredEnv) {
  const value =
    sourcedEnv[name] ?? process.env[name] ?? "";

  result.checked.push(name);

  if (isMissing(value)) {
    result.ok = false;
    result.missing.push(name);
    continue;
  }

  if (hasLocalMarker(name, value)) {
    result.ok = false;
    result.localOnlyValues.push(name);
  }

  if (hasPlaceholderMarker(value)) {
    result.ok = false;
    result.placeholderValues.push(name);
  }
}

result.checked.push(...adminKeyEnv);

const resolvedAdminKeyName = adminKeyEnv.find(
  (name) =>
    !isMissing(
      sourcedEnv[name] ?? process.env[name] ?? "",
    ),
);

if (!resolvedAdminKeyName) {
  result.ok = false;
  result.missing.push(
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  );
} else {
  const resolvedAdminKeyValue =
    sourcedEnv[resolvedAdminKeyName] ??
    process.env[resolvedAdminKeyName] ??
    "";

  if (hasLocalMarker(resolvedAdminKeyName, resolvedAdminKeyValue)) {
    result.ok = false;
    result.localOnlyValues.push(
      resolvedAdminKeyName,
    );
  }

  if (hasPlaceholderMarker(resolvedAdminKeyValue)) {
    result.ok = false;
    result.placeholderValues.push(
      resolvedAdminKeyName,
    );
  }
}

const appUrl =
  sourcedEnv.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "";

const supabaseUrl =
  sourcedEnv.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "";
const expectedSupabaseRef =
  args.expectedSupabaseRef ??
  sourcedEnv.MOVIE_BUFF_EXPECTED_SUPABASE_REF ??
  process.env.MOVIE_BUFF_EXPECTED_SUPABASE_REF ??
  null;
const resolvedSupabaseRef = supabaseProjectRef(
  supabaseUrl,
);

if (expectedSupabaseRef) {
  result.expectedSupabaseRef = expectedSupabaseRef;
  result.supabaseProjectRef = resolvedSupabaseRef;

  if (resolvedSupabaseRef !== expectedSupabaseRef) {
    result.ok = false;
    result.supabaseTargetMismatch = true;
  }
}

if (appUrl && !appUrl.match(/^https?:\/\//i)) {
  result.ok = false;
  result.invalidAppUrl =
    "NEXT_PUBLIC_APP_URL must include http:// or https://";
}

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
