# Movie Buff rollback readiness v1

Date: 2026-08-04
Owner: MOV-19 independent validation

## Classification rules

A rollback is not `PASS` because a file exists. Evidence must state the exact forward SHA/migration, target, data written after apply, rollback authority, command, timestamps, raw result, and post-rollback verification.

## Current lane classifications

### MOV-15

Status: `UNKNOWN`.

No final migration or state-write contract exists on the lane branch. The future rollback must preserve existing rooms and memberships or explicitly stop before apply when duplicate canonical waiting keys exist.

### MOV-16

Status: `FAIL for post-write rollback`; `UNKNOWN for pre-write rehearsal`.

`20260804073000_movie_buff_vip_authority.rollback.sql` drops definitions, inventory, windows, locks, and consumptions. After real writes, that loses inventory and match history. It may be suitable only for an explicitly authorized disposable target or pre-production rehearsal where data preservation is not required.

Required correction: document preconditions and either provide a data-preserving disable/containment rollback or classify destructive rollback as requiring explicit data-loss authorization.

### MOV-17

Status: `UNKNOWN`.

The future rollback must account for active matches already using phase/version/timestamp state. Dropping the phase schema while matches are active is unsafe. A containment path must stop new matches, preserve current state, and define whether in-flight matches are completed, cancelled, or migrated.

### MOV-18

Status: `UNKNOWN`.

Visual/runtime rollback should be application-only and must preserve static fallbacks. Dependency rollback must revert only the MOV-18 package and lockfile changes and cannot remove unrelated packages.

### MOV-19 / PR #5 security packet

Status: `FAIL/UNKNOWN`.

RLS/grant rollback that reopens anon or authenticated table access is security-destructive even when it is metadata-only. A safe rollback should prefer containment, corrected policies, or application disablement instead of restoring insecure grants.

## Mandatory rollback evidence fields

- repository and exact application SHA;
- migration filename/version and checksum;
- target project/database identity;
- whether the target is disposable local, staging, or production;
- rows/state written after forward apply;
- backup/snapshot identity where applicable;
- operator with apply/rollback authority;
- forward command and result;
- rollback command and result;
- post-rollback schema, ACL, function hash, and application checks;
- data-loss classification;
- stop conditions;
- timestamped raw artifacts.

No production or hosted rollback is authorized by this document.
