import "server-only";

export const MOVIE_BUFF_VIDEO_PROVIDER_VALUES = [
  "mux",
  "cloudflare_stream",
] as const;

export const MOVIE_BUFF_AI_HOST_PROVIDER_VALUES = ["livekit"] as const;

export const MOVIE_BUFF_AI_MODEL_PROVIDER_VALUES = [
  "openai_realtime",
  "livekit_inference",
  "qwen",
  "deepseek",
] as const;

export type MovieBuffVideoProvider =
  | (typeof MOVIE_BUFF_VIDEO_PROVIDER_VALUES)[number]
  | "unconfigured";

export type MovieBuffAiHostProvider =
  | (typeof MOVIE_BUFF_AI_HOST_PROVIDER_VALUES)[number]
  | "unconfigured";

export type MovieBuffAiModelProvider =
  | (typeof MOVIE_BUFF_AI_MODEL_PROVIDER_VALUES)[number]
  | "unconfigured";

export type MovieBuffProviderConfiguration = {
  video: {
    provider: MovieBuffVideoProvider;
    configured: boolean;
    playbackUrl: string | null;
  };
  aiHost: {
    provider: MovieBuffAiHostProvider;
    modelProvider: MovieBuffAiModelProvider;
    agentName: string | null;
    configured: boolean;
  };
};

type EnvironmentValues = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseVideoProvider(value: string | undefined): MovieBuffVideoProvider {
  const normalized = nonEmpty(value);

  if (normalized === null) {
    return "unconfigured";
  }

  if (
    !MOVIE_BUFF_VIDEO_PROVIDER_VALUES.includes(
      normalized as (typeof MOVIE_BUFF_VIDEO_PROVIDER_VALUES)[number],
    )
  ) {
    throw new Error(
      "MOVIE_BUFF_BROADCAST_PROVIDER must be mux or cloudflare_stream.",
    );
  }

  return normalized as MovieBuffVideoProvider;
}

function parseAiHostProvider(value: string | undefined): MovieBuffAiHostProvider {
  const normalized = nonEmpty(value);

  if (normalized === null) {
    return "unconfigured";
  }

  if (
    !MOVIE_BUFF_AI_HOST_PROVIDER_VALUES.includes(
      normalized as (typeof MOVIE_BUFF_AI_HOST_PROVIDER_VALUES)[number],
    )
  ) {
    throw new Error("MOVIE_BUFF_AI_HOST_PROVIDER must be livekit.");
  }

  return normalized as MovieBuffAiHostProvider;
}

function parseAiModelProvider(value: string | undefined): MovieBuffAiModelProvider {
  const normalized = nonEmpty(value);

  if (normalized === null) {
    return "unconfigured";
  }

  if (
    !MOVIE_BUFF_AI_MODEL_PROVIDER_VALUES.includes(
      normalized as (typeof MOVIE_BUFF_AI_MODEL_PROVIDER_VALUES)[number],
    )
  ) {
    throw new Error(
      "MOVIE_BUFF_AI_MODEL_PROVIDER must be openai_realtime, livekit_inference, qwen, or deepseek.",
    );
  }

  return normalized as MovieBuffAiModelProvider;
}

function parsePublicPlaybackUrl(value: string | undefined): string | null {
  const normalized = nonEmpty(value);

  if (normalized === null) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("MOVIE_BUFF_PUBLIC_PLAYBACK_URL must be a valid URL.");
  }

  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(
      "MOVIE_BUFF_PUBLIC_PLAYBACK_URL must be an http(s) URL without credentials.",
    );
  }

  return parsed.toString();
}

export function getMovieBuffProviderConfiguration(
  values: EnvironmentValues = process.env,
): MovieBuffProviderConfiguration {
  const videoProvider = parseVideoProvider(values.MOVIE_BUFF_BROADCAST_PROVIDER);
  const playbackUrl = parsePublicPlaybackUrl(
    values.MOVIE_BUFF_PUBLIC_PLAYBACK_URL,
  );
  const aiHostProvider = parseAiHostProvider(values.MOVIE_BUFF_AI_HOST_PROVIDER);
  const aiModelProvider = parseAiModelProvider(
    values.MOVIE_BUFF_AI_MODEL_PROVIDER,
  );
  const aiAgentName = nonEmpty(values.LIVEKIT_AGENT_NAME);
  const aiHostEnabled = values.MOVIE_BUFF_AI_HOST_ENABLED === "true";
  const aiModelConfigured =
    aiModelProvider === "livekit_inference" ||
    (aiModelProvider === "openai_realtime" &&
      Boolean(nonEmpty(values.OPENAI_API_KEY))) ||
    ((aiModelProvider === "qwen" || aiModelProvider === "deepseek") &&
      Boolean(
        nonEmpty(values.MOVIE_BUFF_AI_MODEL_BASE_URL) &&
          nonEmpty(values.MOVIE_BUFF_AI_MODEL_API_KEY),
      ));

  const aiHostConfigured =
    aiHostProvider === "livekit" &&
    aiHostEnabled &&
    aiModelConfigured &&
    Boolean(
      nonEmpty(values.LIVEKIT_URL) &&
        nonEmpty(values.LIVEKIT_API_KEY) &&
        nonEmpty(values.LIVEKIT_API_SECRET) &&
        aiAgentName,
    );

  return {
    video: {
      provider: videoProvider,
      configured: videoProvider !== "unconfigured" && playbackUrl !== null,
      playbackUrl,
    },
    aiHost: {
      provider: aiHostProvider,
      modelProvider: aiModelProvider,
      agentName: aiAgentName,
      configured: aiHostConfigured,
    },
  };
}
