# Movie Buff current-head browser product v7

Validation-only immutable composition. Do not merge, deploy, promote, or mutate hosted/staging/production systems.

## Parent candidate

- product SHA: `c3a6aff9138f6e12b50e54f5b3c0f4bddcc101f6`
- product tree: `a995a9aeb2fca76d2c1b216ece3a2645c2393c71`

## Current intended source heads

- integration: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
- PR #3 visuals: `f692e82a5d524c950011e0300908c9cbec2389cb`
- PR #5 hardening: `91eac0d55abb1a9568017df687e8395771d24780`
- MOV-15: `48d44bb156b71060d1b9adcc7a2a3f014cf92060`
- MOV-16: `1d3b947ca153214028b5ac97a7eea83c382b5c7d`
- MOV-17 source: `ffff733d856c8c6dca5a04fdbe84e3a0c5839111`
- MOV-18: `a416dd1bf6b372d11abcc0541abd9584443b0672`
- encoding repair: `d1f7ca58b534cbccd3071743d542f5788c0e9173`
- lobby auth repair: `3d2743da175229de42847c82c71931657c2090da`

## Reconciled product delta

The composition preserves candidate-v6 race-safe board creation and active-leave client APIs while adding current MOV-17 canonical response identity and the corrected lobby persisted-session bootstrap.

Exactly four runtime/test files differ from candidate v6:

1. `src/app/api/movie-buff/match/view/route.ts`
2. `src/lib/game/movieBuffAuthoritativePhaseClient.ts`
3. `src/app/games/movie-buff/lobby/LobbyAuthBootstrap.tsx`
4. `tests/movie-buff-lobby-auth-bootstrap.test.mjs`

The isolated MOV-17 workflow files are not copied into the product composition because candidate v6 contains later active-leave/Buster validation coverage. Browser execution is delegated to a one-file child controller.

All runtime classifications begin `UNKNOWN` until exact-SHA workflows execute and artifacts are independently verified. Overall release remains `NO-GO`.
