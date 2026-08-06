# Movie Buff integrated candidate v1 — Agent 5

## Classification

- Branch: `validation/movie-buff-integrated-candidate-v1`
- Target: `integration/movie-buff`
- Mode: validation-only, draft PR, never merge
- Overall release classification: `NO-GO`
- Hosted security: `FAIL`
- Source/build/database/browser/staging/rollback evidence: `UNKNOWN` until separately executed for the exact candidate

## Immutable product identity

- Product composition SHA: `2be790c88bc7f34969fe607bb78fd7535b621190`
- Product tree SHA: `cbd8061c9c4da410e39363beee02bf53194ed53f`
- Assembly timestamp: `2026-08-06T04:17:55Z`
- Reconciled product base: `cbf1c3e7c3fdd6925cf3ba473f9729a05d5fdfc7`
- Reconciled base tree: `1657aeaba849ec4f150fb297c975b73f08755200`

The validation branch also contains metadata and workflow commits. Those controller commits do not change the immutable product identity above. Every laboratory must record both the live controller head and the immutable product SHA/tree.

## Exact component heads

| Component | Branch | Full SHA | Tree SHA |
| --- | --- | --- | --- |
| Integration baseline | `integration/movie-buff` | `bf316a15a2120e32d8a32e479df2ae439081f9a1` | `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34` |
| PR #3 visuals | `cursor/movie-buff-origin-main-integration-20260803-155410` | `f692e82a5d524c950011e0300908c9cbec2389cb` | `621bd5d39059f76773d84b5a0d1dce851e2ff0de` |
| PR #5 hardening | `automation/movie-buff-security-hardening-packet-20260804` | `91eac0d55abb1a9568017df687e8395771d24780` | `1ae3ed427b2c1b38c3731cc9532b5d0fb0c6336f` |
| MOV-15 | `copilot/MOV-15-public-matchmaking` | `dc9804cdae03d8627a89980dbcdf2292d2055372` | `86db75f79444b02c972ba4771244950cbec41b38` |
| MOV-16 | `copilot/MOV-16-vip-authority` | `4a5e5591113b005f69fd34361becb2fd8d024897` | `5d0fc27b1c5240196d76eabddee3d59186cda1d3` |
| MOV-17 | `copilot/MOV-17-shared-phase-machine` | `f17234debfb8942e1998306a12dc33301c1c5440` | `56c63df56f085c256289a8e4510ba05cbea3d9d1` |
| MOV-18 | `copilot/MOV-18-visual-motion-runtime` | `780153d0624a8186db1c628f6bd93906bca41a30` | `5a8dc53bc9e13c019675b8a95145422a8436c6de` |
| PR #12 encoding | `copilot/MOV-14-migration-encoding` | `f86689895cb810831d9b4d6346ee95eed9439495` | `6db263611f8a4ef8fd4fbce096d5ff919dac8de6` |
| MOV-19 validator | `copilot/MOV-19-security-validation` | `46c549675d44f19c22a7786421cf2581dc22af3c` | `d37a8ec456ff079da9f83da5c9fa058867ddf401` |

PR #13 is excluded because it is closed, unmerged, and superseded.

## Composition method

The product commit preserves the previously accepted visual/live-flow reconciliation, then substitutes only exact current lane blobs where the live heads moved:

1. MOV-16: exact current evidence-workflow blob.
2. MOV-17: exact current results page and authoritative-phase contract test.
3. MOV-18: exact current passive visual adapter, index, mapping library, and test.
4. PR #12: exact current encoding validator and test; BOM-clean SQL bytes remain unchanged.
5. MOV-19: exact current validator workflows, scripts, tests, pgTAP, and release documents.

The product commit declares all current lane heads as parents for provenance. Agent 5 did not hand-edit lane-owned functional logic.

## Overlap and ownership decisions

| Collision | Decision | Functional owner |
| --- | --- | --- |
| PR #3 / PR #5 / MOV-17 board-preview and play entry points | Preserve the accepted reconciliation; do not re-merge lane tips over it | Visual/live-flow owners |
| PR #5 / MOV-17 `MovieBuffBoardRoomClient.tsx` | Preserve the accepted reconciled blob | MOV-17 with PR #5 security review |
| PR #5 / MOV-18 dependency metadata | Preserve accepted dependency reconciliation | MOV-18 and PR #5 |
| MOV-17 / PR #12 historical SQL | Preserve PR #12 BOM-clean bytes; retain MOV-17 semantic ownership | PR #12 bytes, MOV-17 semantics |

Protected reconciled blobs are pinned in the manifest and checked by the Agent 5 workflow.

## Important caveat

The product tree preserves the accepted PR #5 hardening reconciliation, but this document does **not** claim that every original PR #5 blob appears byte-for-byte. Independent validation must prove the resulting tree still satisfies PR #5 authentication, authorization, membership, RPC, RLS, and security constraints. Until then that scope remains `UNKNOWN`, and the recorded hosted security posture remains `FAIL`.

## Required exact-SHA validation

The Agent 5 workflow must record:

- live controller SHA/tree and immutable product SHA/tree;
- merge bases for every component;
- protected-blob ownership checks;
- dependency install;
- focused lane tests;
- TypeScript;
- production build with localhost-only placeholders;
- SQL encoding checks;
- secret scan;
- clean-worktree postflight;
- evidence hashes and artifact identity.

A successful workflow may establish source assembly/build `PASS` only for its exact controller and product identities. Database, browser, hosted, isolated staging, rollback, containment, forward reapply, deployment provenance, backup/PITR, and production remain separate gates.

## Downstream handoff

Agents 6, 7, 8, 9, and 10 must use:

- validation branch: `validation/movie-buff-integrated-candidate-v1`;
- immutable product SHA: `2be790c88bc7f34969fe607bb78fd7535b621190`;
- immutable product tree: `cbd8061c9c4da410e39363beee02bf53194ed53f`;
- public marker: `/movie-buff-build-marker.json`;
- machine-readable manifest: `docs/validation/movie-buff-integrated-candidate-v1.manifest.json`.

Any component head movement makes evidence tied to the old component set stale. No production or hosted mutation is authorized.
