import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputPath = process.env.MOVIE_BUFF_LOCAL_USERS_OUTPUT;
const runId = (process.env.MOVIE_BUFF_LOCAL_RUN_ID || "exact-lab")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .slice(0, 40);

if (!supabaseUrl || !serviceRoleKey || !outputPath) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MOVIE_BUFF_LOCAL_USERS_OUTPUT are required.",
  );
}

const parsed = new URL(supabaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  throw new Error(`Refusing non-local Supabase target ${parsed.origin}.`);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = `Local-${runId}-A9!`;
const users = [];

for (let index = 1; index <= 4; index += 1) {
  const email = `movie-buff-${runId}-p${index}@example.test`;
  const displayName = `Exact Lab Player ${index}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) {
    throw new Error(`Unable to create local user ${index}: ${error?.message ?? "unknown"}`);
  }

  const { data: profile, error: profileReadError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileReadError) throw profileReadError;
  if (!profile) {
    const { error: profileInsertError } = await admin.from("profiles").insert({
      id: data.user.id,
      display_name: displayName,
    });
    if (profileInsertError) throw profileInsertError;
  }

  users.push({ email, password, id: data.user.id });
}

fs.writeFileSync(outputPath, `${JSON.stringify(users)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ created: users.length, target: parsed.origin }));
