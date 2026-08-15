import { createClient } from "@supabase/supabase-js";
import { resolveSmokeEnvironment } from "./movie-buff-smoke-env.mjs";

const smokeEnvironment = resolveSmokeEnvironment();
const supabaseUrl = smokeEnvironment.supabaseUrl;
const supabaseKey = smokeEnvironment.publishableKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Movie Buff smoke auth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const serviceRoleKey =
  smokeEnvironment.serviceRoleKey;
const smokeEmailDomain = smokeEnvironment.smokeEmailDomain;

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
  // Supabase Auth enforces the RFC local-part length limit. Keep the label
  // recognizable for diagnostics while bounding the generated address so
  // hosted smoke provisioning does not fail before the browser starts.
  const normalizedLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "smoke";
  const uniqueId = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const email = `mb-${normalizedLabel}-${uniqueId}@${smokeEmailDomain}`;
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
    (isHostedSupabaseUrl(supabaseUrl) ||
      process.env.MOVIE_BUFF_PREFER_ADMIN_SMOKE === "1");

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
