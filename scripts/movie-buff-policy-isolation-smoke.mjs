import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");

        if (separatorIndex === -1) {
          return [line.trim(), ""];
        }

        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim(),
        ];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const envFile =
  process.env.MOVIE_BUFF_POLICY_ISOLATION_ENV_FILE ??
  ".env.local";
const fileEnv = loadEnvFile(envFile);
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  fileEnv.SUPABASE_SECRET_KEY ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY;

assert(
  supabaseUrl && publishableKey && secretKey,
  `Policy isolation smoke requires Supabase URL, publishable key, and secret key from ${envFile}.`,
);

const isHosted = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl);
const isKnownProduction = supabaseUrl.includes("yfatwreicmiocdxzyznd");
const allowProduction =
  process.env.MOVIE_BUFF_POLICY_ISOLATION_ALLOW_PRODUCTION === "1";

assert(
  !isKnownProduction || allowProduction,
  "Policy isolation smoke refuses production unless MOVIE_BUFF_POLICY_ISOLATION_ALLOW_PRODUCTION=1 is explicitly set after ARM authorization.",
);
assert(
!isHosted || process.env.MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION === "1",
  "Set MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION=1 to run this mutating rehearsal check.",
);

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const password = `MovieBuffPolicy${Date.now()}!x`;
const users = [];
const matches = [];
const result = {
  ok: false,
  target: supabaseUrl,
  envFile,
  productionOptIn: allowProduction,
  checks: {},
};

async function requireData(label, operation) {
  const { data, error } = await operation;

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  return data;
}

async function cleanup() {
  for (const matchId of matches) {
    await admin.from("matches").delete().eq("id", matchId);
  }

  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

try {
  for (const label of ["policy-a", "policy-b"]) {
    const data = await requireData(
      `create ${label}`,
      admin.auth.admin.createUser({
        email: `${label}-${Date.now()}@example.com`,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: `Movie Buff ${label}`,
        },
      }),
    );

    users.push({ id: data.user.id, email: data.user.email });
  }

  for (const label of ["match-a", "match-b"]) {
    const data = await requireData(
      `create ${label}`,
      admin
        .from("matches")
        .insert({
          category_id: null,
          difficulty: "medium",
          total_rounds: 1,
          status: "active",
        })
        .select("id")
        .single(),
    );

    matches.push(data.id);
  }

  for (let index = 0; index < users.length; index += 1) {
    await requireData(
      `attach player ${index + 1}`,
      admin.from("match_players").insert({
        match_id: matches[index],
        player_id: users[index].id,
      }),
    );
    await requireData(
      `create round ${index + 1}`,
      admin.from("match_rounds").insert({
        match_id: matches[index],
        round_number: 1,
        time_limit_seconds: 30,
      }),
    );
  }

  for (let index = 0; index < users.length; index += 1) {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    await requireData(
      `sign in persona ${index + 1}`,
      client.auth.signInWithPassword({
        email: users[index].email,
        password,
      }),
    );

    const playerRows = await requireData(
      `read player rows persona ${index + 1}`,
      client
        .from("match_players")
        .select("match_id,player_id")
        .order("match_id"),
    );
    const roundRows = await requireData(
      `read round rows persona ${index + 1}`,
      client
        .from("match_rounds")
        .select("match_id")
        .order("match_id"),
    );
    const expectedMatch = matches[index];
    const otherMatch = matches[1 - index];
    const playerMatchIds = playerRows.map((row) => row.match_id);
    const roundMatchIds = roundRows.map((row) => row.match_id);
    const check = {
      playerRows: playerRows.length,
      roundRows: roundRows.length,
      noCrossMatchPlayers: !playerMatchIds.includes(otherMatch),
      noCrossMatchRounds: !roundMatchIds.includes(otherMatch),
      exactMembership:
        playerRows.length === 1 &&
        playerRows[0].player_id === users[index].id &&
        playerRows[0].match_id === expectedMatch,
      exactRounds:
        roundRows.length === 1 &&
        roundRows[0].match_id === expectedMatch,
    };

    result.checks[`persona${index + 1}`] = check;
    assert(
      check.noCrossMatchPlayers &&
        check.noCrossMatchRounds &&
        check.exactMembership &&
        check.exactRounds,
      `RLS isolation failed for persona ${index + 1}.`,
    );
  }

  result.ok = true;
  console.log(JSON.stringify(result, null, 2));
} finally {
  await cleanup();
}
