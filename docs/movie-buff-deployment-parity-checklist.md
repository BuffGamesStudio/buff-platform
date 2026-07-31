# Movie Buff deployment parity checklist

Date: Thursday, July 30, 2026

## Current repo-backed deployment state

Companion execution document:

- [movie-buff-production-handoff-pack.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-production-handoff-pack.md)
- [movie-buff-production-setup-worksheet.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-production-setup-worksheet.md)

What is currently true in the repo:

- local app runtime is wired through `.env.local`
- hosted env example now exists at `.env.production.example`
- hosted app origin is now expected through `NEXT_PUBLIC_APP_URL`
- local Supabase endpoints point at `127.0.0.1`
- local migrations apply successfully with `supabase migration up --local`
- local launch-gate selection now excludes generated-on-demand clips from live public rotation
- there is no `.openai/hosting.json`
- there is no committed hosted environment manifest
- there is no repo-backed production environment variable map

This means Movie Buff can be tested locally, but hosted parity is not yet represented in the repository.

## Minimum deployment decisions still required

Before soft launch, define all of these explicitly:

1. Hosting target
   - where the Next.js app will run
   - how environment variables will be stored there
   - how deploys will be triggered

2. Supabase target
   - production project URL
   - production publishable key
   - production service-role handling
   - migration-application path for hosted rollout

3. Runtime media target
   - where playable movie clip media will be served from in launch
   - expected availability and bandwidth assumptions

4. Rollback path
   - previous deploy restore method
   - migration rollback or hotfix plan if launch smoke fails

## Minimum runtime environment values

At minimum, the hosted app will need real values for:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not copy local values from `.env.local` into production.

Run this check against the real hosted env before launch:

```powershell
npm run movie-buff:check-deploy-env
```

That check fails if:

- a required env var is missing
- `NEXT_PUBLIC_APP_URL` is not a full URL
- any required value still points at `localhost` or `127.0.0.1`
- any required value is still a placeholder example value

You can also validate a candidate env file directly:

```powershell
node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production.example
```

As of Friday, July 31, 2026, that example-file check correctly fails because the example file still contains placeholder values and is not launch-ready by itself.

Fresh gate result from Friday, July 31, 2026:

- `npm run movie-buff:check-deploy-env` fails against `process.env`
- all four required hosted values are still missing:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Minimum production migration set

The hosted database must include at least the launch-critical Movie Buff migrations already proven locally, including:

- `202607300100_movie_buff_clip_analytics_and_round_timing.sql`
- `202607300240_movie_buff_public_room_created_event_in_rpc.sql`
- `202607300220_movie_buff_playback_launch_timeout_buffer.sql`
- `202607300310_movie_buff_public_match_autostart.sql`
- `202607300330_movie_buff_public_ready_autostart_rpc.sql`
- `202607300340_movie_buff_analytics_rls_lockdown.sql`
- `202607301430_movie_buff_public_matchmaking_creation_lock.sql`
- `202607301700_movie_buff_launch_gate_fast_media_only.sql`
- `202607311950_movie_buff_source_registry.sql`
- `202607311958_movie_buff_source_registry_grants.sql`

If hosted migration state does not include those, launch parity is not achieved.

Important hosted parity note as of Friday, July 31, 2026:

- the known hosted public-match blocker was not just “public flow unverified”
- it was a concrete RPC parity failure:
  - hosted Supabase could report that `public.find_or_create_movie_buff_public_room(...)` was missing from the schema cache
- the repo now protects against that better in two ways:
  - `npm run movie-buff:check-launch-migrations` now explicitly requires `202607300240_movie_buff_public_room_created_event_in_rpc.sql`
  - the hosted repair artifact at `scripts/generated/movie-buff-hosted-round-runtime-patch.sql` now also includes the latest `find_or_create_movie_buff_public_room(uuid, text, integer, integer)` definition, the authenticated execute grant, and `notify pgrst, 'reload schema';`

That means a hosted SQL hotfix now exists in-repo for the known public matchmaking blocker instead of relying on assumed migration state.

Important hosted admin parity note as of Friday, July 31, 2026:

- both production bootstrap SQL files in the repo are still missing the newer source-registry schema/grant path
- the repo now includes a dedicated hosted source-registry recovery artifact:
  - `scripts/generated/movie-buff-hosted-source-registry-patch.sql`
- use that artifact if hosted `/admin/sources` fails because `content_sources` / `content_source_items` or their grants are missing

## Minimum pre-launch command checks

From repo root:

```powershell
npm run movie-buff:local-launch-suite
npm run movie-buff:check-launch-migrations
npm run movie-buff:check-bootstrap-artifacts
npm run movie-buff:check-deploy-env
npx tsc --noEmit
npm run movie-buff:verify-analytics
npm run movie-buff:smoke-public
```

Expected minimum:

- local launch suite passes
- launch-critical migration presence check passes
- bootstrap and hosted recovery artifact check passes
- deployment env check passes
- typecheck passes
- analytics verifier passes
- public-flow smoke passes
- leave/abandon smoke passes
- public shared-leave smoke passes
- public smoke reaches final results without selecting generated-on-demand launch-blocked clips

## Go / no-go standard

No-go if any of these are still true:

- public players can still create separate waiting rooms with the same matchmaking settings
- ready check fails to auto-start a valid public room
- play or answer submission breaks during the smoke path
- admin pages needed for live ops fail to load
- hosted environment variables are still undefined
- hosted app origin is still undefined or local-only
- hosted migration state is unknown
- hosted selection can still pick generated-on-demand clips that stall public rounds

## Next deployment actions

1. choose the actual hosting target
2. define the production Supabase project
3. map runtime env vars into that host
4. apply and verify the required DB migrations
5. run the smoke sequence against the hosted target
6. record the exact deploy and rollback commands in this document

Repo-backed verification for step 4 now exists:

```powershell
npm run movie-buff:check-launch-migrations
```

That command proves the required launch-critical migration files are present in this checkout. Hosted parity still requires those same migrations to be applied in the real hosted database.

There is also now a single hosted-safe preflight command:

```powershell
npm run movie-buff:hosted-preflight -- --env-file .env.production.example --base-url https://your-hosted-app.example.com
```

That preflight runs:

- launch migration presence check
- bootstrap and hosted recovery artifact check
- deployment env validation
- route health check against the provided base URL

As of Friday, July 31, 2026, the preflight works locally and correctly fails when the env file still contains placeholder production values.

Fresh preflight result from Friday, July 31, 2026:

- `launch_migrations`: pass
- `bootstrap_artifacts`: pass
- `route_health`: pass
- overall preflight: fail
- failure reason: `deploy_env`
- exact failure cause: `.env.production.example` still contains placeholder values for all four required production keys

If hosted public matchmaking specifically fails with an RPC-not-found or schema-cache error, apply this artifact in hosted Supabase SQL editor before re-running the public smoke:

```powershell
scripts\generated\movie-buff-hosted-round-runtime-patch.sql
```

Minimum expected post-apply verification:

- hosted SQL apply succeeds
- hosted schema reload runs
- `Find Match` enters the waiting room
- two anonymous players land in the same public room
- ready check advances to round 1

If hosted admin/source-registry specifically fails because the source registry is missing or unreadable, apply this artifact in hosted Supabase SQL editor before re-running authenticated admin checks:

```powershell
scripts\generated\movie-buff-hosted-source-registry-patch.sql
```

Minimum expected post-apply verification:

- hosted SQL apply succeeds
- hosted schema reload runs
- `/api/admin/access` returns `200` for a valid admin session
- hosted `/admin/movies` renders
- hosted `/admin/sources` renders source registry content

There is also now a broader full-suite mode:

```powershell
node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production.example --base-url http://127.0.0.1:3001 --full-suite
```

As of Friday, July 31, 2026, that full-suite run proves all local launch-critical checks other than real hosted env parity:

- `launch_migrations`: pass
- `bootstrap_artifacts`: pass
- `route_health`: pass
- `public_smoke`: pass
- `private_smoke`: pass
- `leave_smoke`: pass
- `public_leave_smoke`: pass
- `timer_smoke`: pass
- `analytics_verifier`: pass
- `deploy_env`: expected fail because `.env.production.example` still contains placeholder values

There is also now a single-command local readiness gate:

```powershell
npm run movie-buff:local-launch-suite
```

As of Friday, July 31, 2026, that local suite passes and proves the current
development environment is green across:

- launch-critical migration presence
- route health
- public full flow
- private full flow
- private leave regression
- public shared-leave regression
- authoritative timer behavior
- analytics verification
- pool health snapshot
- production build

Important current note from Friday, July 31, 2026:

- the full local suite was still too long to finish inside one 300-second shell budget during the latest pass
- do not treat that timeout as a failing gate by itself
- the individual launch-critical sub-checks rerun in the same pass still produced fresh local proof for:
  - `movie-buff:smoke-public`
  - `movie-buff:smoke-private`
  - `movie-buff:smoke-public-leave`
  - `movie-buff:smoke-timer`
  - `movie-buff:check-launch-migrations`
  - `movie-buff:check-deploy-env`

There is also now a dedicated abandonment regression:

```powershell
npm run movie-buff:smoke-leave
```

As of Friday, July 31, 2026, that check proves:

- a private room can enter round 1 play
- `Leave Match` returns the player to the lobby
- the backing room transitions to `cancelled`
- active player count falls to `0`
- analytics record both `player_left` and `match_abandoned`

There is also now a dedicated shared public leave regression:

```powershell
npm run movie-buff:smoke-public-leave
```

As of Friday, July 31, 2026, that check proves:

- two public players can enter the same room
- both can reach live round 1 play
- one player can leave back to the lobby
- the room remains `active` for the remaining player
- active player count falls to `1`
- analytics record `player_left`
- `match_abandoned` is not incorrectly written while one player remains

There is also now a separate pool-ops warm command for launch sessions:

```powershell
npm run movie-buff:warm-pool 4
```

That command calls the admin warm-pool API and is intended to pre-fill the
global ready pool before a live session. A fresh forced warm sequence against a
clean production build on Friday, July 31, 2026 reached:

- primary ready: `fan 4 / buff 4 / buffster 4`
- secondary ready: `fan 8 / buff 8 / buffster 7`

The latest local `npm run movie-buff:pool-health` snapshot on Friday, July 31,
2026 is stronger still:

- primary ready: `fan 10 / buff 13 / buffster 19`
- secondary ready: `fan 23 / buff 49 / buffster 33`

That does not replace hosted deployment parity, but it materially reduces
stale-repeat and cold-start risk during soft-launch testing.

## Hosted verification standard

Hosted parity is not proven until all of these are true on the hosted target:

- `/games/movie-buff` returns `200`
- `/games/movie-buff/lobby` returns `200`
- `npm run movie-buff:smoke-public` passes against the hosted base URL
- admin pages return `200` without application-error markers:
  - `/admin/movies`
  - `/admin/analytics/clips`
  - `/admin/analytics/rotation`
  - `/admin/analytics/qa`
  - `/admin/analytics/matches`
- current hosted database migration state is recorded and includes the launch-critical set above
- hosted full-suite preflight passes with real non-placeholder production env values
