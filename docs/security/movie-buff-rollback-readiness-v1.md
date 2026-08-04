# Movie Buff rollback readiness v1

Date: 2026-08-04  
Owner: MOV-19 independent validation  
Release posture: **NO-GO**

A rollback file is not rollback proof. A usable rollback record must identify the exact forward branch/SHA, migration version/checksum, target, state written after apply, data-loss consequences, authority, stop conditions, command/output, timestamps, and post-rollback verification.

## Lane classifications

### MOV-15 — PR #9, HEAD `3cea9b9f5e5436a834adf459834e7196890d2ac1`

**Classification: FAIL for current completeness; UNKNOWN for execution.**

The lane adds `public_matchmaking_key`, a check constraint, a partial unique index, and redefines matchmaking/readiness/start functions. No dedicated rollback SQL is present in the reviewed diff.

Required rollback design:

1. Application rollback point: the exact pre-MOV-15 integration SHA or a later reconciled SHA that no longer calls the new key/functions.
2. Stop new public matchmaking before database rollback.
3. Record all rooms containing `public_matchmaking_key`, including `waiting`, `starting`, and `active` states.
4. Do not drop the key/index while a mixed application fleet can still write the new contract.
5. Do not restore the two-player start rule or caller-controlled capacity as a rollback.
6. Prefer containment: disable new public matchmaking, preserve existing room/membership rows, and deploy a corrected forward migration.
7. If the column/index must be removed on a disposable target, prove that no application SHA depends on it and capture row counts before/after.

Data-loss classification: dropping only the key/index is metadata/data-loss for compatibility evidence; reverting function definitions can reactivate unsafe admission behavior. Post-write production rollback is therefore not a simple down migration.

### MOV-16 — PR #6, HEAD `3683c1ec2b70b8fabc85d70b77242e794b505c7e`

**Classification: FAIL for post-write rollback; UNKNOWN for disposable rehearsal.**

`supabase/rollbacks/20260804073000_movie_buff_vip_authority.rollback.sql` drops definitions, inventory, windows, locks, and consumptions. After any real inventory or match activity this destroys entitlement and audit history.

Required containment before destructive rollback:

1. disable creation of new VIP windows and new activation calls;
2. preserve/export definitions, inventory quantities, locks, consumptions, and keys;
3. identify open matches/windows and choose complete, cancel, or migrate;
4. retain a read-only audit path for existing consumptions;
5. require explicit data-loss authority before any drop;
6. restore application code and database objects in a coordinated order.

The current rollback is acceptable only for an explicitly disposable target with zero retained business/game state and a verified post-rollback schema check.

### MOV-17 — no implementation SHA

**Classification: UNKNOWN.**

The future rollback must not drop phase/version/deadline state while any match uses it. Required containment:

- stop new matches and new phase mutation;
- preserve current room, match, round, selector, tile, playback, deadline, and reconnect state;
- define whether in-flight matches finish, cancel, or migrate;
- prevent an older application SHA from interpreting new state incorrectly;
- preserve MOV-15 strict-three and MOV-16 private lock semantics;
- verify no real room falls back to demo/client-local state after rollback.

### MOV-18 — PR #8, HEAD `d9139c7a7f6628efdc032326db4b099999b2e8c3`

**Classification: PASS for repository-only removal of isolated new files; UNKNOWN after shared integration/dependency use.**

The reviewed PR adds only new visual/runtime/test/docs files and no dependency or shared-page edit. Before integration, repository rollback can revert those commits without database loss.

Once a Rive package, assets, or shared screens are integrated, rollback must:

- remove only MOV-18 dependency/lockfile entries, never unrelated package changes;
- retain static and reduced-motion fallbacks;
- preserve MOV-17 authoritative state/action wiring and PR #3 visual structure;
- avoid making gameplay depend on an unavailable animation asset;
- verify browser hydration, keyboard behavior, and missing-asset recovery after revert.

### MOV-19 / PR #5 security remediation

**Classification: FAIL if rollback reopens exposure; UNKNOWN for corrected containment rehearsal.**

A down migration that disables RLS or restores anon/authenticated CRUD/EXECUTE is security-destructive. Safe rollback should not recreate the hosted posture observed on 2026-08-04.

Preferred order:

1. disable affected application feature/routes if a policy/function breaks legitimate traffic;
2. preserve RLS and revoked anonymous privileges;
3. correct the policy or internal authorization forward;
4. retain service-role continuity only where verified necessary;
5. compare function definitions, owners, search paths, direct/effective grants, RLS, policies, and table grants after correction.

## Stop conditions

Stop rollback/apply work when any of these is true:

- target/project identity or deployed application SHA is missing;
- migration ledger differs from the approved preflight;
- active matches or new state writes are not contained;
- backup/export identity is missing where data can be lost;
- rollback would reopen anon/public access;
- service-role continuity is unverified;
- the operator lacks explicit apply/rollback authority;
- raw postflight evidence cannot be captured;
- production or hosted mutation has not been explicitly authorized.

## Mandatory rollback evidence fields

- repository, branch, forward SHA, rollback SHA;
- migration filename/version and SHA-256 checksum;
- target project/database identity and environment class;
- deployed application SHA before and after;
- rows/state written after forward apply;
- active-match/open-window inventory;
- backup/export/snapshot identity;
- data-loss classification;
- operator and authorization record;
- exact forward and rollback commands;
- start/end timestamps and exit codes;
- raw stdout/stderr and database result artifacts;
- post-rollback migration ledger, object definitions/hashes, owners, search paths, ACLs, RLS/policies, and persona checks;
- application smoke evidence tied to the post-rollback SHA.

No hosted or production apply/rollback is authorized by this document, and no rollback execution is claimed.
