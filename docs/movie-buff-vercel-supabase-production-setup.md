# Movie Buff Vercel + Supabase production setup

Date: Friday, July 31, 2026

## Purpose

This is the exact production-setup guide for launching Movie Buff on:

- Vercel for the Next.js app
- Supabase for auth, database, realtime, and server-side admin/runtime access

It assumes the repo is already locally verified. For the latest live blocker
snapshot, see
[movie-buff-live-status-2026-08-09.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-live-status-2026-08-09.md).

## 1. Create or confirm the production Vercel project

Use the Vercel project import flow for a Git repository-backed Next.js app.

Target result:

- one Vercel project for `buff-platform`
- production branch set correctly
- production deploys triggered from the intended branch

Movie Buff-specific check:

- the deployed app URL must become the final value for:
  - `NEXT_PUBLIC_APP_URL`

## 2. Collect the real production Supabase values

Movie Buff currently requires these exact values:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_APP_URL` | final Vercel production URL or custom domain |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key for browser/client use |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Supabase elevated server key for protected server/admin operations |

Important rules:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the client-safe key
- `SUPABASE_SECRET_KEY` is preferred for new setup
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` must never be exposed in browser code
- do not use local `127.0.0.1` values
- do not leave placeholder values in production

## 2A. Where to get each value

Use this map so the remaining hosted blocker is mechanical rather than guesswork.

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Vercel project production URL or the final custom domain attached to the Vercel project |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project dashboard API/settings area -> project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project dashboard API/settings area -> publishable or anon client key |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Supabase project dashboard API/settings area -> secret key (preferred) or legacy service role key |

Recommended collection order:

1. confirm the Vercel production project
2. confirm the final production app URL
3. open the production Supabase project
4. copy the project URL
5. copy the publishable key
6. copy the secret key (preferred) or the legacy service role key
7. place all four values into Vercel project environment variables

Movie Buff-specific validation rules:

- if `NEXT_PUBLIC_APP_URL` still points at a temporary preview URL, auth redirects are not final
- if `NEXT_PUBLIC_SUPABASE_URL` does not match the intended production Supabase project, hosted smoke results are invalid
- if neither `SUPABASE_SECRET_KEY` nor `SUPABASE_SERVICE_ROLE_KEY` is present, admin/runtime server operations will fail even if public pages load

## 3. Add the env vars in Vercel

In the Vercel project settings, add the four required variables.

Set them for:

- Production
- Preview

Recommended value mapping for Movie Buff:

| Vercel variable | Example |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://movie-buff.yourdomain.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-ref.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (preferred) or legacy service role key |

Movie Buff-specific caution:

- `NEXT_PUBLIC_APP_URL` must match the real app origin used for auth redirects
- `SUPABASE_SECRET_KEY` should be used for new setup when available
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` must be stored only as a server environment variable in Vercel

## 4. Create a real local production env file for verification

Before hosted verification, create a real `.env.production` file locally with
the actual values.

Then run:

```powershell
node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production
```

Expected:

- pass
- no missing values
- no placeholders
- no local-only values

## 5. Apply the launch-critical Supabase migrations to the hosted project

Movie Buff hosted parity is not valid until the hosted Supabase database has the
launch-critical migration set applied.

Current required set:

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

Repo presence check:

```powershell
npm run movie-buff:check-launch-migrations
```

That only proves the files exist in this checkout. It does not prove the hosted
database already has them.

If hosted authenticated admin checks fail because `/admin/sources` is missing
its source-registry schema or grants, apply this hosted recovery artifact in
the Supabase SQL editor before re-running hosted admin verification:

```powershell
scripts\generated\movie-buff-hosted-source-registry-patch.sql
```

## 6. Deploy the app on Vercel

After env vars are present and the hosted DB is ready:

- deploy the Vercel project
- record the final production URL
- confirm the deployed build points at hosted Supabase, not local services

Record:

- production URL
- deploy timestamp
- commit/revision
- production branch used

## 7. Run the hosted Movie Buff verification sequence

After deployment, run:

```powershell
node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production --base-url https://your-real-host.example.com --full-suite
```

Expected suite:

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

## 8. Manual hosted operator pass

After the automated suite passes, verify manually:

- home page loads
- sign-in and sign-up routes load
- Buff Games account entry works
- Movie Buff lobby loads
- public match entry works
- private room entry works
- leave/back flows exist
- `/admin/movies` loads
- `/admin/sources` loads
- analytics pages load
- no route redirects to `localhost` or `127.0.0.1`

## 9. Current honest blocker

As of Sunday, August 9, 2026, the remaining blocker is no longer local
gameplay flow or release-control provenance.

It is:

- a fresh production-like baseline restore or equivalent new rehearsal target
  for the exact successor rerun on head
  `8e63d87af755b3829d4a0f1782d9c850d835e25b`
- any hosted mutation needed to run that exact successor rehearsal
- final merge/promotion decisions after that fresh rehearsal exists

Supporting status:

- authenticated Seat-4 successor head control is complete
- successor hash rebinding is complete
- disposable localhost successor rollback/reapply proof is complete on PR
  `#227` run `31307664441`
- production content-engine parity is still absent on the live August 1
  deployment

## References used

- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel deployment environments: https://vercel.com/docs/deployments/environments
- Vercel GitHub deploy flow: https://vercel.com/docs/git/vercel-for-github
- Vercel Next.js deployment docs: https://vercel.com/docs/frameworks/full-stack/nextjs
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase secure data guidance: https://supabase.com/docs/guides/database/secure-data
