# Movie Buff release train 2026-08-06-01 — production authorization packet

**Packet status:** `PREPARED / INVALID FOR ARM`

**Release status:** `NO-GO`

**Candidate freeze:** `BLOCKED — NO ELIGIBLE FINAL IMMUTABLE PRODUCT SHA EXISTS`

**Production authorization:** `NOT APPLICABLE`

**Capture time:** `2026-08-06T22:44:00Z` (`2026-08-06 18:44 EDT`)

**Repository:** `BuffGamesStudio/buff-platform`

**Controlling intake:** PR #115, branch `release/movie-buff-train-2026-08-06-01-intake`, commit `d03385aa2ea430f5a5fa8959a17a634ec2f975d8`

**Integration baseline:** `bf316a15a2120e32d8a32e479df2ae439081f9a1`, tree `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

---

## 1. Decision

The release train is frozen in a fail-closed state, but no product commit is designated as the final immutable release candidate.

A release candidate may be named only after one exact all-lane product tree contains every admitted release-blocking repair and passes the required exact-product evidence gates. At this capture, no such tree exists.

Therefore:

- no source PR is merge-authorized;
- no Vercel deployment is promotion-authorized;
- no production alias may move;
- no hosted or production Supabase mutation is authorized;
- no backup/PITR claim may be inferred;
- no production ARM statement may be issued or accepted;
- the only valid release classification is `NO-GO`.

---

## 2. Exact accepted input identities

These are current source inputs or controlling support packages. They are not, individually or collectively, a release candidate.

| Scope | PR / branch | Exact SHA | Exact tree | Current evidence boundary |
|---|---|---|---|---|
| Integration baseline | `integration/movie-buff` | `bf316a15a2120e32d8a32e479df2ae439081f9a1` | `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34` | Historical baseline; not current product implementation |
| Rich board intent | PR #3 | `f692e82a5d524c950011e0300908c9cbec2389cb` | Must be re-read from exact commit during composition | Two-file preview source only |
| Security/hardening contract | PR #5 | `91eac0d55abb1a9568017df687e8395771d24780` | Must be re-read from exact commit during composition | Draft hardening packet; no production mutation |
| MOV-15 strict-three admission | PR #9 | `48d44bb156b71060d1b9adcc7a2a3f014cf92060` | `e010c949920f84e5f7aaca9d50ebf39d6ea13309` | Exact-head source/build PASS; database/race/browser/all-lane UNKNOWN |
| MOV-16 private VIP authority | PR #6 | `1d3b947ca153214028b5ac97a7eea83c382b5c7d` | `94fd19ab499b02663b21880aa5efeec37c93ca9d` | Strong isolated database/runtime PASS, but compatibility evidence is pinned to older MOV-17 `9239fcdc…` |
| MOV-17 shared phase authority | PR #10 | `ffff733d856c8c6dca5a04fdbe84e3a0c5839111` | `99cbd5b0554e3d5499d9789c500bbff8e8fd82a5` | Current identity PASS; current exact runtime/browser evidence UNKNOWN |
| MOV-18 passive presentation | PR #8 | `a416dd1bf6b372d11abcc0541abd9584443b0672` | `a866c5610d09c45eb1ff3c3422306a46050e9ec7` | Isolated source/rendered PASS; reviewed MOV-17 pin is older `9239fcdc…`; all-lane behavior UNKNOWN |
| SQL encoding repair | PR #12 | `d1f7ca58b534cbccd3071743d542f5788c0e9173` | `ea817ad706f4107fc16482cbe6cc40ec6a012ee0` | Exact repository-byte PASS only |
| Persisted-session lobby repair | PR #36 | `3d2743da175229de42847c82c71931657c2090da` | `52bd3a7a284ef2c7a4ae2d6ac14ec8b7120589c8` | Repair diff inspected; exact source/build and browser runs remain queued |
| Independent staging security clearance | PR #114 | `55b317f9aece77a26968ddeebe1ce167cbc0664a` | `9f4ddfa93816869efdc793f79dc998572135a9c0` | Staging security/rollback/reapply PASS, bound to product `b975c7ca…`, not a final all-lane candidate |
| Recovery/operations package | PR #108 | `2aaa9d834244db47b8260ca3961fcf02b0b68290` | `643430f564aaf921f59a0b3832796bc406b72b63` | Package controls PASS; bound to stale candidate v5; one migration-level rollback gap remains |
| Independent MOV-19 validator | PR #7 | `e2d14447d7036cf9dc645514c4713bd4d8e42db1` | `264e4374eca6d3881bc587f1e1ff4a9f0a59023d` | Current head is a workflow/evidence portability repair; PR verdict remains NO-GO and current all-lane acceptance is absent |

Any movement of an admitted source head after successor-RC composition makes that successor stale unless the coordinator explicitly classifies the movement as next-release or proves the affected candidate bytes unchanged.

---

## 3. Rejected candidate identities

### 3.1 Candidate v6 — rejected as final RC

- Product SHA: `c3a6aff9138f6e12b50e54f5b3c0f4bddcc101f6`
- Product tree: `a995a9aeb2fca76d2c1b216ece3a2645c2393c71`
- Controller SHA: `6ed07ab94bf05b4afe605fa334720046ef8947b6`
- Controller tree: `9657fefd21244b78fa44ac60c33dab317352a0ba`

Disqualifying facts:

1. It freezes MOV-17 at `9239fcdc731ec05594c75d3ef9961e6cd4d36bbf`, while live MOV-17 is `ffff733d856c8c6dca5a04fdbe84e3a0c5839111`.
2. The Agent 7 prerequisite gate proves candidate v6 does not contain the accepted lobby-auth repair.
3. The combined 17-check database/race/synchronization controller did not execute; GitHub Actions dispatch failed.
4. The exact three-client browser journey did not produce an accepted completed artifact.
5. No production Supabase identity, backup/PITR record, complete rollback package, or human authority package is bound to it.

Classification: `STALE / INELIGIBLE / NO-GO`.

### 3.2 Auth-repaired v5 derivative — not a final RC

- Product SHA: `b975c7ca13d39675ea2d2294df2869c9b5c73b4f`
- Product tree: `3abebd91a58d640d1b08049b6ee429c26c452312`

This product applies the accepted lobby-auth repair to candidate v5 and changes only the lobby bootstrap and its focused test. It does not contain the current MOV-17 successor head, is not the current complete all-lane composition, and its exact source/build and three-browser workflows remain queued.

Classification: `PARTIAL SUCCESSOR / NOT FINAL / NO-GO`.

### 3.3 Current MOV-17 + PR #12 composition — not an all-lane RC

- Product SHA: `373cc05fb4fe457e8512989bb776ddb9638c8258`
- Product tree: `15b6e78b0f692f0a2d2f92f9fcf96051d38de910`
- Controller SHA: `750ecc2dc35a1c2bdd48034ee0be4ce6e824c75c`
- Controller tree: `e16989076000c4f66426cb4ded96d3d132959cd1`

This composition solves only the current MOV-17 plus SQL-encoding identity boundary. It does not freeze MOV-15, MOV-16, MOV-18, PR #3, PR #5, lobby auth, the current security package, operations package, or MOV-19 review into one product.

Classification: `VALID PARTIAL COMPOSITION / NOT FINAL / NO-GO`.

---

## 4. Validation status for the required successor RC

| Gate | Status | Required acceptance evidence |
|---|---|---|
| Exact all-lane product SHA/tree | `ABSENT` | One immutable commit and tree assembled from the accepted exact inputs with a complete conflict/ownership manifest |
| Controller/product separation | `PENDING` | Validation-only controller must be a proven allowlisted child of the immutable product |
| Linux clean install, contracts, TypeScript, production build | `UNKNOWN` | Exact-successor run and independently verified portable artifact |
| Windows command digital twin | `UNKNOWN` | Exact-successor run and independently verified portable artifact |
| Migration inventory and every SHA-256 | `UNKNOWN` | Candidate-derived ordered migration manifest, not a union copied from lane prose |
| Disposable reset and migration ledger | `UNKNOWN` | Exact-successor successful reset through every candidate migration |
| pgTAP/persona/security matrix | `UNKNOWN` | Exact-successor preflight, forward, containment/rollback, and reapply results |
| MOV-15/MOV-16/MOV-17 races | `UNKNOWN` | Combined executable admission, VIP, phase, reconnect, Buster, selector, and leave matrix |
| Three authenticated client browser journey | `UNKNOWN` | Complete waiting-room-to-board-return journey with exact build marker, screenshots, logs, refresh/reconnect/history/stale-client/accessibility checks |
| Staging product deployment | `UNKNOWN` | Immutable deployment bound to the exact product SHA/tree and staging backend identity |
| Staging database compatibility | `UNKNOWN` | Exact-successor migration ledger/object/ACL/RLS/function/persona proof; PR #114 PASS is bound to a different product |
| Rollback/containment/reapply | `INCOMPLETE` | Candidate-derived complete migration-to-recovery map and executable rehearsal; current operations record reports one rollback disposition gap |
| Independent MOV-19 review | `ABSENT` | Independent GO recommendation bound to the successor product, controller, ruleset, and all artifacts |
| Production proof | `NOT APPLICABLE` | Prohibited until all prior gates pass and human ARM is valid |

Current queued runs that do not yet supply acceptance evidence:

- Lobby-auth source/build: run `31120446237`, exact source `3d2743da175229de42847c82c71931657c2090da`, status `queued` at capture.
- Auth-repaired three-browser journey: run `31120596180`, controller `002cf83f76408f61e8eb402c3ce6098f37a66215`, product parent `b975c7ca13d39675ea2d2294df2869c9b5c73b4f`, status `queued` at capture.

A queued workflow is neither PASS nor FAIL for product behavior. Its scope remains `UNKNOWN — NOT EXECUTED` until a runner executes it and the artifact is independently inspected.

---

## 5. Environment identity inventory

### 5.1 Existing Vercel production identity — inventory only

- Team: `shaheed1`
- Team ID: `team_B5DU86UM8Cb77BUCK3rbijw6`
- Project: `movie-buff`
- Project ID: `prj_u2IlNNHUvEhnAytuuymv9GdN7hJY`
- Current production deployment: `dpl_GhFtRDighfB48t6WqiyWfg35VgEC`
- Current source branch: `main`
- Current source SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
- Target: `production`
- Region: `iad1`
- State at capture: `READY`
- Production aliases include: `movie-buff-sigma.vercel.app`, `movie-buff-shaheed1.vercel.app`, `movie-buff-git-main-shaheed1.vercel.app`

This is the identity of the existing production deployment. It is not a proposed or authorized successor-RC promotion target. No final RC deployment ID exists.

### 5.2 Supabase identity

The connected Supabase inventory exposes only:

- Project: `movie-buff-staging`
- Ref: `eddwkxcillhzkvwmavsc`
- Organization: `tleuzztdjpajaltwcclj`
- Region: `us-east-1`
- Database host: `db.eddwkxcillhzkvwmavsc.supabase.co`
- PostgreSQL: `17.6.1.155`
- Status at capture: `ACTIVE_HEALTHY`

No accessible project is positively identified as Movie Buff production. The staging project must not be relabeled, inferred, or used as production.

Production Supabase classification: `UNKNOWN / NOT POSITIVELY IDENTIFIED`.

---

## 6. Candidate-bound production fields

The following fields are mandatory. Values marked `UNRESOLVED` invalidate ARM.

| Field | Required exact value | Current value |
|---|---|---|
| Final product SHA | Full 40-character candidate commit | `UNRESOLVED — candidate absent` |
| Final product tree | Full tree SHA | `UNRESOLVED — candidate absent` |
| Candidate branch/tag | Immutable release-candidate reference | `UNRESOLVED` |
| Validation controller SHA/tree | Exact controller and allowlisted delta | `UNRESOLVED` |
| Full migration manifest | Ordered path, version, Git blob, SHA-256 for every migration | `UNRESOLVED` |
| Full rollback/containment manifest | Exact artifact and SHA-256 for every migration or approved covering disposition | `INCOMPLETE` |
| Expected-state manifest | Exact tables, policies, owners, regprocedures, ACLs, search paths, personas, counts and hashes | `UNRESOLVED for final candidate` |
| Production Supabase organization/project/ref | Exact positive identity | `UNKNOWN` |
| Production Supabase API/DB host and region | Exact positive identity | `UNKNOWN` |
| Current production migration ledger/hash | Read-only preflight capture | `UNKNOWN` |
| Backup/PITR mechanism | Exact mechanism and eligibility | `UNKNOWN` |
| Backup/recovery-point identity | Exact backup ID or UTC recovery point predating release | `UNKNOWN` |
| Retention and restore validation | Exact retention and tested recovery disposition | `UNKNOWN` |
| Restore authority | Named human | `UNASSIGNED` |
| Vercel production project | Exact project | `movie-buff / prj_u2IlNNHUvEhnAytuuymv9GdN7hJY` — inventory PASS |
| Proposed Vercel deployment | Deployment built from final product SHA | `UNRESOLVED` |
| Production aliases to move | Exact allowlist | `UNRESOLVED / no movement authorized` |
| Deployment operator | Named human | `UNASSIGNED` |
| Independent observer | Named human distinct from operator | `UNASSIGNED` |
| Rollback decision authority | Named human | `UNASSIGNED` |
| Containment authority | Named human | `UNASSIGNED` |
| Monitoring owner | Named human | `UNASSIGNED` |
| Maintenance window | Exact UTC and local start/end | `UNASSIGNED` |
| Authorization issue time | Exact UTC | `NOT APPLICABLE` |
| Authorization expiry | Exact UTC, before window end where required | `NOT APPLICABLE` |
| Independent MOV-19 recommendation | Exact artifact/comment bound to candidate | `ABSENT` |
| Human ARM statement | Exact accepted phrase and complete bindings | `NOT PERMITTED` |

---

## 7. Mandatory preflight

Before any production mutation, an independent read-only preflight must prove all of the following against the exact final candidate and positively identified production target:

1. repository, remote, approved branch, full product SHA, tree SHA, clean worktree, and approved ancestry;
2. full candidate migration and rollback manifests with path, version, Git blob, and SHA-256;
3. expected-state manifest SHA-256;
4. production Supabase organization, project, ref, API hostname, database hostname, region, and environment classification through multiple observations;
5. complete production migration ledger and deterministic ledger hash;
6. `db push --dry-run` or equivalent shows only the specifically authorized migration sequence;
7. schema/catalog fingerprints, exact regprocedure identities including argument types, owners, `prosecdef`, `proconfig`, fixed search paths, and definitions;
8. direct, default-derived, and effective ACLs, including PUBLIC OID 0 state;
9. table and column privileges, RLS/FORCE-RLS flags, complete policies, counts, foreign keys, validation and orphan counts;
10. persona and service-role compatibility proof;
11. exact backup/PITR status and recovery point;
12. reviewed rollback and containment artifacts;
13. exact Vercel candidate deployment identity and deployed SHA/build-marker match;
14. named operator, observer, rollback authority, containment authority, monitoring owner, maintenance window, and authorization expiry;
15. independent MOV-19 GO recommendation.

A successful preflight does not itself authorize mutation.

---

## 8. Hard stop conditions

Any one condition below immediately stops advancement. The operator must preserve evidence and invoke the authorized containment or rollback decision path.

- candidate SHA, tree, deployment SHA, build marker, migration hash, expected-state hash, or target identity mismatch;
- dirty worktree, unapproved ancestry, moved candidate ref, or unrecorded candidate byte change;
- absent, expired, incomplete, or ambiguously worded authority;
- production Supabase identity cannot be independently proven;
- backup/PITR identity is missing, stale, postdates the release start, or cannot be restored under the approved authority;
- migration dry-run differs from the authorized ordered manifest;
- any migration, deployment, validation, cleanup, evidence, or hash command exits nonzero;
- unexpected migration ledger row, missing ledger row, duplicate version, or ledger/hash mismatch;
- wrong owner, mutable or unexpected search path, unexpected SECURITY DEFINER identity, unsafe PUBLIC/anon execution, broader-than-manifest authenticated access, or lost service-role compatibility;
- RLS/FORCE-RLS, policy, table privilege, count, foreign-key, validation, or orphan drift;
- self-promotion, cross-room mutation, nonmember/inactive mutation, or authorized-player denial outside the accepted contract;
- exact three-client matchmaking, phase synchronization, selector authority, playback, answer deadline, results, board return, reconnect, stale-client, history, or accessibility regression;
- application error/latency threshold is undefined at authorization time or an approved threshold is breached;
- monitoring evidence is unavailable, incomplete, or cannot identify the deployed candidate;
- artifact missing, digest mismatch, redaction failure, secret finding, or nonportable evidence manifest;
- rollback/containment package missing, mismatched, untested, or fails;
- any scope remains `UNKNOWN` where the authorization requires PASS.

---

## 9. Rollback and containment boundary

Rollback must use reviewed additive compensating migrations or an explicitly approved recovery operation bound to the exact production state. Never edit or delete applied migration files, delete ledger rows, use migration-history repair as SQL rollback, use `db reset --linked`, restore unsafe PUBLIC/anon access, guess prior values, blindly rerun an uncertain failed migration, or invoke PITR without incident-level authority.

Containment may revoke unsafe execution, block unsafe readiness/state mutation, disable new media signing, preserve minimum approved service diagnostics, and place affected gameplay into an explicit unavailable state. Containment must not silently claim full rollback.

Current recovery defect that must be resolved or explicitly covered before ARM:

- `supabase/migrations/20260804083100_movie_buff_server_phase_machine_hardening.sql`
- recorded SHA-256: `602d64cf2c7de8135ec4d21b29f587e5420945d6eb3339b91b3a9fc028b9ab8f`
- current operations record: no dedicated rollback and no accepted covering disposition.

---

## 10. Disabled ARM template

The following is a template only. It is invalid while any field is unresolved and must not be signed, posted, or interpreted as authorization.

```text
EXECUTE AUTHORIZED

Release train: 2026-08-06-01
Repository: BuffGamesStudio/buff-platform
Final product SHA: <full 40-character SHA>
Final product tree: <full tree SHA>
Validation controller SHA/tree: <full SHA> / <full tree SHA>
Migration manifest path and SHA-256: <path> / <digest>
Expected-state manifest path and SHA-256: <path> / <digest>
Rollback/containment manifest path and SHA-256: <path> / <digest>
Production Supabase organization/project/ref: <exact identity>
Production API/database host and region: <exact identities>
Backup/PITR identity and verified recovery time: <exact identity and UTC>
Vercel team/project/deployment: <exact IDs>
Production aliases authorized: <exact allowlist>
Operator: <named human>
Independent observer: <named human>
Rollback authority: <named human>
Containment authority: <named human>
Monitoring owner: <named human>
Maintenance window: <UTC start> through <UTC end>
Authorization issued: <UTC>
Authorization expires: <UTC>
Independent MOV-19 GO artifact: <exact reference and digest>
Authorized operations: <exact ordered operations only>
```

No synonym such as “yes,” “go,” “approved,” “ship,” or “looks good” substitutes for this complete exact-bound statement.

---

## 11. Active dependency and automatic resume condition

```text
STATUS: WAITING_ON_AGENT — ACTIVE

Waiting lane: release-train composition and production-readiness coordination
Dependency owners: functional lane owners, Agent 5 composition, Agent 7 browser validation, Agent 6/security validation, Agent 9 recovery, MOV-19 independent validator, and named human authorities
Required item: one complete immutable successor all-lane product plus accepted exact-product evidence
Required identity: full product SHA/tree, controller SHA/tree, component manifest, migration/rollback/expected-state hashes, exact run/job/artifact identities
Blocked scope: final RC designation, production preflight, and production ARM
Agent remains active: YES
Current independent work: authoritative head checks, queued-run checks, production identity inventory, authorization packet maintenance, evidence and rollback-gap tracking
Prepared fallback work: fail-closed packet, exact gate matrix, hard stop conditions, disabled ARM template, production target inventory
Authoritative sources being checked: PR heads, commits, workflow runs/jobs/artifacts, staging catalog and migration ledger, Vercel deployments, recovery records, MOV-19 decisions
Last checked: 2026-08-06T22:44:00Z
Next check condition: an immutable successor all-lane product appears or a queued qualifying exact-product run changes state
Fallback if unavailable: preserve all unresolved scopes as UNKNOWN or FAIL and keep production authorization NOT APPLICABLE
Overall lane status: WORKING / NO-GO
```

The blocked work resumes automatically when an authoritative source proves all of the following:

1. a successor all-lane product SHA/tree exists;
2. it contains the accepted lobby repair and current admitted functional/security inputs;
3. component identities and conflict resolutions are fully manifested;
4. exact-product Linux, Windows, database, race, browser, security, staging and recovery evidence completes and is independently verified;
5. MOV-19 independently recommends GO;
6. production Supabase, backup/PITR, Vercel deployment, personnel, window, monitoring and expiry fields are complete.

---

## 12. Mutation record

Actions performed while preparing this packet:

- read-only GitHub identity and workflow inspection;
- read-only Vercel deployment inventory;
- read-only Supabase project inventory;
- creation of this governance/authorization document on a release-train documentation branch.

Actions not performed:

- no source-lane merge;
- no integration or main update;
- no Vercel deployment or alias promotion;
- no Supabase migration, SQL mutation, backup, restore or PITR operation;
- no production traffic change;
- no secret access or disclosure;
- no force-push or destructive operation;
- no GO recommendation;
- no ARM request or authorization.

**Final classification:** `RC FREEZE BLOCKED / PACKET PREPARED / PRODUCTION NOT AUTHORIZED / NO-GO`.
