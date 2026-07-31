# Movie Buff launch completion audit

Date: Friday, July 31, 2026

## Purpose

This audit answers one question only:

Is Movie Buff actually at a ready launch state right now?

The answer must be based on current evidence, not intent.

## Completion standard used

For this goal, launch-ready means the following are proven, not assumed:

1. public matchmaking flow works end to end
2. private room flow works end to end
3. ready check works
4. round intro -> play -> results -> next round works reliably
5. answer submit works reliably
6. hint behavior works correctly
7. timer only follows authoritative server state
8. no dead buttons or broken routes in core flow
9. leave / back / exit flows exist where needed
10. admin pages needed for live operations load
11. clip delivery is fast and stable enough for live play
12. pool / rotation behavior avoids stale repeats well enough for soft launch
13. enough playable movie coverage exists for soft launch
14. analytics capture key gameplay and failure events
15. deployment requirements and go-live steps are documented
16. hosted deployment parity is proven against the real target

## Evidence base

Current repo-backed evidence:

- `npm run movie-buff:local-launch-suite`
- `npm run movie-buff:smoke-public`
- `npm run movie-buff:smoke-auth`
- `npm run movie-buff:smoke-private`
- `npm run movie-buff:smoke-leave`
- `npm run movie-buff:smoke-public-leave`
- `npm run movie-buff:smoke-timer`
- `npm run movie-buff:check-bootstrap-artifacts`
- `npm run movie-buff:verify-analytics`
- `npm run movie-buff:pool-health`
- `node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production.example --base-url http://127.0.0.1:3001 --full-suite`
- `npm run build`
- current launch docs in `docs/`
- fresh Friday, July 31, 2026 reruns from this pass:
  - `npm run movie-buff:smoke-public`
  - `npm run movie-buff:smoke-auth`
  - `npm run movie-buff:smoke-private`
  - `npm run movie-buff:smoke-public-leave`
  - `npm run movie-buff:smoke-timer`
  - `npm run movie-buff:check-bootstrap-artifacts`
  - `npm run movie-buff:check-launch-migrations`
  - `npm run movie-buff:check-deploy-env`
  - `node .\scripts\movie-buff-hosted-preflight.mjs --env-file .env.production.example --base-url http://127.0.0.1:3001`

## Requirement-by-requirement audit

| Requirement | Current verdict | Evidence | Gap |
|---|---|---|---|
| Public matchmaking flow works end to end | Proven locally, not hosted-proven | On Friday, July 31, 2026, a fresh rerun of `movie-buff:smoke-public` passed through the same room, ready check, 10 rounds, and final results. Analytics verifier also proves shared room and `public_match_start` path. | still needs hosted rerun |
| Private room flow works end to end | Proven locally, not hosted-proven | On Friday, July 31, 2026, a fresh rerun of `movie-buff:smoke-private` passed through final results across 10 rounds. | still needs hosted rerun |
| Ready check works | Proven locally, not hosted-proven | public and private smoke passes; analytics include `player_ready` | still needs hosted rerun |
| Round intro -> play -> results -> next round works reliably | Proven locally, not hosted-proven | public and private smoke both advance through full rounds | still needs hosted rerun |
| Answer submit works reliably | Proven locally, not hosted-proven | public/private smoke and analytics verifier both record answer path | still needs hosted rerun |
| Hint behavior works correctly | Proven locally, not hosted-proven | A fresh Friday, July 31, 2026 rerun of `movie-buff:smoke-timer` proved hint deducts time and does not auto-start playback. | still needs hosted rerun |
| Timer only follows authoritative server state | Proven locally, not hosted-proven | A fresh Friday, July 31, 2026 rerun of `movie-buff:smoke-timer` passed with the authoritative sequence `30 -> 25 -> 25 -> 24 -> 22`. | still needs hosted rerun |
| No dead buttons or broken routes in core flow | Proven locally, not hosted-proven | local launch suite passes; route health passes; public/private/leave smoke paths pass | still needs hosted rerun |
| Leave / back / exit flows exist where needed | Proven locally, not hosted-proven | `movie-buff:smoke-leave` and a fresh Friday, July 31, 2026 rerun of `movie-buff:smoke-public-leave` both pass with DB-backed verification. The public leave rerun proved one player can leave round 1 back to the lobby while the room stays `active`, active player count drops to `1`, and `player_left` is recorded without false `match_abandoned`. | still needs hosted rerun |
| Admin pages needed for live operations load | Proven locally, not hosted-proven | route health now returns `200` for `/admin/movies`, `/admin/sources`, `/admin/analytics/clips`, `/admin/analytics/rotation`, `/admin/analytics/qa`, and `/admin/analytics/matches`. On Friday, July 31, 2026, a fresh authenticated browser proof using a real admin session also passed `/api/admin/access`, rendered the `/admin/movies` library shell, and rendered `/admin/sources` with live registry content after the source-registry grant fix. Local DB evidence confirms `content_sources` count = `6`. | still needs hosted rerun |
| Clip delivery is fast and stable enough for live play | Proven locally for current launch-gated pool, not hosted-proven | public/private smoke pass; launch gate excludes on-demand generation stalls | still needs hosted rerun |
| Pool / rotation behavior avoids stale repeats well enough for soft launch | Soft-launch viable locally, not fully broad-launch proven | `movie-buff:pool-health` shows healthy primary/secondary reserve; analytics verifier proves weighted rotation and gating | still needs hosted rerun and broader live confidence |
| Enough playable movie coverage exists for soft launch | Soft-launch viable locally | `49` active launch-safe source-backed rows; lane split `10 / 22 / 17`; warmed reserve materially above original minimums | broader launch coverage still limited |
| Analytics capture key gameplay and failure events | Proven locally | `movie-buff:verify-analytics` proves lifecycle, runtime-edge, completion, public start, failure, and abandonment events | still needs hosted rerun |
| Deployment requirements and go-live steps are documented | Proven | deployment checklist, soft-launch runbook, and production handoff pack all exist and align with current scripts | none in repo |
| Buff Games auth entry/session flow works | Proven locally, not hosted-proven | On Friday, July 31, 2026, `movie-buff:smoke-auth` passed and proved sign-in route load, sign-up route load, account creation through the auth layer, signed-in account shell load, session persistence across reload, sign-out redirect, and signed-out account-shell state in a clean browser context. | still needs hosted rerun |
| Hosted deployment parity is proven against the real target | Not proven | A fresh Friday, July 31, 2026 rerun of `movie-buff:check-launch-migrations` passed. A fresh rerun of `movie-buff:check-deploy-env` failed because all four production values are still missing from `process.env`. A fresh rerun of `movie-buff-hosted-preflight --env-file .env.production.example --base-url http://127.0.0.1:3001` failed exactly because `.env.production.example` still contains placeholder values for all four required production keys. | real production URL, real Supabase values, migration application, and hosted rerun are still missing |

## Bottom-line verdict

Movie Buff is not yet proven fully launch-ready.

It is locally soft-launch-viable in the current development environment.

It is not yet hosted-launch-proven.

## What is actually finished

Finished to a strong local standard:

- public flow
- auth flow
- private flow
- leave flows
- timer behavior
- analytics capture
- admin route loading
- pool warm path
- deployment/runbook documentation
- unified full-suite local launch gate

## What is not finished

Not finished because evidence is still missing:

- real hosted deployment parity
- real production env values
- hosted database migration application proof
- hosted rerun of the full suite
- hosted admin verification
- hosted route-health verification

## Exact remaining blockers

1. Production environment values are not real yet
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. No real hosted target has been verified
   - no hosted full-suite pass
   - no hosted admin-route pass
   - no hosted leave-regression pass

3. Hosted migration state is not yet proven
   - repo presence is proven
   - hosted application is not

4. Hosted admin parity is still missing
   - local admin proof is now present
   - hosted `/admin/movies` and `/admin/sources` still need real authenticated verification

## Current truthful status statement

As of Friday, July 31, 2026, Movie Buff is locally verified across its
launch-critical gameplay and analytics flows, but it is not yet fully launch-ready
because hosted deployment parity has not been proven against a real production
target.
