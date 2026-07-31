# Movie Buff launch completion audit

Date: Friday, July 31, 2026

## Purpose

This audit answers one question only:

Is Movie Buff actually at a ready soft-launch state right now?

The answer below is based on current repo state and current hosted/runtime evidence.

## Current environment verified

- repo: `C:\Users\shapa\BuffGames\buff-platform`
- branch: `main`
- current audited commit baseline: `81a7a26`
- framework/runtime versions verified from `package.json`
  - Next.js `16.2.11`
  - React `19.2.4`
  - `@supabase/supabase-js` `^2.110.8`
- hosted app target:
  - `https://movie-buff-sigma.vercel.app`
- hosted Supabase target:
  - `https://yfatwreicmiocdxzyznd.supabase.co`

## Docs and known-issue review used for this pass

Official docs reviewed for this blocker class:

- Supabase Data REST API
- PostgREST tables/views exposure rules
- PostgREST schema-cache reloading
- Next.js deployment/env guidance
- Vercel environment-variable guidance
- Supabase deployment and migration guidance

Key current doc-backed constraints:

- PostgREST only exposes tables/views from exposed schemas that are available to the active role.
- Schema changes can require a cache reload via `NOTIFY pgrst, 'reload schema'`.
- Hosted verification cannot be treated as proven until it is run against the real hosted URL and real hosted env values.

## Riskiest assumption for this pass

Riskiest assumption:

- a green hosted gameplay preflight means hosted live-ops/admin data parity is also real

Why it is risky:

- several admin/server paths in this repo intentionally fall back when content-engine tables are missing from the hosted REST layer
- that means shell rendering can look healthy while production operators still lack real content/analytics visibility

Small proof run first:

- direct hosted Supabase service-role REST reads were attempted for:
  - `content_items`
  - `content_media`
  - `movie_buff_clip_analytics`
  - `content_sources`
  - `content_source_items`
- result:
  - all five currently return schema-cache/table-not-found errors on hosted

Interpretation:

- hosted gameplay parity is now proven
- hosted content-engine/admin parity is not

## Fresh current evidence

Hosted proof now completed:

- `node .\scripts\movie-buff-hosted-preflight.mjs --base-url https://movie-buff-sigma.vercel.app --full-suite`
  - pass
- direct hosted `movie-buff-public-leave-smoke`
  - pass
- direct hosted `movie-buff-leave-smoke`
  - pass

Hosted suite currently proves:

- public matchmaking flow works end to end
- private room flow works end to end
- ready check works
- round intro -> play -> results -> next round works
- answer submit works
- hint behavior works correctly
- timer follows authoritative server state
- leave / back / exit flows in core gameplay work
- Buff Games auth flow works on hosted

Additional hosted evidence gathered during this pass:

- direct hosted REST reads to `movie_buff_round_events`
  - work
- direct hosted REST reads to legacy gameplay tables
  - `movies`: count `49`
  - `clips`: count `49`
- direct hosted REST reads to content-engine/admin tables
  - fail with schema-cache/table-not-found responses
- strengthened hosted admin smoke now proves:
  - `/admin/movies`: `49` visible movies
  - `/admin/sources`: `4` registered sources
  - `/admin/analytics/clips`: `49` tracked clips on hosted
  - `/admin/analytics/rotation`: hosted production parity is now proven on commit `7116a74`
  - `/admin/analytics/qa`: `0` watchlist size on hosted

Additional hosted proof completed after commit `7116a74`:

- Vercel production deployment for `7116a74` reached `Ready`
- hosted admin API proof against `https://movie-buff-sigma.vercel.app/api/admin/analytics/warm-pool`
  - `status: 200`
  - `totalEligibleClips: 49`
  - `totalPrimaryReadyAssets: 49`
  - per-label:
    - `Fan: 9`
    - `Buff: 22`
    - `Buffster: 18`
- hosted page-response proof against `https://movie-buff-sigma.vercel.app/admin/analytics/rotation`
  - authenticated production response includes:
    - `Fan -> 9 primary ready assets from 9 eligible clips`
    - `Buff -> 22 primary ready assets from 22 eligible clips`
    - `Buffster -> 18 primary ready assets from 18 eligible clips`
    - `Eligible clips: 49`

Interpretation:

- the hosted rotation-summary blocker is closed
- the earlier mismatch was consistent with route rendering behavior before the explicit `force-dynamic` page fix shipped in `7116a74`

Coverage/pool evidence restored during this pass:

- `node .\scripts\movie-buff-pool-health.mjs` now reports hosted coverage truthfully even when hosted is still on the legacy content path
- current hosted output:
  - mode: `legacy-fallback`
  - source-backed rows: `49`
  - active source-backed rows: `49`
  - difficulty split:
    - easy: `9`
    - medium: `22`
    - hard: `18`
  - runtime pool file counts:
    - primary: `fan 19 / buff 11 / buffster 6`
    - secondary: `fan 27 / buff 48 / buffster 50`

## Requirement-by-requirement audit

| Requirement | Current verdict | Evidence | Gap |
|---|---|---|---|
| Public matchmaking flow works end to end | Proven hosted | hosted full-suite preflight pass | none |
| Private room flow works end to end | Proven hosted | hosted full-suite preflight pass | none |
| Ready check works | Proven hosted | hosted full-suite preflight pass; direct public leave smoke shows both players ready and entering play | none |
| Round intro -> play -> results -> next round works reliably | Proven hosted | hosted public/private smokes pass through live rounds | none |
| Answer submit works reliably | Proven hosted | hosted public/private smokes pass; answer analytics path green | none |
| Hint behavior works correctly | Proven hosted | hosted timer smoke passes authoritative sequence and non-auto-start behavior | none |
| Timer only follows authoritative server state | Proven hosted | hosted timer smoke passes | none |
| No dead buttons or broken routes in core flow | Proven for core flow | hosted preflight route/gameplay suite passes | non-core route quality can still improve later |
| Leave / back / exit flows exist where needed | Proven hosted | hosted private leave and shared public leave both pass | none |
| Admin pages needed for live operations load and reflect real data | Proven for the currently verified hosted launch scope | hosted proof now covers `/admin/movies`, `/admin/sources`, `/admin/analytics/clips`, and authenticated production rotation-summary output on `/admin/analytics/rotation` | verify the intended real operator account has admin role before launch day |
| Clip delivery is fast and stable enough for live play | Proven for current soft-launch pool path | hosted full-suite gameplay passes; launch gate avoids on-demand-only stalls | broader scale remains unproven |
| Pool / rotation behavior avoids stale repeats well enough for soft launch | Partially proven | runtime pool depth is healthy; hosted gameplay uses warmed assets; coverage verifier now works again in hosted legacy mode | weighted content-engine rotation/admin visibility is not fully hosted-parity proven |
| Enough playable movie coverage exists for soft launch | Proven for soft-launch minimum, not broader public depth | hosted legacy gameplay inventory is `49` active source-backed rows with balanced difficulty spread; pool reserves are materially above shallow minimums | still below the user's larger long-term content target |
| Analytics capture key gameplay and failure events | Proven hosted for live room events | hosted preflight passes; direct hosted reads from `movie_buff_round_events` work; leave fixes now record `player_left` and `match_abandoned` correctly | clip-level content analytics tables are not hosted-parity exposed |
| Deployment requirements and go-live steps are documented | Proven | runbook, parity checklist, handoff pack, and setup docs exist in `docs/` | docs need refresh to reflect the new hosted-green / admin-parity-red state |
| Hosted deployment parity is proven against the real target | Proven for gameplay/auth/runtime path; not proven for content-engine admin data path | hosted preflight is green against `https://movie-buff-sigma.vercel.app`; direct hosted table checks still fail for content-engine/admin tables | partial parity gap remains |

## Launch audit by bucket

### 1. Launch blockers

| Blocker | Owner area | Current status | Evidence | Next fix | Severity |
|---|---|---|---|---|---|
| Real launch operator account provisioning is not yet verified | Admin ops | Open | hosted admin path now works for authenticated admin users, but the current Edge browser session used in manual checking was not an admin account | verify or promote the intended Buff Games operator account before launch day | High |
| Hosted content-engine/source registry REST parity is incomplete | Supabase schema + admin ops | Open | direct hosted REST reads still fail for `content_items`, `content_media`, `content_sources`, and `content_source_items`, even though `/admin/movies` and `/admin/sources` now render useful fallback/live data | apply the missing hosted schema/grants or keep verified fallback paths only where they are operationally sufficient | High |
| Hosted admin smoke needed stronger data assertions | Verifier coverage | Mitigated | strengthened hosted admin smoke now proves movie count and source count instead of only headings | keep this stronger verifier and rerun after each hosted admin fix | Medium |

### 2. Important but deferrable

| Item | Owner area | Current status | Evidence | Next fix | Severity |
|---|---|---|---|---|---|
| Content library depth is soft-launch viable but still limited | Content ops | In progress | `49` active hosted legacy rows; enough for initial controlled launch, not large public scale | continue content ingest after launch-blocker closure | Medium |
| Weighted rotation parity between legacy hosted data and full content-engine analytics | Gameplay/content ops | Partial | runtime pool counts are healthy, but full hosted content-engine weighting is not exposed | finish hosted content-engine parity, then rerun rotation/admin proofs | Medium |
| Runbook/checklist docs are stale on hosted parity status | Ops documentation | Open | existing docs still describe hosted parity as missing, but gameplay parity is now green | refresh docs after admin-parity decision lands | Medium |

### 3. Post-launch ideas

- full global two-tier pool manager
- automated source-ingest watcher pipeline
- deeper analytics tuning
- broader library expansion automation
- richer board-mode presentation and advanced multiplayer polish
- nonessential animation/presentation polish

## Bottom-line verdict

Movie Buff is closer to soft launch than it was earlier on Friday, July 31, 2026.

It is now hosted-proven for the core player path.

It is not yet fully soft-launch-ready because a fresh full launch audit still needs to be rerun after the latest hosted admin fix and because the intended operator admin account still needs to be verified.

## Current truthful status statement

As of Friday, July 31, 2026, Movie Buff is hosted-green for core gameplay, auth,
ready-check, timer, leave flow, and round progression on
`https://movie-buff-sigma.vercel.app`, and hosted admin now proves real movie,
source, clip analytics, and rotation-summary data for authenticated admin
requests. The remaining launch-readiness gap from this pass is operational:
verify the intended real admin/operator account and then rerun the full launch
audit against the current hosted deployment.
