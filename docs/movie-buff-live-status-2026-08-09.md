# Movie Buff live status audit

Date: Tuesday, August 11, 2026 (updated from the August 9 audit)

## Purpose

This document records the latest reconciled Movie Buff state. GitHub, Vercel,
the Supabase production read packet, and the authorized rehearsal branch were
refreshed on August 11.

Use it when the earlier July 30-31 launch docs conflict with current live
state. Those earlier docs still matter as historical evidence and runbooks, but
their blocker ordering is no longer fully current.

Wednesday, August 12, 2026 hosted / Supabase alignment correction:

- the live Vercel production alias still resolves to deployment
  `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`
- verified client-bundle evidence for that live deployment shows the hosted app
  is currently compiled against successor rehearsal Supabase project
  `eiamucxbestinitydkvu`, not production project `yfatwreicmiocdxzyznd`
- therefore, any lower section that treats the current live alias as direct
  proof of production-Supabase hardening or cutover is stale
- use these newer focused notes as the controlling August 12 truth:
  - `docs/movie-buff-hosted-validation-status-2026-08-12.md`
  - `docs/movie-buff-production-supabase-audit-2026-08-12.md`

Hosted/runtime addendum at end of day Tuesday, August 11, 2026:

- the Vercel live-alias section below has been refreshed to the latest `main`
  deployment
- the Supabase production and rehearsal facts below remain the earlier
  August 10-11 read packet unless a line explicitly says otherwise

Wednesday, August 12, 2026 production hardening addendum:

- production Supabase was mutated in an authorized session after the earlier
  August 10-11 read packet
- two production migrations were applied:
  - `movie_buff_board_runtime_rls_repair`
  - `movie_buff_revoke_anon_execute_for_authenticated_rpcs`
- the previously live board/runtime row exposure is now closed:
  - `movie_buff_boards` publishable-key probe -> HTTP `200` with `[]`
  - `movie_buff_board_tiles` publishable-key probe -> HTTP `200` with `[]`
  - `match_round_player_playback` publishable-key probe -> HTTP `200` with
    `[]`
  - `movie_buff_round_events` publishable-key probe -> HTTP `401`
- the pre-repair advisor findings `rls_disabled_in_public` on the six repaired
  tables and `rls_enabled_no_policy` on `movie_buff_round_events` are gone
- targeted anon execute cleanup is now in effect for authenticated gameplay
  RPCs such as:
  - `advance_movie_buff_round(uuid)`
  - `get_movie_buff_round(uuid)`
  - `submit_movie_buff_answer(uuid, text)`
  - `is_movie_buff_round_member(uuid)`
- remaining anon-callable `SECURITY DEFINER` functions are now narrowed to:
  - `find_or_create_movie_buff_public_room(uuid, text, integer, integer)`
  - `start_movie_buff_match(uuid)`
  - `pick_movie_buff_clip(uuid, uuid, text)`
  - `handle_new_user()`
- repo-intent read is mixed:
  - `find_or_create_movie_buff_public_room` now looks like likely grant drift
    from later function recreation
  - `start_movie_buff_match` and `pick_movie_buff_clip` were explicitly granted
    to `anon` in multiple raw migrations and need separate intent review
- the live Vercel production alias now resolves to deployment
  `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`, `READY`, from commit
  `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13` on `main`
- read-only hosted route health against `https://movie-buff-sigma.vercel.app`
  is currently stable for public routes, and unauthenticated admin routes show
  access gating without leaked admin payload
- for the full repaired production packet, see:
  - `docs/movie-buff-production-supabase-audit-2026-08-12.md`

Wednesday, August 12, 2026 public-RPC alignment follow-up:

- a third production migration was applied:
  - `movie_buff_public_rpc_acl_alignment`
- production now matches the tighter restored-rehearsal ACL posture for:
  - `find_or_create_movie_buff_public_room(uuid, text, integer, integer)`
  - `start_movie_buff_match(uuid)`
  - `pick_movie_buff_clip(uuid, uuid, text)`
  - `handle_new_user()`
- those functions are no longer callable by `anon` in production
- `pick_movie_buff_clip` and `handle_new_user()` are also no longer callable by
  `authenticated`; they retain `service_role` only
- the earlier `anon_security_definer_function_executable` findings for those
  functions are now gone from the production Supabase security advisor
- restored rehearsal proof is now stronger than the earlier static SQL read:
  - the restored rehearsal project already had the tighter ACL posture
  - a no-session publishable-key client there receives permission denied for
    `find_or_create_movie_buff_public_room`
  - local route health passed
  - a one-round local public Movie Buff smoke passed against the restored
    rehearsal target while using the tighter ACL state
- this means the public-RPC exposure is now closed both in rehearsal and in
  production
- the next hardening frontier is no longer the public RPC grants; it is the
  remaining anonymous-sign-in semantics behind `TO authenticated` policies and
  the still-public authenticated `SECURITY DEFINER` Movie Buff RPC surface

## Live facts verified now

### Supabase production project

- project: `Movie Buff`
- ref / project id: `yfatwreicmiocdxzyznd`
- region: `us-east-1`
- current project status: `ACTIVE_HEALTHY` (Supabase CLI project inventory)
- authorized read status: `READABLE` through the Supabase Management API
  `database/query/read-only` endpoint as `supabase_read_only_user`, observed at
  `2026-08-10 20:11:57.629955+00`; the Supabase connector itself still denies
  the equivalent read with `MCP error -32600` / `INVALID_ARGUMENT`
- fresh production security state: all six protected tables exist, but all six
  have `relrowsecurity=false` and `relforcerowsecurity=false`; no policies are
  present for those tables, and their ACLs grant `anon` and `authenticated`
  broad table privileges
- fresh migration ledger: `supabase_migrations.schema_migrations` exists with
  exactly two entries: `20260803233057 remote_schema` and
  `20260803235116 movie_buff_join_room_rpc_hardening`
- fresh functional state: `public.match_rounds` contains 416 rows; the
  candidate's 29-function critical contract is not present in production. Only
  15 functions were found, zero match the full expected contract, and most use
  `search_path=public` instead of the candidate contract. The one matching
  function is `join_movie_buff_room(text)`, hardened with
  `search_path=pg_catalog` and anonymous execute revoked
- fresh schema inventory: the five content-engine tables remain absent;
  `public.movie_buff_round_events` exists with an estimated 1,411 rows
- no production SQL, migration, grant, restore, or other database mutation was
  performed during this audit

### Authorized rehearsal target

- persistent branch: `movie-buff-mov19-rehearsal-20260811`
- branch project ref: `awzkzgzsezhwopzutlyt`
- parent project ref: `yfatwreicmiocdxzyznd`
- production data cloned: `false`
- branch status: `FUNCTIONS_DEPLOYED` (Supabase CLI branch inventory)
- authorized branch write window: through `2026-08-11T08:00:00Z`, limited to
  `awzkzgzsezhwopzutlyt`
- branch read-only query succeeded at `2026-08-11 05:04:50.046805+00` as
  `supabase_read_only_user`; the branch database and migration ledger are
  reachable
- exact repository SQL was applied only to this rehearsal branch through the
  Supabase Management API migration endpoint; production was not mutated
- fresh branch reconciliation is PASS: all six protected tables have RLS and
  FORCE RLS, exact policies and ACLs; all 15 internal tables have forced RLS,
  restrictive browser-deny policies, and service-role continuity; all 29
  manifest-critical functions pass the exact owner/SECURITY DEFINER/search-path/
  EXECUTE contract; the `ensure_rls` event trigger and `match_rounds` schema
  contract pass
- content-engine parity is PASS: all 14 expected tables are present,
  including the five previously missing production tables
- branch migration ledger contains 36 unique entries after forward apply,
  rollback containment, and exact reapply; the inherited production entries
  remain intact
- exact v3 successor verifier is PASS at manifest SHA
  `a77ed93556d338075d8f941e8570f77621551dda47fec5bc1f53a1ad054063bf`
- fresh forward/recovery/equality rehearsal is PASS: state digest before
  rollback `279d2660788d16e8057b41ae8c42d5ae`, containment digest
  `49ddb836eebb2861707fe7c3864ebaa8`, and reapply digest equal to the original;
  equality result `true`

### Vercel production project

- team: `shaheed1`
- project: `movie-buff`
- production alias:
  - `movie-buff-sigma.vercel.app`
- production alias currently resolves to deployment:
  - `dpl_9fQAjEP1tqszq1zN7SWd9xtcoARZ`
- that live deployment was created on Tuesday, August 11, 2026 from:
  - branch: `main`
  - commit: `e2c753ea9cdae1a758801d0ae2ef37c8ddd380b7`

### Newer non-live deployments exist

- newer historical branch and prior-main deployments still exist, but the live
  production alias now points at the latest `main` deployment above
- exact current candidate Preview: `dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc`
  (`movie-buff-92sqsz4ag-shaheed1.vercel.app`), `READY` from `f53da415...`

### Hosted auth/admin inventory changed since July 31

Live production auth now shows:

- total auth users: `312`
- anonymous users: `6`
- non-anonymous users: `306`
- non-test full accounts by current repo heuristic: `21`
- admin profiles: `44`
- non-anonymous admin profiles: `44`

Interpretation:

- the old July 31 blocker "`no real production operator account exists yet`" is
  no longer true as written
- production now has real non-anonymous users and multiple admin-profile rows

### Public hosted page health

- `https://movie-buff-sigma.vercel.app/account` returns `200`
- a fresh unauthenticated browser session still shows no active Buff Games
  account session by default

### Production activity

- `movie_buff_round_events` total rows observed: `1401`
- latest observed event timestamp:
  - `2026-08-08 02:13:17.69647+00`

Interpretation:

- the production system has continued to receive activity after the July 31
  audit window

## Remaining verified gaps

### 1. Last dated production probe: content-engine schema was absent

These production tables are still missing:

- `public.content_items`
- `public.content_media`
- `public.content_sources`
- `public.content_source_items`
- `public.movie_buff_clip_analytics`

Interpretation:

- the fresh August 10 read confirms the legacy-fallback production path is
  still carrying the live app and has no full content-engine parity
- read access is restored for evidence collection, but the observed production
  state is a security/ledger/function-contract FAIL against the current
  candidate and cannot be treated as release-ready

### 2. PR #224 is still draft and not merged

GitHub currently shows:

- PR `#224`
- state: `open`
- draft: `true`
- merged: `false`
- mergeable: `true` / `CLEAN`
- Vercel: `SUCCESS`
- Vercel Preview Comments: `SUCCESS`
- head SHA:
  - `f53da415629135deb61cea2996fab431804b149e`
- head tree:
  - `1209926102ab85abb8fdb4420effaacd2a888b9c`

### 3. Exact-head proofs are PASS; the rehearsal branch is reconciled but production is not

- current candidate provenance is narrow PASS: author and committer are
  `iecmail01-debug`; the commit is unsigned/unverified
- current inventory proof is PASS on run `31425974193`; both inventory and
  independent-inspection jobs passed. Artifact `9077192680`, digest
  `sha256:240b3815a6deb09600ea8fffb7a725ee0382de41ca813b21d3eaa8e2599be559`
- current recovery proof is PASS on run `31425975147`; forward, containment
  rollback, exact reapply, catalog equality, credential hygiene, and
  independent inspection all passed. Artifact `9077248296`, digest
  `sha256:32a13458ed5e6d9a0e31edbddf7c9c1573e25e28710fc8415e6d31c91b024a4e`
- the candidate now contains the PostgreSQL-compatible constraint guard and
  canonical definition checks, a textual default preflight comparison, and an
  explicit historical-only scope marker for the manifest-v2 verifier
- the fresh recovery artifact is disposable-localhost evidence and explicitly
  does not prove hosted production state or production equality
- the authorized production read packet independently confirms the six
  protected-table RLS/FORCE RLS failure, the two-entry migration ledger, and
  the incomplete critical-function contract above
- the named rehearsal branch now supplies fresh hosted forward, containment
  rollback, exact reapply, catalog equality, content-table, and v3 successor
  verifier evidence; this evidence is branch-scoped and does not change or
  certify production

Interpretation:

- the remaining blockers are production reconciliation under an explicitly
  authorized change window, hosted production-like forward/recovery/equality
  evidence, authenticated protected Preview smoke, and independent post-run
  MOV-19 acceptance
- old green artifacts remain historical because they bind the prior candidate
- independent MOV-19 review completed against this exact head: `NO-GO`;
  reviewer confirmed candidate identity and exact-head inventory/recovery
  evidence, but rejected acceptance because production baseline fails, hosted
  production-like equality is absent, protected Preview auth is unverified,
  and no current-head `APPROVED` review exists

### 4. The live alias has moved since the earlier August 10 read packet

Interpretation:

- earlier notes that tied `movie-buff-sigma.vercel.app` to the August 1
  deployment are now stale
- production users now receive the latest `main` deployment on
  `movie-buff-sigma.vercel.app`
- August 8 branch evidence is still not the same thing as already-live
  production, but the production alias itself is no longer frozen on the older
  August 1 build

## Current truthful status

As of Tuesday, August 11, 2026:

- core hosted Movie Buff is live on the latest verified `main` production
  deployment at commit `e2c753ea9cdae1a758801d0ae2ef37c8ddd380b7`
- production now has real non-anonymous users and admin-profile rows
- the fresh August 10 read confirms six protected tables with RLS and FORCE
  RLS disabled, no policies, broad `anon`/`authenticated` table ACLs, only two
  migration-ledger entries, and an incomplete function hardening contract
- PR `#224` remains draft/unmerged
- the candidate head is `f53da415...` / `1209926102...`
- inventory and recovery are current-head PASS with independent artifact
  inspection
- the authorized named rehearsal branch is reconciled and its forward,
  rollback/reapply, equality, content parity, and v3 verifier checks are PASS
- the exact candidate Vercel Preview is READY and its build/page-data checks
  pass; protected application smoke still redirects to Vercel SSO
- MOV-19 is independently `NO-GO` pending production reconciliation, hosted
  production-like forward/recovery/equality evidence, protected Preview
  authentication, and a current-head approval from an authorized reviewer

## Safe next actions without human interaction

- preserve the fresh exact-head inventory/recovery artifacts as current evidence
- preserve the branch-scoped rehearsal ledger, verifier, and equality evidence;
  do not represent it as production state
- keep launch and handoff docs aligned with the current candidate and gate state
- preserve old artifacts as historical-only; do not reuse them as current-head
  evidence

## Actions that still need human direction or authenticated human presence

- an authorized production change window for the RLS/FORCE RLS, policy/ACL,
  migration-ledger, content-engine, and critical-function gaps now confirmed by
  the fresh read packet
- any production-side forward/recovery/equality exercise beyond the named
  rehearsal branch, if that gate is required for release
- current-head MOV-19 acceptance after all gates pass
- authenticated protected Preview application smoke, if required by the
  acceptance packet
- any merge or promotion of PR `#224`
- any deployment/promotion, hosted mutation, production SQL, restore, or ARM
- production SQL or hosted mutation to add the absent content-engine schema
- deployment alias changes or other production promotion steps

## Controlling August 12 correction

The dated sections above are retained as historical audit context. The
following facts supersede their August 10-11 production snapshot:

- the live production alias is `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`, deployed from
  `main` at `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`
- the live client bundle uses successor rehearsal Supabase project
  `eiamucxbestinitydkvu`, not production ref `yfatwreicmiocdxzyznd`
- a fresh production read at `2026-08-12T04:15:12Z` found five migration-ledger
  rows, RLS enabled but FORCE RLS disabled on the six target tables, broad
  direct ACLs on the first five target tables, and content-engine parity still
  incomplete
- production has received partial board/RPC hardening, but it does not yet
  satisfy the full successor manifest or production-like forward/recovery/
  equality gate
- PR #224 remains open, draft, and unmerged at `f53da415...`; all six reviews
  are `COMMENTED`, and no independent current-head `APPROVED` review exists
- the exact Preview still returns Vercel SSO `302`, so authenticated protected
  application smoke remains unproven

The current controlling notes are
`docs/movie-buff-production-supabase-audit-2026-08-12.md` and
`docs/movie-buff-hosted-validation-status-2026-08-12.md`.

## Controlling August 12 authorized-window completion update

The historical status above is superseded for the current hosted state:

- production Supabase project `yfatwreicmiocdxzyznd` now passes the successor
  v3 manifest: six protected tables with FORCE RLS, `14/14` content tables,
  `29/29` critical functions, shared security schema, and the enabled RLS
  event trigger
- production rollback/reapply equality proof passed in a transaction with
  equal before/after catalog digests
- the four round-flow playback RPCs missing authenticated execution were
  repaired and rechecked
- Vercel production is now READY at deployment
  `dpl_B2dGbKfNwe1mPttXwcyB6CYSyVS2`, aliased to `movie-buff-sigma`; Preview
  is READY at `dpl_42NTfXYg45NgwFLGq3SHBVKK29gP` and remains rehearsal-backed
- production route health and the categories API are green; the fresh
  three-client smoke reached live play but did not complete client convergence
  at round-results, so full MOV-19 gameplay acceptance is still unproven
- PR #224 remains draft/unmerged with no independent current-head `APPROVED`
  review, and protected Preview authentication is still a human/browser gate

See the two August 12 controlling notes above for the exact evidence and
timestamps.

The controlling production proof was rerun at `2026-08-12T06:01:36Z` against
candidate `f53da415629135deb61cea2996fab431804b149e` (tree
`1209926102ab85abb8fdb4420effaacd2a888b9c`). Exact forward/rollback artifacts
were applied inside one transaction; the before and after-reapply catalog
digests were both `7f474b2246816ac24f07ab89e0ce5581`, so equality passed and no
proof state persisted.

### Current controlling audit — 2026-08-12T07:27:42Z

The current candidate and hosted state were rechecked after the independent
review was submitted. Candidate `f53da415629135deb61cea2996fab431804b149e`
with tree `1209926102ab85abb8fdb4420effaacd2a888b9c` is clean. PR #224 remains
Draft/unmerged, Vercel checks pass, and `iecmail01-debug` approved the exact
head at `2026-08-12T06:55:29Z`.

The exact Preview deployment is READY and renders in authenticated Chrome.
Unauthenticated requests still receive the expected Vercel SSO redirect.
Production route health passed `12` routes times `5` attempts and the
categories API returned HTTP `200` at approximately `2026-08-12T07:12Z`.

The remaining acceptance blockers are the complete hosted three-client
join-to-final-results flow, full gameplay evidence on the exact protected
candidate Preview, and a safe independent fingerprint proving the production
and Preview Supabase value bindings. The Supabase v3 verifier and migration
ledger are not reclassified in this capture because the local read path lacks
production-matching credentials. The old RLS/ledger/content-engine failures,
missing approval statements, and unverified-Preview statements elsewhere in
this historical document remain historical only.

## Controlling current status — 2026-08-12T11:50:04Z

The latest authorized-window work changes the launch disposition as follows:

- Vercel Production Supabase variables were corrected to production project
  `yfatwreicmiocdxzyznd`; Preview variables were restored to rehearsal project
  `eiamucxbestinitydkvu`.
- Production was redeployed as READY `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, and
  its public client bundle independently contains the production Supabase URL.
- Fresh route health passed 12 routes × 5 attempts, and the categories API
  returned HTTP `200`.
- Fresh Data API inventory returned `200` for all `14/14` expected
  content-engine tables. This does not prove catalog RLS/FORCE RLS, policies,
  ACLs, critical functions, or migration-ledger state.
- Fresh production three-client gameplay joined one room and reached round 2,
  but timed out during post-round client convergence; no final-results PASS is
  claimed.

Launch remains `NO-GO` until all of these are closed, in priority order:

1. Obtain a complete three-client production-like flow through final results;
2. Obtain authenticated full gameplay on exact candidate Preview
   `dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc`;
3. Re-establish a production SQL/catalog read and rerun the v3 verifier plus
   migration-ledger proof after the rebind;
4. Capture independent Preview Supabase binding evidence; and
5. Reconcile the evidence packet and hand off launch without merging or
   promoting PR #224.

The remaining human gate is browser access: Chrome is running with the Codex
extension enabled and its native host manifest valid, but the browser-control
connection currently fails with `failed to write kernel assets`. Reconnect the
Codex browser extension or allow opening a fresh Chrome window, then provide
the authenticated candidate Preview session for the full gameplay run.

## Exact-head acceptance correction

Capture: `2026-08-12T12:03:17Z`.

The `iecmail01-debug` review at `2026-08-12T06:55:29Z` is not the required
independent MOV-19 acceptance: it was submitted by the Seat-4
implementation/security writer and was classified `NOT APPLICABLE` to the
sole independent Watchtower gate at `2026-08-12T09:41:02Z`. A reviewer outside
Seats 1-4 must approve after the fresh hosted and production evidence is
complete. The production/Vercel authorization window ended at
`2026-08-12T12:00:00Z`; no further hosted mutation is authorized without a
new window.

## Current browser-gate recheck

Capture: `2026-08-12T12:07:39Z`.

A fresh browser connection attempt still fails with
`failed to write kernel assets` before protected Preview inspection can begin.
No production or Vercel mutation occurred after the authorization window
ended at `2026-08-12T12:00:00Z`.

## Isolated local quality remediation

Capture: `2026-08-12T12:34:34Z`.

The frozen exact candidate remains at `f53da415629135deb61cea2996fab431804b149e`.
An isolated branch, `codex/movie-buff-lint-fixes` at commit `1349433`, clears
the local React hook/purity lint errors and passes the full `171/171` Movie
Buff test suite plus a production-environment in-process webpack build. This
branch is not part of PR #224 or any deployment; adopting it would require a
new exact candidate, fresh rebind/proof cycle, and independent MOV-19 review.

## Fresh read-only production API recheck

Capture: `2026-08-12T12:47:12Z`.

The authenticated Supabase CLI performed a fresh service-role REST inventory:
all `14/14` expected content-engine tables returned HTTP `200`. This is
current API-readability evidence only and does not prove catalog security,
critical functions, or migration-ledger state. The database host remains
unreachable from this Windows session; no production mutation was attempted.

## Current hosted-state recheck and access boundary

Capture: `2026-08-12T12:52:18Z`.

PR `#224` remains open, Draft, unmerged, and `CLEAN` at exact head
`f53da415629135deb61cea2996fab431804b149e`; its listed Vercel checks pass.
The current production bundle still contains the production Supabase URL, but
protected Preview gameplay and exact Preview binding remain unproven because
browser control fails before tab selection.

A linked Supabase CLI retry reached the temporary read-only login-role
handshake but did not complete a SQL query; no application or schema write was
performed. Further production/Vercel or linked-query work is paused until a
new authorization window is supplied.

## Local exact-candidate browser harness recheck

Capture: `2026-08-12T13:04:15Z`.

The exact candidate reached exact visible build identity and authenticated all
three disposable localhost players, but public matchmaking produced two room
IDs instead of one; all three failure captures remained on `Loading waiting
room...`. No browser page, console, HTTP, or request errors were recorded, so
this is a local convergence failure rather than hosted proof. A fresh local
Supabase reset also fails at `20260804070000_movie_buff_production_baseline_reconciliation.sql`
because `public.is_movie_buff_room_member(uuid)` already exists from an earlier
migration. The later atomic three-player matchmaking migration is therefore
not applied locally; the production-like local proof environment remains
unreproducible and launch stays `NO-GO`.

## Current supersession note — August 12, 2026

The historical sections above contain older deployment, bundle, and database
snapshots and must not be used as current launch evidence. The controlling
status is now
`docs/movie-buff-hosted-validation-status-2026-08-12.md`, which records the
current production bundle, PR head, public route-health result, narrow REST
inventory, expired authorization boundary, and missing exact-candidate hosted
proof. No statement in this document authorizes a production mutation, merge,
promotion, or launch.

## Current exact-candidate supersession - August 12, 2026 17:45 UTC

The historical notes above are superseded by the exact candidate below. The
current authorized window is Supabase production `yfatwreicmiocdxzyznd` and
Vercel `shaheed1/movie-buff` through `2026-08-13T12:00:00Z`; PR #224 was not
merged and no unrelated change was promoted.

- Candidate branch:
  `codex/movie-buff-playback-resync-20260812`
- Candidate commit/tree:
  `2bc147792f6778a4f1b51186be70dbb606a36409` /
  `687330e4e40822871e0ba550501dfda9657e1fb7`
- Local quality: lint PASS; full Movie Buff test suite `171/171` PASS.
- Preview deployment: `dpl_DxKAtmGPBJZQcoGueBJz7BA7ppgt`,
  `movie-buff-p6mtuspqt-shaheed1.vercel.app`, READY, exact candidate SHA.
- Production-target deployment without alias promotion:
  `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`,
  `movie-buff-edq13k84v-shaheed1.vercel.app`, READY, exact candidate SHA.
- Both deployments have fresh bundle binding to the production Supabase URL,
  no rehearsal URL, and the current publishable-key hash.
- Both deployments have fresh three-user hosted forward/readiness/recovery/
  match-view proofs with disposable room and user cleanup.
- Disposable security proof: 119 forward tests PASS, 33 rollback tests PASS,
  four security migration versions present, and before/reapply catalog digest
  equal `7aea01ce96a8bd0c37eb05fcdcc195c9`.

Launch remains NO-GO for two highest-priority reasons:

1. Current production SQL/catalog state is UNKNOWN. The linked Supabase SQL
   query timed out and browser SQL Editor access is unavailable, so current
   RLS/FORCE RLS, policies/ACLs, critical functions, and migration-ledger state
   have not been freshly verified.
2. Independent post-run MOV-19 acceptance is NO-GO. The independent review
   confirmed the candidate evidence but cannot accept launch while the live
   catalog read is missing; a named reviewer outside Seats 1-4 still must
   record post-run approval.

PR #224 remains open, Draft, unmerged, CLEAN, and still points to its older
head `f53da415629135deb61cea2996fab431804b149e`. The corrected candidate is
not being represented as merged or release-authorized by this document.

## Current live-state correction - August 12, 2026 19:07 UTC

The older same-day sections in this file that described the live public alias
as rehearsal-backed are now stale.

Fresh read-only checks establish:

- latest Vercel production-target deployment:
  `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`, `READY`, created
  `2026-08-12T17:20:17.378Z`, commit
  `2bc147792f6778a4f1b51186be70dbb606a36409`
- live alias recheck:
  `https://movie-buff-sigma.vercel.app`
- current live bundle fingerprint:
  `/_next/static/chunks/2jpmv089c_ya6.js`, SHA-256
  `1ab29bf37c27503adddc0bc152ad7066d681bb9c203004f72c73c5acd377e93e`
- that live bundle contains production Supabase URL
  `https://yfatwreicmiocdxzyznd.supabase.co`
- that live bundle does not contain rehearsal ref
  `eiamucxbestinitydkvu`
- newest production-target deployment runtime logs from
  `2026-08-12T17:06:57Z` through `2026-08-12T19:06:16Z` show `7` HTTP `200`
  responses and no error/fatal logs

Interpretation:

- the public live alias is currently production-backed on the client side
- the controlling public-host truth is now in:
  - `docs/movie-buff-hosted-validation-status-2026-08-12.md`
  - `docs/movie-buff-production-supabase-audit-2026-08-12.md`
- local repo env files still point to rehearsal project
  `eiamucxbestinitydkvu`, so local env state and live hosted state are no
  longer aligned

Current truthful blocker summary:

1. live public client binding: `PASS`
2. current live server-side secret binding: `UNKNOWN`
3. current production SQL/catalog read: `PARTIAL / MIXED`
4. independent MOV-19 post-run acceptance: still required

## Current production catalog correction - August 12, 2026 19:07 UTC

The live-status summary above is now supplemented by a fresh direct production
SQL read against `yfatwreicmiocdxzyznd`.

Confirmed now:

- migration ledger rows: `37`
- auth users: `312` total, `6` anonymous, `306` permanent
- expected content-engine tables: `14/14` present
- `movie_buff_security` schema: present
- `ensure_rls` event trigger: present

Current catalog status is not fully green and not fully unknown:

- several current Movie Buff tables have both RLS and FORCE RLS with one
  policy each, including `movie_buff_boards`, `movie_buff_board_tiles`,
  `movie_buff_board_categories`, `movie_buff_board_events`,
  `movie_buff_match_participant_seats`, `movie_buff_match_phase_actions`,
  `movie_buff_match_phase_events`, and `movie_buff_match_phase_state`
- several current public tables still show `relforcerowsecurity=false`,
  including `game_rooms`, `match_players`, `match_rounds`,
  `movie_buff_round_events`, `movie_buff_clip_analytics`, and
  `movie_buff_movie_analytics`
- key gameplay playback RPCs currently expose authenticated execute for
  `enter_movie_buff_round`, `prepare_movie_buff_round_playback`,
  `start_movie_buff_round_playback`, `advance_movie_buff_round`,
  `join_movie_buff_room`, and `find_or_create_movie_buff_public_room`
- `pick_movie_buff_clip` and `start_movie_buff_match` are currently
  service-role only

Therefore the current truthful classification is:

- live public binding: `PASS`
- current production catalog read: `PARTIAL / MIXED`
- current live secret binding: still `UNKNOWN`

## Current public alias identity and runtime correction - August 12, 2026 19:25 UTC

The current public alias identity has now been separated from the newest
production-target deployment:

- `movie-buff-sigma.vercel.app` is serving
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, commit
  `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`;
- `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG` is a newer READY production-target
  deployment for commit `2bc147792f6778a4f1b51186be70dbb606a36409`, but its
  alias list does not include `movie-buff-sigma.vercel.app`;
- the live public bundle remains production-Supabase-bound, with the
  rehearsal project reference absent;
- live route health passed all `12` routes across `5` attempts each;
- live deployment runtime logs show `67` HTTP `200` responses and no
  error/fatal entries in the captured window;
- the live categories API returned `200` and `50` playable clips, while
  unauthenticated admin APIs returned the expected `401` access gate.

The production catalog read now has direct counts (`50` movies, `50` clips,
`50` content items, `50` media rows, `37` migration rows, `312` users), but
challenge sets and analytics aggregates are empty and source items are empty.
The truthful status remains: live public binding `PASS`, production catalog
`PARTIAL / MIXED`, live server-side secret `UNKNOWN`, and independent MOV-19
acceptance still required. No promotion, merge, or production mutation was
performed.

## Current production match-visibility policy finding - August 12, 2026 19:40 UTC

The current production policy definitions for authenticated reads of
`match_players` and `match_rounds` contain uncorrelated self-comparisons
(`mine.match_id = mine.match_id` and `mp.match_id = mp.match_id`). The intended
membership helper is present, but those policies do not call it. This is a
confirmed security blocker for authenticated match-scoped read acceptance.

A forward-only repair is staged in
`supabase/migrations/20260812130000_movie_buff_match_visibility_policy_repair.sql`.
It has not been applied to production.

The local round-scoped playback repair was rechecked afterward: lint passed
with zero warnings/errors, the production build passed with only the known
informational NFT-tracing warning, and local route health passed all `12`
routes across `5` attempts each. The local server was stopped after the check.

The rehearsal-backed local acceptance pass also covered authenticated sign-in,
admin surfaces, private/public one-round play, leave behavior, and timer/hint
progression. The direct analytics verifier remains explicitly gated to a
Docker container labeled for this repo's Supabase project; no matching local
stack is currently running, so it was not treated as a pass.

The local acceptance checks were completed in the later
`2026-08-12T20:16:43Z` window.

At `2026-08-12T20:21:15Z`, the public categories API had recovered from one
observed `JWT issued at future` HTTP `500`: the next three retries and a
ten-request probe were all HTTP `200` with `50` playable clips. Keep this as
a transient JWT clock-skew watch item until the hosted environment has a
longer clean observation window.

## Rehearsal policy repair verification - August 12, 2026 20:26 UTC

The staged match-visibility policy repair was applied to the rehearsal
Supabase project `eiamucxbestinitydkvu` only. A fresh `pg_policies` read
confirmed that both authenticated SELECT policies now call
`public.is_movie_buff_match_member(match_id)`; the production tautologies are
absent in rehearsal. The rehearsal ledger records version `20260812202625`
(`movie_buff_match_visibility_policy_repair`). Production was not changed.

The rehearsal RLS behavior was also tested with two temporary authenticated
personas and two isolated matches: each persona returned one own
`match_players` row and one own `match_rounds` row, with zero cross-match
rows. Cleanup removed the temporary users and match records.

The repeatable local command is
`MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION=1 npm run
movie-buff:smoke-policy-isolation`; it is guarded against the production
project and cleans up its temporary rehearsal data.

## Current live recheck - August 12, 2026 20:36 UTC

The public sigma alias remains on READY deployment
`dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, commit
`7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`, and its compiled client still
targets production Supabase. Ten category API probes returned `200` with `50`
playable clips; hosted route health passed all `12` routes over `5` attempts.
The only recent deployment 5xx is the earlier `JWT issued at future` event at
`20:19:01Z`, retained as a transient watch item.

The separate READY deployment `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG` is on the
playback-resync branch at commit `2bc147792f6778a4f1b51186be70dbb606a36409`,
not on the current main candidate, so it remains unpromoted.

The repository `.env.production` shape check passes but still names rehearsal
Supabase `eiamucxbestinitydkvu`; the public compiled bundle is the separate
source of evidence that the live client targets production.
