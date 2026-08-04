# Movie Buff rollback readiness v1

Date: 2026-08-04  
Owner: MOV-19 independent validation  
Integration base: `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Release posture: **NO-GO**

A rollback file is not rollback proof. A usable record identifies the exact forward branch/SHA, migration version/checksum, target identity, state written after apply, data-loss consequences, authority, stop conditions, exact commands/output, timestamps, and post-rollback verification.

## MOV-15 — PR #9, `ce1f49bef7bf4f911e1949ef5fd626c0f92132dd`

**Classification: FAIL for completeness; UNKNOWN for execution.**

The lane adds `public_matchmaking_key`, a check constraint, a partial unique index, and function redefinitions. No rollback SQL is present.

Required containment/rollback:

1. stop new public matchmaking;
2. record all waiting/starting/active rooms and memberships using the key;
3. prevent mixed application versions from writing different contracts;
4. preserve strict-three admission—never restore caller-controlled capacity or the two-player rule;
5. prefer a corrected forward migration while retaining room/membership evidence;
6. drop the key/index only on an explicitly disposable target after proving no deployed SHA depends on them;
7. reconcile `start_movie_buff_match(uuid)` with MOV-17 before any application rollback.

Data-loss/security classification: dropping the key destroys compatibility evidence; restoring old function definitions reactivates unsafe admission behavior.

## MOV-16 — PR #6, `3683c1ec2b70b8fabc85d70b77242e794b505c7e`

**Classification: FAIL for post-write rollback; UNKNOWN for disposable rehearsal.**

The current rollback drops definitions, inventory, windows, locks, and consumptions. After real writes it destroys entitlement and audit history.

Required containment:

- stop new VIP window creation and activation;
- export definitions, quantities, locks, consumptions, and idempotency keys;
- classify open windows/matches for completion, cancellation, or migration;
- preserve a read-only audit path;
- require explicit data-loss authority before any drop;
- coordinate application and database rollback order.

## MOV-17 — PR #10, `9b8a46aad207cd7ecc7aa99d99cf3580fd4ac73f`

**Classification: UNKNOWN; rollback implementation absent.**

PR #10 is contract-only. No phase-state migration or rollback SQL exists.

The future rollback must:

- stop new matches and phase mutation;
- preserve room, match, round, phase version, selector, tile, clip, shared timestamps, required-human snapshots, leave quotes, abandonment ledger, reconnect deadlines, and Buster relationships;
- choose whether in-flight matches finish, cancel, or migrate;
- prevent older application code from interpreting new state or falling back to demo/client-local state;
- preserve MOV-15 strict-three and MOV-16 private lock/consumption semantics;
- preserve PR #5 authorization protections;
- verify no duplicate charge, phase transition, selection, or playback start occurs during rollback.

Dropping phase/participant state after match writes would be data-destructive and authority-destructive.

## MOV-18 — PR #8, `900e9877d11b1ecd18ed6b4d847437af48b9b49b`

**Classification: PASS for repository-only removal of the current isolated additions; UNKNOWN after dependency/shared-page integration.**

The reviewed PR adds new visual/runtime/test/docs files and no package/lock or shared gameplay-page edit. Vercel successfully built the exact SHA, but rendered runtime acceptance is not proven.

Current repository rollback can revert the isolated commits without database loss. After Rive/package/shared-page integration, rollback must:

- remove only MOV-18 package/lock entries;
- retain static and reduced-motion fallbacks;
- preserve MOV-17 authoritative action/navigation wiring and PR #3 visual structure;
- ensure gameplay never depends on asset availability or animation completion;
- verify hydration, keyboard/focus behavior, malformed asset recovery, and responsive presentation after revert.

## MOV-19 / PR #5 security remediation

**Classification: FAIL if rollback reopens exposure; UNKNOWN for safe containment rehearsal.**

A down migration that disables RLS or restores anonymous CRUD/EXECUTE is security-destructive. It must not recreate the hosted posture observed on 2026-08-04.

Preferred response to a broken policy/function:

1. disable the affected feature or route;
2. preserve RLS and anonymous revocations;
3. correct the policy/internal authorization forward;
4. preserve verified service-role continuity only where required;
5. re-probe definitions/hashes, owners, search paths, direct/effective grants, RLS, policies, and table grants.

## Universal stop conditions

Stop when:

- target/project identity or deployed SHA is missing;
- migration ledger differs from approved preflight;
- active matches/new writes are not contained;
- backup/export identity is missing where data can be lost;
- rollback would reopen anonymous/public access;
- service-role continuity is unverified;
- operator apply/rollback authority is absent;
- raw postflight evidence cannot be captured;
- hosted/production mutation lacks explicit authorization.

## Mandatory evidence fields

- repository, branch, forward SHA, rollback SHA;
- migration filename/version and SHA-256;
- target project/database and environment;
- deployed application SHA before/after;
- rows/state written after forward apply;
- active match/window inventory;
- backup/export/snapshot identity;
- data-loss and security-loss classification;
- operator and authorization record;
- exact commands, timestamps, exit codes, stdout/stderr;
- post-rollback ledger, object hashes, owners, search paths, ACLs, RLS/policies, persona checks, and application smoke evidence.

No rollback execution, hosted mutation, or production mutation is claimed or authorized.
