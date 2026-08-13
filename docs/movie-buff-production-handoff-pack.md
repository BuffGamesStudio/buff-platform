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

- [movie-buff-hosted-validation-status-2026-08-12.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-12.md)

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

August 11, 2026 addendum:

- hosted runtime parity is now proven on the live production alias
  `https://movie-buff-sigma.vercel.app`
- current hosted/runtime status is tracked in:
  - [movie-buff-hosted-validation-status-2026-08-12.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-12.md)
- the top remaining gaps are no longer "can the hosted app run the game?"
- the remaining gaps are now external gates such as broader Supabase
  production reconciliation, reviewer acceptance, and any human-controlled
  promotion or production-data decisions

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

## Current ARM packet — 2026-08-13

The current locally verified candidate reached the final hosted gate. The
following ARM operations are now recorded as completed:

1. Applied
   [`20260812130000_movie_buff_match_visibility_policy_repair.sql`](C:/Users/shapa/BuffGames/buff-platform/supabase/migrations/20260812130000_movie_buff_match_visibility_policy_repair.sql)
   to Supabase project `yfatwreicmiocdxzyznd`; the production ledger records
   version `20260813010036`.
2. Verified the production `pg_policies` definitions for `match_players` and
   `match_rounds` contain `is_movie_buff_match_member(match_id)` and no
   `mine.match_id = mine.match_id` or `mp.match_id = mp.match_id` tautology.
3. Ran the disposable two-persona cross-match isolation acceptance against
   production in a transaction-scoped SQL harness. Each persona saw exactly
   its own player and round rows, no cross-match rows, and the transaction was
   rolled back. The fail-closed Node smoke remains available for a future
   operator run with the production env file and both explicit opt-ins:

   ```powershell
   $env:MOVIE_BUFF_POLICY_ISOLATION_ENV_FILE = ".env.production"
   $env:MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION = "1"
   $env:MOVIE_BUFF_POLICY_ISOLATION_ALLOW_PRODUCTION = "1"
   npm run movie-buff:smoke-policy-isolation
   ```

   That Node run creates temporary users and matches, checks exact membership
   and no cross-match visibility, then deletes its fixtures. Preserve its JSON
   output if it is used.
4. Keep `movie-buff-sigma.vercel.app` on the current main deployment unless a
   human explicitly selects a different READY deployment. The latest READY
   deployment is from a separate branch and is not the current validated
   candidate.
5. A preview-only deployment attempt of the current dirty workspace was made
   after adding `.vercelignore`; the payload was reduced to 330 MB but the
   upload aborted at 82.5 MB with Vercel `fetch failed` errors. No new preview
   deployment was created, and no promotion was attempted.

No Vercel promotion, merge, or secret rotation was performed. The public alias
remains on the existing main deployment; the latest READY deployment is from
a separate branch and the current worktree candidate is uncommitted.
- operator owner:

## Section 7: fastest remaining path to soft launch

The shortest remaining path from current evidence is:

1. preserve the current hosted-validation evidence on the live alias
2. preserve the current repo/runtime alignment on `main`
3. resolve the remaining non-runtime gates outside this repo surface:
   - Supabase production reconciliation and any authorized DB changes
   - reviewer / MOV-19 acceptance
   - any explicit human launch or promotion decision
4. if those gates clear, run the invited soft-launch session against the
   already-live production alias

That is the current bottleneck. The main gameplay flow is no longer the
highest-risk area based on current hosted evidence.

## Superseding cutover update — 2026-08-13

The previous sections preserve the pre-cutover handoff history. The current
release is live on the `movie-buff-sigma.vercel.app` production alias as READY
deployment `dpl_JCwqLbqJhX6EEVgdMFqWeFzz1SJz`, bound to production Supabase
`yfatwreicmiocdxzyznd`.

The per-player Movie Buff round flow is production-accepted: each player can
start playback independently, inactive players are auto-launched at the
deadline, each player answers against their own playback clock, and submitted
players wait until all active players finish before the shared phase advances.
The final production smoke completed all 10 rounds, including a mixed manual /
automatic first round, and its disposable room and accounts were cleaned up.

The remaining source-control follow-up is to commit and push the dirty working
tree so future Git deployments reproduce this exact release. Supabase advisor
warnings remain a separate security/performance review item, not a blocker for
the accepted gameplay behavior.

## Superseding release verification — 2026-08-13

The gameplay release is committed as
`699d7b2a1cd57e59e485da46124af2f977d5c6d9` (`feat(movie-buff): ship
per-player round flow`). The follow-up documentation is also pushed, and the
worktree was clean after both commits.

Vercel automatically built that exact commit as READY production deployment
`dpl_2i5rxw6CnTMvZVe9mfhwBsaf6oCt`, with aliases
`movie-buff-sigma.vercel.app`, `movie-buff-shaheed1.vercel.app`, and
`movie-buff-git-main-shaheed1.vercel.app`. The compiled bundle is bound to
production Supabase ref `yfatwreicmiocdxzyznd`. Static route health, the
production build, lint, migration gate, bootstrap gate, and smoke-script syntax
checks pass.

The production migration ledger includes the policy repair and all six
per-player playback/answer migrations. A fresh policy read confirms both
authenticated match-visibility policies use `is_movie_buff_match_member` and
contain no tautological self-comparisons. The current Supabase advisor counts
remain a separate backlog: 57 security notices and 108 performance notices;
no advisor remediation was applied during this release verification.

The repository's ignored local `.env.production` still points at rehearsal
Supabase ref `eiamucxbestinitydkvu`; it is not evidence for Vercel's production
binding and must not be used to run production behavioral smoke. The attempted
exact-deployment rerun was correctly blocked by that mismatch, while the
previous production three-client, ten-round acceptance remains the gameplay
evidence for this same deployed source state.
