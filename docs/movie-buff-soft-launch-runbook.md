# Movie Buff soft-launch runbook

Date: Thursday, July 30, 2026

## Purpose

This runbook is the minimum operating guide for a soft launch of Movie Buff.

It is scoped to current launch blockers only:

- gameplay flow smoke checks
- local/runtime prerequisites
- admin/ops checks
- rollback steps
- known risks that still need live verification

## Current soft-launch standard

Movie Buff is not yet proven broad-public ready.

The current target is:

- private/internal test-ready in 2 to 5 focused workdays
- soft-launch-ready in about 1 to 2 weeks

## Required services

Movie Buff currently depends on:

- Next.js app server
- Supabase local or hosted project
- Supabase auth
- Supabase realtime
- Supabase Postgres RPCs and tables for rooms, rounds, analytics, and clip selection
- reachable movie media URLs for playable clip rounds

## Required local checks before smoke testing

From the repo root:

```powershell
npm run movie-buff:local-launch-suite
npx tsc --noEmit
npx eslint src\app\games\movie-buff\waiting-room\page.tsx src\app\games\movie-buff\play\page.tsx src\lib\db\movieBuff.ts
npm run movie-buff:verify-analytics
```

If using the local Supabase stack:

```powershell
supabase status
```

Expected minimum:

- local launch suite passes
- launch-critical migration presence check passes
- deployment env check passes
- typecheck passes
- targeted lint passes
- analytics verifier passes
- Supabase API and DB are reachable

If validating a hosted target, also run:

```powershell
npm run movie-buff:check-launch-migrations
npm run movie-buff:check-deploy-env
```

If validating a production env file before deploying, also run:

```powershell
node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production.example
```

## Current migration state that matters for launch

The local launch-blocker pass on Thursday, July 30, 2026 applied:

- `supabase/migrations/202607300310_movie_buff_public_match_autostart.sql`
- `supabase/migrations/202607300330_movie_buff_public_ready_autostart_rpc.sql`
- `supabase/migrations/202607301430_movie_buff_public_matchmaking_creation_lock.sql`

That migration changes public-match start behavior so:

- public rooms no longer require a host-only start click
- public rooms require at least 2 ready players
- the public waiting room can auto-start once the ready condition is satisfied
- simultaneous players sharing the same public-match settings no longer race into separate waiting rooms during room creation

## Start-up steps

### App server

Start the app server on the expected local host:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Expected primary local URLs:

- game home: `http://127.0.0.1:3001/games/movie-buff`
- lobby: `http://127.0.0.1:3001/games/movie-buff/lobby`
- admin movies: `http://127.0.0.1:3001/admin/movies`
- admin clip analytics: `http://127.0.0.1:3001/admin/analytics/clips`

### Supabase local

If not already running:

```powershell
supabase start
```

If migrations need to be applied locally:

```powershell
supabase migration up --local
```

## Soft-launch smoke checklist

Run these in order.

### 1. Home and lobby

Verify:

- Movie Buff home loads
- Play Now goes to the lobby
- How to Play loads
- lobby category buttons render
- lobby difficulty buttons render
- Find Match works
- Create Room works
- Join button state behaves correctly with empty/non-empty code

### 2. Public match smoke

Required proof:

- Find Match opens a public waiting room
- Back to Lobby works
- Leave works
- I'm Ready works
- room shows auto-start messaging
- at 1 player, match does not start
- at 2 ready players, match auto-starts
- round intro loads
- Start Round reaches play
- clip loads fast enough for use
- submit answer works
- round results loads
- Next Round advances correctly

Recommended automated proof:

```powershell
& 'C:\Users\shapa\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' `
  .\scripts\movie-buff-public-flow-smoke.mjs
```

Current note:

- the 1-player waiting-room state is now live-proven
- on Thursday, July 30, 2026, a local two-player anonymous simulation proved:
  - both players were matched into the same public room
  - both players marked ready
  - the room advanced to `active`
  - round 1 was created automatically
  - the `round_started` event recorded `trigger = public_match_start`
- `npm run movie-buff:verify-analytics` now includes `publicMatchVerification` for this backend path
- on Thursday, July 30, 2026, the new isolated browser smoke at `scripts/movie-buff-public-flow-smoke.mjs` also proved:
  - two distinct anonymous players can now land in the same public waiting room
  - both can ready up
  - both can run through a full public 10-round match
  - both reach the same final-results page
- that smoke test was the proof used to catch and validate the public-room creation race fix in `202607301430_movie_buff_public_matchmaking_creation_lock.sql`
- this closes the main local public-flow proof gap; the remaining replay target is the hosted environment once deployment parity exists
- public leave/abandon behavior now also has a local regression: `npm run movie-buff:smoke-public-leave` proves one player can leave a live shared public match without cancelling the room for the remaining player

### 3. Private room smoke

Required proof:

- Create Room opens a private waiting room
- host ready works
- Start Match works
- round intro loads
- Start Round reaches play
- hint deducts time but does not auto-start playback
- clip playback starts only after play
- submit answer works
- round results loads
- Leave Match works from in-round states
- Next Round works
- final-results screen appears at match completion
- final exit actions work

Current note:

- a full single-player private match was live-proven on Thursday, July 30, 2026
- that run verified:
  - round-results to next-round routing
  - round 10 to final-results
  - final-results exit back to the lobby
- on Friday, July 31, 2026, `npm run movie-buff:smoke-leave` also proved the private in-round abandonment path:
  - a private room started round 1
  - `Leave Match` from the live play screen returned the player to the lobby
  - the backing room moved to `cancelled`
  - active player count fell to `0`
  - room analytics recorded both `player_left` and `match_abandoned`
- on Friday, July 31, 2026, `npm run movie-buff:smoke-public-leave` also proved the shared public in-round leave path:
  - two players entered the same public room
  - both reached round 1 play
  - one player left back to the lobby
  - the room remained `active`
  - active player count fell to `1`
  - room analytics recorded `player_left`
  - `match_abandoned` was not incorrectly written while one player remained

### 4. Admin smoke

Required proof:

- `/admin/movies` loads with real rows
- `/admin/analytics/clips` loads with real data
- navigation between admin sections works
- refresh actions do not error

Current note:

- movies and clip analytics pages were live-verified on Thursday, July 30, 2026

### 5. Analytics smoke

Verify at minimum:

- `room_created`
- `player_joined`
- `player_ready`
- `round_started`
- `clip_loaded`
- `media_ready`
- `clip_started`
- `answer_submitted`
- `correct` or `wrong`
- `player_left` when applicable
- `match_completed` or `match_abandoned`

Current note from Thursday, July 30, 2026:

- recent local timing sample showed:
  - `22` rounds with `media_ready`
  - average `load_to_ready_seconds = 0.036`
  - maximum `load_to_ready_seconds = 0.107`
- this means server-side clip readiness is currently fast in local testing
- the larger timing variance is mainly in how long players wait before pressing play

Current diversity note from Friday, July 31, 2026:

- recent 1-day round history showed `100` sampled rounds with `6` immediate repeats
- immediate back-to-back repeats are not the main issue
- broader title concentration is still the issue, with some titles surfacing too often across matches
- the active launch-safe lane split is now repaired and matches source difficulty:
  - `10` Fan
  - `22` Buff
  - `17` Buffster
- a newer 200-round local history sample now shows:
  - `6` immediate repeats
  - `49` distinct movies
- source-backed inactive inventory is still much larger than the active live pool (`56` inactive source-backed video rows)
- on Friday, July 31, 2026, the global warm-pool path was repaired so verified local fallback media is copied into real pool assets instead of leaving empty pool directories
- a fresh forced warm sequence against a clean production build on Friday, July 31, 2026 reached:
  - primary ready: `fan 4 / buff 4 / buffster 4`
  - secondary ready: `fan 8 / buff 8 / buffster 7`
- that means the warmed reserve is no longer Fan-only, though Buffster secondary reserve is still slightly below the nominal target depth
- a new picker patch on Thursday, July 30, 2026 now:
  - excludes movies used in the last `3` global rounds
  - penalizes movies reused heavily in the last `2` hours
  - penalizes movies overused in the last `24` hours
- a fresh post-patch 120-pick simulation on Thursday, July 30, 2026 still produced:
  - experimental variants briefly made concentration worse and were rejected
  - the current restored balanced-spread picker now produces:
    - `21` distinct clips out of `120` picks
    - `4` immediate repeats
  - that is better than the weaker variants, but still not wide enough for launch-safe variety
- fresh pool expansion is still required before clearing the diversity blocker

## Operator checks during soft launch

Watch for:

- rooms stuck in `waiting`
- rooms stuck in `active` without round advancement
- clip load failures
- repeated stale movie selection
- timer drift reports
- answer submit failures
- final-results navigation failures

## Known unresolved risks as of Thursday, July 30, 2026

These are not cleared yet:

- hosted deployment target is still undefined in-repo
- `.openai/hosting.json` is still absent
- production runtime environment values are now named, but still not populated with real hosted values
- hosted public-flow proof is still absent
- measured clip startup latency across multiple public rounds is still limited
- live repeat/diversity audit for rotation behavior is still limited

## Security note requiring a user decision

This was the earlier issue:

- `public.movie_buff_clip_analytics`
- `public.movie_buff_movie_analytics`
- `public.movie_buff_round_events`

On Thursday, July 30, 2026, local RLS lockdown was applied for all three tables:

- RLS enabled
- anon/authenticated direct table access revoked
- service-role full-access policies added

Post-change checks:

- the local Supabase RLS advisor warning cleared
- admin analytics and admin movies still loaded successfully

Hosted deployment still needs the same migration parity before launch.

Applied local migration:

- `supabase/migrations/202607300340_movie_buff_analytics_rls_lockdown.sql`

## Hosted parity note

As of Thursday, July 30, 2026:

- there is no `.openai/hosting.json` in this repo
- `.env.local` still points at local Supabase services on `127.0.0.1`
- `.env.production.example` now defines the minimum hosted env names:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- the real hosted deployment target and real production values are still not defined in repo

That means hosted deployment parity is still an explicit launch task.

Repo-backed parity proof added on Friday, July 31, 2026:

- `npm run movie-buff:local-launch-suite` now provides the one-command local readiness gate for the currently proven launch-critical stack: migration presence, route health, public flow, private flow, private leave, public shared-leave, timer, analytics, pool health, and production build
- `npm run movie-buff:check-launch-migrations` now proves the required launch-critical migration files exist in this checkout
- `npm run movie-buff:check-deploy-env` still fails until real hosted environment values are defined
- `node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production.example` also fails correctly because the checked file still contains placeholder example values
- `npm run movie-buff:hosted-preflight -- --env-file .env.production.example --base-url http://127.0.0.1:3001` now proves the combined migration-check + env-check + route-health workflow runs in one command; it currently fails for the correct reason when env values are still placeholders
- `node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production.example --base-url http://127.0.0.1:3001 --full-suite` now proves the local launch-critical suite is green apart from hosted env parity: migrations, route health, public smoke, private smoke, timer smoke, and analytics verification all pass, while deploy-env still fails for the correct placeholder-value reason
- that same `--full-suite` gate now also includes both leave regressions: `leave_smoke` for private abandonment and `public_leave_smoke` for shared public in-round leave behavior
- `npm run movie-buff:warm-pool` now provides a scriptable ops path to pre-fill the live global pool before a session
- the latest `npm run movie-buff:pool-health` snapshot on Friday, July 31, 2026 shows the runtime reserve is no longer shallow in Buffster or any other lane: `primary fan 10 / buff 13 / buffster 19`, `secondary fan 23 / buff 49 / buffster 33`

## Rollback / recovery

If a gameplay flow breaks during testing:

1. stop using the affected path
2. capture the route, room id, and visible error
3. inspect:
   - `game_rooms`
   - `match_rounds`
   - `movie_buff_round_events`
4. verify app logs and browser console logs
5. if the issue is tied to the latest local change, revert the change in code and retest locally before reintroducing it

If the local app server is stuck:

1. stop the stuck node process
2. restart:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

If local Supabase is unhealthy:

1. inspect:

```powershell
supabase status
```

2. if needed, restart:

```powershell
supabase stop
supabase start
```

3. then re-apply pending local migrations:

```powershell
supabase migration up --local
```

## Minimum go / no-go rule

Do not call Movie Buff soft-launch-ready until all of these are true:

- public match flow is proven end to end
- private room flow is proven end to end
- answer submit is stable
- timer follows authoritative server state in live play
- admin movies and analytics pages load reliably
- clip playback is fast enough for live use
- enough clip variety exists to avoid obvious repetition
- a clear rollback path exists

## Immediate next actions

1. live-prove the 2-player public auto-start path
2. live-prove post-fix `Next Round`
3. live-prove final-results exit
4. run a short clip-latency and repeat-diversity sample
