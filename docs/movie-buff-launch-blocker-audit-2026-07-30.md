# Movie Buff launch-blocker audit

Date: Thursday, July 30, 2026

August 11, 2026 addendum:

- this July 30 blocker audit is now historical
- for the current hosted-runtime truth, use:
  - [movie-buff-hosted-validation-status-2026-08-11.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-11.md)
- several blocker rows below still refer to hosted parity as future work
  because they were written before the August 11 hosted-runtime revalidation

## Scope

This audit switches Movie Buff into launch-blocker mode.

Work is grouped into three buckets only:

1. Launch blockers
2. Important but deferrable
3. Post-launch ideas

The purpose is speed to soft launch, not architecture expansion.

## Current evidence base

- [movie-buff-launch-readiness.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-launch-readiness.md)
- [movie-buff-clip-analytics-completion-audit.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-clip-analytics-completion-audit.md)
- `npm run movie-buff:verify-analytics`
- `npm run movie-buff:smoke-public`
- `npm run movie-buff:smoke-private`
- `npm run movie-buff:route-health`
- `npx tsc --noEmit`
- recent direct DB checks on `game_rooms`, `match_rounds`, `movie_buff_round_events`, `movie_buff_clip_analytics`, `content_media`, and `content_items`

## 1. Launch blockers

| Blocker | Owner area | Current status | Evidence | Next fix | Severity |
|---|---|---|---|---|---|
| Public match flow works end to end | Gameplay flow / matchmaking | Locally proven | Public match target was reduced from 6 players to 3 players for soft-launch practicality. On Thursday, July 30, 2026, public start gating was changed so public rooms no longer require a host-only click; any active room member can trigger start, public rooms require at least 2 ready players, and the waiting room now auto-starts when the public-ready condition is met. `npm run movie-buff:verify-analytics` proves two users land in the same public room, both become ready, the room advances to `status = active`, `current_round = 1`, a match row is created, round 1 is inserted, and `round_started.trigger = public_match_start`. A fresh Friday, July 31, 2026 rerun of `npm run movie-buff:smoke-public` also passed end to end through the same waiting room, ready check, all 10 rounds, and final results. That smoke path exposed and validated two real product fixes: `202607301430_movie_buff_public_matchmaking_creation_lock.sql` added a matchmaking-key transaction lock so simultaneous public players stop creating separate waiting rooms, and `202607301700_movie_buff_launch_gate_fast_media_only.sql` now excludes generated-on-demand clips from live launch rotation so public rounds no longer stall on 45-second media generation. | Keep the smoke test as the baseline regression check and rerun it against the hosted target once deployment parity exists. | Medium |
| Private room flow works end to end | Gameplay flow | Locally proven by browser smoke and earlier live run | On Thursday, July 30, 2026, `npm run movie-buff:smoke-private` completed a full private flow from lobby -> waiting room -> ready -> play -> round results -> next round through all 10 rounds -> final results. A fresh Friday, July 31, 2026 rerun also passed through final results. | Keep this smoke test as the baseline private-flow regression and rerun it against the hosted target once deployment parity exists. | Medium |
| Ready check works | Matchmaking / waiting room | Proven for current private and public waiting-room paths | Browser evidence shows `I'm Ready` changes visible state to `Ready`. DB evidence shows `player_ready` events. | Keep as monitored; no immediate code change unless public full-flow test exposes edge cases. | Medium |
| Round intro -> play -> results -> next round works reliably | Client routing / round flow | Live-proven for private flow | On Thursday, July 30, 2026, `Next Round` was clicked live from round 1 results and routed correctly to round 2 intro. The same routing path held through a full 10-round private match. | Reconfirm during public-match regression, but the private-flow route blocker is closed. | Medium |
| Answer submit works reliably | Play flow | Proven | Browser evidence showed submit transitioned to results; DB evidence recorded `answer_submitted` and answer outcome events. | Keep as monitored; no current blocker-level code change. | Medium |
| Hint behavior works correctly | Play flow | Proven for current private flow | Browser evidence showed hint deducts time without auto-starting playback. Verifier and runtime code support per-player hint events. | Keep as monitored; verify again during full public/private regression pass. | Medium |
| Timer only follows authoritative server state | Play flow / round timing | Locally proven | On Thursday, July 30, 2026, `npm run movie-buff:smoke-timer` proved the visible timer stays at `30` before playback, drops to `25` after hint use without starting playback, stays at `25` while still idle, and only starts decreasing after `Play Movie Clip` begins playback (`24`, then `22`). A fresh Friday, July 31, 2026 rerun reproduced that same sequence. The play page no longer runs a local decrement loop; it resyncs authoritative round state from the server every second. | Keep this timer smoke as a regression check and rerun it against the hosted target once deployment parity exists. | Medium |
| Clip playback is fast and stable enough for real users | Media delivery / pooling | Locally proven for current launch-gated pool | The prior stall class was isolated to generated-on-demand clips. A new launch gate now excludes those clips from live selection. After that change, `npm run movie-buff:smoke-public` completed all 10 rounds and final results without playback deadlock. Round-media delivery is now routed through `/api/movie-buff/round-media/:roundId`, the play page no longer trusts stale static paths directly, and the clipper now serves verified local assets immediately when present. | Keep the smoke test as the playback regression baseline and rerun it against the hosted target once deployment parity exists. | Medium |
| No dead buttons or broken routes in core flow | Client routing | Locally proven for the public smoke path | Waiting-room, intro, play, results, and final-results route surfaces were hardened to direct navigation. `npm run movie-buff:smoke-public` now proves lobby -> waiting room -> ready check -> play -> results -> next round -> final results across 10 full rounds without route deadlock. | Keep monitoring with the same smoke path and add one explicit leave/abandon regression pass for public flow. | Medium |
| Leave / back / exit flows exist where needed | Client routing / recovery | Locally proven for both private abandonment and public shared-match leave behavior | Waiting-room back/leave, intro leave, play leave, round-results leave, and final-results exit back to lobby are now live-proven. On Friday, July 31, 2026, `npm run movie-buff:smoke-leave` added explicit private abandonment proof from the live play screen: a private room advanced into round 1 play, `Leave Match` returned the player to the lobby, the room moved to `status = cancelled`, active player count fell to `0`, and analytics recorded both `player_left` and `match_abandoned` for the room. On the same day, `npm run movie-buff:smoke-public-leave` added explicit shared public-match leave proof, and a fresh rerun in the latest pass re-confirmed it: two players entered the same public room, both reached round 1 play, one player left back to the lobby, the room stayed `active`, active player count fell to `1`, and analytics recorded `player_left` without incorrectly writing `match_abandoned`. | Keep both leave regressions in the launch suite and rerun them against the hosted target once deployment parity exists. | Medium |
| Admin pages needed for live operations actually load | Admin / ops | Proven locally | On Thursday, July 30, 2026, `/admin/movies` loaded live with real rows and `/admin/analytics/clips` loaded live with tracked clip analytics data. A fresh local route audit still returns `200` for `/admin/movies`, `/admin/analytics/clips`, `/admin/analytics/matches`, `/admin/analytics/rotation`, and `/admin/analytics/qa` across 5 attempts each with rendered HTML and no application-error markers. On Friday, July 31, 2026, a real authenticated browser proof using a local admin session also verified `/api/admin/access` returned `200`, `/admin/movies` rendered the Movie Library admin shell, and `/admin/sources` rendered Source Registry content after the source-registry grant fix in `202607311958_movie_buff_source_registry_grants.sql`. The local source-registry data layer is also re-verified directly in Postgres: `content_sources` count = `6`, with expected approved/conditional sample rows. | Recheck the same pages against the hosted target once deployment parity exists, but this is no longer a top local launch blocker. | Medium |
| Enough playable movie coverage exists to avoid obvious repetition | Content / rotation | Improved, soft-launch viable but still limited for broader launch | An over-broad activation pass previously exposed `67` rows whose static public-domain MP4 files were missing on disk, which caused real `404` playback failures. The local reconciliation script `scripts/movie-buff-reconcile-static-media.mjs` deactivated that broken class, reducing the reliable local pool first to `38` active launch-safe video rows. Since then, additional verified static clips have been activated, bringing the current launch-safe source-backed pool to `49` active video rows. Public and private full-flow smoke tests still pass after the latest activation, so the added inventory did not reopen the earlier playback deadlock class. The active lane split now verified by `npm run movie-buff:pool-health` is `10` Fan / `22` Buff / `17` Buffster, with `56` additional inactive source-backed video rows still outside the live pool. On Friday, July 31, 2026, the global pool-warm path was repaired so warm-ready assets materialize on disk correctly. The latest `npm run movie-buff:pool-health` snapshot now shows the runtime pool materially above the original minimum launch depth across all lanes: `primary: fan 10 / buff 13 / buffster 19` and `secondary: fan 23 / buff 49 / buffster 33`. | Keep launch traffic on the reconciled fast-media pool for soft launch, keep the warmed reserve healthy with the new warm-pool command/API, continue adding only verified static assets, and only expand more aggressively after hosted parity is proven. | Medium |
| Rotation / pooling prevents stale repeats in real play | Media delivery / rotation | Improved, still needs hosted-target confidence | Weighted rotation verifier passes. The current balanced-spread picker performs better than the rejected stronger/flattened experiments, and the active lane split no longer collapses low-sample clips into `Buff`. Local evidence improved again on Friday, July 31, 2026 because the repaired global pool warmer now fills live-ready assets across all three lanes instead of leaving Buff/Buffster empty. The latest `npm run movie-buff:pool-health` snapshot shows a materially deeper runtime reserve than the earlier repaired baseline: `primary: fan 10 / buff 13 / buffster 19` and `secondary: fan 23 / buff 49 / buffster 33`. Full public and private smoke reruns still pass, and the verification suite is more stable now because the private smoke was hardened against one-off lobby navigation misses while the public smoke now waits for the actual `Start Round` control before treating round-intro as ready. The blocker is not fully cleared yet because broader live confidence is still pending hosted deployment parity, not because the local runtime pool is still shallow. | Keep the repaired lane prior and global warm path in place, use the new warm-pool ops path before soft launch sessions, and rerun diversity checks after hosted parity exists. | Medium |
| Critical analytics and failure events are captured | Analytics | Proven | Verifier now proves lifecycle, runtime-edge, and match-completion events including `match_completed`. | Keep as monitored. No blocker-level code change needed now. | Medium |
| Deployment / environment / runbook steps are documented | Ops / deployment | Improved, hosted parity still open | The launch runbook exists in `docs/movie-buff-soft-launch-runbook.md`, and dedicated deployment handoff documents now exist in `docs/movie-buff-deployment-parity-checklist.md`, `docs/movie-buff-production-handoff-pack.md`, `docs/movie-buff-production-setup-worksheet.md`, and `docs/movie-buff-vercel-supabase-production-setup.md`. On Thursday, July 30, 2026, the app also gained a real hosted-origin contract through `NEXT_PUBLIC_APP_URL`, a deploy-env validator at `npm run movie-buff:check-deploy-env`, and an auth redirect fix so fallback redirects no longer point at `http://localhost:3000`. On Friday, July 31, 2026, the repo also gained a launch-critical migration presence gate at `npm run movie-buff:check-launch-migrations`, a hosted recovery/bootstrap artifact gate at `npm run movie-buff:check-bootstrap-artifacts`, a one-command hosted-safe preflight at `npm run movie-buff:hosted-preflight`, a broader full-suite preflight mode, a local Buff Games auth smoke at `npm run movie-buff:smoke-auth`, and a scriptable pool-warm ops path at `npm run movie-buff:warm-pool` plus `/api/admin/analytics/warm-pool`. The current repo-backed gate picture is strong locally: `launch_migrations`, `bootstrap_artifacts`, `route_health`, `public_smoke`, `auth_smoke`, `private_smoke`, `leave_smoke`, `public_leave_smoke`, `admin_smoke`, `timer_smoke`, and `analytics_verifier` are now locally proven, while `deploy_env` still fails correctly because the checked production env file still contains placeholders. Hosted parity remains the top unresolved launch blocker because `npm run movie-buff:check-deploy-env` still fails with all four required hosted env vars missing, `node .\scripts\movie-buff-deployment-env-check.mjs --env-file .env.production.example` still fails because that file contains placeholders, the repo still has no `.openai/hosting.json`, and current env wiring is still local-only via `.env.local` pointing at `127.0.0.1` Supabase services. | Define the real hosted deployment target, production env vars, and migration-application path before launch, then rerun the smoke suite and hosted preflight against that target. | High |
| Analytics/event table security | Data security / ops | Locally fixed, monitor in hosted deployment | On Thursday, July 30, 2026, RLS was enabled for `movie_buff_round_events`, `movie_buff_clip_analytics`, and `movie_buff_movie_analytics`. Direct anon/authenticated table access was revoked, and service-role full-access policies were added. The local Supabase RLS advisor warning cleared, and admin analytics/movies pages still loaded after the change. | Reconfirm the same migration is present in the hosted environment before launch. | Medium |

## Highest-severity blockers right now

These are the top items to attack first:

1. Deployment / hosted-environment parity checks
2. Hosted-target reruns of the now-proven local gameplay regressions after deployment parity exists
3. Hosted admin parity and hosted full-suite reruns after deployment parity exists

## 2. Important but deferrable

- full global two-tier pool manager
- automated source-ingest watcher pipeline
- deeper analytics tuning
- advanced admin polish
- visual polish beyond core usability
- broader content automation beyond immediate launch needs

## 3. Post-launch ideas

- aggressive library expansion automation
- deeper ranking systems
- richer multiplayer board presentation
- advanced moderation / ops tooling
- large-scale ingest/watcher sophistication
- nonessential animation and presentation polish

## Suggested launch timeline from current state

- private/internal test-ready: 2 to 5 focused workdays
- soft launch-ready: about 1 to 2 weeks
- broader public-ready state: about 2 to 4 weeks

## Recommended next action

Work from highest severity downward.

Immediate next blocker to attack:

- define hosted deployment parity in-repo and then rerun the proven full suite against that hosted target: auth flow, public flow, private flow, leave regressions, timer, route health, analytics verification, bootstrap artifacts, and launch-migration presence.
