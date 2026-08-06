# Movie Buff Agent 5 exact integrated candidate v2

Captured: `2026-08-06T14:09:36Z`

## Immutable product identity

- Repository: `BuffGamesStudio/buff-platform`
- Validation branch: `validation/movie-buff-integrated-candidate-v1`
- Product commit: `0eccbdedb49342ef2f04b237899e9c246442c0ec`
- Product tree: `5a53aa117838561bcf8e698b63e6ac69ce174e05`
- Previous product: `2be790c88bc7f34969fe607bb78fd7535b621190` / `cbd8061c9c4da410e39363beee02bf53194ed53f`
- Integration baseline: `bf316a15a2120e32d8a32e479df2ae439081f9a1` / `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

## Composition method

The prior accepted visual/security/product reconciliation was preserved. Agent 5 applied only exact committed deltas from the old embedded lane heads to the current live heads, plus Agent 6's additive security package. No product, authorization, database, or presentation conflict was rewritten by Agent 5.

The new product contains 24 exact delta paths. Protected reconciled blobs remain:

- `src/app/games/movie-buff/board-preview/page.tsx` → `ee4ef8bae382aebc1e2242a8342d3858ecbc922c`
- `src/app/games/movie-buff/play/page.tsx` → `2115b1f81a1dd64fa0998ebffcd2ca4ef605f0d5`
- `src/components/movie-buff/MovieBuffBoardRoomClient.tsx` → `da8ea21aba760e51ffb37fa32e8906e5825cf86f`

## Current components

| Component | Branch | SHA | Tree |
|---|---|---|---|
| integration | `integration/movie-buff` | `bf316a15a2120e32d8a32e479df2ae439081f9a1` | `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34` |
| pr3_visuals | `cursor/movie-buff-origin-main-integration-20260803-155410` | `f692e82a5d524c950011e0300908c9cbec2389cb` | `621bd5d39059f76773d84b5a0d1dce851e2ff0de` |
| pr5_hardening | `automation/movie-buff-security-hardening-packet-20260804` | `91eac0d55abb1a9568017df687e8395771d24780` | `1ae3ed427b2c1b38c3731cc9532b5d0fb0c6336f` |
| mov15 | `copilot/MOV-15-public-matchmaking` | `48d44bb156b71060d1b9adcc7a2a3f014cf92060` | `e010c949920f84e5f7aaca9d50ebf39d6ea13309` |
| mov16 | `copilot/MOV-16-vip-authority` | `f169d652a9199a65afd5369c52c0584f635d7031` | `3a66c05277eb0907aba7f3f4f0506fb2eb162259` |
| mov17 | `copilot/MOV-17-shared-phase-machine` | `f17234debfb8942e1998306a12dc33301c1c5440` | `56c63df56f085c256289a8e4510ba05cbea3d9d1` |
| mov18 | `copilot/MOV-18-visual-motion-runtime` | `64ffcc4b2fcb4cb833f18912358861847b385fc7` | `51d5a9387a10a8d3a227bda619f8605efdf39138` |
| pr12_encoding | `copilot/MOV-14-migration-encoding` | `d1f7ca58b534cbccd3071743d542f5788c0e9173` | `ea817ad706f4107fc16482cbe6cc40ec6a012ee0` |
| agent6_security | `security/movie-buff-rls-acl-staging` | `9d1d1392bf5ff0e6961182050dbf902d0001d2c2` | `5c634f5234063f0dc0a72721acfd4b566ae907f3` |
| mov19_validator | `copilot/MOV-19-security-validation` | `46c549675d44f19c22a7786421cf2581dc22af3c` | `d37a8ec456ff079da9f83da5c9fa058867ddf401` |

## Vercel configuration observed

- Team: `team_B5DU86UM8Cb77BUCK3rbijw6`
- Project: `movie-buff` / `prj_u2IlNNHUvEhnAytuuymv9GdN7hJY`
- Framework preset: `nextjs`
- Project Node: `24.x`
- Agent 5 validation Node: `22.x`
- Root directory, explicit install/build commands, ignored-build configuration, and cache behavior: `UNKNOWN`

The Node-version mismatch is recorded and prevents transfer of Agent 5 build PASS to Vercel provenance.

## Scope classification before exact controller execution

Source assembly, focused tests, TypeScript, production build, Windows digital twin, and artifact integrity are `UNKNOWN` pending the exact controller run.

Database, pgTAP, personas, races, browser, accessibility, Vercel provenance, hosted Supabase, staging, rollback, containment, forward reapply, backup/PITR, and production target remain `UNKNOWN`.

Overall release classification: **NO-GO**.

This branch and PR are validation-only, draft, and never merge.
