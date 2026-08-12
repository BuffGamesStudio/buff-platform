# Movie Buff hosted validation status

Date: Tuesday, August 11, 2026

## Purpose

This note captures the current hosted-runtime and deployment evidence that was
revalidated on August 11 against the live production alias.

It is intentionally narrower than the broader production security / Supabase
reconciliation packet. Use this note for current hosted gameplay, auth, admin,
and deployment-parity facts only.

## Exact repo and deployment identity

- repo branch: `main`
- current repo head: `278691530b573c5e4174d4c9c8f477a650a12fd7`
- commit message: `Allow bounded Movie Buff smoke runs`
- latest production deployment: `dpl_FtPnSkDfGAPLhjan6vcNnsYH4DUt`
- production alias:
  - `https://movie-buff-sigma.vercel.app`
- current production alias state: `READY`
- current production alias commit:
  - `278691530b573c5e4174d4c9c8f477a650a12fd7`

## What changed in the latest commit

The August 11 commit is validation-only. It updates:

- `scripts/movie-buff-public-flow-smoke.mjs`
- `scripts/movie-buff-private-flow-smoke.mjs`

No application runtime files changed in this commit.

The harness fix records room `total_rounds` and treats capped smoke runs as
partial validation when the room is still healthy and advancing. Full-length
runs still fail if final results never appear.

## Hosted checks revalidated on August 11

The following checks were rerun directly against
`https://movie-buff-sigma.vercel.app` and passed:

- launch migration inventory
- bootstrap artifact inventory
- deployment env validation for `.env.production`
- route health
- auth smoke
- public smoke (bounded to 1 round for a fast hosted spot-check)
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
- hosted auth smoke is PASS:
  - sign-in page loads
  - sign-up page loads
  - a fresh account can be provisioned
  - account session persists
  - sign-out returns the browser to the public site

### Hosted gameplay health

- bounded public smoke is PASS:
  - all three players land in the same waiting room
  - ready-up succeeds
  - gameplay advances into round 1
  - results load
  - the room advances into round 2
- bounded private smoke is PASS:
  - private room creation succeeds
  - ready-up and match start succeed
  - gameplay advances into round 1
  - results load
  - the room advances into round 2

For both bounded smokes, the harness now records:

- room `totalRounds`
- configured smoke cap
- `partialRun: true` semantics when the room is still healthy and has advanced
  beyond the capped round budget

### Leave and timer health

- private leave smoke is PASS:
  - leaving from gameplay returns the browser to the lobby
  - the room is marked `cancelled`
  - `player_left` and `match_abandoned` events are recorded
- shared public leave smoke is PASS:
  - the leaving player returns to the lobby
  - the remaining players stay in the live room
- timer smoke is PASS:
  - initial countdown starts at 30
  - hint usage reduces remaining time from 30 to 25
  - active playback continues decrementing from the post-hint timer state

### Admin and content-pool health

- hosted admin smoke is PASS:
  - `/admin/movies` loads with 50 visible movies
  - `/admin/sources` loads with 4 registered sources
  - clip analytics loads with 50 tracked clips
  - rotation control loads with:
    - `eligibleClips = 50`
    - `primaryReadyAssets = 50`
    - matching API totals
  - QA / Content Health loads with `watchlistSize = 14`
  - Match Analytics loads with recent room summaries visible
- pool health is PASS:
  - `sourceBackedVideoRows = 50`
  - `activeSourceBackedVideoRows = 50`
  - runtime pool files are present across primary and secondary lanes

## Important scope limit

This hosted note does **not** prove:

- production Supabase security reconciliation
- production migration-ledger reconciliation
- production content-engine parity beyond the currently live hosted runtime
- MOV-19 acceptance
- PR merge / production promotion authority beyond the already-live alias state

Use the broader production reconciliation packet for those gates.

