import fs from "node:fs";
import path from "node:path";

import { readSmokeEnvFile } from "./movie-buff-smoke-env.mjs";

const VIDEO_PROVIDERS = new Set(["mux", "cloudflare_stream"]);
const AI_HOST_PROVIDERS = new Set(["livekit"]);
const AI_MODEL_PROVIDERS = new Set([
  "openai_realtime",
  "livekit_inference",
  "qwen",
  "deepseek",
]);

function nonEmpty(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function loadEnvironment() {
  const explicitEnvFile =
    process.env.MOVIE_BUFF_PROVIDER_PREFLIGHT_ENV_FILE ??
    process.env.MOVIE_BUFF_ENV_FILE ??
    null;
  const envFilePath = explicitEnvFile
    ? path.resolve(process.cwd(), explicitEnvFile)
    : path.join(process.cwd(), ".env.local");
  const fileEnv = fs.existsSync(envFilePath)
    ? readSmokeEnvFile(envFilePath)
    : {};

  return {
    ...fileEnv,
    ...process.env,
  };
}

function required(values, name, missing) {
  if (!nonEmpty(values[name])) {
    missing.push(name);
  }
}

function requiredEither(values, names, missing, label) {
  if (!names.some((name) => nonEmpty(values[name]))) {
    missing.push(label ?? names.join(" or "));
  }
}

function validPublicUrl(values, name, errors) {
  const value = nonEmpty(values[name]);

  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);

    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
      errors.push(`${name} must be an http(s) URL without credentials.`);
    }
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

function validate(values) {
  const missing = [];
  const errors = [];
  const videoProvider = nonEmpty(values.MOVIE_BUFF_BROADCAST_PROVIDER);
  const aiHostProvider = nonEmpty(values.MOVIE_BUFF_AI_HOST_PROVIDER);
  const aiModelProvider =
    nonEmpty(values.MOVIE_BUFF_AI_MODEL_PROVIDER) ?? "openai_realtime";

  required(values, "NEXT_PUBLIC_SUPABASE_URL", missing);
  required(values, "MOVIE_BUFF_EXPECTED_SUPABASE_REF", missing);
  requiredEither(
    values,
    ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    missing,
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  );
  required(values, "MOVIE_BUFF_LIVE_SHOW_KEY", missing);
  required(values, "MOVIE_BUFF_LIVE_RUNNER_ENABLED", missing);
  required(values, "MOVIE_BUFF_BROADCAST_PROVIDER", missing);
  required(values, "MOVIE_BUFF_PUBLIC_PLAYBACK_URL", missing);
  required(values, "MOVIE_BUFF_BROADCAST_WEBHOOK_SECRET", missing);
  required(values, "MOVIE_BUFF_AI_HOST_PROVIDER", missing);
  required(values, "MOVIE_BUFF_AI_HOST_ENABLED", missing);
  required(values, "MOVIE_BUFF_AI_MODEL_PROVIDER", missing);

  if (values.MOVIE_BUFF_LIVE_RUNNER_ENABLED !== "true") {
    errors.push("MOVIE_BUFF_LIVE_RUNNER_ENABLED must be true for the durable host.");
  }

  if (videoProvider && !VIDEO_PROVIDERS.has(videoProvider)) {
    errors.push(
      "MOVIE_BUFF_BROADCAST_PROVIDER must be mux or cloudflare_stream.",
    );
  }

  if (videoProvider === "mux") {
    required(values, "MUX_TOKEN_ID", missing);
    required(values, "MUX_TOKEN_SECRET", missing);
    required(values, "MUX_LIVE_STREAM_ID", missing);
    required(values, "MUX_PLAYBACK_ID", missing);
  }

  if (videoProvider === "cloudflare_stream") {
    required(values, "CLOUDFLARE_ACCOUNT_ID", missing);
    required(values, "CLOUDFLARE_STREAM_API_TOKEN", missing);
    required(values, "CLOUDFLARE_LIVE_INPUT_UID", missing);
  }

  if (aiHostProvider && !AI_HOST_PROVIDERS.has(aiHostProvider)) {
    errors.push("MOVIE_BUFF_AI_HOST_PROVIDER must be livekit.");
  }

  if (values.MOVIE_BUFF_AI_HOST_ENABLED === "true") {
    required(values, "LIVEKIT_URL", missing);
    required(values, "LIVEKIT_API_KEY", missing);
    required(values, "LIVEKIT_API_SECRET", missing);
  }

  if (!AI_MODEL_PROVIDERS.has(aiModelProvider)) {
    errors.push(
      "MOVIE_BUFF_AI_MODEL_PROVIDER must be openai_realtime, livekit_inference, qwen, or deepseek.",
    );
  }

  if (values.MOVIE_BUFF_AI_HOST_ENABLED === "true") {
    if (aiModelProvider === "openai_realtime") {
      required(values, "OPENAI_API_KEY", missing);
    } else if (aiModelProvider === "qwen" || aiModelProvider === "deepseek") {
      required(values, "MOVIE_BUFF_AI_MODEL_BASE_URL", missing);
      required(values, "MOVIE_BUFF_AI_MODEL_API_KEY", missing);
    }
  }

  validPublicUrl(values, "NEXT_PUBLIC_SUPABASE_URL", errors);
  validPublicUrl(values, "MOVIE_BUFF_PUBLIC_PLAYBACK_URL", errors);

  return {
    missing: [...new Set(missing)],
    errors: [...new Set(errors)],
    selected: {
      videoProvider: videoProvider ?? "unconfigured",
      aiHostProvider: aiHostProvider ?? "unconfigured",
      aiModelProvider,
      showKey: nonEmpty(values.MOVIE_BUFF_LIVE_SHOW_KEY) ?? "unconfigured",
    },
  };
}

const result = validate(loadEnvironment());
const ready = result.missing.length === 0 && result.errors.length === 0;

console.log(
  JSON.stringify(
    {
      check: "movie-buff-live-provider-preflight",
      status: ready ? "ready" : "blocked",
      ready,
      selected: result.selected,
      missing: result.missing,
      errors: result.errors,
      secretValuesPrinted: false,
    },
    null,
    2,
  ),
);

if (!ready) {
  process.exitCode = 1;
}
