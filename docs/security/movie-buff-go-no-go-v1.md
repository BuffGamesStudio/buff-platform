# Movie Buff independent GO/NO-GO — v1

Captured: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

## Verdict

# **NO-GO**

UNKNOWN is not PASS. No local, database, browser, race, accessibility, rollback, staging, or production result is claimed without exact-SHA evidence.

## Exact lane state reviewed

- MOV-15 PR #9: `ce1f49bef7bf4f911e1949ef5fd626c0f92132dd`
- MOV-16 PR #6: `3683c1ec2b70b8fabc85d70b77242e794b505c7e`
- MOV-17 PR #10: `9b8a46aad207cd7ecc7aa99d99cf3580fd4ac73f`
- MOV-18 PR #8: `900e9877d11b1ecd18ed6b4d847437af48b9b49b`
- MOV-19 PR #7: final current head is recorded in GitHub/Linear after this document commit

## Confirmed hosted security failures

Read-only inspection of Supabase project `yfatwreicmiocdxzyznd` confirmed:

- all six target public tables have RLS disabled and no policies;
- anon and authenticated have effective SELECT/INSERT/UPDATE/DELETE on all six;
- broad anonymous execution remains on critical Movie Buff SECURITY DEFINER functions;
- most critical functions use mutable `search_path=public`;
- only migrations `20260803233057` and `20260803235116` are hosted; none of the current lane migrations is hosted.

The hardened `join_movie_buff_room(text)` is a narrow hosted PASS: owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog`, anon denied, authenticated/service role retained. It does not cure the wider exposure.

## Lane decisions

### MOV-15 — validation pending

Static source contains strict-three size, canonical key, per-player and compatibility locking, partial uniqueness, ordinary `FOR UPDATE`, and removal of the known two-player browser timer.

Release blockers:

- no executable migration/race/negative-case output;
- no GitHub Actions run;
- harness can emit PASS without exact SHA/command/exit/artifact hashes;
- local deletion lacks separate consent and failure cleanup;
- no external row-lock contention regression;
- same-settings fourth-player/cohort policy needs an explicit product record;
- no rollback SQL;
- start RPC overlaps MOV-17 phase ownership.

Classification: **WAITING_FOR_LOCAL_EVIDENCE / not accepted.**

### MOV-16 — changes requested

Confirmed blockers:

- concurrent first window-open and first lock races;
- required-human count without immutable participant identities/system/Buster classification;
- browser navigation from VIP readiness rather than canonical phase;
- incomplete contradictory activation replay binding;
- no executed ownership/privacy/deadline/reconnect/exactly-once personas;
- destructive post-write rollback.

Classification: **CHANGES_REQUESTED / not accepted.**

### MOV-17 — contract only

PR #10 defines a coherent phase/participant/leave contract, but runtime implementation is absent:

- referenced view/advance routes do not exist;
- no migration/RPC/state tables;
- no atomic tile/clip transition or shared playback timestamp;
- no participant/leave ledger, reconnect worker, Buster execution, or shared-page rewiring;
- no rollback, pgTAP, or three-client harness;
- no GitHub Actions run.

Current integration still has manual progression, service-role multi-statement board mutation, fail-open real-room fallback, and per-player playback timestamps.

Classification: **AGENT_WORKING; current integration FAIL; runtime UNKNOWN.**

### MOV-18 — build passes, runtime blocked

Vercel deployment `dpl_3gWEhvPNo8wnpjo2VHESqGYFtp62` independently reached READY for exact SHA `900e9877…`. Build logs show successful compile, TypeScript, static page generation, route manifest inclusion, and deployment. This is a narrow preview-build PASS.

Blocking findings remain:

- HEAD availability cannot prove a valid/parseable `.riv` file or successful runtime initialization;
- actual Rive package/adapter/production assets are absent;
- modal lacks complete focus and keyboard behavior;
- reduced-motion hydration behavior is unproven;
- protected preview could not be rendered through the connected fetch;
- responsive, accessibility, malformed-asset, reconnect, and browser behavior remain UNKNOWN.

Classification: **CHANGES_REQUESTED / build-only evidence.**

### MOV-19 — validator corrected, execution pending

MOV-19 corrected its own evidence defects:

- proof scope and claim type forbid static runtime/hosted PASS;
- matchmaking races are fresh and local-target guarded;
- full phase synchronization remains explicitly UNKNOWN;
- pgTAP covers the six-table/RPC security floor and declares the correct 111-test plan;
- matrix and rollback evidence identify current lane heads and hosted observations.

No MOV-19 Actions/local validator output exists. Classification: **WAITING_FOR_LOCAL_EVIDENCE.**

## Narrow PASS

- integration and all five lane branches exist;
- MOV-15 strict-three source invariants;
- MOV-17 canonical contract clarity;
- MOV-18 read-only visual-authority invariant;
- MOV-18 exact-SHA Vercel compile/TypeScript/build/route presence;
- hosted hardened `join_movie_buff_room(text)` metadata;
- hosted service-role CRUD continuity;
- actual Figma write capability verified by reversible probe;
- MOV-19 evidence schema and pgTAP plan integrity.

## FAIL

- hosted six-table RLS/grant posture;
- hosted anonymous critical RPC execution and mutable search paths;
- current integration board/phase/playback authority;
- MOV-16 concurrency/participant/phase/rollback defects;
- MOV-17 functional implementation absence;
- MOV-18 actual asset-init failure channel and modal accessibility;
- tested post-write rollback readiness.

## UNKNOWN

- all local lane lint, Node, pgTAP, race, browser, and diff-check results;
- MOV-15 runtime convergence and lock contention;
- MOV-16 persona/concurrency behavior;
- MOV-17 three-client synchronized journey, reconnect, Buster, and no-human closure;
- MOV-18 rendered runtime, malformed asset, reduced motion, hydration, accessibility, and responsive behavior;
- one reconciled integrated SHA containing PR #3, PR #5, and all functional lanes;
- staging/production deployed SHA and post-remediation database state;
- rollback after real state writes.

## GO exit contract

GO requires, on one exact integrated SHA:

1. independently reviewed diffs with ownership collisions resolved;
2. successful lint, TypeScript, focused tests, pgTAP, production build, and diff check;
3. repeated fresh three-player matchmaking races and complete negative cases;
4. executed VIP ownership/privacy/deadline/duplicate/reconnect/exactly-once personas;
5. three clients agreeing through intro, VIP, board, atomic selection, transition, shared playback, answer/results, rotation, leave/reconnect, Buster, and no-human closure;
6. actual Rive failure, reduced-motion, hydration, accessibility, and responsive proof;
7. staging ledger/object hashes/owners/search paths/grants/RLS/policies/service-role proof;
8. tested rollback/containment with explicit authority and data-loss classification;
9. production identity and exact deployed SHA before any production-ready claim.

## Safety statement

No merge, deployment initiated by MOV-19, production alias change, destructive reset, paid resource, secret disclosure, force-push, hosted/production Supabase mutation, or hosted resource deletion was performed.
