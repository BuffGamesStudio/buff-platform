# Movie Buff Live show runner

## What is implemented

Movie Buff now has an additive live-show layer around the existing authoritative
match phase machine:

- `movie_buff_live_shows` stores the singleton show lease, current episode,
  current phase, and heartbeat state.
- `movie_buff_live_queue` stores authenticated contestant-row entries,
  presence, stage assignment, and post-episode cooldown.
- `movie_buff_live_show_episodes` records each three-seat episode.
- `tick_movie_buff_live_show(show_key, worker_id)` is the only worker contract.
  It leases the show, expires abandoned queue entries, selects three eligible
  contestants, starts the existing Movie Buff match, advances its authoritative
  phase, and rotates contestants after completion.
- `get_movie_buff_live_show_view` is the public read contract for the live page.
- `join_movie_buff_live_queue`, `heartbeat_movie_buff_live_queue`, and
  `leave_movie_buff_live_queue` are authenticated contestant controls.

The normal browser game remains responsible for player actions such as tile
selection and answers. The show runner does not write those actions directly;
it only advances the existing server-owned phase timeline.

## Local verification

The repository now includes:

```text
src/app/games/movie-buff/live/page.tsx
src/components/movie-buff/MovieBuffLiveShowClient.tsx
src/lib/db/movieBuffLiveShow.ts
scripts/movie-buff-live-show-runner.mjs
docker/movie-buff-live-runner.Dockerfile
docker-compose.movie-buff-live.yml
```

To run one fail-closed tick against a local or explicitly selected Supabase
project, provide the service key and opt in explicitly:

```powershell
$env:MOVIE_BUFF_LIVE_RUNNER_ENABLED = "true"
$env:MOVIE_BUFF_LIVE_RUNNER_ONCE = "true"
npm run movie-buff:live-runner
```

For continuous operation:

```powershell
$env:MOVIE_BUFF_LIVE_RUNNER_ENABLED = "true"
npm run movie-buff:live-runner
```

The runner reads `.env.local` locally, or the environment injected into its
container. It uses `SUPABASE_SECRET_KEY` when available and never exposes that
key to the browser. The runner is intentionally not a Vercel Function: Vercel
Functions are bounded request handlers, while this process requires a durable
lease and a restart policy.

## Docker operation

The compose file is a deployment template, not a production launch action. It
expects `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the operator's
environment:

```powershell
docker compose -f docker-compose.movie-buff-live.yml up -d --build
```

Use a Linux host or another durable container runtime with restart-on-failure,
centralized JSON logs, and an alert when `last_heartbeat_at` or the worker lease
goes stale. Only one worker actively controls the show; a second worker waits
for the database lease to expire.

## Episode policy

The first live format is deliberately deterministic:

1. Three queue entries with fresh presence are selected in join order.
2. The three players enter a public Movie Buff room and are marked ready.
3. The existing admission handoff creates the match and first round.
4. The worker advances the match phase whenever the server deadline is due.
5. When the episode finishes, all three entries receive a 30-second cooldown.
6. The next three eligible queue entries become the next episode.

This gives Movie Buff a stable Price Is Right-style rotation without silently
replacing a human during a live episode. The existing Buster boundary remains
responsible for an abandoned seat inside an active match.

## Production gate

This change adds a migration and a worker, but it does not apply the migration,
deploy the worker, or start a production show. Those actions require explicit
production authorization and a separate smoke test using dedicated accounts.
Before production use, verify:

- migration applied to the intended Supabase project;
- anonymous read access exposes only the public show view;
- authenticated queue join/leave/heartbeat policies work;
- two runner processes converge on one lease;
- three contestants become one authoritative match;
- phase advancement continues after all browser tabs close;
- finished episodes rotate into the next three contestants;
- the worker's container restarts cleanly after termination.
