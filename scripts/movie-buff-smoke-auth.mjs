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

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function provisionLocalSmokeAccount(label) {
  const uniqueId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const email = `moviebuff-${label}-${uniqueId}@example.com`;
  const password = "MovieBuffLocal123!";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: `Movie Buff ${label}`,
      },
    },
  });

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
