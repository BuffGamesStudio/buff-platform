# Movie Buff Agent 5 exact integrated candidate v3

Captured: `2026-08-06T14:24:00Z`

## Immutable product identity

- Repository: `BuffGamesStudio/buff-platform`
- Validation branch: `validation/movie-buff-integrated-candidate-v1`
- Product SHA: `df2289c1efc2e26c18a9691ed6f9c8bb0e45f076`
- Product tree: `1c69793e3308bfaac25141b86afabb92203f7e18`
- Delta base product: `0eccbdedb49342ef2f04b237899e9c246442c0ec` / `5a53aa117838561bcf8e698b63e6ac69ce174e05`
- Integration: `bf316a15a2120e32d8a32e479df2ae439081f9a1` / `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

Candidate v2 was invalidated by moved MOV-17, MOV-18, and Agent 6 heads. Candidate v3 overlays exactly thirteen current-head blobs onto v2. No lane-owned functional or security behavior was rewritten by Agent 5.

## Current component freeze

- PR #3: `f692e82a5d524c950011e0300908c9cbec2389cb`
- PR #5: `91eac0d55abb1a9568017df687e8395771d24780`
- MOV-15: `48d44bb156b71060d1b9adcc7a2a3f014cf92060`
- MOV-16: `f169d652a9199a65afd5369c52c0584f635d7031`
- MOV-17: `9239fcdc731ec05594c75d3ef9961e6cd4d36bbf`
- MOV-18: `6cf6ae7ef951141c630cdd66f178cd73e1b88327`
- PR #12: `d1f7ca58b534cbccd3071743d542f5788c0e9173`
- Agent 6: `ae82e62b01bf028b38b29d6baf42823419f86512`
- MOV-19: `46c549675d44f19c22a7786421cf2581dc22af3c`

## Protected reconciliation

- Board preview remains blob `ee4ef8bae382aebc1e2242a8342d3858ecbc922c`.
- Play page remains blob `2115b1f81a1dd64fa0998ebffcd2ca4ef605f0d5`.
- Board-room client is now exact MOV-17 blob `7cbe07c6aad2094fc2831b59b4847bc6c12193b4`. Its current delta adds stale-poll rejection to the same previously reconciled predecessor and does not replace the visual markup.

The full overlap matrix, component trees, merge bases, and exact thirteen-file delta ledger are recorded in the machine-readable manifest.

## Vercel boundary

The connected `movie-buff` Vercel project reports Next.js and Node `24.x`; Agent 5 validation uses Node `22.x`. Root directory, explicit install/build commands, ignored-build behavior, and cache behavior remain `UNKNOWN`. A local workflow build cannot be transferred to Vercel provenance.

## Classification

Source assembly, focused tests, TypeScript, build, SQL encoding, hygiene, Windows, and artifact integrity remain `UNKNOWN` until the exact v3 controller run is complete and artifacts are inspected.

Database, pgTAP, personas, races, browser, accessibility, Vercel provenance, hosted Supabase, isolated staging, rollback, containment, forward reapply, backup/PITR, and production target remain separate `UNKNOWN` scopes.

Overall release classification: **NO-GO**.

This branch and PR are validation-only, draft, and never merge.
