# Movie Buff hosted validation status

Date: Wednesday, August 12, 2026

## Purpose

This note captures the current hosted-runtime state for the live Movie Buff
production alias on August 12, 2026.

It is intentionally narrow:

- what the live alias is currently serving
- whether that live deployment is healthy
- what that hosted evidence does and does not prove

## Validation capture identity

- repo head at capture:
  - `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`
- live production alias:
  - `https://movie-buff-sigma.vercel.app`
- live deployment at capture:
  - `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`
- live deployment state:
  - `READY`
- live deployment commit:
  - `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`

## Critical scope correction

The live alias is currently wired to the successor rehearsal Supabase project,
not the production Supabase project.

Verified evidence:

- the alias still resolves to immutable deployment
  `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`
- saved client bundle artifact for that deployment initializes Supabase against
  `https://eiamucxbestinitydkvu.supabase.co`
- artifact:
  `C:\Users\shapa\Documents\Codex\2026-08-09\https-chatgpt-com-share-6a781292-d98c\outputs\movie-buff-chunks\30fqqc84wv0x2.js`

Interpretation:

- hosted checks against `https://movie-buff-sigma.vercel.app` currently validate
  the successor rehearsal project `eiamucxbestinitydkvu`
- they do not prove current runtime behavior against production Supabase
  `yfatwreicmiocdxzyznd`

## Hosted checks currently passing on the live alias

Earlier in this task, the full hosted preflight suite passed against the live
alias:

- route health
- public smoke
- auth smoke
- private smoke
- leave smoke
- shared public leave smoke
- admin smoke
- timer smoke
- pool health

Because the live alias still points to the same immutable deployment, these
results remain the current hosted truth for `movie-buff-sigma.vercel.app`.

## Current hosted runtime signal

Vercel production runtime logs since deployment creation
`2026-08-12T00:26:21.293Z`:

- HTTP `200`: `597`
- HTTP `307`: `14`
- HTTP `416`: `11`
- HTTP `304`: `4`
- HTTP `201`: `3`
- error/fatal logs: none

Interpretation:

- the current live deployment is operationally healthy
- no current runtime error/fatal signal was found for the live deployment window

## What this note proves

- the public production alias is live
- the current live deployment is healthy for hosted gameplay, auth, admin, and
  timer/pool checks
- the current live deployment is serving a rehearsal-backed Supabase client

## What this note does not prove

- that the live alias is using production Supabase
- that production Supabase auth settings have been hardened
- that Vercel production env vars already match the intended final production
  cutover target
- that hosted production and production Supabase are currently aligned

## Controlling authorized-window update

Capture: `2026-08-12T05:46:33Z`.

The previous capture is historical. The live production alias now points to
READY deployment `dpl_B2dGbKfNwe1mPttXwcyB6CYSyVS2`, and the production
Supabase project has been reconciled and revalidated:

- six protected tables: RLS/FORCE RLS and manifest policies PASS
- content engine: `14/14` expected tables present
- critical-function manifest: `29/29`, v3 verifier `PASS`
- migration ledger: `37` rows total, including `32` authorized-window
  reconciliation rows
- transaction-scoped rollback/reapply equality: `true`
- runtime playback RPC ACL repair: PASS for the four authenticated gameplay
  functions used by the round flow

Fresh hosted checks against `https://movie-buff-sigma.vercel.app` show route
health PASS for `12` routes over `5` attempts each, and the categories API
returns HTTP `200` from production. A three-client production smoke reached
the waiting room and play route; its first run exposed the missing playback
RPC grant, which was repaired. The next run reached round-results transition
but did not complete client convergence before timeout, so this is not a full
MOV-19 gameplay PASS.

Vercel Preview was rebuilt as READY deployment
`dpl_42NTfXYg45NgwFLGq3SHBVKK29gP` with its existing rehearsal Supabase
target. Protected Preview remains SSO-protected (`302` without an authenticated
browser session), so authenticated Preview application smoke is still
unverified. PR #224 remains draft and unmerged, with no current-head
independent `APPROVED` review.

The exact candidate-bound production forward/recovery/equality rerun completed
at `2026-08-12T06:01:36Z` against commit
`f53da415629135deb61cea2996fab431804b149e` and tree
`1209926102ab85abb8fdb4420effaacd2a888b9c`. Its transaction-scoped catalog
digests were `7f474b2246816ac24f07ab89e0ce5581` before rollback,
`33c5d2bd27d864f338b5e374798b752d` after rollback, and
`7f474b2246816ac24f07ab89e0ce5581` after reapply; equality was `true`, with
no state persisted.

A post-proof production read at `2026-08-12T06:06:25Z` reconfirmed the same
ledger, six-table RLS/FORCE RLS, `14/14` content-table, runtime-ACL, shared
security-schema, and `ensure_rls` event-trigger results.

The exact candidate Preview deployment was rechecked at `2026-08-12T06:17:03Z`:
`dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc` is READY at
`https://movie-buff-92sqsz4ag-shaheed1.vercel.app`, but protected routes still
require Vercel SSO.

## Controlling current audit update

Capture: `2026-08-12T07:27:42Z`.

This append-only section supersedes earlier historical statements in this file
that say the candidate has no independent approval or that authenticated
Preview access has not been demonstrated.

- Candidate freeze: commit `f53da415629135deb61cea2996fab431804b149e`, tree
  `1209926102ab85abb8fdb4420effaacd2a888b9c`; candidate worktree clean.
- PR #224 remains open, Draft, and unmerged. Its head remains the candidate,
  merge state is `CLEAN`, Vercel checks pass, and `iecmail01-debug` submitted an
  independent `APPROVED` review against that exact head at
  `2026-08-12T06:55:29Z`.
- Exact Preview deployment `dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc` remains READY.
  Authenticated Chrome evidence shows the application landing page; an
  unauthenticated HTTP request still returns the expected Vercel SSO `302`.
- Fresh production route health at `2026-08-12T07:12:27Z` passed all `12` routes
  over `5` attempts, with no application errors or leaked admin payloads.
  Production `/api/movie-buff/categories` returned HTTP `200`.
- Vercel read-only inspection at approximately `2026-08-12T07:18Z` confirmed
  all five required variable names are configured for Production and Preview;
  secret values were not exposed, so exact deployment-to-project value
  binding remains `UNKNOWN` until a safe fingerprint is captured.
- Supabase project identity `yfatwreicmiocdxzyznd` is `ACTIVE_HEALTHY`. The v3
  verifier and migration-ledger read were not rerun in this cycle because the
  local environment has no production-matching Supabase credentials and the
  CLI requires a production-linked IPv4/database access path.
- The fresh three-client final-results proof remains pending. The production
  harness was not run because only rehearsal Supabase values were available in
  the current process; no test data was created by that attempt.
- Local candidate smoke is also pending: the clean candidate checkout lacks a
  running candidate server and the required local Supabase environment.

Current blockers, in order: complete the three-client hosted flow; capture a
full authenticated exact-candidate Preview gameplay run; independently verify
the production/Preview Supabase value binding; restore a read-only production
Supabase query path; then commit or archive the evidence documents and decide
whether separate promotion authorization is granted. No production, Vercel,
code, or PR mutation was performed by this audit.

## Current production bundle binding fingerprint

Capture: `2026-08-12T11:10:30Z`.

The public production client bundle was fetched from the live alias
`https://movie-buff-sigma.vercel.app` and independently inspected without
printing any key material. It contains the production Supabase URL
`https://yfatwreicmiocdxzyznd.supabase.co`.

- deployment query marker: `dpl_B2dGbKfNwe1mPttXwcyB6CYSyVS2`
- matching bundle: `/_next/static/chunks/336-m59nm70c2.js`
- bundle SHA-256: `0253ee7e18782fe0526b93f0e8f9e6297ab69baa6d3f9ec332938bdb0a40820c`
- bundle size: `232558` bytes

This proves the production browser/client URL binding. It does not expose or
prove the server secret value, and the exact candidate Preview bundle remains
SSO-protected to unauthenticated HTTP, so Preview value binding and the full
candidate-hosted gameplay run remain open.

## Controlling rebind and fresh hosted evidence

Capture: `2026-08-12T11:50:04Z`.

The authorized Vercel environment correction is now applied and redeployed:

- Production `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` were
  rebound as sensitive Production variables to the production project
  `yfatwreicmiocdxzyznd`.
- Preview values were restored as sensitive Preview variables to the named
  rehearsal project `eiamucxbestinitydkvu`.
- A redeploy of the prior production artifact completed as READY deployment
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, aliased to
  `https://movie-buff-sigma.vercel.app`. No PR merge or promotion was used.
- The current production client bundle contains the production Supabase URL,
  not the rehearsal URL. The matching chunk is
  `/_next/static/chunks/2jpmv089c_ya6.js` with deployment marker
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, SHA-256
  `1ab29bf37c27503adddc0bc152ad7066d681bb9c203004f72c73c5acd377e93e`, and
  size `232396` bytes.

Fresh post-rebind route evidence is PASS: the 12-route health suite completed
five attempts per route with no application-error markers and correct admin
access gating; `/api/movie-buff/categories` returned HTTP `200`.

A fresh production service-key REST inventory at
`2026-08-12T11:50:04.725Z` found all `14/14` expected content-engine tables
readable through the Data API: `content_types`, `content_items`,
`content_categories`, `tags`, `content_tags`, `content_media`,
`content_answers`, `challenge_sets`, `challenge_set_items`,
`movie_buff_round_events`, `movie_buff_clip_analytics`,
`movie_buff_movie_analytics`, `content_sources`, and
`content_source_items`. This is table existence/readability evidence only; it
does not replace the catalog-level RLS/FORCE RLS, ACL/policy, critical-function,
or migration-ledger verifier.

The fresh three-client production flow at
`2026-08-12T11:43:13.841Z` created one common public room, confirmed the
10-round setting, reached round-results for round 1, and reached round 2 play
for at least two clients. It then timed out while the three clients failed to
converge into the next phase, so final-results and full MOV-19 gameplay remain
`UNKNOWN`/not accepted. The exact smoke room and smoke accounts were removed
after the run.

Current open gates remain: authenticated exact-candidate Preview gameplay,
independent Preview binding evidence, a fresh production catalog/verifier and
migration-ledger read, and the unresolved three-client transition to final
results. The Vercel production rebind is no longer a blocker.

## Exact-head acceptance correction

Capture: `2026-08-12T12:03:17Z`.

The earlier `2026-08-12T07:27:42Z` section incorrectly described the
`iecmail01-debug` review as independent MOV-19 acceptance. The exact-head
review at `2026-08-12T06:55:29Z` is a Seat-4 implementation/security review;
the latest Watchtower classification at `2026-08-12T09:41:02Z` marks it
`NOT APPLICABLE` to the sole independent MOV-19 acceptance gate. A reviewer
outside Seats 1-4 must still record post-run acceptance against candidate
`f53da415629135deb61cea2996fab431804b149e` after the hosted and production
gates are fresh. No merge or promotion is authorized by this correction.

## Current browser-gate recheck

Capture: `2026-08-12T12:07:39Z`.

The existing Chrome extension/native-host diagnostics remain healthy, but a
fresh connection attempt still fails before browser selection with
`failed to write kernel assets`. No protected Preview gameplay or Supabase
SQL Editor read was claimed from this attempt. The production/Vercel change
window ended at `2026-08-12T12:00:00Z`; no hosted mutation was performed after
expiry.

## Exact-candidate local build and phase-contract recheck

Capture: `2026-08-12T12:18:43Z`.

The frozen candidate checkout remains at commit
`f53da415629135deb61cea2996fab431804b149e` and tree
`1209926102ab85abb8fdb4420effaacd2a888b9c`. With the production Supabase URL
and API keys supplied only in process, `npm run build` completed successfully;
no key material was persisted or recorded. The exact candidate's full local
phase-contract suite passed `171/171` tests. ESLint remains red on existing
React hook/purity rules, so this local verification does not replace hosted
acceptance or the missing independent MOV-19 review.

## Vercel binding read-only recheck

Capture: `2026-08-12T12:23:37Z`.

Vercel `env pull` confirmed the three required Supabase variable names are
present in both Production and Preview, but the CLI returned `[SENSITIVE]` for
every value, including the URL. Therefore exact Production and Preview value
fingerprints remain unavailable; no false binding claim is made.

## Isolated local quality remediation

Capture: `2026-08-12T12:34:34Z`.

The frozen exact candidate was not modified. In a separate worktree based on
candidate `f53da415629135deb61cea2996fab431804b149e`, local branch
`codex/movie-buff-lint-fixes` commit `1349433` removes the existing React
hook/purity lint errors and the unused `roundService.ts` local. Verification
passed `npm run lint -- --max-warnings=0`, the full Movie Buff suite at
`171/171`, and a production-environment in-process webpack build. This is a
candidate-adjacent quality patch only: it has not been pushed, deployed,
rebound, or included in any hosted proof. A new exact candidate and fresh
hosted/database evidence would be required before treating the lint gate as
closed.

## Fresh read-only production API recheck

Capture: `2026-08-12T12:47:12Z`.

Using the already-authenticated Supabase CLI to obtain the existing production
legacy service-role API credential in process, a fresh REST inventory returned
HTTP `200` for all `14/14` expected content-engine tables. The credential was
not printed or persisted. This is stronger current API-readability evidence
than the earlier publishable-key check, but it remains intentionally narrow:
the REST surface cannot establish catalog RLS/FORCE RLS, policy definitions,
effective ACLs, function ownership/search paths/execute grants, or the
`supabase_migrations.schema_migrations` ledger. The direct production database
host is not reachable from this Windows session, and the browser SQL Editor
gate remains unavailable.

## Current hosted-state recheck and access boundary

Capture: `2026-08-12T12:52:18Z`.

The current PR recheck still resolves PR `#224` as open, Draft, unmerged, and
`CLEAN`, with exact candidate head
`f53da415629135deb61cea2996fab431804b149e`; both listed Vercel checks are
passing. The live production alias remains reachable, and its current bundle
still contains the production Supabase URL. The exact protected Preview and
its Supabase target remain unproven because browser control still fails before
tab selection.

A linked Supabase CLI query retry at `2026-08-12T12:46:17Z` reached the
platform's temporary read-only login-role handshake but did not complete a SQL
query. No application data, schema migration, policy, ACL, or deployment write
was performed. Because that handshake touches the production control plane,
no further linked-query or other production/Vercel operation will be retried
until a new authorization window is supplied.

## Exact-candidate local browser harness recheck

Capture: `2026-08-12T13:04:15Z`.

The exact candidate was exercised against a disposable localhost app with the
temporary harness line-ending normalization needed by this Windows checkout.
The harness passed the three independent Chrome processes, all three
authenticated sessions, and the exact visible build marker, then failed before
ready-state convergence because the three public-match clicks produced two
different room IDs. All three failure screenshots remained on `Loading waiting
room...`; the captured browser evidence had no page errors, console errors,
failed responses, or failed requests. This is not hosted evidence.

The local Supabase reset was then rechecked and failed at migration
`20260804070000_movie_buff_production_baseline_reconciliation.sql` with
`Baseline mismatch: public.is_movie_buff_room_member(uuid) already exists.`
The earlier failed reset left the local database without the later atomic
three-player matchmaking schema (including `public_matchmaking_key`). The
production-like local proof therefore remains invalid until the repository's
baseline snapshot/migration chain is made reproducible; no hosted database or
deployment was changed.

## Corrected candidate local playback recheck

Capture: `2026-08-12T15:13:47Z`.

The playback correction was implemented and verified only in isolated worktree
`C:\\wtkey-playback-fix`, branch
`codex/movie-buff-playback-resync-20260812`, commit
`3542d735c8fc2f965762c1906e8f9df0771c2316`, tree
`ffb22ec34d482d304c3ee79ed7313102d3dd2d34`. The worktree is not the frozen PR
candidate and has not been pushed, deployed, or promoted.

- `npm run lint -- --max-warnings=0`: PASS.
- Movie Buff test suite: `171/171` PASS.
- Production build with the local overlay configuration: PASS; the existing
  Next.js NFT-tracing warning remains informational.
- Disposable local Supabase overlay reset and deterministic seed: PASS, with
  `49` movies and `49` clips loaded. The overlay intentionally omitted the
  fail-closed production baseline migration because the repository does not
  contain its required external snapshot; it is not production evidence.
- Exact three-client local run `full-journey-evidence-patched-4` reached the
  corrected playback path with three authenticated players, one-room
  convergence, selector-only board control, stale-selection `409`, refresh and
  offline recovery, answer deadline, history recovery, responsive results, and
  synchronized results countdown. Playback clocks were
  `[3.257782, 4.568624, 3.426888]` seconds, a `1.31` second spread.

The full local harness was not classified PASS: later reruns reached board
return but remained sensitive to localhost/Next.js timing and the MOV-18 visual
runtime tail. Therefore this evidence proves the corrected playback critical
path and local quality gates, but does not substitute for fresh hosted
forward/recovery/equality evidence or MOV-19 acceptance.

The frozen PR candidate remains unchanged at
`f53da415629135deb61cea2996fab431804b149e`; PR #224 remains Draft and
unmerged. No hosted system was modified during this recheck.

## Current public-host and browser recheck

Capture: `2026-08-12T15:21:10Z`.

Read-only checks confirm the launch boundary is unchanged:

- The public production alias returned HTTP `200` at `2026-08-12T15:17:50Z`.
  Its current client bundle is deployment-marked
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, contains the production Supabase URL,
  and contains neither the corrected isolated commit marker nor the frozen PR
  commit marker. This is current production URL binding, not exact-candidate
  gameplay evidence.
- The exact Preview URL still returns Vercel SSO HTTP `302` at
  `2026-08-12T15:18:18Z`, so authenticated Preview gameplay and exact Preview
  value binding remain unavailable to this session.
- A fresh publishable-key REST probe at `2026-08-12T15:21:10Z` returned
  `200` for `11/14` expected tables. The three analytics tables returned
  `401`, which is consistent with their service-role-only boundary. This
  confirms public API reachability for content tables; it does not establish
  catalog security, ACLs, functions, or the migration ledger.
- GitHub currently reports PR #224 open, Draft, unmerged, `mergeable=true`,
  `mergeable_state=clean`, with head
  `f53da415629135deb61cea2996fab431804b149e`. The current check-runs response
  lists `Vercel Preview Comments` as successful. No independent MOV-19
  acceptance is present.
- Chrome is running and the extension/native-host diagnostics pass, but the
  browser-client retry still fails before tab discovery with
  `failed to write kernel assets`. No protected Preview or SQL Editor evidence
  was claimed.

The production/Vercel authorization window remains expired at
`2026-08-12T12:00:00Z`; no production or Vercel mutation was performed in
this recheck.

The public route-health suite was also rerun against the production alias at
`2026-08-12T15:22Z`: all `12` routes passed across `5` attempts each, with no
application-error markers, no leaked admin payloads, and the expected
unauthenticated admin access gates. Route health remains a stability check and
does not prove authenticated gameplay or database security.

## Current exact-candidate supersession — 2026-08-12T17:45Z

The sections above are historical capture notes. The current authorized
candidate and evidence are:

- authorization scope: Supabase production project `yfatwreicmiocdxzyznd` and
  Vercel project `shaheed1/movie-buff`, authorized through
  `2026-08-13T12:00:00Z`; no PR merge or unrelated promotion was performed;
- exact candidate branch:
  `codex/movie-buff-playback-resync-20260812`;
- exact candidate commit/tree:
  `2bc147792f6778a4f1b51186be70dbb606a36409` /
  `687330e4e40822871e0ba550501dfda9657e1fb7`;
- repository quality: lint PASS; full Movie Buff Node suite `171/171` PASS;
  the final commit contains the Windows filesystem-lock contention fix;
- corrected Vercel bindings: Production and Preview URL and publishable key
  target `yfatwreicmiocdxzyznd`; server key is the compatible legacy
  service-role key. Values were entered byte-clean; no key values are stored
  in this document;
- exact Preview deployment: `dpl_DxKAtmGPBJZQcoGueBJz7BA7ppgt`,
  `https://movie-buff-p6mtuspqt-shaheed1.vercel.app`, READY, exact metadata SHA
  `2bc147792f6778a4f1b51186be70dbb606a36409`;
- exact production-target deployment without domain promotion:
  `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`,
  `https://movie-buff-edq13k84v-shaheed1.vercel.app`, READY, exact metadata
  SHA `2bc147792f6778a4f1b51186be70dbb606a36409`;
- fresh client-bundle binding for both deployments: HTML `200`, `11` JS
  assets, production Supabase URL present, rehearsal URL absent, publishable
  key hash match `231c35da9130f16a8005ff6cacda05c2049c140da4f7453255dd2a887683c33a`;
- fresh hosted forward/recovery/match-view proof for both deployments: three
  authenticated callers converged to one room, readiness activated exactly
  three members, the phase view remained readable, exact candidate identity
  matched all three hosted callers, and the disposable room/users were
  deleted;
- fresh disposable security proof bound to this candidate's migration chain:
  forward `119` pgTAP tests PASS, rollback `33` pgTAP tests PASS, all four
  security migration versions present, and catalog digest before/reapply equal
  at `7aea01ce96a8bd0c37eb05fcdcc195c9`.

These results establish a corrected candidate and fresh production-like
evidence. They do not yet establish current hosted production catalog state:
the linked Supabase SQL read timed out, and the browser SQL Editor connector
remains unavailable. Current production RLS/FORCE-RLS, policies/ACLs, critical
functions, and migration-ledger state therefore remain **UNKNOWN**, not
assumed PASS.

MOV-19 remains **NO-GO** pending (1) a fresh production SQL/catalog read and
reconciliation if needed, and (2) independent post-run acceptance by a named
reviewer outside Seats 1–4. PR #224 remains Draft/unmerged; no merge or
promotion was performed.

## Current public-host recheck

Capture: `2026-08-12T19:07:10Z`.

This section supersedes the earlier same-day hosted note that described the
live alias as rehearsal-backed.

- live alias rechecked:
  - `https://movie-buff-sigma.vercel.app`
- newest Vercel production-target deployment:
  - `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`
  - created: `2026-08-12T17:20:17.378Z`
  - state: `READY`
  - commit: `2bc147792f6778a4f1b51186be70dbb606a36409`
- current live HTML fetch returned `11` unique JS assets
- current live client bundle fingerprint:
  - chunk: `/_next/static/chunks/2jpmv089c_ya6.js`
  - SHA-256:
    `1ab29bf37c27503adddc0bc152ad7066d681bb9c203004f72c73c5acd377e93e`
  - production URL present:
    `https://yfatwreicmiocdxzyznd.supabase.co`
  - rehearsal ref absent:
    `eiamucxbestinitydkvu`

Interpretation:

- the public live alias is currently serving a production-bound Supabase client
- the older `dpl_6gmp6d...` rehearsal-backed capture in this file is now
  historical only
- the public-host/Vercel rebind is no longer the controlling blocker

Fresh runtime sanity for the newest production-target deployment:

- Vercel runtime logs for deployment `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`
  between `2026-08-12T17:06:57Z` and `2026-08-12T19:06:16Z` show:
  - HTTP `200`: `7`
  - error/fatal logs: none

What remains unproven from this exact recheck:

- current server-side secret binding in the live Vercel environment
- current production SQL/catalog state
- full authenticated MOV-19 gameplay acceptance

Local-state warning:

- `.env.local` and `.env.production` in the repo are still pointed at
  rehearsal project `eiamucxbestinitydkvu`
- do not use those files as evidence of the current live hosted target

## Current deployment-alias, API, and local-quality correction

Capture: `2026-08-12T19:25:59Z`.

The previous section correctly established production URL binding, but it
associated the public `sigma` alias with the newest production-target
deployment. A fresh deployment-alias read distinguishes those two facts:

- public alias deployment:
  - `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`
  - commit `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`
  - aliases include `movie-buff-sigma.vercel.app`,
    `movie-buff-shaheed1.vercel.app`, and
    `movie-buff-git-main-shaheed1.vercel.app`
- newer production-target deployment:
  - `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`
  - commit `2bc147792f6778a4f1b51186be70dbb606a36409`
  - aliases include `movie-buff-shaheed1.vercel.app` and
    `movie-buff-spaynetaxes-debug-shaheed1.vercel.app`, but not `sigma`

The live `sigma` HTML returned `200` and carried
`data-dpl-id="dpl_5nac8QihgHPXQHMzTLXhzWP48RFw"`. The direct newer deployment
hostname returned Vercel SSO `302` without a protection bypass, so it is not
the public alias used by the live route-health run. The public client bundle
on `sigma` still contains the production Supabase URL and no rehearsal URL;
that binding remains `PASS`, but the current public code identity is the
`7dc51935...` deployment, not the `2bc147792...` candidate deployment.

Fresh public-host evidence for the actual `sigma` alias:

- route health: all `12` routes passed across `5` attempts each;
  unauthenticated admin routes returned the expected access gate with no
  leaked admin payload;
- deployment-scoped runtime logs for `dpl_5nac8...` since its creation:
  `67` HTTP `200` responses, no `error` or `fatal` entries;
- `GET /api/movie-buff/categories`: HTTP `200`, with `All Movies` reporting
  `50` playable clips;
- unauthenticated `GET /api/admin/access`, `/api/admin/movies`,
  `/api/admin/sources`, and `/api/admin/analytics`: HTTP `401` with
  `Admin sign-in is required.`

Fresh production catalog reads also establish that the production database is
not empty: `37` migration rows, `312` auth users (`6` anonymous and `306`
permanent), `50` movies, `50` clips, `50` content items, and `50` content
media rows. Challenge-set and analytics aggregate tables currently read `0`
rows, while the source registry has `6` sources and `0` source items. The
catalog/security classification therefore remains `PARTIAL / MIXED`, not
`PASS`.

Local repository quality was rechecked after a focused playback-page repair:

- `npm run lint`: PASS with `8` pre-existing warnings and no errors;
- `npm run build`: PASS with the existing informational NFT-tracing warning;
- launch-migration and bootstrap-artifact gates: PASS;
- `.env.local` and `.env.production` still point to rehearsal project
  `eiamucxbestinitydkvu`; they were not changed because the current session
  does not have an authorized production server-secret value source.

This correction leaves the final disposition unchanged: live public client
binding is `PASS`; current production catalog is `PARTIAL / MIXED`; live
server-side secret binding is `UNKNOWN`; the newer candidate is not proven to
be the `sigma` alias; and independent post-run MOV-19 acceptance remains
required. No production mutation, promotion, merge, or secret rotation was
performed.

## Current production match-visibility policy finding

Capture: `2026-08-12T19:40:33Z`.

A fresh read-only `pg_policies` read against production found that the current
authenticated SELECT policies for `match_players` and `match_rounds` contain
uncorrelated self-comparisons:

- `mine.match_id = mine.match_id` in `Players view match participants`;
- `mp.match_id = mp.match_id` in `Players view match rounds`.

The repository's intended membership helper is present and correctly checks
the requested match against `auth.uid()`, but these current policy predicates
do not call it. This is a security blocker for treating authenticated
match-scoped reads as proven. A forward-only repair migration has been staged
at `supabase/migrations/20260812130000_movie_buff_match_visibility_policy_repair.sql`.
It has not been applied to production; production mutation remains behind the
authorization gate.

## Local quality recheck after round-scoped state repair

Capture: `2026-08-12T19:40:33Z`.

The playback-page repair was rechecked after the earlier status snapshot:

- `npm run lint`: PASS with zero warnings and zero errors;
- `npm run build`: PASS with only the known informational NFT-tracing warning;
- local route health: all `12` routes passed across `5` attempts each, with
  expected unauthenticated admin access gates and no leaked admin payload;
- the local built server was stopped after the check.

The local authenticated smoke set also passed against the rehearsal-backed
environment: sign-in/session persistence, admin library/source/analytics
surfaces, a private one-round flow, a three-player public one-round flow,
single-player leave, public-player leave, and timer/hint/playback progression.
The analytics verifier was not run against an arbitrary Docker database after
the failure fingerprint showed that the available containers belonged to a
different Supabase CLI project; its container lookup now requires the repo
project label and reports that mismatch explicitly.

The acceptance details above were completed in the later `2026-08-12T20:16:43Z`
window; the earlier `19:40:33Z` capture remains the code-quality/policy
snapshot.

## Current live API transient recheck

Capture: `2026-08-12T20:21:15Z`.

The public alias was rechecked after one observed `GET /api/movie-buff/categories`
HTTP `500` at `20:19:01Z` with body `JWT issued at future`. Three immediate
manual retries and a ten-request probe then returned HTTP `200`, each reporting
`50` playable clips. The deployment-scoped runtime log shows that single
`500` and no error/fatal log entry; the subsequent public route-health run
passed all `12` routes across `5` attempts each. This is recorded as a
transient Supabase JWT clock-skew watch item, not treated as a clean zero-error
claim. If it recurs, the production owner should open a Supabase support case
with the UTC timestamp and project ref rather than rotating keys blindly.

## Rehearsal policy repair verification

Capture: `2026-08-12T20:26:36Z`.

The forward-only policy repair was applied to the rehearsal Supabase project
`eiamucxbestinitydkvu` and verified through a fresh `pg_policies` read. The
rehearsal definitions now use `public.is_movie_buff_match_member(match_id)`
for both authenticated match-scoped SELECT policies; the prior
`mine.match_id = mine.match_id` and `mp.match_id = mp.match_id` tautologies are
absent. The rehearsal migration ledger now includes
`movie_buff_match_visibility_policy_repair` at version `20260812202625`.

This validates the repair path on rehearsal only. Production remains
unchanged and still requires explicit authorization before the same migration
can be applied there, followed by authenticated cross-match isolation tests.

The rehearsal acceptance was then exercised with two temporary authenticated
personas and two isolated match rows. Each persona saw exactly its own
`match_players` and `match_rounds` rows and saw no row from the other match;
the temporary users and matches were deleted in cleanup. This proves the
repair behavior on rehearsal, not on production.

The repeatable repository check is now
`MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION=1 npm run
movie-buff:smoke-policy-isolation`; it refuses the known production URL and
cleans up its temporary rehearsal data.

## Current live and candidate recheck

Capture: `2026-08-12T20:36:31Z`.

The public `movie-buff-sigma.vercel.app` alias still resolves to READY
deployment `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw` at commit
`7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`. Its compiled client chunk still
contains the production Supabase ref `yfatwreicmiocdxzyznd` and not the
rehearsal ref. Ten direct category API requests returned HTTP `200` with `50`
playable clips, and the hosted route-health suite passed all `12` routes over
`5` attempts each with expected unauthenticated admin gates. The only
deployment-scoped `5xx` log in the last 30 minutes is the earlier
`20:19:01Z` `JWT issued at future` event; no later 5xx appeared. Keep that
event as a transient clock-skew watch item until a longer clean window exists.

The other READY production candidate, `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`, is
commit `2bc147792f6778a4f1b51186be70dbb606a36409` on the separate
`codex/movie-buff-playback-resync-20260812` branch. It is not an ancestor of
the current main deployment commit and contains only the Windows lock-
contention change, so it is not a valid promotion target for the current
uncommitted Movie Buff candidate.

The repository `.env.production` file is structurally complete, but its
Supabase URL is still the rehearsal ref `eiamucxbestinitydkvu`; therefore its
passing env-shape check is not production-binding proof. `.env.local` also
intentionally omits `NEXT_PUBLIC_APP_URL` for local smoke use. The live bundle
identity, not the local env file, remains the authority for the public alias.

## Local phase-complete replay and current hosted boundary

Capture: `2026-08-13T00:44:40Z`.

The local migration replay is now phase-complete and clean:

- the launch migration gate reports all `35` required migrations present,
  zero UTF-8 BOM files, and no forbidden policy tautologies;
- local replay applies through `20260812211000`, including the phase-machine,
  policy-repair, service-role match-player, match-runtime table-grant, and
  public content-read grant migrations;
- the data-only local seed leaves `36/36` source-backed video rows active and
  board-eligible across all six board bands;
- the bootstrap-artifact gate, `npm run lint`, `npm run build`, and the
  authenticated policy-isolation smoke all pass;
- `npm run movie-buff:verify-analytics` passes from a clean reset across its
  aggregate, rotation, admin-override, lifecycle, runtime-edge,
  match-completion, and public-room tracks;
- after cleanup, the local database has `0` synthetic auth users and `0` game
  rooms.

With a disposable local fixture set containing two categories and six board
bands, the aligned local launch suite passed migration/artifact gates, route
health, auth/session persistence, the three-player public flow, private
match completion, single-player leave/abandonment, public-player
leave/recovery, admin access, timer/hint/playback-clock progression, analytics,
and content-pool health. The one-round smoke cap was explicit for the public
and private flows. These checks prove the current local replay; they are not
hosted-production acceptance evidence.

A fresh read-only hosted reconciliation found:

- production project `yfatwreicmiocdxzyznd` is `ACTIVE_HEALTHY`, but its
  `match_players` and `match_rounds` SELECT policies still contain
  `mine.match_id = mine.match_id` and `mp.match_id = mp.match_id`;
- rehearsal project `eiamucxbestinitydkvu` is `ACTIVE_HEALTHY`, its migration
  ledger includes `movie_buff_match_visibility_policy_repair`, and its
  policies use `is_movie_buff_match_member(match_id)`;
- the current Vercel project latest READY production deployment is
  `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG` at commit
  `2bc147792f6778a4f1b51186be70dbb606a36409`, while the public
  `movie-buff-sigma.vercel.app` response still identifies deployment
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw` at the current main commit;
- the current Vercel runtime-error aggregate still has one historical
  `ENOENT` `media` error for `/api/movie-buff/round-media/[roundId]`, last
  seen at `2026-08-12T17:00:15Z`.

## Fresh read-only hosted reconciliation

Capture: `2026-08-13T00:52:46Z`.

The direct hosted snapshots are unchanged in the material ways:

- production `yfatwreicmiocdxzyznd` still has the tautological
  `mine.match_id = mine.match_id` and `mp.match_id = mp.match_id` predicates;
  its latest migration is `20260812053816`
  (`movie_buff_prod_20260812_32_runtime_playback_acl_repair`);
- rehearsal `eiamucxbestinitydkvu` still has the helper-based
  `is_movie_buff_match_member(match_id)` predicates; its latest migration is
  `20260812202625` (`movie_buff_match_visibility_policy_repair`);
- Vercel's latest READY production deployment is
  `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG` at commit
  `2bc147792f6778a4f1b51186be70dbb606a36409`, but the public
  `movie-buff-sigma.vercel.app` alias remains on
  `dpl_5nac8QihgHPXQHMzTLXhzWP48RFw` at the current main commit; and
- the project runtime-error aggregate still contains only the historical
  `ENOENT` `media` error for `/api/movie-buff/round-media/[roundId]`, last
  seen at `2026-08-12T17:00:15Z`.

The current Supabase security advisors report existing WARN-level hardening
items in both projects, including intended Movie Buff `SECURITY DEFINER` RPCs
callable by authenticated users, policies that allow anonymous access, and
disabled leaked-password protection. Rehearsal also reports insufficient MFA
options. These findings are separate from the repaired cross-match visibility
predicate and are not being silently changed as part of this local-first pass.

## Production policy repair and acceptance

Capture: `2026-08-13T01:03:32Z`.

The reviewed migration `20260812130000_movie_buff_match_visibility_policy_repair.sql`
was applied to production project `yfatwreicmiocdxzyznd`. The production
migration ledger now records it as version `20260813010036`, and a direct
`pg_policies` snapshot shows both match-scoped SELECT policies using
`is_movie_buff_match_member(match_id)` with no `mine.match_id = mine.match_id`
or `mp.match_id = mp.match_id` tautology.

Production isolation acceptance passed in a transaction-scoped SQL harness:
two existing profiles with no prior match-player rows were used as personas,
two fixture matches and rounds were inserted inside a transaction, and each
authenticated persona saw exactly `1` player row and `1` round row, both for
its own match, with `0` cross-match rows. The transaction was rolled back, so
no fixture match or user was left behind. The same acceptance result was
observed independently for persona 1 and persona 2.

The public alias route-health suite was rerun after the repair against
`https://movie-buff-sigma.vercel.app`: all `12` routes passed across `5`
attempts each, with expected unauthenticated admin gates and no application
errors. No Vercel promotion, merge, or secret rotation was performed; the
public alias remains on the existing main deployment because the latest READY
candidate is from a separate branch and the current worktree candidate is
uncommitted. A fresh Vercel runtime-error query over the last hour returned no
runtime errors.

## Current release-candidate deployment attempt — 2026-08-13

The current dirty workspace candidate was prepared for a preview-only Vercel
deployment. A new `.vercelignore` retains the checked-in
`public/media/movie-buff/public-domain` assets because production content still
references 48 of those 50 clip paths, while excluding the 1.34 GB
`runtime-generated` cache and non-deployable workspace directories. The upload
payload was reduced from approximately 1.6 GB to 330 MB.

The preview upload was attempted once after that reduction and failed at
82.5 MB with Vercel CLI `fetch failed` / aborted connection errors. A current
deployment listing shows no new preview deployment; the public alias and its
existing READY deployment are unchanged. No Vercel promotion, merge, or secret
rotation was performed.

## Superseding production cutover — 2026-08-13

The historical sections above describe the pre-cutover state. The current
production state is:

- Vercel production deployment: `dpl_JCwqLbqJhX6EEVgdMFqWeFzz1SJz`
- public alias: `https://movie-buff-sigma.vercel.app`
- deployment state: `READY`
- production Supabase ref: `yfatwreicmiocdxzyznd`
- the compiled client bundle contains the production Supabase URL and no
  rehearsal URL

The per-player playback/answer contract is now live. After a round's shared
tile is locked, each player may start their own clip. A player who does not
start it receives the automatic launch when the launch deadline expires. The
personal answer timer begins from that player's playback start, and a player
who submits early is shown a waiting state until the remaining active players
finish or time out. The server advances the shared phase only after all active
players are finished.

Production migrations applied for this contract are recorded in the remote
ledger as `movie_buff_individual_player_round_flow`,
`movie_buff_individual_player_answer_phase`,
`movie_buff_answer_requires_player_playback`,
`movie_buff_auto_launch_before_completion`,
`movie_buff_playback_launch_deadline_repair`, and
`movie_buff_ignore_preplay_timeout`.

Acceptance evidence:

- local `lint`, production build, launch-migration check, smoke-script syntax
  check, and `git diff --check` passed
- rehearsal mixed manual/automatic three-client smoke passed
- production three-client smoke completed all 10 rounds; round 1 recorded
  three answers and three personal playback rows, including one manual start
  and automatic starts for the other players
- production phase events recorded `playback -> answer` with
  `playersFinished=3` and `playersTotal=3`
- the smoke room and temporary smoke accounts were removed; the room count
  check returned zero
- Vercel reported no runtime errors in the final one-hour check

Remaining operational follow-ups, not blockers for this gameplay contract:

1. The working tree is intentionally dirty and the release is not committed
   or pushed. Commit and push the reviewed changes before relying on a future
   Git-triggered deployment to reproduce this release.
2. Supabase security/performance advisors still report pre-existing policy and
   exposed `SECURITY DEFINER` RPC warnings. They should be reviewed separately
   before a broader security hardening pass; changing them was outside this
   cutover because the live smoke depends on the current RPC contract.

## Superseding exact-commit verification — 2026-08-13

The release is now reproducible from Git. `main` and `origin/main` point to
`699d7b2a1cd57e59e485da46124af2f977d5c6d9`, and the worktree is clean. Vercel
built that exact SHA as READY production deployment
`dpl_2i5rxw6CnTMvZVe9mfhwBsaf6oCt`; the `movie-buff-sigma.vercel.app` alias
resolves to it and its compiled client targets production Supabase
`yfatwreicmiocdxzyznd`.

The exact deployment passed static route health, the production build, lint,
the launch-migration gate, the bootstrap-artifact gate, and smoke-script syntax
checks. A behavioral-suite attempt against the unique deployment URL was
invalidated by Vercel Deployment Protection redirecting the test browser to
`vercel.com/login`. The rerun against the public alias reached the app, but the
local smoke harness was using the ignored `.env.production` rehearsal target
`eiamucxbestinitydkvu`, while the deployed bundle uses production ref
`yfatwreicmiocdxzyznd`; its test sessions therefore could not authenticate to
the deployed project. No application regression is inferred from that invalid
cross-project test.

The prior production three-client, ten-round acceptance remains the valid
behavioral proof for this source state. The current external verification gap
is to run the smoke harness with the production Supabase credentials, not to
change the Movie Buff round-flow code. Recent Vercel error-log review returned
no error-level runtime entries.
