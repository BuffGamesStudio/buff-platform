# Movie Buff Agent 9 — release recovery and operations runbook

Generated: `2026-08-06T04:18:45Z`  
Branch: `operations/movie-buff-release-recovery`  
Target base: `integration/movie-buff`  
Overall classification: **NO-GO**

## Purpose and authority boundary

This package owns rollback orchestration, fail-closed containment, backup/PITR verification, operator/observer controls, maintenance-window controls, evidence packaging, and the production-authorization template. It does **not** own product behavior, database policies, lane migrations, deployment promotion, or production authorization.

No merge, production deployment, production alias change, production or historical-hosted Supabase mutation, paid-resource action, force-push, secret disclosure, or hosted deletion is authorized by this runbook.

## Current exact identities

| Item | Exact identity | Classification |
|---|---|---|
| Integration | `bf316a15a2120e32d8a32e479df2ae439081f9a1` / tree `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34` | PASS — identity only |
| MOV-15 PR #9 | `dc9804cdae03d8627a89980dbcdf2292d2055372` / tree `86db75f79444b02c972ba4771244950cbec41b38` | UNKNOWN — current isolated DB recovery proof incomplete |
| MOV-16 PR #6 | `4a5e5591113b005f69fd34361becb2fd8d024897` / tree `5d0fc27b1c5240196d76eabddee3d59186cda1d3` | PASS — declared exact local scope only |
| MOV-17 PR #10 | `f17234debfb8942e1998306a12dc33301c1c5440` / tree `56c63df56f085c256289a8e4510ba05cbea3d9d1` | PASS — declared exact local scope only |
| Agent 6 PR #105 | `413d06836239fe92bbee4b5b1f4e70a61233d15b` / tree `3af64604907b7d977db903fbb20922540e22be4d` | UNKNOWN — clean extraction incomplete |
| Historical Agent 8 candidate PR #100 | `4c27ae357e16a48ccc5d8885d11cc5411643b218` / tree `ab9c6301eba48d4119ffa4f0909ac4c4452ec14c` | UNKNOWN/stale for current heads |

PR #100 cannot be treated as the current candidate because it binds MOV-16 `12c3a8…`, not the current stable handoff `4a5e559…`, and it predates the clean Agent 6 package.

## Connected environment identities

### Isolated Supabase staging

- project name: `movie-buff-staging`
- project ref: `eddwkxcillhzkvwmavsc`
- organization: `tleuzztdjpajaltwcclj`
- region: `us-east-1`
- database host: `db.eddwkxcillhzkvwmavsc.supabase.co`
- status: `ACTIVE_HEALTHY`

Read-only capture shows the six target tables under RLS and FORCE RLS and records the security tail plus rollback/reapply rehearsal entries. Fresh exact-candidate persona/effect proof remains **UNKNOWN**.

The historical project ref `yfatwreicmiocdxzyznd` could not be re-fetched through the current connector and is not accepted as a production identity.

### Vercel

- team: `team_B5DU86UM8Cb77BUCK3rbijw6`
- designated staging project: `app` / `prj_qTI4u8AW6ukAJXf6zgGdssM2t1ls`
- designated staging deployment: **none**
- preview/build project: `movie-buff` / `prj_u2IlNNHUvEhnAytuuymv9GdN7hJY`
- historical PR #100 preview: `dpl_6YjSTAR2mRTSpyaK8EEZrApKARZp`, READY, `target=null`, not a rollback candidate

A READY preview with `target=null` is build/provenance evidence only. It is not staging or production proof.

## Ordered database plan

The machine-readable order, SHA-256 values, rollback paths, missing rollback dispositions, and ledger verification queries are in:

`operations/movie-buff/release-recovery-manifest.json`

Forward order is the manifest order. Rollback order is the exact reverse order, but **execution is prohibited** while any entry lacks a dedicated rollback or owning-lane written disposition.

Current fail-closed gaps:

1. `20260804073100_movie_buff_vip_null_category_fail_closed.sql` has no dedicated rollback in the exact manifest.
2. `20260804083100_movie_buff_server_phase_machine_hardening.sql` has no dedicated rollback in the exact manifest.
3. Agent 6 PR #105 has not yet extracted and accepted the security files whose hashes were proved on validation candidate #78.
4. One current immutable all-lane candidate has not been frozen.

## Recovery policy

### Preferred order

1. **Stop further change.** Freeze deploys, aliases, migrations, background workers, and manual mutations.
2. **Capture identity.** Record repository, branch, full SHA, tree, deployment ID, Supabase ref, ledger, UTC time, operator, and observer.
3. **Contain first.** Revoke or disable only the affected callable/mutation surface using the owning lane's data-preserving containment.
4. **Verify containment.** Confirm traffic, RPC, RLS, ACL, owner, search-path, and persona effects.
5. **Choose rollback or forward repair.** The named rollback authority decides. No operator may self-authorize.
6. **Application rollback.** Move only the verified staging/production alias to an immutable known-good deployment after source/build-marker verification.
7. **Database rollback.** Apply exact rollback files in reverse dependency order only after backup/PITR identity is recorded and data-preservation probes pass.
8. **Forward reapply.** Apply the original exact migration bytes in forward order.
9. **Revalidate.** Compare ledger, schema, RLS, policies, ACLs, owners, functions, personas, and catalog digest with the approved expected state.
10. **Close or remain contained.** The independent observer records the evidence classification. Unresolved disagreement remains `NO-GO`.

### Application rollback sequence

1. Verify Vercel team, project, deployment ID, source SHA, and visible build marker.
2. Verify the deployment is explicitly eligible as a rollback candidate.
3. Freeze alias changes.
4. Record current alias-to-deployment mapping.
5. Apply the authorized alias rollback.
6. Verify the alias resolves to the exact expected immutable deployment.
7. Preserve the previous mapping and audit response in the evidence bundle.

The currently observed PR #100 preview is not eligible because `isRollbackCandidate=false` and `target=null`.

### Database containment sequence

Security containment uses reverse order:

`161000 -> 160500 -> 160000 -> 155000`

MOV-16 callable containment uses:

`supabase/rollbacks/20260804073310_movie_buff_vip_callable_containment.rollback.sql`

MOV-15 and MOV-17 containment must follow owning-lane handoffs. Destructive rollback must never be substituted for missing containment evidence.

## Mandatory stop conditions

Stop immediately and preserve evidence when any of these occurs:

- repository, branch, SHA, tree, or target does not exactly match the authorization;
- worktree is dirty or the evidence directory is inside the checkout;
- a migration or rollback SHA-256 is missing or mismatched;
- a required rollback or owning-lane disposition is missing;
- target hostname/ref/project/team is ambiguous or unapproved;
- backup/PITR identity is absent, stale, or not bound to the exact target;
- operator, independent observer, rollback authority, or containment authority is absent;
- maintenance window has not started or authorization has expired;
- any child process exits nonzero;
- migration ledger differs from the ordered manifest;
- RLS, FORCE RLS, policy, ACL, ownership, search path, overload, or persona result differs from the expected-state manifest;
- a secret, key, token, cookie, signed URL, password, or connection string appears in evidence;
- Vercel source SHA and visible build marker differ;
- browser/runtime monitoring shows a launch-critical error, stale-client acceptance, cross-room access, or synchronization divergence;
- cleanup fails or the final worktree is dirty.

## Roles and unresolved fields

The following remain **UNKNOWN** and must be bound before any staging execution beyond read-only inspection:

- operator;
- independent observer;
- rollback authority;
- containment authority;
- maintenance window;
- monitoring owner;
- authorization expiry;
- production Supabase ref;
- production Vercel project/deployment/alias;
- backup/PITR identity.

The operator executes only the approved wrapper. The observer independently verifies identity, watches stop conditions, records exits and UTC timestamps, validates hashes, and can call a stop. The rollback and containment authorities must be named people or approved roles separate from an unreviewed operator decision.

## Evidence bundle

Write evidence outside the source checkout. Minimum bundle:

- `identity.json`
- `tool-versions.json`
- `environment-variable-names.txt`
- `manifest-copy.json`
- `file-hashes.tsv`
- `preflight.json`
- `execution-plan.json`
- one stdout/stderr/exit record per child process
- `ledger-before.tsv` and `ledger-after.tsv`
- `catalog-before.json` and `catalog-after.json`
- `catalog-diff.txt`
- `cleanup.json`
- `sha256.txt`

Values must be redacted. Environment-variable **names** may be recorded; values may not.

## Current decision

Rollback, containment, backup/PITR, staging deployment, and production authorization are not complete. The project remains **NO-GO**.
