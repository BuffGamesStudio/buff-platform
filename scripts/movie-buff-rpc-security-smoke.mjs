import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "yfatwreicmiocdxzyznd";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supabaseUrl = process.env.MOVIE_BUFF_RPC_SECURITY_SUPABASE_URL?.trim();
const publishableKey =
  process.env.MOVIE_BUFF_RPC_SECURITY_PUBLISHABLE_KEY?.trim();
const emailA = process.env.MOVIE_BUFF_RPC_SECURITY_EMAIL_A?.trim();
const emailB = process.env.MOVIE_BUFF_RPC_SECURITY_EMAIL_B?.trim();
const password = process.env.MOVIE_BUFF_RPC_SECURITY_PASSWORD;
const memberRoomId =
  process.env.MOVIE_BUFF_RPC_SECURITY_MEMBER_ROOM_ID?.trim();
const foreignRoomId =
  process.env.MOVIE_BUFF_RPC_SECURITY_FOREIGN_ROOM_ID?.trim();

if (process.env.MOVIE_BUFF_RPC_SECURITY_ALLOW_PRODUCTION !== "1") {
  throw new Error(
    "Refusing to run the production RPC security smoke without MOVIE_BUFF_RPC_SECURITY_ALLOW_PRODUCTION=1.",
  );
}

if (
  !supabaseUrl ||
  !publishableKey ||
  !emailA ||
  !emailB ||
  !password ||
  !memberRoomId ||
  !foreignRoomId
) {
  throw new Error(
    "RPC security smoke requires the production URL, publishable key, two account emails, password, member room, and foreign room.",
  );
}

if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) ||
  !supabaseUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF) ||
  !publishableKey.startsWith("sb_publishable_")
) {
  throw new Error(
    "RPC security smoke requires the production Supabase URL and a modern publishable key.",
  );
}

for (const [label, value] of [
  ["member room", memberRoomId],
  ["foreign room", foreignRoomId],
]) {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label} UUID.`);
  }
}

if (memberRoomId === foreignRoomId) {
  throw new Error("The member and foreign rooms must be different.");
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

const anonymousClient = createClient(
  supabaseUrl,
  publishableKey,
  clientOptions,
);

function createAuthenticatedClient() {
  return createClient(supabaseUrl, publishableKey, clientOptions);
}

function summarizeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code ?? null,
    status: error.status ?? null,
    message: String(error.message ?? "Unknown error").slice(0, 180),
  };
}

function isEmptyResult(data) {
  if (data == null) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === "object") {
    return Object.keys(data).length === 0;
  }

  return false;
}

async function signIn(label, email) {
  const client = createAuthenticatedClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to sign in ${label}: ${error?.message ?? "No session returned."}`,
    );
  }

  return client;
}

const allowlistedBrowserRpcs = [
  ["activate_movie_buff_round_vip", {
    p_room_id: foreignRoomId,
    p_round_id: "00000000-0000-0000-0000-000000000000",
    p_activation_key: "security-smoke",
  }],
  ["advance_movie_buff_match_phase", {
    p_room_id: foreignRoomId,
    p_expected_version: 0,
  }],
  ["advance_movie_buff_round", { p_room_id: foreignRoomId }],
  ["confirm_movie_buff_active_leave", {
    p_room_id: foreignRoomId,
    p_quote_token: "security-smoke",
    p_idempotency_key: "security-smoke",
  }],
  ["enter_movie_buff_round", { p_room_id: foreignRoomId }],
  ["find_or_create_movie_buff_public_room", {
    p_category_id: null,
    p_difficulty: "medium",
    p_total_rounds: 1,
    p_max_players: 2,
  }],
  ["get_movie_buff_active_leave_quote", { p_room_id: foreignRoomId }],
  ["get_movie_buff_final_results", { p_room_id: foreignRoomId }],
  ["get_movie_buff_match_phase_view", { p_room_id: foreignRoomId }],
  ["get_movie_buff_round", { p_room_id: foreignRoomId }],
  ["get_movie_buff_round_results", { p_room_id: foreignRoomId }],
  ["get_movie_buff_round_results", {
    p_room_id: foreignRoomId,
    p_round_id: "00000000-0000-0000-0000-000000000000",
  }],
  ["get_movie_buff_vip_round_view", {
    p_room_id: foreignRoomId,
    p_round_id: "00000000-0000-0000-0000-000000000000",
  }],
  ["join_movie_buff_room", { p_room_code: "ZZZZZZ" }],
  ["leave_movie_buff_room", { p_room_id: foreignRoomId }],
  ["lock_movie_buff_round_vip", {
    p_room_id: foreignRoomId,
    p_round_id: "00000000-0000-0000-0000-000000000000",
    p_vip_id: "00000000-0000-0000-0000-000000000000",
    p_idempotency_key: "security-smoke",
  }],
  ["mark_movie_buff_round_media_ready", { p_room_id: foreignRoomId }],
  ["prepare_movie_buff_round_playback", { p_room_id: foreignRoomId }],
  ["select_movie_buff_match_tile", {
    p_room_id: foreignRoomId,
    p_tile_id: "00000000-0000-0000-0000-000000000000",
    p_expected_version: 0,
    p_idempotency_key: "security-smoke",
  }],
  ["set_movie_buff_player_ready", {
    p_room_id: foreignRoomId,
    p_is_ready: false,
  }],
  ["start_movie_buff_match", { p_room_id: foreignRoomId }],
  ["start_movie_buff_round_playback", { p_room_id: foreignRoomId }],
  ["submit_movie_buff_answer", {
    p_room_id: foreignRoomId,
    p_submitted_answer: "security-smoke",
  }],
  ["touch_movie_buff_match_participant", { p_room_id: foreignRoomId }],
  ["touch_movie_buff_room_presence", { p_room_id: foreignRoomId }],
  ["use_movie_buff_round_hint", {
    p_room_id: foreignRoomId,
    p_penalty_seconds: 5,
  }],
];

const anonymousInternalRpcs = [
  ["begin_movie_buff_match_from_admission", { p_room_id: foreignRoomId }],
  ["get_movie_buff_round_player_time_left", {
    p_round_id: "00000000-0000-0000-0000-000000000000",
    p_player_id: "00000000-0000-0000-0000-000000000000",
    p_round_started_at: new Date().toISOString(),
    p_time_limit_seconds: 30,
  }],
  ["is_buff_content_manager", {}],
  ["is_movie_buff_match_member", {
    p_match_id: "00000000-0000-0000-0000-000000000000",
  }],
  ["is_movie_buff_room_member", { p_room_id: foreignRoomId }],
  ["is_movie_buff_round_member", {
    p_round_id: "00000000-0000-0000-0000-000000000000",
  }],
  ["movie_buff_phase_require_access", { p_room_id: foreignRoomId }],
];

async function expectRpcError(label, client, functionName, args) {
  const { data, error } = await client.rpc(functionName, args);

  if (!error) {
    throw new Error(
      `${label} unexpectedly succeeded; returned ${
        Array.isArray(data) ? `${data.length} row(s)` : typeof data
      }.`,
    );
  }

  return {
    label,
    ok: true,
    error: summarizeError(error),
  };
}

async function expectDeniedOrEmpty(label, client, functionName, args) {
  const { data, error } = await client.rpc(functionName, args);

  if (!error && !isEmptyResult(data)) {
    throw new Error(`${label} returned non-empty data across a room boundary.`);
  }

  return {
    label,
    ok: true,
    outcome: error ? "denied" : "empty",
    error: summarizeError(error),
  };
}

const results = {
  anonymousAllowlist: [],
  anonymousInternal: [],
  authenticatedCrossRoom: [],
  authenticatedProbeRoom: [],
  positiveMembership: [],
};

for (const [functionName, args] of allowlistedBrowserRpcs) {
  results.anonymousAllowlist.push(
    await expectRpcError(
      `anonymous ${functionName}`,
      anonymousClient,
      functionName,
      args,
    ),
  );
}

for (const [functionName, args] of anonymousInternalRpcs) {
  results.anonymousInternal.push(
    await expectRpcError(
      `anonymous internal ${functionName}`,
      anonymousClient,
      functionName,
      args,
    ),
  );
}

const [clientA, clientB] = await Promise.all([
  signIn("account A", emailA),
  signIn("account B", emailB),
]);

for (const [label, client] of [
  ["account A", clientA],
  ["account B", clientB],
]) {
  for (const [functionName, args] of [
    ["get_movie_buff_active_leave_quote", {
      p_room_id: foreignRoomId,
    }],
    ["get_movie_buff_final_results", { p_room_id: foreignRoomId }],
    ["get_movie_buff_match_phase_view", { p_room_id: foreignRoomId }],
    ["get_movie_buff_round", { p_room_id: foreignRoomId }],
    ["get_movie_buff_round_results", { p_room_id: foreignRoomId }],
    ["get_movie_buff_round_results", {
      p_room_id: foreignRoomId,
      p_round_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["get_movie_buff_vip_round_view", {
      p_room_id: foreignRoomId,
      p_round_id: "00000000-0000-0000-0000-000000000000",
    }],
  ]) {
    results.authenticatedCrossRoom.push(
      await expectDeniedOrEmpty(
        `${label} cross-room ${functionName}`,
        client,
        functionName,
        args,
      ),
    );
  }

  for (const [functionName, args] of [
    ["activate_movie_buff_round_vip", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_round_id: "00000000-0000-0000-0000-000000000000",
      p_activation_key: "security-smoke",
    }],
    ["advance_movie_buff_match_phase", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_expected_version: 0,
    }],
    ["advance_movie_buff_round", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["confirm_movie_buff_active_leave", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_quote_token: "security-smoke",
      p_idempotency_key: "security-smoke",
    }],
    ["enter_movie_buff_round", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["leave_movie_buff_room", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["lock_movie_buff_round_vip", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_round_id: "00000000-0000-0000-0000-000000000000",
      p_vip_id: "00000000-0000-0000-0000-000000000000",
      p_idempotency_key: "security-smoke",
    }],
    ["mark_movie_buff_round_media_ready", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["prepare_movie_buff_round_playback", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["select_movie_buff_match_tile", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_tile_id: "00000000-0000-0000-0000-000000000000",
      p_expected_version: 0,
      p_idempotency_key: "security-smoke",
    }],
    ["set_movie_buff_player_ready", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_is_ready: false,
    }],
    ["start_movie_buff_match", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["start_movie_buff_round_playback", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["submit_movie_buff_answer", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_submitted_answer: "security-smoke",
    }],
    ["touch_movie_buff_match_participant", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["touch_movie_buff_room_presence", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
    }],
    ["use_movie_buff_round_hint", {
      p_room_id: "00000000-0000-0000-0000-000000000000",
      p_penalty_seconds: 5,
    }],
  ]) {
    results.authenticatedProbeRoom.push(
      await expectRpcError(
        `${label} probe-room ${functionName}`,
        client,
        functionName,
        args,
      ),
    );
  }

  for (const [functionName, args] of anonymousInternalRpcs) {
    results.authenticatedProbeRoom.push(
      await expectRpcError(
        `${label} internal ${functionName}`,
        client,
        functionName,
        args,
      ),
    );
  }
}

// Account A is the live member-room fixture. Account B remains in the suite
// to prove that a second authenticated identity cannot cross the room boundary.
const { data: memberData, error: memberError } =
  await clientA.rpc("get_movie_buff_match_phase_view", {
    p_room_id: memberRoomId,
  });

if (memberError) {
  throw new Error(
    `account A could not execute the member-room phase view: ${memberError.message}`,
  );
}

results.positiveMembership.push({
  label: "account A",
  ok: true,
  nonEmpty: !isEmptyResult(memberData),
});

console.log(JSON.stringify({
  ok: true,
  target: PRODUCTION_PROJECT_REF,
  checks: {
    anonymousAllowlist: results.anonymousAllowlist.length,
    anonymousInternal: results.anonymousInternal.length,
    authenticatedCrossRoom: results.authenticatedCrossRoom.length,
    authenticatedProbeRoom: results.authenticatedProbeRoom.length,
    positiveMembership: results.positiveMembership.length,
  },
}, null, 2));
