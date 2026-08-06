# Movie Buff Agent 5 exact integrated candidate v4

Captured: `2026-08-06T14:36:00Z`

## Immutable product

- Product SHA: `ce0c87e05328762a998d05bea2ecacfa0503821e`
- Product tree: `0e497dfec2c53c9057a3558a3244021c659250a4`
- Delta base: `df2289c1efc2e26c18a9691ed6f9c8bb0e45f076` / `1c69793e3308bfaac25141b86afabb92203f7e18`
- Integration: `bf316a15a2120e32d8a32e479df2ae439081f9a1` / `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

Candidate v4 changes only eight Agent 6-owned security/evidence paths relative to v3. It incorporates current Agent 6 head `4b9fefaebe79ed8fb29dc8b107799068fed7ce27`, tree `8b505a0b2c99d661d3ce22c1826103c48f0766c0`.

All other component identities remain:

- PR #3 `f692e82a5d524c950011e0300908c9cbec2389cb`
- PR #5 `91eac0d55abb1a9568017df687e8395771d24780`
- MOV-15 `48d44bb156b71060d1b9adcc7a2a3f014cf92060`
- MOV-16 `f169d652a9199a65afd5369c52c0584f635d7031`
- MOV-17 `9239fcdc731ec05594c75d3ef9961e6cd4d36bbf`
- MOV-18 `6cf6ae7ef951141c630cdd66f178cd73e1b88327`
- PR #12 `d1f7ca58b534cbccd3071743d542f5788c0e9173`
- MOV-19 `46c549675d44f19c22a7786421cf2581dc22af3c`

Protected board/play reconciliation remains unchanged. The current MOV-17 board-room client blob remains `7cbe07c6aad2094fc2831b59b4847bc6c12193b4`.

The Vercel project reports Node `24.x`, while Agent 5 validation uses Node `22.x`; Vercel provenance remains `UNKNOWN`.

All source/build/Windows classifications remain `UNKNOWN` pending the exact v4 run and artifact inspection. Database, pgTAP, personas, races, browser, accessibility, hosted, staging, rollback, containment, reapply, backup/PITR, and production target remain separate `UNKNOWN` scopes.

Overall release classification: **NO-GO**. Draft only. Never merge.
