# Movie Buff hosted validation status

Date: Wednesday, August 12, 2026

## Purpose

This note captures the current hosted-runtime and deployment evidence for the
live Movie Buff production alias as of August 12.

It is intentionally narrower than the broader production security / Supabase
reconciliation packet. Use this note for current hosted gameplay, auth, admin,
and deployment-parity facts only.

## Exact repo and deployment identity

- repo branch: `main`
- current repo head: `e2c753ea9cdae1a758801d0ae2ef37c8ddd380b7`
- commit message: `Reconcile Movie Buff docs with hosted runtime state`
- latest production deployment: `dpl_9fQAjEP1tqszq1zN7SWd9xtcoARZ`
- production alias:
  - `https://movie-buff-sigma.vercel.app`
- current production alias state: `READY`
- current production alias commit:
  - `e2c753ea9cdae1a758801d0ae2ef37c8ddd380b7`

## What changed since the August 11 runtime revalidation

The live alias has moved from the August 11 validation commit
`278691530b573c5e4174d4c9c8f477a650a12fd7` to two later `main` commits:

- `5d895b71602f00515c52868fee6080a8cd2ebf51`
  - `Document current Movie Buff hosted validation state`
- `e2c753ea9cdae1a758801d0ae2ef37c8ddd380b7`
  - `Reconcile Movie Buff docs with hosted runtime state`

These later commits are documentation-only. No Movie Buff application runtime
files changed after `278691530b573c5e4174d4c9c8f477a650a12fd7`.

## Hosted checks directly rerun on August 12

The following checks were rerun directly against
`https://movie-buff-sigma.vercel.app` on August 12 and passed:

- route health
- public smoke (bounded to 1 round for a fast live-alias spot check)

## Standing hosted checks from August 11 that still apply

Because no application runtime files changed after
`278691530b573c5e4174d4c9c8f477a650a12fd7`, the following August 11 hosted
checks remain the latest direct evidence for the same live runtime path:

- launch migration inventory
- bootstrap artifact inventory
- deployment env validation for `.env.production`
- auth smoke
- private smoke (bounded to 1 round for a fast hosted spot-check)
- private leave smoke
- shared public leave smoke
- admin smoke
- timer smoke
- pool health

## Current hosted facts

### Route and auth health

- route health is PASS across sign-in, sign-up, account, lobby, gameplay, and
  protected admin routes
- unauthenticated admin routes still show the expected access gate with no
  leaked admin payload
- the August 11 hosted auth smoke remains valid for the current live alias
  because no runtime files changed after the last direct auth verification

### Hosted gameplay health

- the August 12 bounded public smoke is PASS:
  - all three players land in the same waiting room
  - ready-up succeeds
  - gameplay advances into round 1
  - results load
  - the room advances into round 2
- the August 11 bounded private smoke remains PASS evidence for the current
  live alias because no runtime files changed after the last direct private
  hosted verification

For bounded smokes, the harness records:

- room `totalRounds`
- configured smoke cap
- `partialRun: true` semantics when the room is still healthy and has advanced
  beyond the capped round budget

### Leave, timer, admin, and content-pool health

- August 11 private leave smoke remains PASS for the current live alias
- August 11 shared public leave smoke remains PASS for the current live alias
- August 11 timer smoke remains PASS for the current live alias
- August 11 hosted admin smoke remains PASS for the current live alias:
  - `/admin/movies` loads with 50 visible movies
  - `/admin/sources` loads with 4 registered sources
  - clip analytics loads with 50 tracked clips
  - rotation control loads with:
    - `eligibleClips = 50`
    - `primaryReadyAssets = 50`
    - matching API totals
  - QA / Content Health loads with `watchlistSize = 14`
  - Match Analytics loads with recent room summaries visible
- August 11 pool health remains PASS for the current live alias:
  - `sourceBackedVideoRows = 50`
  - `activeSourceBackedVideoRows = 50`
  - runtime pool files are present across primary and secondary lanes

### Current Vercel error signal

- Vercel grouped runtime errors for the last 24 hours show one error cluster:
  - route: `/api/movie-buff/round-media/[roundId]`
  - deployment: `dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc`
  - error: `ENOENT` during `mkdir` on `media`
- that cluster points to an older non-live deployment, not the current live
  alias deployment `dpl_9fQAjEP1tqszq1zN7SWd9xtcoARZ`

## Important scope limit

This hosted note does **not** prove:

- production Supabase security reconciliation
- production migration-ledger reconciliation
- production content-engine parity beyond the currently live hosted runtime
- MOV-19 acceptance
- PR merge / production promotion authority beyond the already-live alias state

Use the broader production reconciliation packet for those gates.
