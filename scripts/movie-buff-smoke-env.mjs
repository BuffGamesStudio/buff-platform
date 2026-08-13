import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3001";

function stripOptionalQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

export function readSmokeEnvFile(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

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

    if (!key) {
      continue;
    }

    values[key] = stripOptionalQuotes(
      trimmed.slice(separatorIndex + 1).trim(),
    );
  }

  return values;
}

export function isLocalSmokeBaseUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(
    url ?? "",
  );
}

export function supabaseProjectRef(url) {
  if (!url) {
    return null;
  }

  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);

    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function resolveSmokeEnvironment({
  baseUrl = process.env.MOVIE_BUFF_BASE_URL ??
    DEFAULT_LOCAL_BASE_URL,
  envFile = null,
  expectedSupabaseRef = null,
} = {}) {
  const explicitEnvFile =
    envFile ??
    process.env.MOVIE_BUFF_SMOKE_ENV_FILE ??
    process.env.MOVIE_BUFF_ENV_FILE ??
    null;
  const envFilePath = explicitEnvFile
    ? path.resolve(process.cwd(), explicitEnvFile)
    : isLocalSmokeBaseUrl(baseUrl)
      ? path.join(process.cwd(), ".env.local")
      : null;

  if (explicitEnvFile && !fs.existsSync(envFilePath)) {
    throw new Error(
      `Movie Buff smoke environment file does not exist: ${envFilePath}`,
    );
  }

  const fileEnv = envFilePath && fs.existsSync(envFilePath)
    ? readSmokeEnvFile(envFilePath)
    : {};
  const values = {
    ...process.env,
    ...fileEnv,
  };
  const resolvedBaseUrl = baseUrl;
  const supabaseUrl =
    values.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const actualSupabaseRef = supabaseProjectRef(
    supabaseUrl,
  );
  const resolvedExpectedSupabaseRef =
    expectedSupabaseRef ??
    values.MOVIE_BUFF_EXPECTED_SUPABASE_REF ??
    null;

  if (!isLocalSmokeBaseUrl(resolvedBaseUrl)) {
    if (!resolvedExpectedSupabaseRef) {
      throw new Error(
        "Hosted Movie Buff smoke requires MOVIE_BUFF_EXPECTED_SUPABASE_REF so the Supabase target is explicit.",
      );
    }

    if (!actualSupabaseRef) {
      throw new Error(
        "Hosted Movie Buff smoke requires a hosted NEXT_PUBLIC_SUPABASE_URL with a recognizable Supabase project ref.",
      );
    }
  }

  if (
    resolvedExpectedSupabaseRef &&
    actualSupabaseRef !== resolvedExpectedSupabaseRef
  ) {
    throw new Error(
      `Movie Buff smoke Supabase target mismatch: expected ${resolvedExpectedSupabaseRef}, resolved ${actualSupabaseRef ?? "unknown"}.`,
    );
  }

  return {
    baseUrl: resolvedBaseUrl,
    envFilePath,
    values,
    supabaseUrl,
    supabaseProjectRef: actualSupabaseRef,
    expectedSupabaseRef: resolvedExpectedSupabaseRef,
    publishableKey:
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    serviceRoleKey:
      values.SUPABASE_SECRET_KEY ??
      values.SUPABASE_SERVICE_ROLE_KEY ??
      "",
    smokeEmailDomain:
      values.MOVIE_BUFF_SMOKE_EMAIL_DOMAIN ??
      "example.com",
  };
}
