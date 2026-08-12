# Movie Buff production setup worksheet

Date: Friday, July 31, 2026

## Purpose

This worksheet is the shortest path from the current locally verified Movie Buff
state to a real hosted soft-launch verification run.

Use it to collect the exact production values and decisions that remain useful
for production provenance and any remaining external launch gates.

For the latest hosted-state snapshot, see
[movie-buff-hosted-validation-status-2026-08-11.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-11.md).

August 11, 2026 addendum:

- the hosted runtime parity work itself is already complete
- this worksheet is now mainly useful for tracking environment provenance and
  any remaining external production decisions, not for proving first hosted
  gameplay readiness

## 1. Required production values

Fill every line before hosted verification.

| Variable | Where it comes from | Actual value | Done |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | production app host URL | | |
| `NEXT_PUBLIC_SUPABASE_URL` | hosted Supabase project settings | | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | hosted Supabase API settings | | |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | hosted Supabase API settings | | |

Rules:

- no placeholder values
- no local values
- no `localhost`
- no `127.0.0.1`

Quick source map:

- `NEXT_PUBLIC_APP_URL`: Vercel production URL or final custom domain
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project API/settings area -> project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase project API/settings area -> publishable or anon client key
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`: Supabase project API/settings area -> secret key (preferred) or legacy service role key

## 2. Deployment decisions

| Decision | Required answer | Final answer | Done |
|---|---|---|---|
| Production app host | where the Next.js app runs | | |
| Deploy command/path | how production deploys are triggered | | |
| Env storage | where production secrets are stored | | |
| Production Supabase project | exact project used for launch | | |
| Migration apply path | how SQL migrations are applied and verified | | |
| Media origin | where launch media is served from | | |
| Rollback path | how app + DB are reverted | | |

## 3. Launch-critical migrations

These must be applied in the hosted database:

- `202607300100_movie_buff_clip_analytics_and_round_timing.sql`
- `202607300220_movie_buff_playback_launch_timeout_buffer.sql`
- `202607300240_movie_buff_public_room_created_event_in_rpc.sql`
- `202607300310_movie_buff_public_match_autostart.sql`
- `202607300330_movie_buff_public_ready_autostart_rpc.sql`
- `202607300340_movie_buff_analytics_rls_lockdown.sql`
- `202607301430_movie_buff_public_matchmaking_creation_lock.sql`
- `202607301700_movie_buff_launch_gate_fast_media_only.sql`
- `202607311950_movie_buff_source_registry.sql`
- `202607311958_movie_buff_source_registry_grants.sql`

Hosted migration proof command:

```powershell
npm run movie-buff:check-launch-migrations
```

Hosted admin/source-registry fallback artifact:

```powershell
scripts\generated\movie-buff-hosted-source-registry-patch.sql
```

## 4. Hosted verification commands

Run these after the real production values are set:

```powershell
node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production
node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production --base-url https://your-real-host.example.com --full-suite
npm run movie-buff:check-bootstrap-artifacts
```

Expected hosted full-suite steps:

- `launch_migrations`
- `bootstrap_artifacts`
- `deploy_env`
- `route_health`
- `public_smoke`
- `auth_smoke`
- `private_smoke`
- `leave_smoke`
- `public_leave_smoke`
- `admin_smoke`
- `timer_smoke`
- `analytics_verifier`

## 5. Hosted go / no-go

Do not call Movie Buff hosted-launch-ready until every line is complete.

| Check | Status |
|---|---|
| Production env values are real and verified | |
| Hosted DB migrations are applied | |
| Hosted preflight passes | |
| Hosted public smoke passes | |
| Hosted private smoke passes | |
| Hosted leave smoke passes | |
| Hosted public leave smoke passes | |
| Hosted admin smoke passes | |
| Hosted timer smoke passes | |
| Hosted analytics verification passes | |
| Hosted rollback path is documented | |

## 6. Current honest status

As of Friday, July 31, 2026:

- local gameplay flow is strongly verified
- local admin proof is now verified
- local build is passing
- hosted parity is still blocked by missing real production values
