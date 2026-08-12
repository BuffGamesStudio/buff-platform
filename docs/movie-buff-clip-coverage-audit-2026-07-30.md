# Movie Buff clip coverage audit

Date: Thursday, July 30, 2026

August 11, 2026 addendum:

- this July 30 clip-coverage audit is now historical
- for the current hosted-runtime truth, use:
  - [movie-buff-hosted-validation-status-2026-08-12.md](C:/Users/shapa/BuffGames/buff-platform/docs/movie-buff-hosted-validation-status-2026-08-12.md)
- the statement below that hosted deployment parity is unproven reflects the
  earlier July state, not the current live production alias

## Current launch-relevant content state

Current local counts after the Friday, July 31, 2026 pool and coverage refresh:

- total active playable movies: `49`
- active public-domain playable video movies: `48`
- total active playable video rows: `49`
- active public-domain playable video rows: `48`
- positive-weight clip analytics rows: `156`
- analytics verifier after reconciliation: `pass`

Updated local counts after the Friday, July 31, 2026 lane-prior refresh:

- active launch-safe video rows: `49`
- distinct active launch-safe movies: `49`
- active lane split:
  - `Fan`: `10`
  - `Buff`: `22`
  - `Buffster`: `17`
- recent 200 started rounds:
  - immediate repeats: `6`
  - distinct movies seen: `49`

## What that means

Movie Buff is no longer blocked by the specific stale-static-media failure that was causing live rounds to fall back from clip play into trivia.

The key correction is this:

- a broader activation pass exposed `67` public-domain rows whose static montage files were missing on disk
- those rows produced real `404` media failures in live play
- a reconciliation pass removed those broken rows from live selection
- live round payloads for video/audio now route through `/api/movie-buff/round-media/:roundId` instead of trusting stale legacy static paths
- low-sample lane labeling no longer collapses nearly every active clip into `Buff`
- active low-sample clips now inherit source difficulty as the launch prior, which restores the intended lane spread for real play

## Current recommendation

Based on current evidence:

- private/internal test-ready: closer, but not fully re-cleared after the latest dev-runtime stalls
- narrow soft launch-ready: not yet proven
- broader public-ready: no

## Why this is still a blocker for broader launch

The remaining launch risks are now:

- the verified pool is still only `49` active launch-safe video clips
- repeat pressure is reduced but still visible in real history (`6` immediate repeats in the latest `200` started rounds)
- hosted deployment parity is still unproven
- the warmed reserve is much healthier than before, but not yet perfectly full in every lane target after one refresh cycle

## Launch judgment

Do not treat the current pool as launch-cleared yet.

## Recommended minimum next content target

The immediate target changed from expansion back to reliability:

- keep only rows whose static assets truly exist, unless on-demand/generated delivery is proved fast enough
- keep the repaired `Fan / Buff / Buffster` lane split intact
- keep adding only individually verified static assets like `20,000 Leagues Under the Sea`, `Aelita: Queen of Mars`, `Holiday`, `Carmen`, `The Martyrs of the Alamo`, `Cleopatra`, and `H?xan` so hard-lane coverage grows without reopening `404` risk
- use the repaired warm-pool path before live soft-launch sessions so the ready reserve starts at:
  - primary `fan 4 / buff 4 / buffster 4`
  - secondary `fan 8 / buff 8 / buffster 7`
- only expand coverage again after the launch path is stable and newly added assets are verified

## Evidence note

Evidence behind this update:

- `supabase/migrations/202607301500_movie_buff_activate_built_public_domain_library.sql`
- `scripts/movie-buff-reconcile-static-media.mjs`
- local verification showed the broken class directly:
  - active selected rounds returning `404` for static MP4s
  - current round rows with `clip_type = video` but missing public files on disk
- reconciliation output:
  - `activeRowsBefore = 104`
  - `existingMp4Files = 38`
  - `deactivatedRows = 67`
  - `remainingPlayableStaticRows = 37`
- `npm run movie-buff:verify-analytics`
