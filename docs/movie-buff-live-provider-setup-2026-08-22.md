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

The current provider-account verification found the LiveKit Cloud agent
`assistant-231b` (agent ID `CA_5mveYweP497m`) deployed and running in `us-east`,
with zero concurrent sessions at inspection time. The Mux Production live
stream resource is present but currently `Idle`, with zero live minutes; an
ingest/egress connection is still required before a live broadcast is proven.

The repository-side provider bridge is deliberately control-plane only: it
creates or updates the LiveKit control-room metadata and dispatches the named
agent. It does not claim to be a video renderer, start a LiveKit Egress job, or
push an encoder feed into Mux. The remaining broadcast step is to connect the
reviewed board/broadcast renderer to an authorized egress or encoder and send
it to the Mux RTMPS ingest endpoint using the Mux stream key. The repository now
contains a fail-closed LiveKit Web Egress controller for that handoff; it only
starts an egress when both explicit opt-in flags are present. The stream key is
a secret and must never be committed, printed, or placed in browser code. See
the [Mux RTMP/RTMPS configuration guide](https://www.mux.com/docs/guides/configure-broadcast-software)
for the provider endpoint contract.

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
- `MOVIE_BUFF_BROADCAST_COMPOSITION_URL` (public HTTPS URL for the read-only
  `/games/movie-buff/broadcast` composition)
- `MOVIE_BUFF_BROADCAST_EGRESS_ENABLED=true` to inspect egress state
- `MOVIE_BUFF_BROADCAST_EGRESS_APPLY=true` only for an explicitly authorized
  egress start

### Mux

- `MOVIE_BUFF_BROADCAST_PROVIDER=mux`
- `MUX_TOKEN_ID`
- `MUX_TOKEN_SECRET`
- `MUX_LIVE_STREAM_ID`
- `MUX_PLAYBACK_ID`
- `MUX_LIVE_STREAM_INGEST_URL` (the RTMP/RTMPS ingest URL including the stream
  key; store it only in the host secret manager)

### LiveKit and the AI host

- `MOVIE_BUFF_AI_HOST_PROVIDER=livekit`
- `MOVIE_BUFF_AI_HOST_ENABLED=true`
- `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_ENABLED=true` to opt the durable runner into
  LiveKit room-metadata synchronization and explicit agent dispatch
- `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED=true` only after the LiveKit agent
  has been verified; when false, provider outages are logged without stopping
  the Supabase episode runner
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_AGENT_NAME=assistant-231b` (the exact registered LiveKit agent name,
  verified in LiveKit Cloud)
- `MOVIE_BUFF_LIVEKIT_CONTROL_ROOM` (optional; defaults to
  `movie-buff-<show-key>`)
- `MOVIE_BUFF_AI_MODEL_PROVIDER=openai_realtime`, `livekit_inference`,
  `qwen`, or `deepseek`

The model-specific requirements are:

- `openai_realtime`: `OPENAI_API_KEY`
- `livekit_inference`: no additional model key in the application
- `qwen` or `deepseek`: `MOVIE_BUFF_AI_MODEL_BASE_URL` and
  `MOVIE_BUFF_AI_MODEL_API_KEY`

When the bridge is enabled, the runner publishes a redacted, non-secret show
projection to the LiveKit control-room metadata and explicitly dispatches the
registered agent. The agent must be implemented/configured to consume the
`movie_buff_live_state` metadata contract; environment variables alone do not
make the AI host speak or publish a broadcast feed.

## Broadcast composition and egress controller

The public, read-only composition is available at:

```text
/games/movie-buff/broadcast?showKey=main
```

It polls the public live-show projection and renders the theater board,
contestants, phase countdown, Cinephile Cinematic cue, and Buster branding. It
does not expose player controls or provider secrets, making it suitable for
LiveKit Web Egress to capture.

Inspect the egress state from the durable host with:

```powershell
npm run movie-buff:broadcast-egress
```

The command is read-only unless both `MOVIE_BUFF_BROADCAST_EGRESS_ENABLED` and
`MOVIE_BUFF_BROADCAST_EGRESS_APPLY` are set to `true`. It matches an existing
active Web Egress by the exact composition URL and never prints the ingest URL,
stream key, or provider credentials.

## Remaining external actions

The repository-side boundary is safe to validate without provider accounts.
Creating Railway/Mux resources, signing into LiveKit Cloud/OpenAI, generating
API keys, entering secrets, and deploying or switching the production runner
remain explicit operator actions.
