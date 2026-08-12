# Movie Buff launch readiness audit

Date: July 30, 2026

## Purpose

This document separates what is already proven from what is still a launch blocker.

It uses current repo state, current local verifier output, and recent local browser/runtime verification as the evidence base.

August 11, 2026 addendum:

- this July 30 launch-readiness audit is now historical
- for the current hosted-runtime truth, use:
  - [movie-buff-hosted-validation-status-2026-08-11.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-11.md)
- many of the blocker statements below were based on pre-hosted-parity local
  evidence and are no longer the latest state for the live production alias

## Evidence used

- pre-build and completion docs:
  - `docs/movie-buff-clip-analytics-prebuild.md`
  - `docs/movie-buff-clip-analytics-completion-audit.md`
  - `docs/movie-buff-global-pool-prebuild-review.md`
- implementation files:
  - `src/lib/game/movieBuffAnalytics.ts`
  - `src/lib/server/movieClipper.ts`
  - `src/lib/server/movieBuffAnalyticsAdmin.ts`
  - `src/app/games/movie-buff/**/*`
  - `src/app/admin/analytics/**/*`
- current verification commands run on July 30, 2026:
  - `npm run movie-buff:verify-analytics`
  - `npx tsc --noEmit`
  - `npx eslint src/lib/game/movieBuffAnalytics.ts src/lib/server/movieClipper.ts src/lib/server/movieBuffAnalyticsAdmin.ts src/app/admin/analytics/clips/page.tsx src/app/admin/analytics/rotation/page.tsx src/app/admin/analytics/qa/page.tsx src/app/admin/analytics/matches/page.tsx scripts/verify-movie-buff-analytics.mjs`

## Verified working now

### Analytics, scoring, and rotation core

Status: Verified

What is proven:

- movie-level analytics are aggregated and refreshed
- clip-level analytics are aggregated and refreshed
- round and match events are captured
- difficulty, quality, rotation, and admin-boost signals are computed
- weighted rotation prefers stronger clips and suppresses weak clips
- cooldown and quality gating still apply even when admin boost is present

Direct evidence from `npm run movie-buff:verify-analytics`:

- aggregate clip stats updated:
  - `totalPlays: 1`
  - `totalCorrect: 1`
  - `totalHintsUsed: 1`
  - `avgAnswerTimeSeconds: 12.5`
  - `difficultyScore: 47.19`
  - `systemDifficultyLabel: "Buff"`
  - `qualityScore: 100`
  - `rotationWeight: 16.25`
- weighted selection favored the stronger clip:
  - high-weight clip chosen `119` times
  - low-weight clip chosen `1` time
- admin override scenario proved:
  - healthy clips moved from `35` to `47.6` rotation weight after `adminBoost: 3`
  - weak clip collapsed to `rotationWeight: 0` and `status: "cooling_down"` even with `adminBoost: 3`
- runtime edge scenario proved:
  - `clip_failed_to_load`, `media_ready`, `timeout`, and `match_abandoned` events were accepted
  - weak runtime outcomes degraded `qualityScore` to `35`
  - weak runtime outcomes drove `rotationWeight` to `0`

### Admin analytics surfaces

Status: Verified in code and static checks

Present admin sections:

- Content Library
- Clip Analytics
- Rotation Control
- QA / Content Health
- Match Analytics

Evidence:

- pages exist under `src/app/admin/analytics` and `src/app/admin/movies`
- typecheck passes
- targeted lint passes

### Core private-room gameplay flow

Status: Browser-verified in local runtime

Verified path:

- create room
- waiting room
- player ready
- start match
- round intro
- play screen
- hint flow
- answer submit
- round results
- leave from play
- leave from results

What was proven in the recent local run:

- ready state changed correctly
- host-only start match advanced to round intro
- start round advanced to play
- hint deducted time without auto-starting playback
- clip playback started successfully
- answer submit advanced to round results
- leave from play returned to the lobby
- leave from round results returned to the lobby
- analytics rows were written for real gameplay events

Recent DB evidence from room `20b83877-2010-4bc9-b7b0-2838b8e75fb8`:

- room status ended as:
  - `cancelled`
- event trail recorded:
  - `room_created`
  - `player_joined`
  - `player_ready`
  - `round_started`
  - `clip_loaded`
  - `media_ready`
  - `answer_submitted`
  - `answer_wrong`
  - `player_left`
  - `match_abandoned`

This is strong evidence for launch readiness, but the proof is still partly operational rather than captured in a permanent automated browser test.

### Backend match completion and final-results flow

Status: Verified

Repeatable verifier evidence from `npm run movie-buff:verify-analytics`:

- `matchCompletionVerification.roomStatus = "finished"`
- `matchCompletionVerification.advanceStatuses.afterRound1 = "active"`
- `matchCompletionVerification.advanceStatuses.afterRound2 = "finished"`
- `matchCompletionVerification.currentRound = 2`
- `matchCompletionVerification.completedRounds = 2`
- `matchCompletionVerification.totalRounds = 2`
- `matchCompletionVerification.finalResultsStatus = "finished"`
- `matchCompletionVerification.standingsCount = 1`

Recorded completion events:

- `room_created`
- `player_joined`
- `round_started` twice
- `answer_submitted` twice
- `answer_wrong` twice
- `match_completed`

What this proves:

- the backend round-advance path can finish a match correctly
- the final-results data RPC returns a finished-room payload correctly
- the analytics/event pipeline records match completion

### Round-results and final-results route hardening

Status: Code-fixed, partial live proof

What was confirmed on July 30, 2026:

- `Next Round` on `round-results` was observed stuck on the same URL in the live browser
- this matched the same fragile client-navigation pattern seen earlier on other Movie Buff screens
- direct database evidence from room `482075eb-0143-4b57-9d42-c4e6809e9e81` shows the backend advance path did continue:
  - room state reached `current_round = 3`
  - `match_rounds` count reached `3`
  - round rows show:
    - round 1 ended at `2026-07-30 16:25:03+00`
    - round 2 started at `2026-07-30 16:25:03+00` and ended at `2026-07-30 16:26:08+00`
    - round 3 started at `2026-07-30 16:26:08+00`
  - event trail recorded multiple `round_started` events for successive rounds

Interpretation:

- the server-side round-advance path is working
- the remaining weakness observed in that run was on the client transition/routing layer, not the analytics, round-advance backend logic, or final-results backend logic

Code changes now applied:

- `src/app/games/movie-buff/round-results/page.tsx`
  - `Next Round`
  - `Leave Match`
  - internal result redirects
  - all now use the direct-navigation helper
- `src/app/games/movie-buff/final-results/page.tsx`
  - `Back to Lobby`
  - `Play Again`
  - `Return to Lobby`
  - fallback return button for unavailable final results
  - all now use the direct-navigation helper
- `src/app/games/movie-buff/round-intro/page.tsx`
  - `Go Back`
  - `Leave Match`
  - start-round routing fallback
  - all now route through the same direct-navigation helper
- `src/app/games/movie-buff/play/page.tsx`
  - `Leave Match`
  - redirect to round results
  - missing-room fallback
  - all now route through the same direct-navigation helper

Static proof:

- `npx eslint src/app/games/movie-buff/round-intro/page.tsx src/app/games/movie-buff/play/page.tsx src/app/games/movie-buff/round-results/page.tsx src/app/games/movie-buff/final-results/page.tsx`
- `npx tsc --noEmit`

Limit:

- browser policy blocked the immediate live re-test of the patched `Next Round` path, so the post-fix runtime proof for that specific client route is still pending even though backend advance evidence is present

### Public waiting-room flow

Status: Partially verified and improved

What is now proven:

- the current `Find Match` flow enters a public waiting room
- the public ready button updates the player state correctly
- leaving the public waiting room now returns to the lobby after the direct-navigation fix in:
  - `src/app/games/movie-buff/waiting-room/page.tsx`

Recent UI evidence from the local runtime:

- `Find Match` routed to:
  - `/games/movie-buff/waiting-room?roomId=e04d85ee-a144-4c3a-b030-e8e9ba6a3d70&code=150877`
- clicking `I'm Ready` changed the visible player status from `Waiting` to `Ready`
- the waiting-room exit path now returns to:
  - `/games/movie-buff/lobby`

Recent DB evidence from the same room:

- room status ended as:
  - `cancelled`
- event trail recorded:
  - `player_joined`
  - `room_created`
  - `player_ready`
  - `player_left`

Limit:

- this still does not prove the full intended public matchmaking lifecycle, only the current public waiting-room segment

### Authoritative timer direction

Status: Improved and locally verified

Evidence:

- the play experience was changed to follow authoritative server `timeLeftSeconds`
- the earlier pre-play countdown drift issue was specifically addressed
- verifier and local browser checks now support the corrected direction

## Current launch blockers

### 1. Playable clip coverage is still too low for a public launch

Status: Blocker

Known recent runtime evidence:

- tracked movies: `106`
- tracked clips: `108`
- playable clips: `38`

Why this blocks launch:

- public players will see stale repetition too quickly
- the analytics/rotation system is built, but the available playable pool is still too narrow for sustained public traffic

Minimum condition before go-live:

- materially increase the playable, validated clip pool beyond the current `38`
- keep enough diversity across eras, titles, and difficulty lanes to avoid obvious repetition

### 2. Public matchmaking still needs a clean end-to-end proof pass

Status: Blocker

What is missing:

- complete browser-driven verification for the intended public flow beyond waiting-room entry
- queue or matchmaking entry if that is still part of the final product direction
- start and progression behavior under public flow with multiple players
- fallback behavior when the full target player count is not met

Why this blocks launch:

- partial public waiting-room correctness does not prove full public matchmaking correctness
- launch readiness requires the actual public entry path to be proven under local runtime conditions

### 3. Exit and recovery flows are not fully verified

Status: Blocker

What still needs explicit proof:

- behavior when a player leaves mid-round or mid-match
- final-results exit behavior after a completed full match
- post-fix live verification that the `round-results` client route now follows backend advancement cleanly

What has now been verified:

- public waiting-room leave/back returns to the lobby after the direct-navigation fix
- private waiting-room back returns to the lobby
- round-intro `Go Back` returns to the lobby while the room remains resumable from the current-room banner
- round-intro `Leave Match` clears the room and returns to the lobby
- play-screen `Leave Match` clears the room and returns to the lobby
- round-results `Leave Match` clears the room and returns to the lobby
- the core intro -> play -> results -> final-results route surfaces are now consistently hardened in code with direct navigation helpers

Why this blocks launch:

- public-facing game flows need reliable recovery paths
- dead-end screens or broken exits become immediate support issues after release

### 4. Runtime analytics are strong but not yet fully proven by persistent browser automation

Status: Blocker for full completion proof

What is already strong:

- synthetic verifier proves ingestion and aggregation
- recent manual browser flow proved real answer submission analytics

What remains weaker than it should be:

- no stable automated browser proof artifact yet for the full runtime event chain

Needed proof:

- one repeatable browser test or equivalent captured run proving:
  - `clip_loaded`
  - `media_ready`
  - `clip_started`
  - `hint_requested`
  - `answer_submitted`
  - `answer_correct` or `answer_wrong`
  - `timeout`
  - `clip_failed_to_load` in a forced-failure case

## Non-blocking items

These matter, but they should not be confused with the current hard blockers above.

- threshold tuning after broader live data
- larger-scale warm-pool optimization
- automated source-ingest watcher pipeline
- further branding/copy polish
- broader clip library expansion beyond the first launch-ready target

## Go-live requirements

Do not treat Movie Buff as launch-ready until all items below are true.

### Required product checks

- public matchmaking flow works end to end
- private room flow works end to end
- ready check works
- round intro -> play -> results -> next round works
- answer submit works reliably
- hint behavior works correctly
- timer follows only authoritative server state
- no dead buttons or broken routes remain in the core flow
- leave/back/exit paths exist and work where needed
- admin pages load and reflect live data

### Required content and delivery checks

- clip delivery is fast enough for live play
- two-tier or equivalent ready-pool behavior avoids stale repeats
- enough playable movie coverage exists for launch

### Required analytics checks

- every live round writes the key gameplay and failure events
- admin can inspect clip quality, difficulty, and rotation behavior
- bad clips can be cooled down or retired

### Required deployment checks

- production environment variables are defined
- Supabase realtime and database connectivity are stable
- media delivery paths resolve correctly in the deploy target
- admin access control is defined for production

## Current judgment

Movie Buff is not yet ready for public launch.

Why:

- the analytics, scoring, and rotation foundation is in place and verified
- several core private-room gameplay paths are working
- the remaining blockers are launch-critical, especially playable coverage, public-match proof, exit-flow proof, and stronger automated runtime proof

## Next recommended build order

1. verify public matchmaking end to end
2. verify all leave/back/exit flows end to end
3. raise playable validated clip coverage above the current launch-blocking level
4. capture stable browser-level proof for the runtime analytics chain
5. only then treat deployment prep as the final gate
