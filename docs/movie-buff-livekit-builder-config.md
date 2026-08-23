# Movie Buff LiveKit Builder configuration

This is the provider-side handoff for the existing LiveKit Builder agent
`assistant-231b`. It is intentionally separate from the repository because the
Builder stores the generated Python agent configuration in LiveKit Cloud.

## Agent identity

- Host: `Cinephile Cinematic`
- Mascot: `Buster`
- Model path: `livekit_inference`
- Agent: `assistant-231b`
- Room: `movie-buff-main`

Do not add an OpenAI API key. Keep the existing LiveKit Inference model path.

## Add one read-only HTTP tool

In the agent's `Actions` tab, add an HTTP tool with these semantics:

```text
Name: get_movie_buff_live_host_context
Method: GET
URL: https://<deployed-movie-buff-origin>/api/movie-buff/live/host-context?showKey=main
```

The URL must point to the deployed Movie Buff origin after the broadcast
composition commit is published. Do not use `localhost`, a Railway console
URL, or a URL containing credentials.

The endpoint is read-only and secret-free. It returns:

- `host`: the current Cinephile Cinematic/Buster cue;
- `show`: status, episode, phase, queue, and contestants;
- `media`: either `null` or a constrained same-origin round-media URL and clip
  type.

It does not return provider credentials, Mux stream keys, LiveKit secrets, or
the full board payload.

## Update the agent instructions

Add these operational rules to the existing Builder instructions:

```text
Before each live-show segment, call get_movie_buff_live_host_context.
Speak only from the returned host cue and show state. If the tool fails or the
show is not live, say a brief holding line and do not invent contestants,
scores, phases, movies, or winners. During playback and answer phases, keep
the host commentary concise so the movie clip remains the focus. Buster is a
mascot and visual co-host; never claim that Buster performed an action unless
the returned state supports it. Never reveal internal IDs, provider names,
credentials, stream keys, or implementation details to viewers.
```

Save the Builder configuration and deploy the agent only after the reviewed
repository commits are deployed. The existing provider bridge will continue to
publish redacted room metadata; the HTTP tool gives the agent a direct,
read-only state refresh path.

## Verification

From a trusted operator environment, set only the public origin:

```powershell
$env:MOVIE_BUFF_BROADCAST_ORIGIN = "https://<deployed-movie-buff-origin>"
npm run movie-buff:broadcast-contract
```

The contract check is read-only, prints only the target hostname and sanitized
state, and fails closed if the response contains a secret-shaped field or an
unexpected media URL. It does not start a show, create a contestant, change a
LiveKit agent, or start Mux egress.
