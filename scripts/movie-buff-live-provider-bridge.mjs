import { LiveKitAPI } from "livekit-server-sdk";

function nonEmpty(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function required(values, name) {
  const value = nonEmpty(values[name]);

  if (!value) {
    throw new Error(`Movie Buff Live provider bridge requires ${name}.`);
  }

  return value;
}

function normalizeLiveKitHost(value) {
  const normalized = nonEmpty(value);

  if (!normalized) {
    throw new Error("Movie Buff Live provider bridge requires LIVEKIT_URL.");
  }

  const parsed = new URL(normalized);

  if (parsed.protocol === "wss:") {
    parsed.protocol = "https:";
  } else if (parsed.protocol === "ws:") {
    parsed.protocol = "http:";
  }

  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("LIVEKIT_URL must be a websocket or HTTP(S) URL without credentials.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeRoomName(value, showKey) {
  const roomName = nonEmpty(value) || `movie-buff-${showKey}`;

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(roomName)) {
    throw new Error(
      "MOVIE_BUFF_LIVEKIT_CONTROL_ROOM must be 1-128 characters using letters, numbers, dot, underscore, or hyphen.",
    );
  }

  return roomName;
}

function normalizeView(view) {
  if (!view || typeof view !== "object" || Array.isArray(view)) {
    throw new Error("Movie Buff Live provider bridge received invalid show state.");
  }

  const contestants = Array.isArray(view.contestants)
    ? view.contestants.map((contestant) => ({
        seatIndex: contestant?.seatIndex ?? null,
        displayName: contestant?.displayName ?? "Movie Buff",
        score: contestant?.score ?? 0,
        participantState: contestant?.participantState ?? "active",
      }))
    : [];

  return {
    status: view.status ?? "unknown",
    episodeNumber: view.episodeNumber ?? 0,
    currentPhase: view.currentPhase ?? null,
    currentPhaseEndsAt: view.currentPhaseEndsAt ?? null,
    currentRoundNumber: view.currentRoundNumber ?? null,
    totalRounds: view.totalRounds ?? null,
    queueCount: view.queueCount ?? 0,
    queueCapacity: view.queueCapacity ?? 3,
    contestants,
    serverNow: view.serverNow ?? null,
    nextTickAt: view.nextTickAt ?? null,
    lastHeartbeatAt: view.lastHeartbeatAt ?? null,
  };
}

function buildRoomMetadata({ showKey, view, provider, playbackUrl }) {
  const payload = {
    schemaVersion: 1,
    type: "movie_buff_live_state",
    source: "buff-platform",
    showKey,
    host: {
      name: "Cinephile Cinematic",
      mascot: "Buster",
    },
    broadcast: {
      provider,
      playbackUrl,
    },
    show: normalizeView(view),
  };

  const metadata = JSON.stringify(payload);

  if (Buffer.byteLength(metadata, "utf8") > 512 * 1024) {
    throw new Error("Movie Buff Live provider metadata exceeded the LiveKit room limit.");
  }

  return metadata;
}

/**
 * Create an opt-in bridge that keeps a LiveKit control room synchronized with
 * the authoritative Supabase live-show projection and dispatches the named
 * Cinephile Cinematic agent once. Provider errors are surfaced to the caller;
 * the runner decides whether they are fatal based on its required flag.
 */
export function createMovieBuffLiveProviderBridge({ values, supabase, showKey }) {
  if (values.MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_ENABLED !== "true") {
    return null;
  }

  if (values.MOVIE_BUFF_AI_HOST_PROVIDER !== "livekit") {
    throw new Error(
      "MOVIE_BUFF_AI_HOST_PROVIDER must be livekit when the provider bridge is enabled.",
    );
  }

  if (values.MOVIE_BUFF_AI_HOST_ENABLED !== "true") {
    throw new Error(
      "MOVIE_BUFF_AI_HOST_ENABLED must be true when the provider bridge is enabled.",
    );
  }

  const liveKitApi = new LiveKitAPI({
    host: normalizeLiveKitHost(values.LIVEKIT_URL),
    apiKey: required(values, "LIVEKIT_API_KEY"),
    secret: required(values, "LIVEKIT_API_SECRET"),
    requestTimeout: 10,
  });
  const agentName = required(values, "LIVEKIT_AGENT_NAME");
  const roomName = normalizeRoomName(
    values.MOVIE_BUFF_LIVEKIT_CONTROL_ROOM,
    showKey,
  );
  const provider = nonEmpty(values.MOVIE_BUFF_BROADCAST_PROVIDER) || "mux";
  const playbackUrl = nonEmpty(values.MOVIE_BUFF_PUBLIC_PLAYBACK_URL);

  if (!playbackUrl) {
    throw new Error(
      "MOVIE_BUFF_PUBLIC_PLAYBACK_URL is required when the provider bridge is enabled.",
    );
  }

  let roomReady = false;
  let dispatchId = null;
  let lastMetadata = null;

  return {
    required: values.MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED === "true",
    roomName,
    agentName,

    async sync() {
      const { data, error } = await supabase.rpc(
        "get_movie_buff_live_show_view",
        { p_show_key: showKey },
      );

      if (error) {
        throw new Error(error.message);
      }

      const metadata = buildRoomMetadata({
        showKey,
        view: data,
        provider,
        playbackUrl,
      });
      let metadataChanged = false;
      let dispatchCreated = false;

      if (!roomReady) {
        const rooms = await liveKitApi.room.listRooms([roomName]);

        if (rooms.length === 0) {
          await liveKitApi.room.createRoom({
            name: roomName,
            emptyTimeout: 60 * 60,
            departureTimeout: 60,
            metadata,
          });
        } else {
          await liveKitApi.room.updateRoomMetadata(roomName, metadata);
        }

        roomReady = true;
        lastMetadata = metadata;
        metadataChanged = true;
      } else if (metadata !== lastMetadata) {
        await liveKitApi.room.updateRoomMetadata(roomName, metadata);
        lastMetadata = metadata;
        metadataChanged = true;
      }

      if (!dispatchId) {
        const dispatches = await liveKitApi.agentDispatch.listDispatch(roomName);
        const existing = dispatches.find(
          (dispatch) => dispatch.agentName === agentName,
        );

        if (existing) {
          dispatchId = existing.id;
        } else {
          const dispatch = await liveKitApi.agentDispatch.createDispatch(
            roomName,
            agentName,
            {
              metadata: JSON.stringify({
                type: "movie_buff_live_dispatch",
                showKey,
                hostName: "Cinephile Cinematic",
                mascotName: "Buster",
                stateSource: "livekit_room_metadata",
              }),
            },
          );
          dispatchId = dispatch.id;
          dispatchCreated = true;
        }
      }

      return {
        status: "synced",
        roomName,
        agentName,
        metadataChanged,
        dispatchCreated,
      };
    },
  };
}
