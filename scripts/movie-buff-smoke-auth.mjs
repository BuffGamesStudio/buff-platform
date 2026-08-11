import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const parsed = {};

  if (!fs.existsSync(envPath)) {
    return parsed;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
}

const localEnv = loadLocalEnv();
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  localEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Movie Buff smoke auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SECRET_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY;
const smokeEmailDomain =
  process.env.MOVIE_BUFF_SMOKE_EMAIL_DOMAIN ??
  localEnv.MOVIE_BUFF_SMOKE_EMAIL_DOMAIN ??
  "example.com";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function isHostedSupabaseUrl(url) {
  return /^https:\/\/.+\.supabase\.co$/i.test(url);
}

function resolveUsableServiceRoleKey() {
  if (!serviceRoleKey) {
    return null;
  }

  if (isHostedSupabaseUrl(supabaseUrl)) {
    return serviceRoleKey.startsWith("sb_secret_")
      ? serviceRoleKey
      : null;
  }

  return serviceRoleKey;
}

const usableServiceRoleKey =
  resolveUsableServiceRoleKey();

const adminSupabase = usableServiceRoleKey
  ? createClient(supabaseUrl, usableServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function provisionLocalSmokeAccount(label) {
  const uniqueId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const email = `moviebuff-${label}-${uniqueId}@${smokeEmailDomain}`;
  const password = "MovieBuffLocal123!";

  const createViaSignup = async () =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: `Movie Buff ${label}`,
        },
      },
    });

  const createViaAdmin = async () => {
    if (!adminSupabase) {
      return {
        error: new Error(
          "No usable Supabase admin key available for admin smoke-account provisioning.",
        ),
      };
    }

    return adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: `Movie Buff ${label}`,
      },
    });
  };

  const shouldPreferAdminProvisioning =
    Boolean(adminSupabase) &&
    isHostedSupabaseUrl(supabaseUrl);

  let error = null;

  if (shouldPreferAdminProvisioning) {
    ({ error } = await createViaAdmin());
  } else {
    ({ error } = await createViaSignup());
  }

  if (error && adminSupabase) {
    const normalizedMessage = error.message.toLowerCase();
    const shouldFallbackToAdmin =
      normalizedMessage.includes("rate limit") ||
      normalizedMessage.includes("invalid") ||
      normalizedMessage.includes("email not confirmed");

    if (shouldFallbackToAdmin) {
      const adminResult = await createViaAdmin();
      error = adminResult.error ?? null;
    }
  }

  if (error) {
    throw new Error(
      `Failed to provision local smoke account: ${error.message}`,
    );
  }

  return {
    email,
    password,
  };
}

export async function provisionLocalSmokeSession(label) {
  const credentials =
    await provisionLocalSmokeAccount(label);
  const { data, error } =
    await supabase.auth.signInWithPassword(
      credentials,
    );

  if (error || !data.session) {
    throw new Error(
      `Failed to provision local smoke session: ${error?.message ?? "No session returned."}`,
    );
  }

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

  return {
    email: credentials.email,
    password: credentials.password,
    storageKey,
    session: data.session,
    sessionString: JSON.stringify(data.session),
  };
}
