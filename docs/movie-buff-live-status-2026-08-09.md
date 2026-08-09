# Movie Buff live status audit

Date: Sunday, August 9, 2026

## Purpose

This document records the current live Movie Buff state as independently
verified on Sunday, August 9, 2026 across the connected Supabase, Vercel,
GitHub, and hosted-app surfaces.

Use it when the earlier July 30-31 launch docs conflict with current live
state. Those earlier docs still matter as historical evidence and runbooks, but
their blocker ordering is no longer fully current.

## Live facts verified now

### Supabase production project

- project: `Movie Buff`
- ref / project id: `yfatwreicmiocdxzyznd`
- region: `us-east-1`
- status: `ACTIVE_HEALTHY`

### Vercel production project

- team: `shaheed1`
- project: `movie-buff`
- production alias:
  - `movie-buff-sigma.vercel.app`
- production alias currently resolves to deployment:
  - `dpl_GhFtRDighfB48t6WqiyWfg35VgEC`
- that live deployment was created on Friday, August 1, 2026 from:
  - branch: `main`
  - commit: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

### Newer non-live deployments exist

- multiple later deployments from Friday, August 8, 2026 are `READY`
- those later deployments are branch deployments, not the live production alias

### Hosted auth/admin inventory changed since July 31

Live production auth now shows:

- total auth users: `312`
- anonymous users: `6`
- non-anonymous users: `306`
- non-test full accounts by current repo heuristic: `21`
- admin profiles: `44`
- non-anonymous admin profiles: `44`

Interpretation:

- the old July 31 blocker "`no real production operator account exists yet`" is
  no longer true as written
- production now has real non-anonymous users and multiple admin-profile rows

### Public hosted page health

- `https://movie-buff-sigma.vercel.app/account` returns `200`
- a fresh unauthenticated browser session still shows no active Buff Games
  account session by default

### Production activity

- `movie_buff_round_events` total rows observed: `1401`
- latest observed event timestamp:
  - `2026-08-08 02:13:17.69647+00`

Interpretation:

- the production system has continued to receive activity after the July 31
  audit window

## Remaining verified gaps

### 1. Production content-engine schema is still absent

These production tables are still missing:

- `public.content_items`
- `public.content_media`
- `public.content_sources`
- `public.content_source_items`
- `public.movie_buff_clip_analytics`

Interpretation:

- the legacy-fallback production path is still carrying the live app
- full content-engine parity is still not present in production

### 2. PR #224 is still draft and not merged

GitHub currently shows:

- PR `#224`
- state: `open`
- draft: `true`
- merged: `false`
- mergeable: `true`
- head SHA:
  - `a90219841cbc033185b08930049e6063e5b79e5a`

### 3. Authenticated Seat-4 head control and successor hash rebinding are complete

Latest PR `#224` / issue `#200` comments now converge on this updated state:

- authenticated GitHub identity `iecmail01-debug` has now committed and pushed
  the successor manifest/verifier correction on PR `#224`
- existing `2e01f0fb...` evidence remains diagnostic only because the exact
  branch identity has changed to `a90219841cbc033185b08930049e6063e5b79e5a`
- successor hash rebinding now passes on PR `#225` run `31298920591`, artifact
  `9033871433`, digest
  `sha256:1338dcda2a7142f2d34378c613c1ba840a2ceb3165fa5cf91aa92caa7c97da51`
- read-only successor manifest v3 verification passes on the current
  production-like rehearsal final state at project `gvzjpxtbuecgrsdtxrax`
- the remaining missing proof is a fresh exact rerun from the frozen
  production-like baseline on exact head
  `a90219841cbc033185b08930049e6063e5b79e5a` / tree
  `c5c1fa5f2d91d04515a1feabb986851008aeca5e`
- successor local rollback/reapply proof now passes on disposable localhost:
  - PR `#227`
  - run `31306587627`
  - jobs `93227829968` + `93228059415`
  - both `recovery-proof` and `independent-recovery-inspection` passed on
    Sunday, August 9, 2026

Interpretation:

- the current blocker is no longer simply "production operator account missing"
- the authenticated release-control and provenance step on the successor
  security branch is now complete
- successor cryptographic binding is now complete
- disposable localhost successor rollback/reapply evidence is now complete
- the next blocker is not hashing; it is the absence of a fresh
  production-like baseline target for the exact successor rerun

### 4. The live alias is still on the August 1 production deployment

Interpretation:

- newer August 8 validation/security branch deployments are not what production
  users receive at `movie-buff-sigma.vercel.app`
- any August 8 branch evidence must not be mistaken for already-live production
  promotion

## Current truthful status

As of Sunday, August 9, 2026:

- core hosted Movie Buff is live on the August 1 `main` production deployment
- production now has real non-anonymous users and admin-profile rows
- production content-engine tables are still absent
- PR `#224` remains draft/unmerged
- authenticated Seat-4 adoption of the successor manifest/verifier correction
  is complete on head `a90219841cbc033185b08930049e6063e5b79e5a`
- successor hash rebinding is complete on PR `#225` run `31298920591`
- successor local rollback/reapply proof is complete on PR `#227` run
  `31306587627`
- the current rehearsal final catalog passes the successor manifest v3
  read-only verifier
- the available rehearsal target is no longer the frozen baseline because it
  already contains the old-head forward, recovery, and reapply ledger
- the remaining blocker is a fresh production-like baseline restore or
  equivalent new rehearsal target for an exact successor rerun from step 1

## Safe next actions without human interaction

- keep repo tooling aligned with current Supabase secret-key naming
- keep launch and handoff docs aligned with the August 9 live blocker story
- continue read-only verification and evidence reconciliation on current state
- preserve the successor hash seal and verifier artifacts already published on
  PR `#224`, PR `#225`, PR `#227`, and issue `#202`

## Actions that still need human direction or authenticated human presence

- a fresh production-like baseline restore or equivalent new rehearsal target
  for the exact successor rerun
- any merge or promotion of PR `#224`
- any deployment/promotion, hosted mutation, production SQL, restore, or ARM
- production SQL or hosted mutation to add the absent content-engine schema
- deployment alias changes or other production promotion steps
