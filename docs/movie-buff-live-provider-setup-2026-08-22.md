# Movie Buff live provider setup

## Current boundary

The Movie Buff live runner and Supabase episode state are already provider-neutral.
The public broadcast projection now exposes only non-secret integration metadata:

- `integrations.video`: `mux` or `cloudflare_stream`, plus an optional public
  playback URL.
- `integrations.aiHost`: `livekit` and whether the server-side credentials are
  present.

The projection remains `cue_only` until a real LiveKit agent has joined the
episode control room. Environment variables alone must never make the UI claim
that an AI host is live.

## Recommended launch configuration

Use one Railway persistent service for `movie-buff-live-runner`, Mux as the
canonical in-app video delivery layer, and LiveKit Agents as the realtime AI
host transport. The authorized launch configuration uses LiveKit Inference, so
it does not require OpenAI credits or an OpenAI API key. OpenAI Realtime, Qwen,
or DeepSeek can be introduced behind the same LiveKit boundary later if the
operator explicitly selects and funds one of those model paths.

Use YouTube as a distribution mirror after the Mux path is healthy. Supabase
remains authoritative for episode, contestant, phase, lease, and score state.

## Provider preflight

Run this locally or on the durable host after setting secrets through the host's
secret manager:

```powershell
npm run movie-buff:provider-preflight
```

The check is fail-closed and prints names only; it never prints secret values.
It validates the Supabase target, runner enablement, selected video provider,
public playback URL, provider credentials, webhook secret, LiveKit credentials,
and the selected AI model path.

## Required secret names

The exact values belong in Railway/Vercel/LiveKit/Mux secret management, not in
the repository or browser code.

### Common

- `NEXT_PUBLIC_SUPABASE_URL`
- `MOVIE_BUFF_EXPECTED_SUPABASE_REF`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `MOVIE_BUFF_LIVE_SHOW_KEY`
- `MOVIE_BUFF_LIVE_RUNNER_ENABLED=true`
- `MOVIE_BUFF_BROADCAST_WEBHOOK_SECRET`
- `MOVIE_BUFF_PUBLIC_PLAYBACK_URL`

### Mux

- `MOVIE_BUFF_BROADCAST_PROVIDER=mux`
- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_LIVE_STREAM_ID`
- `MUX_PLAYBACK_ID`

### LiveKit and the AI host

- `MOVIE_BUFF_AI_HOST_PROVIDER=livekit`
- `MOVIE_BUFF_AI_HOST_ENABLED=true`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `MOVIE_BUFF_AI_MODEL_PROVIDER=openai_realtime`, `livekit_inference`,
  `qwen`, or `deepseek`

The model-specific requirements are:

- `openai_realtime`: `OPENAI_API_KEY`
- `livekit_inference`: no additional model key in the application
- `qwen` or `deepseek`: `MOVIE_BUFF_AI_MODEL_BASE_URL` and
  `MOVIE_BUFF_AI_MODEL_API_KEY`

## Remaining external actions

The repository-side boundary is safe to validate without provider accounts.
Creating Railway/Mux resources, signing into LiveKit Cloud/OpenAI, generating
API keys, entering secrets, and deploying or switching the production runner
remain explicit operator actions.
