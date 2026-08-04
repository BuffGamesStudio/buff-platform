# Movie Buff independent GO/NO-GO — v1

Captured: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

## Verdict

# **NO-GO**

UNKNOWN is not PASS. Lane-specific build evidence does not prove one reconciled integrated application, database behavior, hosted state, browser synchronization, accessibility, or rollback execution.

## Exact lane state reviewed

- MOV-15 PR #9: `cf95ade4f050a70f73077561ea95fbb0c0d82b6a`
- MOV-16 PR #6: `95c292ead66fc83cf13d7154bd3cf691610f549d`
- MOV-17 PR #10: `e40f639c761b6f1e61e36b0c807c9beafad7349c`
- MOV-18 PR #8: `6bd23661743d82914ea9c922221883a83be84582`
- MOV-19 PR #7: pre-refresh head `8b81c7c2a57aa720de9516349171e8af8aa356a6`; GitHub records the final head after these document commits.

All four functional PRs and the validation PR remain open, draft, unmerged, and targeted to `integration/movie-buff`.

## Confirmed hosted security failures

Read-only inspection of Supabase project `yfatwreicmiocdxzyznd` confirmed:

- all six target public tables have RLS disabled and no policies;
- anon and authenticated have effective SELECT/INSERT/UPDATE/DELETE on all six;
- broad anonymous execution remains on critical Movie Buff SECURITY DEFINER functions;
- most critical functions use mutable `search_path=public`;
- only migrations `20260803233057` and `20260803235116` are hosted; none of the current lane migrations is hosted.

The hardened `join_movie_buff_room(text)` remains a narrow hosted PASS: owner `postgres`, SECURITY DEFINER, `search_path=pg_catalog`, anon denied, authenticated/service role retained. It does not cure the wider exposure.

## Lane decisions

### MOV-15 — source/build repaired; database proof pending

At exact SHA `cf95ade…`:

- server-owned public size is exactly three;
- canonical compatibility, partial waiting-room uniqueness, player/key advisory locks, ordinary row waits, and no `SKIP LOCKED` are present;
- browser two-player/350 ms start authority is removed;
- the exact-SHA evidence wrapper now binds checkout HEAD, manifest SHA, and child expected SHA to one value;
- Vercel deployment `dpl_8MgC3s81XUiYEXpUDmQZWyU7dniT` compiled, completed TypeScript, generated all pages, and reached READY.

Still UNKNOWN: migration apply, pgTAP, Node contract tests, repeated three-player races, external row-lock contention, browser behavior, containment/rollback rehearsal, and MOV-17 start compatibility.

Classification: **WAITING_FOR_LOCAL_EVIDENCE / not accepted.**

### MOV-16 — required finalizer present; database proof pending

At exact SHA `95c292…`:

- first-open, lock, activation, participant-snapshot, release, and replay source repairs are present;
- Round Intro consumes canonical MOV-17 navigation rather than VIP readiness;
- required service-only `finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)` now exists;
- the finalizer binds the exact deadline, creates deterministic explicit no-VIP pass records for missing unreleased humans at deadline, consumes no inventory, and returns stable readiness;
- owner/search-path/direct-grant boundaries and data-preserving finalizer rollback are present;
- Vercel deployment `dpl_DRaxAj1Eta65Ty9RGjxkousPug2Q` compiled, completed TypeScript, generated all pages, and reached READY.

Still UNKNOWN: SQL parse/apply, pgTAP, persona/adversarial execution, real concurrency, privacy, exact-once consumption, rollback rehearsal, and combined MOV-16/MOV-17 runtime compatibility.

Classification: **WAITING_FOR_LOCAL_EVIDENCE / not accepted.**

### MOV-17 — functional source present; synchronized execution pending

At exact SHA `e40f639…`:

- durable canonical phase, route, participant-seat, selector, board-selection, playback, answer, results, reconnect, Buster, and blocked/terminal source contracts are present;
- `vip_lock -> board_select` fails closed unless the MOV-16 finalizer returns `advanceReady = true`;
- the prior `system` participant-controller contradiction is repaired: abandoned seats remain original-human controlled until safe-boundary Buster activation, while system remains a non-seat actor;
- the exact-SHA three-client evidence wrapper verifies local targets, consent, checkout SHA, hashes, exit status, and test-profile restoration;
- the Buster correction rollback is self-contained and preserves durable data;
- Vercel deployment `dpl_GekqaYCKWYFS77QH2Mw6Gh5VrDvF` compiled, completed TypeScript, generated all pages, and reached READY.

Still UNKNOWN: SQL parse/apply, pgTAP, Node tests, exact-SHA three-client journey, synchronized timestamps, reconnect/Buster runtime, browser behavior, rollback rehearsal, and combined MOV-15/MOV-16/MOV-17 execution.

Classification: **WAITING_FOR_LOCAL_EVIDENCE / not accepted.**

### MOV-18 — isolated executable evidence passes

At exact SHA `6bd236…`, GitHub Actions run `30923902972`, job `92041382445`, independently verified:

- exact branch/SHA and clean checkout;
- exact pair `@rive-app/react-webgl2@4.30.0` and `@rive-app/webgl2@2.39.1`;
- lock deep-equality to integration after removing only the approved Rive declaration/nodes;
- `npm ci`;
- 13/13 focused tests;
- `tsc --noEmit`;
- production Next build with localhost-only placeholders and 14/14 pages;
- artifact `8898290290`, digest `sha256:4bca98b5ca8b9868f7bb0d19769f0d33dc86b160a81bc712aea2b87e5a0e5b28`.

The visual boundary remains passive by source: no phase, selector, tile, playback, VIP, score, penalty, or hosted-state mutation authority. Missing assets, renderer errors, and reduced motion select static presentation.

Still UNKNOWN: production `.riv` assets, verified artboard/state-machine names, real load/parse/init, WebGL context loss, rendered browser behavior, hydration, responsive/accessibility/modal-focus proof, reconnect integration, and rollback rehearsal.

Classification: **READY_FOR_REVIEW for isolated scope / not accepted.**

### MOV-19 — validation records refreshed; release remains blocked

MOV-19 preserves source-versus-runtime proof scopes and has now independently re-reviewed each current functional SHA. No MOV-19 local Node, pgTAP, race, browser, Supabase, or integrated-SHA PASS is claimed.

Classification: **AGENT_WORKING / overall NO-GO.**

## Narrow PASS

- integration and all five lane branches exist;
- all functional PRs remain draft against the correct integration target;
- MOV-15 exact-SHA compile/TypeScript/build and repaired evidence binding;
- MOV-16 exact-SHA compile/TypeScript/build and static finalizer boundary;
- MOV-17 exact-SHA compile/TypeScript/build and corrected non-seat system/Buster boundary;
- MOV-18 exact-SHA Actions dependency/test/TypeScript/build/artifact evidence;
- hosted hardened `join_movie_buff_room(text)` metadata;
- hosted service-role CRUD continuity;
- actual Figma write capability verified by reversible probe;
- MOV-19 evidence proof-scope and hosted-security observations.

## FAIL

- hosted six-table RLS/grant posture;
- hosted anonymous critical RPC execution and mutable search paths;
- current integration branch does not contain the functional lane implementations;
- no one exact integrated SHA reconciles PR #3, PR #5, and MOV-15 through MOV-18;
- no executed database proof establishes matchmaking, VIP, phase, board, playback, answer, reconnect, Buster, or rollback behavior;
- hosted post-remediation state remains absent.

## UNKNOWN

- MOV-15 migration, races, contention, containment, and rollback execution;
- MOV-16 SQL/persona/concurrency/privacy/exact-once/finalizer behavior;
- MOV-17 synchronized three-client journey, reconnect, Buster, no-human closure, and rollback;
- MOV-18 real production asset/rendering/accessibility behavior;
- cross-lane migration order and function-overwrite compatibility;
- one integrated lint, TypeScript, focused-test, pgTAP, production-build, browser, and diff-check result;
- staging/production deployed SHA and post-remediation database state;
- rollback after real state writes.

## GO exit contract

GO requires, on one exact integrated SHA:

1. independently reviewed integration diff preserving PR #3 visuals and PR #5 authorization hardening;
2. successful lint, TypeScript, focused tests, pgTAP, production build, and diff check;
3. repeated fresh three-player matchmaking races, lock contention, and complete negative cases;
4. executed VIP ownership/privacy/deadline/finalizer/duplicate/reconnect/exactly-once personas;
5. three clients agreeing through intro, VIP, board, atomic selection, transition, shared playback, answer/results, rotation, leave/reconnect, Buster, and no-human closure;
6. actual Rive load/failure, reduced-motion, hydration, accessibility, modal-focus, and responsive proof;
7. staging ledger/object hashes/owners/search paths/grants/RLS/policies/service-role proof;
8. tested rollback/containment with explicit authority and data-loss classification;
9. production identity and exact deployed SHA before any production-ready claim.

## Safety statement

No merge, deployment initiated by MOV-19, production alias change, destructive reset, paid resource, secret disclosure, force-push, hosted/production Supabase mutation, or hosted resource deletion was performed.
