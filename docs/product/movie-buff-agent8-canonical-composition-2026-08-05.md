# Movie Buff Agent 8 canonical composition

Status: **NO-GO pending independent MOV-19 review**

This document binds one isolated release-candidate assembly. It does not authorize merge, deployment, hosted mutation, production action, or a readiness claim.

## Repository and baseline

- Repository: `BuffGamesStudio/buff-platform`
- Canonical target observed: `integration/movie-buff`
- Baseline SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
- Baseline tree: `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`
- Candidate branch: `release-candidate/movie-buff-canonical-20260805-agent8-v3`

## Exact component heads

| Component | PR | Exact head | Ownership |
|---|---:|---|---|
| Rich board visual requirements | #3 | `f692e82a5d524c950011e0300908c9cbec2389cb` | visual hierarchy only |
| Bearer/security hardening | #5 | `91eac0d55abb1a9568017df687e8395771d24780` | bearer validation, least privilege, board-route personas |
| MOV-16 | #6 | `12c3a8a09cd135152134a7b765976019de7be1a4` | private VIP authority |
| MOV-18 | #8 | `ed9d4f08692c892258415d88d68f06b41a174b24` | passive presentation only |
| MOV-15 | #9 | `dc9804cdae03d8627a89980dbcdf2292d2055372` | admission/readiness only |
| MOV-17 | #10 | `f17234debfb8942e1998306a12dc33301c1c5440` | shared gameplay authority |
| Migration encoding | #12 | `bf5e6d6f251f6840d17eed2fc68e0d580295437f` | byte-order-mark removal only |

## Deterministic integration order

1. Integration baseline.
2. PR #12 migration encoding.
3. PR #5 bearer/security hardening.
4. PR #9 MOV-15 admission/readiness.
5. PR #6 MOV-16 VIP authority.
6. PR #10 MOV-17 shared gameplay authority.
7. PR #8 passive visual runtime.
8. PR #3 rich-board ownership record.
9. Agent 8 composition metadata and validation controllers.

The source PRs remain unmerged into `integration/movie-buff`.

## Composition commits before controller metadata

- PR #12 merge commit: `bfa68e243d15d3645fdd0ff306a85614cbc7ee8f`
- PR #5 merge commit: `5afb82ad2c36db762e4acc990a008a6a42af4e52`
- MOV-15 merge commit: `e9f1315c73e74e2400cc24ca490f399a81667256`
- MOV-16 merge commit: `e98e1f7711ada0e64758b72af10ce15325e33e30`
- MOV-17 ownership-resolution commit: `86124e283e34fbb17d2026156ade60105998ad8a`
- MOV-18 ownership-resolution commit: `64e2bc78be8106c1c3dc7b0bcae380e65ecc5269`
- PR #3 ownership-record commit: `a94a8a26b259b2de81db2fe6b5509fa1778df354`
- Functional tree before controller metadata: `96c087e7ba93fa4143d34ebd81e39fa28cc3e9ee`

## Conflict-resolution record

### PR #12 versus MOV-17 historical migrations

Resolution: retain PR #12 exact blobs for its nine historical BOM-only migration files. Apply MOV-17 exact blobs for every new authority migration, rollback, RPC/API route, shared client, result surface, reconnect/Buster/leave contract and focused test. This prevents MOV-17 from silently absorbing or reversing the encoding lane.

### PR #5 versus MOV-18 package manifest

Resolution: retain PR #5's `test:movie-buff-board-routes` script and add MOV-18's pinned `@rive-app/react-webgl2` dependency. Use MOV-18's exact lockfile because script-only changes do not alter dependency resolution.

### PR #3 versus MOV-17 board/play ownership

PR #3's two route blobs include direct server actions and manual progression controls such as continuing directly to the clip round. Those route implementations are superseded by MOV-17 authority and were not restored. PR #3's exact head is recorded in the parent matrix; its approved cinematic board hierarchy is preserved through the authoritative board client and MOV-18 passive visual layer. This is an explicit integration-only conflict decision, not an assertion that the two obsolete route blobs were copied.

### MOV-18 versus functional authority

Only MOV-18 passive visual components, visual runtime libraries, preview, tests, evidence workflows, docs and dependency graph were applied. No MOV-18 file may advance gameplay, select a tile, mutate authoritative phase, decide an answer, or override reconnect/Buster state.

## Required validation classification

Separate candidate-bound jobs must report independently for:

1. repository/source/build;
2. Windows command digital twin;
3. disposable database application;
4. race/concurrency;
5. real three-client browser journey;
6. security/persona checks;
7. containment rollback and ordered forward reapply;
8. artifact integrity, redaction and portable hashes.

A green subset is not transferable to another SHA. Failed or missing jobs remain `FAIL` or `UNKNOWN`, never implied PASS.

## Rollback order

Rollback must reverse functional application order while respecting dependency ownership:

1. MOV-18 passive presentation files and Rive dependency.
2. MOV-17 active-leave/Buster and phase-machine rollbacks in descending migration order.
3. MOV-16 VIP authority rollback.
4. MOV-15 admission/readiness rollback.
5. PR #5 security helpers and policies only through their approved rollback artifacts.
6. PR #12 encoding is a byte-only repository change; rollback means restoring the recorded pre-PR12 blobs, not executing database SQL.

PR #3 has no applied functional route blob in this composition and therefore has no runtime rollback step.

## Independent validator boundary

MOV-19 must independently inspect the final controller SHA/tree, ancestry, exact inventory, migration hashes, wrapper hashes, workflow runs, artifacts, redaction, rollback order and unresolved UNKNOWNs. MOV-19 must not repair the candidate it judges.
