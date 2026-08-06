# Movie Buff Agent 8 canonical release-candidate composition

Status: NO-GO / validation only
Date: 2026-08-05 America/New_York / 2026-08-06 UTC
Repository: BuffGamesStudio/buff-platform
Canonical integration target: integration/movie-buff

## Immutable source freeze

- integration baseline: bf316a15a2120e32d8a32e479df2ae439081f9a1
- integration tree: 12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34
- PR #3 rich board source: f692e82a5d524c950011e0300908c9cbec2389cb
- PR #5 bearer/security packet: 91eac0d55abb1a9568017df687e8395771d24780
- PR #6 MOV-16: 430aaa3a0bb28b54c9131b653eda5bfb9742772a
- PR #8 MOV-18: 5f02493eb4abd0e0047ea25940adda1fe44ce730
- PR #9 MOV-15: dc9804cdae03d8627a89980dbcdf2292d2055372
- PR #10 MOV-17: b6aa1b5bd8cf18770db0cac7bf3630a09a7d86b1
- PR #12 migration encoding: bf5e6d6f251f6840d17eed2fc68e0d580295437f

## Deterministic ownership order

1. integration baseline
2. PR #12 migration byte hygiene
3. MOV-15 admission/readiness
4. MOV-16 private VIP authority
5. PR #5 bearer/security hardening
6. PR #3 cinematic visual intent
7. MOV-17 shared gameplay authority
8. MOV-18 passive presentation
9. separately approved integration-only conflict resolution

## Approved integration tree reused

The functional tree is derived from GitHub-signed conflict-aware composition e0c1f66563b0b3c3d384e62771d83068fa0870e7, tree 01cbb61c58f5c90978ec3548d42ac5826f1d021c. That composition combines canonical full candidate v3 f6ce05803567e71ab16752d583451721092a13ed with current MOV-18 source 5f02493eb4abd0e0047ea25940adda1fe44ce730.

MOV-16 advanced after that composition with three non-product contract/containment files. The candidate overlays their exact current blobs:

- scripts/movie-buff-mov16-evidence-guard.mjs
- supabase/rollbacks/20260804073310_movie_buff_vip_callable_containment.rollback.sql
- supabase/tests/movie_buff_vip_catalog_contract_test.sql

No MOV-16 product migration, route, shared phase, visual, or browser behavior is rewritten by this overlay.

## Conflict resolutions

- PR #3 board-preview and play pages are not restored as legacy local-authority pages. MOV-17 authoritative routes remain controlling; PR #3 red/black/amber board richness is preserved through the approved authoritative visual reconciliation.
- PR #5 board page/client copies do not overwrite MOV-17 selector, phase-version, idempotency, navigation, or shared board authority. PR #5 bearer checks, board-route security, six-table RLS and persona contracts remain present through the approved hardening reconciliation.
- MOV-15 owns admission/readiness only; its handoff delegates match bootstrap and the shared timeline to MOV-17.
- MOV-16 owns private VIP windows, locks, privacy and finalization only; it does not choose routes or advance the shared phase.
- MOV-17 owns shared phase, board mutation, selector rotation, playback epoch, answer/results, reconnect, Buster and active leave authority.
- MOV-18 owns passive presentation only; it has no Supabase/API mutation, navigation or animation-complete gameplay authority.
- PR #12 wins byte identity for its nine historical migrations and changes no SQL semantics.
- Package resolution preserves the pinned MOV-18 Rive dependency graph and PR #5 security test command without introducing unrelated dependency versions.
- Evidence workflows from source lanes are retained as source history only; candidate-wide evidence must run against the final exact candidate SHA.

## Safety boundary

- Do not merge this branch or any source PR.
- Do not update integration/movie-buff.
- Do not deploy or promote a Vercel target.
- Do not mutate hosted Supabase or production state.
- Do not request production authorization.
- MOV-19 remains independent and must not repair the candidate it judges.
