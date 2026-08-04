# Movie Buff independent GO/NO-GO — v1

Captured: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

## Verdict

# **NO-GO**

UNKNOWN is not PASS. No local, browser, database, race, build, or production result is claimed unless an actual exact-SHA artifact exists.

## Decision basis

### Hosted security — confirmed FAIL

Read-only inspection of Supabase project `yfatwreicmiocdxzyznd` confirmed:

- all six target tables have RLS disabled and no policies;
- anon and authenticated have effective SELECT/INSERT/UPDATE/DELETE on all six;
- broad anon execution remains on critical Movie Buff SECURITY DEFINER functions;
- most critical functions use mutable `search_path=public`;
- the hosted migration ledger contains only `20260803233057` and `20260803235116`, so none of the current lane migrations is hosted.

The hardened `join_movie_buff_room(text)` function is a narrow PASS: owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog`, anon denied, authenticated/service role allowed. It does not cure the broader exposure.

### MOV-15 — PR #9, HEAD `3cea9b9f5e5436a834adf459834e7196890d2ac1`

Static source now contains the intended strict-three capacity, normalized compatibility key, per-player and compatibility serialization, partial uniqueness guard, and removal of the known two-player browser timer. These are source-invariant passes only.

Release blockers remain:

- zero GitHub Actions runs;
- no executed repeated race or full negative matrix;
- no hosted application;
- no rollback SQL;
- PR body is stale and says the waiting-room defect remains although HEAD source removes it;
- the added contract test was not included in the prior exact file claim;
- `start_movie_buff_match(uuid)` overlaps MOV-17 phase ownership and must be reconciled before integration.

Classification: **UNKNOWN for behavior; not accepted.**

### MOV-16 — PR #6, HEAD `3683c1ec2b70b8fabc85d70b77242e794b505c7e`

Confirmed blockers:

- first concurrent window-open and first concurrent lock can race through check-then-insert paths;
- only a required-player count is persisted, not immutable required human identities/system classification;
- Round Intro can navigate from VIP readiness rather than canonical MOV-17 phase;
- contradictory activation replay is not fully bound to the supplied activation key;
- required ownership/privacy/deadline/reconnect/exactly-once personas are not executed;
- post-write rollback drops entitlement and audit state.

Classification: **CHANGES_REQUESTED / not accepted.**

### MOV-17 — no implementation or PR

Integration still has manual progression, non-atomic board mutation, fail-open real-room fallback, per-player playback timestamps, and no proven selector abandonment, reconnect grace, Buster, no-human closure, or three-client agreement.

Classification: **FAIL on current integration; implementation/evidence absent.**

### MOV-18 — PR #8, HEAD `d9139c7a7f6628efdc032326db4b099999b2e8c3`

The visual authority boundary is correctly read-only at source level, but:

- the “Rive” surface has no Rive runtime and attaches `onError` to a `<div>`, so `.riv` failure cannot trigger the claimed fallback;
- the Game Menu dialog lacks initial focus, focus containment, Escape handling, and focus restoration;
- no package, production asset, shared-page integration, Actions run, browser proof, screenshot, hydration proof, or accessibility result exists.

Classification: **CHANGES_REQUESTED / scaffold only.**

### MOV-19 — PR #7

MOV-19 found and corrected its own evidence-integrity defects:

- static regex checks now carry `proofScope` and `claimType`;
- repository-static evidence cannot PASS runtime/hosted claims;
- three-client matchmaking uses fresh targeted local rooms and leaves full phase synchronization UNKNOWN;
- pgTAP now targets the six-table and critical RPC security floor;
- validation and rollback documents now identify exact lane heads and hosted observations.

These are source changes only. PR #7 has no Actions run and remains validation-pending.

## Classification summary

### Narrow PASS

- integration and all lane branches exist;
- static strict-three source invariants at MOV-15 HEAD;
- static read-only visual authority invariant at MOV-18 HEAD;
- hosted hardened `join_movie_buff_room(text)` metadata;
- hosted service-role table CRUD continuity;
- Figma write capability was verified by a reversible create/remove probe;
- MOV-19 evidence schema now forbids static behavioral PASS.

### FAIL

- hosted six-table RLS/grant posture;
- hosted anonymous critical RPC execution and mutable definer search paths;
- current integration phase/board/playback authority;
- MOV-16 concurrency/participant/phase/rollback findings;
- MOV-18 actual asset-failure wiring and dialog accessibility;
- tested post-write rollback readiness.

### UNKNOWN

- all lane lint, TypeScript, Node, pgTAP, route, build, and diff-check outputs;
- MOV-15 runtime race and negative matrix;
- MOV-16 persona and concurrency behavior;
- MOV-17 implementation and three-client synchronization;
- MOV-18 runtime/browser/asset/accessibility behavior;
- exact preview/staging/production deployed SHA;
- hosted post-remediation ACL/RLS/RPC state;
- rollback rehearsal after state writes.

## GO exit contract

A GO recommendation requires all of the following on one exact integrated SHA:

1. independently reviewed lane diffs with no unresolved ownership collision;
2. successful lint, TypeScript, focused tests, pgTAP, production build, and diff check;
3. repeated fresh three-player matchmaking races and complete negative cases;
4. executed VIP ownership/privacy/deadline/duplicate/reconnect/exactly-once personas;
5. three clients agreeing through Round Intro, board, atomic tile selection, transitions, shared playback timestamp, answer/results, selector rotation, and reconnect;
6. reduced-motion, missing-asset, hydration, accessibility, and responsive visual proof;
7. staging database proof for migration ledger, object hashes, owners, search paths, direct/effective grants, RLS, policies, and service-role continuity;
8. tested rollback/containment with explicit authority and data-loss classification;
9. production identity and exact deployed SHA before any production-ready claim.

## Safety statement

No merge, deployment, production alias change, destructive reset, paid resource, secret disclosure, force-push, hosted/production Supabase mutation, or hosted resource deletion was performed by this review.
