# Movie Buff current-lane composition freeze

Captured: 2026-08-05T17:45:00Z
Repository: `BuffGamesStudio/buff-platform`
Remote: `https://github.com/BuffGamesStudio/buff-platform.git`
Integration target: `integration/movie-buff`
Integration SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
Integration tree: `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`
Assembly branch: `validation/movie-buff-current-lanes-20260805`
Assembly base: MOV-17 current head

## Frozen component identities

| Component | PR | Commit SHA | Tree SHA |
|---|---:|---|---|
| Rich board visuals | #3 | `f692e82a5d524c950011e0300908c9cbec2389cb` | `621bd5d39059f76773d84b5a0d1dce851e2ff0de` |
| Security and synchronized-flow hardening | #5 | `91eac0d55abb1a9568017df687e8395771d24780` | `1ae3ed427b2c1b38c3731cc9532b5d0fb0c6336f` |
| MOV-15 public matchmaking | #9 | `7db078157f09565ea0a16f345e6f14896d36fe3b` | `4fe5efc5c3e9161c951b08bf5d0008af5efb4023` |
| MOV-16 private VIP authority | #6 | `95c292ead66fc83cf13d7154bd3cf691610f549d` | `f8a8a9f316f5319566dad8c9aa01c2ce73f67e21` |
| MOV-17 authoritative phase machine | #10 | `6d7e9aabe5b07796a3a17fdf6c11df091dd1f978` | `8264d2e30b0c75a8bebaa1ad938df6a635f7d991` |
| MOV-18 passive visual runtime | #8 | `e335a07eed20c97bc2487962ad0cf67c4f9dcc03` | `94d96908efa4d189cd8673c3a50c24ea296a7772` |
| Migration encoding repair | #12 | `bf5e6d6f251f6840d17eed2fc68e0d580295437f` | `d97528616454b9e93c6be9a44705d008a901ac66` |

## Stale evidence invalidation

Draft PR #13 remains an exact-SHA validation record only for its historical composition headed by `973b210e391c754bd2f5057ed3ae14dfdf5f5c10`, which used MOV-17 `b1a21651e545df6649b178346198b1e7d836ca0b`. It does not prove MOV-17 `6d7e9aabe5b07796a3a17fdf6c11df091dd1f978` or MOV-15 `7db078157f09565ea0a16f345e6f14896d36fe3b`.

## Reconciliation status

This branch is an isolated assembly scaffold rooted at the current MOV-17 head. The component identities above are frozen and reproducible, but the complete source-tree reconciliation is not yet proven.

Known overlapping ownership requiring explicit content reconciliation rather than last-writer copying includes:

- `src/app/games/movie-buff/board-preview/page.tsx` across PR #3, PR #5, and MOV-17;
- `src/app/games/movie-buff/play/page.tsx` across PR #3 and MOV-17;
- `src/components/movie-buff/MovieBuffBoardRoomClient.tsx` across PR #5 and MOV-17;
- `package.json` across PR #5 and MOV-18;
- MOV-15/MOV-17 match-start and phase-authority migrations and tests.

The connected GitHub write interface used for this freeze does not provide a safe conflict-aware cherry-pick or merge-tree operation. No overlapping file was silently overwritten, no PR was merged, and no integration branch was modified.

## Classification

- exact live-head freeze: `PASS`
- isolated branch creation: `PASS`
- component tree identity: `PASS`
- clean-worktree evidence: `UNKNOWN` until exact-SHA CI checks the branch checkout
- complete source reconciliation: `UNKNOWN`
- build/database/browser/hosted behavior: `UNKNOWN`
- release: `NO-GO`

All lane PRs remain draft and isolated. No merge, deployment, hosted Supabase mutation, force-push, secret exposure, or production action is authorized.