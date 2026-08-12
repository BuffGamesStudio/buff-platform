# Movie Buff production handoff pack

Date: Friday, July 31, 2026

## Purpose

This document is the exact handoff pack for getting Movie Buff from the current
locally verified state to a hosted soft-launch verification run.

It does not assume a specific host vendor. It does assume:

- the app will run as a Next.js production deployment
- Supabase will be the hosted backend
- the launch-critical migration set already proven locally must exist in the
  hosted database before any launch decision is made

Vendor-specific companion:

- [movie-buff-vercel-supabase-production-setup.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-vercel-supabase-production-setup.md)

Current hosted-state companion:

- [movie-buff-hosted-validation-status-2026-08-11.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-11.md)

## Current proven baseline

As of Friday, July 31, 2026, the following are already proven locally:

- Buff Games auth entry/session flow passes
- public match flow passes end to end
- private room flow passes end to end
- private in-round leave behavior passes
- shared public in-round leave behavior passes
- timer behavior follows authoritative server state
- analytics verification passes
- admin routes load
- route health passes
- runtime pool depth is no longer shallow:
  - primary: `fan 10 / buff 13 / buffster 19`
  - secondary: `fan 23 / buff 49 / buffster 33`

The top unresolved blocker is hosted deployment parity.

Fresh evidence update from Friday, July 31, 2026:

- `npm run movie-buff:smoke-public`: pass
- `npm run movie-buff:smoke-auth`: pass
- `npm run movie-buff:smoke-private`: pass
- `npm run movie-buff:smoke-public-leave`: pass
- `npm run movie-buff:smoke-admin`: pass
- `npm run movie-buff:smoke-timer`: pass
- `npm run movie-buff:check-bootstrap-artifacts`: pass
- `npm run movie-buff:check-launch-migrations`: pass
- `npm run movie-buff:check-deploy-env`: fail because the real production values are still missing
- `npm run build`: pass

Additional hosted recovery artifact now present:

- `scripts/generated/movie-buff-hosted-source-registry-patch.sql`
  - use this if hosted `/admin/sources` fails because the source-registry schema
    or grants are missing

## Section 1: required production values

Fill these with the real values before the hosted verification run.

| Variable | Required | Example shape | Actual value |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | yes | `https://moviebuff.example.com` | |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase anon/publishable key | |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase secret key (preferred) or legacy service role key | |

Rules:

- no local URLs
- no `localhost`
- no `127.0.0.1`
- no placeholder values
- do not reuse local development secrets

## Section 2: required deployment decisions

These decisions must be explicit before launch verification:

| Decision area | Question | Final decision |
|---|---|---|
| App host | Where will the production Next.js app run? | |
| Deploy trigger | How are production deploys started? | |
| Env storage | Where are production env vars stored? | |
| Supabase project | Which hosted Supabase project is production? | |
| Migration path | How will the required SQL migrations be applied and verified? | |
| Media origin | Where will launch media files be served from? | |
| Rollback | How will the team revert the app and database if hosted smoke fails? | |

## Section 3: launch-critical migration set

These migration files are the minimum hosted baseline:

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

Hosted rollout is not valid unless these are applied in the production
database.

## Section 4: hosted verification sequence

Run this in order.

### Step 1: validate the production env file

```powershell
node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production
```

Expected:

- pass
- no missing vars
- no placeholder vars
- no local-only values

### Step 2: confirm launch-critical migrations exist in repo

```powershell
npm run movie-buff:check-launch-migrations
```

Expected:

- pass

### Step 2B: confirm hosted recovery artifacts are present and current

```powershell
npm run movie-buff:check-bootstrap-artifacts
```

Expected:

- pass

### Step 3: deploy the app with the real production env vars

Use the chosen host vendor's normal production deploy path.

Record exactly what was used:

- deploy command:
- deployed app URL:
- deploy timestamp:
- deployed commit/revision:

### Step 4: pre-fill the runtime pool before the live smoke run

```powershell
npm run movie-buff:warm-pool 4
```

Expected:

- no request failure
- ready assets present across all three lanes

### Step 5: run the hosted full-suite preflight

```powershell
node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production --base-url https://your-real-host.example.com --full-suite
```

Expected:

- `launch_migrations`: pass
- `bootstrap_artifacts`: pass
- `deploy_env`: pass
- `route_health`: pass
- `public_smoke`: pass
- `auth_smoke`: pass
- `private_smoke`: pass
- `leave_smoke`: pass
- `public_leave_smoke`: pass
- `admin_smoke`: pass
- `timer_smoke`: pass
- `analytics_verifier`: pass

### Step 6: do one manual hosted operator pass

Manual checks:

- home page loads
- lobby loads
- public match can be entered
- private room can be created
- leave/back actions exist where expected
- admin movies page loads
- admin sources page loads
- admin analytics pages load
- no visible `localhost` redirects

## Section 5: hosted go / no-go sheet

Mark each item before soft launch:

| Check | Status |
|---|---|
| Production app URL defined | |
| Production Supabase URL defined | |
| Production publishable key defined | |
| Production service role key defined | |
| Launch-critical migrations applied in hosted DB | |
| Hosted full-suite preflight passes | |
| Public smoke passes against hosted target | |
| Private smoke passes against hosted target | |
| Private leave smoke passes against hosted target | |
| Public shared-leave smoke passes against hosted target | |
| Admin smoke passes against hosted target | |
| Timer smoke passes against hosted target | |
| Admin pages load on hosted target | |
| Runtime pool warmed before session | |
| Rollback path documented | |

No-go if any line above is incomplete or failed.

## Section 6: rollback procedure skeleton

If the hosted run fails after deploy:

1. stop new launch traffic
2. record:
   - hosted URL
   - room ID
   - route
   - failure time
   - visible error
3. revert the app deployment to the prior stable revision
4. if the failure is migration-related, apply the agreed DB hotfix or rollback
   plan
5. rerun route health before reopening any traffic

Record the real rollback commands here:

- app rollback command:
- DB rollback or hotfix command:
- operator owner:

## Section 7: fastest remaining path to soft launch

The shortest remaining path from current evidence is:

1. choose the real production host
2. fill the real production env values
3. apply the launch-critical migrations to the hosted DB
4. deploy
5. run the hosted full suite
6. if all checks pass, run a small invited soft-launch session

That is the current bottleneck. The main gameplay flow is no longer the
highest-risk area based on local evidence.
