# Movie Buff rollback readiness v1

Date: 2026-08-04  
Owner: MOV-19 independent validation  
Integration base: `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Release posture: **NO-GO**

A rollback file is not rollback proof. A usable record identifies the exact forward branch/SHA, migration version/checksum, target identity, state written after apply, data-loss consequences, authority, stop conditions, exact commands/output, timestamps, and post-rollback verification.

## MOV-15 — PR #9, `cf95ade4f050a70f73077561ea95fbb0c0d82b6a`

**Classification: PASS for fail-closed containment design; UNKNOWN for execution and full rollback.**

The lane adds `public_matchmaking_key`, a check constraint, a partial unique index, and matchmaking/readiness/start function redefinitions.

The committed packet is intentionally containment rather than restoration of the known-unsafe predecessor:

- requires explicit session setting `movie_buff.allow_matchmaking_containment = on`;
- revokes authenticated matchmaking, readiness, and start execution;
- keeps PUBLIC/anon denied;
- preserves service-role diagnostic continuity;
- deletes or rewrites no rooms, memberships, matches, compatibility history, or event data;
- does not drop the compatibility column/index/constraint.

This is safer than restoring caller-controlled capacity, two-player public start, broad anonymous execution, or mutable search paths. It is not a complete rollback to an earlier application contract and has not been rehearsed.

Required proof:

1. exact target and application SHA;
2. capture of waiting/starting/active rooms and open memberships;
3. explicit containment authorization;
4. apply output and direct/effective grant verification;
5. service-role diagnostic continuity;
6. browser admission/readiness/start denial personas;
7. forward recovery plan preserving strict-three;
8. MOV-17 function-order compatibility.

Data-loss/security classification: current containment is non-destructive. Dropping the key destroys compatibility evidence; restoring old function definitions reactivates unsafe admission behavior.

## MOV-16 — PR #6, `95c292ead66fc83cf13d7154bd3cf691610f549d`

**Classification: mixed — guarded destructive main rollback; data-preserving ordered corrections; all execution UNKNOWN.**

### Main VIP rollback

The main rollback drops definitions, inventory, windows, required-player snapshots, locks, and consumptions. It now blocks when VIP data exists unless explicitly authorized through a disposable-target session setting, but after real writes it remains entitlement- and audit-destructive.

Required containment before any main removal:

- stop new VIP window creation, lock, finalization, and activation;
- export definitions, quantities, locks, consumptions, idempotency keys, required-player snapshots, and release reasons;
- classify open windows/matches for completion, cancellation, or migration;
- preserve a read-only audit path;
- require explicit data-loss authority and verified disposable target;
- coordinate application and database rollback order.

### Participant-release correction rollback

`20260804073200_movie_buff_vip_snapshot_release_hardening.rollback.sql` restores the immediately preceding release behavior without deleting VIP data. Execution is UNKNOWN.

### Deadline-finalizer rollback

`20260804073300_movie_buff_vip_deadline_finalize.rollback.sql` revokes and drops only `finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)`. It preserves windows, required-player rows, explicit no-VIP pass locks, selections, inventory, and consumptions.

This is data-preserving but immediately blocks MOV-17 `vip_lock -> board_select` because MOV-17 intentionally fails closed when the function is absent. Application containment and active-match disposition are therefore required before use. Execution is UNKNOWN.

## MOV-17 — PR #10, `e40f639c761b6f1e61e36b0c807c9beafad7349c`

**Classification: designed/guarded in layers; UNKNOWN for execution and in-flight-state behavior.**

The lane now includes additive phase-state, participant-seat, answer, event, authorization, tile-mutation, contract-alignment, and rollback artifacts.

### Safe-boundary Buster correction rollback

`20260804083200_movie_buff_buster_safe_boundary.rollback.sql` is self-contained:

- removes the correction trigger;
- restores the immediately preceding canonical phase view without safe-boundary activation;
- restores owner and intended caller grants;
- drops only the correction staging/activation functions;
- deletes no phase, seat, event, board, answer, room, match, or round data.

This rollback disables delayed Buster activation while preserving durable records. It has not been rehearsed.

### Contract-alignment rollback

The alignment rollback removes the finalization trigger/route helper/alignment constraint surfaces as defined by the lane. It must not be used while an application SHA expects the MOV-16 finalization guard or canonical route helper. Exact forward/down migration order and post-down function availability require local proof.

### Main phase rollback

Dropping authoritative phase/participant/answer/event state after match writes is authority- and data-destructive. A production-quality response should prefer containment and forward correction:

1. stop new matchmaking and phase mutation;
2. prevent mixed application versions;
3. inventory active matches, phases, versions, selector seats, tile/clip selections, shared timestamps, VIP windows/passes, answers, reconnect deadlines, replacement timing, and leave/abandonment state;
4. choose finish, cancel, or migrate for each in-flight match;
5. preserve MOV-15 strict-three, MOV-16 private locks/consumption, PR #5 authorization, and PR #3 rendering structure;
6. prove no duplicate charge, phase transition, selection, playback start, score, or Buster activation during rollback;
7. verify older application code cannot fall back to demo/client-local authority.

The exact-SHA evidence wrapper snapshots/restores test-profile display names, but this does not prove database rollback.

## MOV-18 — PR #8, `6bd23661743d82914ea9c922221883a83be84582`

**Classification: PASS for isolated rollback design and exact build/test evidence; UNKNOWN for rehearsal and shared-page integration.**

The lane adds the exact Rive dependency pair, isolated visual/runtime components, preview, tests, workflow, and documentation. It changes no Supabase object or gameplay-authority route.

`docs/product/movie-buff-visual-runtime-rollback.md` defines:

- automatic static containment for missing assets, reduced motion, and renderer failure;
- adapter, dependency-pair, and isolated-proof rollback units;
- synchronized `package.json`/`package-lock.json` removal boundaries;
- normal revert-only procedure with no force-push;
- stop conditions and post-revert evidence requirements.

GitHub Actions run `30923902972` proved the exact dependency pair, minimal lock boundary, tests, TypeScript, build, and evidence artifact at the forward SHA. It did not execute a rollback.

Rollback requirements after shared-page integration:

- remove only MOV-18 package/lock nodes and visual wiring;
- retain static/reduced-motion fallbacks;
- preserve MOV-17 authoritative action/navigation wiring and PR #3 visual structure;
- ensure gameplay never depends on asset availability or animation completion;
- verify hydration, keyboard/focus behavior, malformed asset recovery, responsive presentation, and the final journey after revert.

## MOV-19 / PR #5 security remediation

**Classification: FAIL if rollback reopens exposure; UNKNOWN for safe containment rehearsal.**

A down migration that disables RLS or restores anonymous CRUD/EXECUTE is security-destructive. It must not recreate the hosted posture observed on 2026-08-04.

Preferred response to a broken policy/function:

1. disable the affected feature or route;
2. preserve RLS and anonymous revocations;
3. correct the policy/internal authorization forward;
4. preserve verified service-role continuity only where required;
5. re-probe definitions/hashes, owners, search paths, direct/effective grants, RLS, policies, and table grants.

## Cross-lane rollback order

No cross-lane rollback is authorized or proven. A safe plan must account for dependencies:

1. contain browser admission and new match creation;
2. contain shared phase mutation and classify active matches;
3. contain VIP lock/finalization/activation while preserving audit data;
4. remove visual integration only after authoritative gameplay remains operable through static fallback;
5. change database functions/tables only after the deployed application SHA no longer requires them;
6. verify PR #5 authorization and hosted RLS/grants are never weakened;
7. verify MOV-15 strict-three is never replaced by the unsafe two-player predecessor.

## Universal stop conditions

Stop when:

- target/project identity or deployed SHA is missing;
- migration ledger differs from approved preflight;
- active matches/new writes are not contained;
- backup/export identity is missing where data can be lost;
- rollback would reopen anonymous/public access;
- service-role continuity is unverified;
- application/database compatibility order is unknown;
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
