import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Live runner smoke requires ${name}.`);
  }

  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.env.MOVIE_BUFF_LIVE_SMOKE_ENABLED !== "true") {
  throw new Error(
    "Live runner smoke is fail-closed. Set MOVIE_BUFF_LIVE_SMOKE_ENABLED=true explicitly.",
  );
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY?.trim() ??
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!serviceRoleKey) {
  throw new Error(
    "Live runner smoke requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(supabaseUrl)) {
  throw new Error(
    "Live runner smoke is local-only. Refusing to mutate a hosted Supabase project.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `MovieBuffLive-${suffix}-Pass!`;
const createdUsers = [];
let roomId = null;
let episodeId = null;

try {
  for (let index = 0; index < 3; index += 1) {
    const email = `movie-buff-live-${suffix}-${index}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `Live Smoke ${index + 1}` },
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Smoke user creation failed.");
    }

    createdUsers.push({ email, id: data.user.id });
  }

  const playerClients = [];

  for (const user of createdUsers) {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Smoke user sign-in failed.");
    }

    playerClients.push(client);
  }

  const positions = [];

  for (const client of playerClients) {
    const { data, error } = await client.rpc(
      "join_movie_buff_live_queue",
      { p_show_key: "main" },
    );

    if (error) {
      throw new Error(error.message);
    }

    assert(data?.status === "queued", "Expected each smoke player to queue.");
    positions.push(data.position);
  }

  assert(
    positions.join(",") === "1,2,3",
    `Expected queue positions 1,2,3, received ${positions.join(",")}.`,
  );

  const { data: startResult, error: startError } = await admin.rpc(
    "tick_movie_buff_live_show",
    {
      p_show_key: "main",
      p_worker_id: `live-smoke-${suffix}`,
    },
  );

  if (startError) {
    throw new Error(startError.message);
  }

  assert(
    startResult?.action === "episode_started",
    `Expected episode_started, received ${startResult?.action ?? "none"}.`,
  );
  roomId = startResult.roomId;
  episodeId = startResult.episodeId;

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: liveView, error: liveViewError } = await publicClient.rpc(
    "get_movie_buff_live_show_view",
    { p_show_key: "main" },
  );

  if (liveViewError) {
    throw new Error(liveViewError.message);
  }

  assert(liveView?.status === "live", "Expected the show to be live.");
  assert(liveView?.roomId === roomId, "Public view room id mismatch.");
  assert(
    Array.isArray(liveView?.contestants) && liveView.contestants.length === 3,
    "Expected three contestants in the public live view.",
  );

  await sleep(4500);

  const { data: advanceResult, error: advanceError } = await admin.rpc(
    "tick_movie_buff_live_show",
    {
      p_show_key: "main",
      p_worker_id: `live-smoke-${suffix}`,
    },
  );

  if (advanceError) {
    throw new Error(advanceError.message);
  }

  assert(
    advanceResult?.action === "phase_tick",
    `Expected phase_tick after the server deadline, received ${advanceResult?.action ?? "none"}.`,
  );
  assert(
    advanceResult.phase !== "round_intro",
    "Expected the server-owned phase to advance beyond round_intro.",
  );

  console.log(
    JSON.stringify({
      pass: true,
      queuePositions: positions,
      episodeId,
      roomId,
      phaseAfterDeadline: advanceResult.phase,
    }),
  );
} finally {
  if (episodeId) {
    await admin
      .from("movie_buff_live_show_episodes")
      .delete()
      .eq("id", episodeId);
  }

  if (roomId) {
    await admin.from("game_rooms").delete().eq("id", roomId);
  }

  await admin
    .from("movie_buff_live_shows")
    .update({
      status: "waiting_for_contestants",
      episode_number: 0,
      current_episode_id: null,
      current_phase: null,
      current_phase_ends_at: null,
      next_tick_at: null,
      worker_id: null,
      lease_expires_at: null,
      last_heartbeat_at: null,
      last_error: null,
    })
    .eq("show_key", "main");

  for (const user of createdUsers) {
    await admin.auth.admin.deleteUser(user.id);
  }
}
