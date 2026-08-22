import { createClient } from "@supabase/supabase-js";

import path from "node:path";

import { readSmokeEnvFile } from "./movie-buff-smoke-env.mjs";

const EXPECTED_PROJECT_REF = "yfatwreicmiocdxzyznd";
const SHOW_KEY = "main";
const DEFAULT_WAIT_SECONDS = 45;
const MAX_WAIT_SECONDS = 120;

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function required(values, key) {
  const value = nonEmpty(values[key]);

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function safeError(value) {
  return String(value instanceof Error ? value.message : value)
    .replace(/https?:\/\/[^\s"']+/gi, "<redacted-url>")
    .replace(/(bearer\s+)[^\s]+/gi, "$1<redacted>")
    .replace(
      /(apikey|api[_-]?key|token|secret|password)[=:]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loadValues() {
  const envFile = nonEmpty(process.env.MOVIE_BUFF_LIVE_SMOKE_ENV_FILE);
  const fileValues = envFile
    ? readSmokeEnvFile(path.resolve(process.cwd(), envFile))
    : {};

  return {
    ...fileValues,
    ...process.env,
  };
}

function loadConfig(values) {
  if (values.MOVIE_BUFF_LIVE_SMOKE_ENABLED !== "true") {
    throw new Error(
      "Production live smoke is fail-closed. Set MOVIE_BUFF_LIVE_SMOKE_ENABLED=true.",
    );
  }

  const expectedRef = required(
    values,
    "MOVIE_BUFF_LIVE_EXPECTED_SUPABASE_REF",
  );
  assert(
    expectedRef === EXPECTED_PROJECT_REF,
    `Production smoke refuses any Supabase ref other than ${EXPECTED_PROJECT_REF}.`,
  );

  const supabaseUrl = required(values, "NEXT_PUBLIC_SUPABASE_URL");
  const parsedUrl = new URL(supabaseUrl);
  assert(
    parsedUrl.hostname.toLowerCase() === `${expectedRef}.supabase.co`,
    "Production smoke Supabase URL does not match the expected project ref.",
  );
  assert(
    !parsedUrl.username && !parsedUrl.password,
    "Production smoke Supabase URL must not contain credentials.",
  );

  const publishableKey = required(
    values,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  const serviceKey =
    nonEmpty(values.SUPABASE_SECRET_KEY) ??
    nonEmpty(values.SUPABASE_SERVICE_ROLE_KEY);

  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  }

  const waitSeconds = Math.min(
    MAX_WAIT_SECONDS,
    Math.max(
      5,
      Number.parseInt(
        values.MOVIE_BUFF_LIVE_SMOKE_MAX_WAIT_SECONDS ??
          String(DEFAULT_WAIT_SECONDS),
        10,
      ) || DEFAULT_WAIT_SECONDS,
    ),
  );

  return {
    supabaseUrl,
    publishableKey,
    serviceKey,
    waitSeconds,
    emailDomain: nonEmpty(values.MOVIE_BUFF_LIVE_SMOKE_EMAIL_DOMAIN) ?? "example.com",
  };
}

function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createPublicClient(config) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getShow(admin) {
  const { data, error } = await admin
    .from("movie_buff_live_shows")
    .select(
      "id,show_key,status,episode_number,current_episode_id,current_phase,current_phase_ends_at,next_tick_at,worker_id,lease_expires_at,last_heartbeat_at",
    )
    .eq("show_key", SHOW_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Production live show query failed: ${safeError(error)}`);
  }

  if (!data) {
    throw new Error("Production live show main was not found.");
  }

  return data;
}

async function getActiveQueue(admin, showId) {
  const { data, error } = await admin
    .from("movie_buff_live_queue")
    .select("id,status,player_id")
    .eq("show_id", showId)
    .in("status", ["queued", "on_stage", "cooldown"]);

  if (error) {
    throw new Error(`Production live queue query failed: ${safeError(error)}`);
  }

  return data ?? [];
}

async function getPublicView(client) {
  const { data, error } = await client.rpc(
    "get_movie_buff_live_show_view",
    { p_show_key: SHOW_KEY },
  );

  if (error) {
    throw new Error(`Production public live view failed: ${safeError(error)}`);
  }

  return data;
}

async function waitForLiveEpisode(client, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;

  while (Date.now() < deadline) {
    const view = await getPublicView(client);

    if (
      view?.status === "live" &&
      view?.matchId &&
      view?.roomId &&
      view?.currentPhase &&
      Array.isArray(view?.contestants) &&
      view.contestants.length === 3
    ) {
      return view;
    }

    if (view?.status === "error" || view?.status === "paused") {
      throw new Error(`Production live show entered unexpected status '${view.status}'.`);
    }

    await sleep(1000);
  }

  throw new Error("Production runner did not cast three contestants before the deadline.");
}

async function waitForPhaseAdvance(client, initialView, waitSeconds) {
  const deadline = Date.now() + Math.min(waitSeconds, 20) * 1000;

  while (Date.now() < deadline) {
    await sleep(1000);
    const view = await getPublicView(client);

    if (
      view?.status === "live" &&
      (view.currentPhaseVersion > initialView.currentPhaseVersion ||
        view.currentPhase !== initialView.currentPhase)
    ) {
      return view;
    }
  }

  throw new Error("The authoritative live phase did not advance before the deadline.");
}

async function deleteUsers(admin, users) {
  const errors = [];

  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      errors.push(`delete user failed: ${safeError(error)}`);
    }
  }

  return errors;
}

async function getEpisodeByMatch(admin, matchId) {
  if (!matchId) {
    return null;
  }

  const { data, error } = await admin
    .from("movie_buff_live_show_episodes")
    .select("id, episode_number, status, room_id, match_id")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    throw new Error(`Smoke episode lookup failed: ${safeError(error)}`);
  }

  return data ?? null;
}

async function verifyNoSmokeResidue(admin, users, episodeId, matchId) {
  const userIds = users.map((user) => user.id);
  const residue = {
    queueRows: 0,
    episodeRows: 0,
    matchRows: 0,
    usersRemaining: 0,
  };

  const { data: queueRows, error: queueError } = await admin
    .from("movie_buff_live_queue")
    .select("id")
    .in("player_id", userIds);

  if (queueError) {
    throw new Error(`Smoke queue cleanup verification failed: ${safeError(queueError)}`);
  }

  residue.queueRows = queueRows?.length ?? 0;

  if (episodeId) {
    const { data: episodeRows, error: episodeError } = await admin
      .from("movie_buff_live_show_episodes")
      .select("id")
      .eq("id", episodeId);

    if (episodeError) {
      throw new Error(`Smoke episode cleanup verification failed: ${safeError(episodeError)}`);
    }

    residue.episodeRows = episodeRows?.length ?? 0;
  }

  if (matchId) {
    const { data: matchRows, error: matchError } = await admin
      .from("matches")
      .select("id")
      .eq("id", matchId);

    if (matchError) {
      throw new Error(`Smoke match cleanup verification failed: ${safeError(matchError)}`);
    }

    residue.matchRows = matchRows?.length ?? 0;
  }

  for (const user of users) {
    const { data, error } = await admin.auth.admin.getUserById(user.id);

    if (!error && data?.user) {
      residue.usersRemaining += 1;
    }
  }

  return residue;
}

async function runSmoke(config) {
  const admin = createAdminClient(config);
  const publicClient = createPublicClient(config);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = `MovieBuffLiveSmoke-${suffix}-Pass!`;
  const users = [];
  let show = null;
  let episodeId = null;
  let roomId = null;
  let matchId = null;
  let phaseBefore = null;
  let phaseAfter = null;
  let positions = [];
  let cleanupErrors = [];
  let residue = null;
  let createdEpisode = false;
  let smokeResult = null;
  let runError = null;

  try {
    show = await getShow(admin);
    assert(
      show.status === "waiting_for_contestants" &&
        show.current_episode_id === null,
      "Production smoke is unsafe while main is not waiting for contestants.",
    );

    const activeQueue = await getActiveQueue(admin, show.id);
    assert(
      activeQueue.length === 0,
      "Production smoke is unsafe while unrelated active contestants exist.",
    );

    for (let index = 0; index < 3; index += 1) {
      const email = `movie-buff-live-smoke-${suffix}-${index}@${config.emailDomain}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Production Smoke ${index + 1}` },
      });

      if (error || !data.user) {
        throw new Error(`Smoke user creation failed: ${safeError(error ?? "unknown error")}`);
      }

      users.push({ id: data.user.id, email });
    }

    const playerClients = [];

    for (const user of users) {
      const client = createPublicClient(config);
      const { error } = await client.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (error) {
        throw new Error(`Smoke user sign-in failed: ${safeError(error)}`);
      }

      playerClients.push(client);
    }

    for (const client of playerClients) {
      const { data, error } = await client.rpc(
        "join_movie_buff_live_queue",
        { p_show_key: SHOW_KEY },
      );

      if (error) {
        throw new Error(`Smoke queue join failed: ${safeError(error)}`);
      }

      assert(data?.status === "queued", "Smoke player did not enter the queue.");
      positions.push(data.position);
    }

    assert(
      positions.join(",") === "1,2,3",
      `Expected smoke queue positions 1,2,3; received ${positions.join(",")}.`,
    );

    const liveView = await waitForLiveEpisode(publicClient, config.waitSeconds);
    roomId = liveView.roomId ?? null;
    matchId = liveView.matchId ?? null;
    phaseBefore = liveView.currentPhase;
    createdEpisode = Boolean(liveView.episodeNumber > show.episode_number);

    assert(createdEpisode, "The runner did not create a new authoritative episode.");
    assert(matchId, "The live view did not return the authoritative match ID.");

    const episode = await getEpisodeByMatch(admin, matchId);
    episodeId = episode?.id ?? null;

    assert(episodeId, "The authoritative episode could not be resolved from the match ID.");
    assert(
      episode.episode_number === liveView.episodeNumber && episode.status === "live",
      "The private episode row did not match the live public view.",
    );

    assert(
      liveView.contestants.every((contestant) =>
        /^Production Smoke /.test(contestant.displayName),
      ),
      "The live episode contestants did not match the three smoke accounts.",
    );

    for (const client of playerClients) {
      const { data, error } = await client.rpc(
        "get_movie_buff_live_show_view",
        { p_show_key: SHOW_KEY },
      );

      if (error) {
        throw new Error(`Smoke authenticated view failed: ${safeError(error)}`);
      }

      assert(data?.myQueueStatus === "on_stage", "Smoke account was not on stage.");

      const { data: heartbeat, error: heartbeatError } = await client.rpc(
        "heartbeat_movie_buff_live_queue",
        { p_show_key: SHOW_KEY },
      );

      if (heartbeatError) {
        throw new Error(`Smoke heartbeat failed: ${safeError(heartbeatError)}`);
      }

      assert(heartbeat?.updated === true, "Smoke heartbeat did not update the account.");
    }

    const advancedView = await waitForPhaseAdvance(
      publicClient,
      liveView,
      config.waitSeconds,
    );
    phaseAfter = advancedView.currentPhase;

    smokeResult = {
      pass: true,
      targetProjectRef: EXPECTED_PROJECT_REF,
      queuePositions: positions,
      contestants: 3,
      episodeNumber: liveView.episodeNumber,
      roomCreated: Boolean(roomId),
      matchCreated: Boolean(matchId),
      phaseBefore,
      phaseAfter,
    };
  } catch (error) {
    runError = error;
  } finally {
    if (show && users.length > 0) {
      const userIds = users.map((user) => user.id);
      const { error: queueError } = await admin
        .from("movie_buff_live_queue")
        .delete()
        .eq("show_id", show.id)
        .in("player_id", userIds);

      if (queueError) {
        cleanupErrors.push(`delete smoke queue rows failed: ${safeError(queueError)}`);
      }
    }

    if (createdEpisode && matchId && !episodeId) {
      try {
        const episode = await getEpisodeByMatch(admin, matchId);
        episodeId = episode?.id ?? null;
        roomId = roomId ?? episode?.room_id ?? null;
      } catch (error) {
        cleanupErrors.push(safeError(error));
      }
    }

    if (createdEpisode && show) {
      const { error: resetError } = await admin
        .from("movie_buff_live_shows")
        .update({
          status: "waiting_for_contestants",
          episode_number: show.episode_number,
          current_episode_id: null,
          current_phase: null,
          current_phase_ends_at: null,
          next_tick_at: null,
          worker_id: show.worker_id,
          lease_expires_at: show.lease_expires_at,
          last_heartbeat_at: show.last_heartbeat_at,
          last_error: null,
        })
        .eq("id", show.id);

      if (resetError) {
        cleanupErrors.push(`reset smoke show failed: ${safeError(resetError)}`);
      }
    }

    if (episodeId) {
      const { error } = await admin
        .from("movie_buff_live_show_episodes")
        .delete()
        .eq("id", episodeId);

      if (error) {
        cleanupErrors.push(`delete smoke episode failed: ${safeError(error)}`);
      }
    }

    if (roomId) {
      const { error } = await admin.from("game_rooms").delete().eq("id", roomId);

      if (error) {
        cleanupErrors.push(`delete smoke room failed: ${safeError(error)}`);
      }
    }

    if (matchId) {
      const { error } = await admin.from("matches").delete().eq("id", matchId);

      if (error) {
        cleanupErrors.push(`delete smoke match failed: ${safeError(error)}`);
      }
    }

    cleanupErrors.push(...(await deleteUsers(admin, users)));

    if (users.length > 0) {
      try {
        residue = await verifyNoSmokeResidue(admin, users, episodeId, matchId);
      } catch (error) {
        cleanupErrors.push(safeError(error));
      }
    }
  }

  const cleanup = {
    ok: cleanupErrors.length === 0 &&
      (!residue ||
        (residue.queueRows === 0 &&
          residue.episodeRows === 0 &&
          residue.matchRows === 0 &&
          residue.usersRemaining === 0)),
    errors: cleanupErrors,
    residue,
  };

  if (runError) {
    const error = new Error(safeError(runError));
    error.cleanup = cleanup;
    throw error;
  }

  if (!cleanup.ok) {
    const error = new Error("Production smoke cleanup did not verify cleanly.");
    error.cleanup = cleanup;
    throw error;
  }

  return {
    ...smokeResult,
    cleanup,
  };
}

async function main() {
  let result;

  try {
    const values = loadValues();
    const config = loadConfig(values);
    const smoke = await runSmoke(config);

    result = smoke;
  } catch (error) {
    result = {
      pass: false,
      status: String(error?.message ?? "").startsWith("Production smoke is unsafe")
        ? "blocked"
        : "failed",
      targetProjectRef: EXPECTED_PROJECT_REF,
      error: safeError(error),
      cleanup: error?.cleanup ?? null,
    };
  }

  console.log(JSON.stringify(result));
  process.exitCode = result.pass ? 0 : result.status === "blocked" ? 2 : 1;
}

await main();
