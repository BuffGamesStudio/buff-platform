# Movie Buff production / hosted alignment audit - 2026-08-12

Captured: 2026-08-12 02:05:16 UTC

Repo head:

- `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`

Live Vercel production alias:

- `https://movie-buff-sigma.vercel.app`

Live deployment at capture:

- deployment id: `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`
- state: `READY`
- target: `production`
- branch: `main`
- commit: `7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`

Supabase projects at capture:

- production:
  - ref: `yfatwreicmiocdxzyznd`
  - name: `Movie Buff`
  - status: `ACTIVE_HEALTHY`
  - database version: `17.6.1.147`
- successor rehearsal:
  - ref: `eiamucxbestinitydkvu`
  - name: `movie-buff-successor-rehearsal-20260809`
  - status: `ACTIVE_HEALTHY`
  - database version: `17.6.1.155`

## Current classification

- hosted live alias runtime health: `PASS`
- hosted live alias -> production Supabase alignment: `FAIL`
- production Supabase availability: `PASS`
- production anonymous sign-ins: `ENABLED`
- autonomous production Supabase auth-config mutation from this environment:
  `BLOCKED`
- autonomous Vercel production env mutation from this environment:
  `TECHNICALLY AVAILABLE, NOT AUTHORIZED IN THIS TURN`

## Critical correction

The current live Vercel production alias is not compiled against the production
Supabase project.

Verified evidence:

1. The live alias still resolves to immutable deployment
   `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`.
2. Saved client bundle artifact for that deployment contains a Supabase client
   initialization against the successor rehearsal project URL
   `https://eiamucxbestinitydkvu.supabase.co`.
3. Artifact path:
   `C:\Users\shapa\Documents\Codex\2026-08-09\https-chatgpt-com-share-6a781292-d98c\outputs\movie-buff-chunks\30fqqc84wv0x2.js`

Interpretation:

- current hosted validation against `https://movie-buff-sigma.vercel.app`
  validates the successor rehearsal project `eiamucxbestinitydkvu`
- it does not validate the production Supabase project
  `yfatwreicmiocdxzyznd`
- any note claiming the current live alias already proves production-Supabase
  hardening or cutover is stale for this deployment

## Hosted validation result against the live alias

Earlier in this task, the full hosted preflight suite was rerun against
`https://movie-buff-sigma.vercel.app` and passed:

- route health
- public smoke
- auth smoke
- private smoke
- leave smoke
- shared public leave smoke
- admin smoke
- timer smoke
- pool health

This remains valid for the current capture because the live alias still points
to the same immutable deployment `dpl_6gmp6dUvz9yUDVdg4GfGZY1Svjky`.

## Current runtime-log signal for the live deployment window

Vercel production runtime logs since deployment creation
`2026-08-12T00:26:21.293Z`:

- HTTP `200`: `597`
- HTTP `307`: `14`
- HTTP `416`: `11`
- HTTP `304`: `4`
- HTTP `201`: `3`
- error/fatal logs: none

Interpretation:

- the currently live deployment is operationally healthy
- the absence of current runtime errors is good hosted evidence
- that evidence still belongs to the rehearsal-backed deployment wiring above

## Production Supabase facts that remain true

Direct production `auth.users` read:

- anonymous users: `6`
- permanent users: `306`
- latest anonymous sign-in:
  - `2026-08-01 08:31:35.552536+00`

Current production auth configuration evidence from browser artifacts in this
task:

- the production Auth providers page shows **Allow anonymous sign-ins** with
  `aria-checked="true"`
- the switch is disabled in the current dashboard session
- artifact:
  `C:\Users\shapa\Documents\Codex\2026-08-09\https-chatgpt-com-share-6a781292-d98c\outputs\browser-state\anon-label-info.json`

Management API read attempt from the authenticated browser session:

- `GET /v1/projects/yfatwreicmiocdxzyznd/config/auth`
- result: HTTP `401`
- artifact:
  `C:\Users\shapa\Documents\Codex\2026-08-09\https-chatgpt-com-share-6a781292-d98c\outputs\browser-state\cdp-auth-config-get.json`

Interpretation:

- anonymous sign-ins remain enabled in production
- a safe authenticated Management API write path for production auth config was
  not established from the current tool surface

## Capability inventory relevant to the remaining cutover work

### Vercel

- connected Vercel app exposes read-heavy project, deployment, and runtime-log
  tools
- no direct env-var write tool is exposed through the connected Vercel app in
  this session
- shell path:
  - `vercel` is not on PATH
  - `npx vercel` works
  - `npx vercel whoami` returned `spaynetaxes-debug`
  - `npx vercel env list production --json --project movie-buff --scope shaheed1`
    succeeded

Interpretation:

- a shell-based Vercel production env mutation path likely exists from this
  environment
- no Vercel production mutation was performed in this task

### Supabase

- connected Supabase app exposes project inspection, SQL, logs, keys, and
  branch tools
- no project auth-config write tool is exposed through the connected Supabase
  app in this session
- the browser dashboard shows the relevant auth toggle state, but the controls
  are disabled in the current session
- direct browser-cookie access to `/config/auth` returned `401`

Interpretation:

- no autonomous production Supabase auth-config mutation path is currently
  available from this environment
- no production Supabase mutation was performed in this task

## Exact next dependency

One of these is required before the remaining cutover/hardening work can be
completed truthfully:

1. explicit authorization to mutate Vercel production env vars through the now
   authenticated `npx vercel` CLI path, followed by redeploy and revalidation
2. a working Supabase Management API write path that can
   `PATCH /v1/projects/{ref}/config/auth`
3. a manual production dashboard change by an authorized human, followed by
   direct revalidation from this environment

## Scope limit

This note does **not** claim:

- production Supabase has been cut back into the currently live hosted alias
- production anonymous sign-ins have been disabled
- Vercel production env vars have already been changed in this task
- production hosted state matches the current rehearsal-backed live deployment

## Controlling August 12 authorized-window update

Capture: `2026-08-12T05:46:33Z`.

The authorized production reconciliation has now been applied to project
`yfatwreicmiocdxzyznd` through the Supabase Management API. The final
read-only snapshot and successor manifest verifier report:

- migration ledger: `37` total rows, including `32` uniquely named
  `movie_buff_prod_20260812_*` reconciliation rows
- six protected tables: all present, RLS enabled, FORCE RLS enabled, and one
  manifest policy per table
- content engine: `14/14` expected tables present
- critical functions: `29/29` present; v3 verifier `PASS`
- shared `movie_buff_security` schema: present and passing
- `ensure_rls` event trigger: enabled and passing
- runtime playback ACL repair: `enter_movie_buff_round`,
  `prepare_movie_buff_round_playback`, `start_movie_buff_round_playback`, and
  `advance_movie_buff_round` now allow authenticated execution, deny anon
  execution, and retain service-role execution

The production rollback/reapply proof ran inside one transaction and left no
rollback state persisted. Its catalog digests were:

- before: `0d2e8dd38cda04bcc6aee0f457e74769`
- after rollback containment: `175bcb636289b81c496c49fb38d81d4b`
- after reapply: `0d2e8dd38cda04bcc6aee0f457e74769`
- equality: `true`

Vercel project `movie-buff` was corrected without merging or promoting a PR:

- current production deployment: `dpl_B2dGbKfNwe1mPttXwcyB6CYSyVS2`, READY,
  aliased to `https://movie-buff-sigma.vercel.app`
- production Supabase URL now targets `yfatwreicmiocdxzyznd`
- production Supabase client/server variables use the verified compatible
  production anon/service-role pair for the current `@supabase/supabase-js`
  runtime
- Preview variables now target its existing rehearsal project
  `eiamucxbestinitydkvu` with that project’s compatible pair; Preview was
  rebuilt as `dpl_42NTfXYg45NgwFLGq3SHBVKK29gP`
- protected Preview requests still return Vercel SSO `302`, so authenticated
  Preview smoke is not claimed

Fresh hosted evidence after production redeploy:

- production route health: `12` routes × `5` attempts, all HTTP `200`, with
  no application-error markers or leaked admin payload
- production `/api/movie-buff/categories`: HTTP `200`
- production three-client smoke reached the live waiting room and play route;
  the first attempt exposed the missing playback RPC ACL, which is now fixed;
  the subsequent run reached round-results transition but timed out while the
  three browser clients converged, so full MOV-19 gameplay acceptance remains
  unproven
- the two smoke rooms and six smoke accounts created in this window were
  removed by exact-ID cleanup

Production anonymous sign-ins were not changed in this window. PR #224 was
not modified: it remains draft/unmerged, and no independent current-head
`APPROVED` review exists. MOV-19 therefore remains `NO-GO` until an
authenticated protected Preview run and independent post-run acceptance are
recorded against the exact candidate head.

## Candidate-bound production forward/recovery/equality rerun

Capture: `2026-08-12T06:01:36Z`.

The exact candidate-bound production proof was rerun against project
`yfatwreicmiocdxzyznd` in one outer transaction. The binding was:

- candidate commit: `f53da415629135deb61cea2996fab431804b149e`
- candidate tree: `1209926102ab85abb8fdb4420effaacd2a888b9c`
- forward artifact SHA-256: `c2809a6c1eb625da20a591b4f46418860d652178032b1eda044f96ca461b2de7`
- rollback artifact SHA-256: `cd0bf2a1d8cec89b645cc9b1188beb4be87bf733ad81740eae0f8dae7f1402b9`
- successor v3 verifier SHA-256: `a87f229eff4dcf818256fddaeddce0169d349a2f9291413227df5c800d32cafa`

The proof applied the exact rollback artifact, captured the catalog digest,
reapplied the exact forward artifact, captured the digest again, and rolled
back the outer transaction. Result:

- before digest: `7f474b2246816ac24f07ab89e0ce5581`
- after rollback: `33c5d2bd27d864f338b5e374798b752d`
- after reapply: `7f474b2246816ac24f07ab89e0ce5581`
- `reapply_equals_before`: `true`

No proof state or migration-ledger row persisted from this rerun.

A post-proof read-only snapshot at `2026-08-12T06:06:25Z` confirmed the
production state remained unchanged: `37` ledger rows with `32` authorized
window rows, all six protected tables with RLS and FORCE RLS plus one policy
each, `14/14` content-engine tables, authenticated execution on all four
round-flow playback RPCs, no anonymous execution on those RPCs, the shared
security schema, and the enabled `ensure_rls` event trigger.

At `2026-08-12T06:17:03Z`, the exact candidate Preview deployment
`dpl_9zgCMs9NMZcnTy7Ls5csrR1hHhsc` was independently rechecked as READY at
`https://movie-buff-92sqsz4ag-shaheed1.vercel.app`. Its protected route still
requires Vercel SSO, so no authenticated candidate-hosted proof is claimed.

## Current evidence reconciliation

Capture: `2026-08-12T07:27:42Z`.

The following facts supersede the older historical disposition above:

- Candidate `f53da415629135deb61cea2996fab431804b149e` and tree
  `1209926102ab85abb8fdb4420effaacd2a888b9c` are frozen and clean.
- PR #224 is still Draft/unmerged with a clean merge state, passing Vercel
  checks, and an independent current-head approval by `iecmail01-debug` at
  `2026-08-12T06:55:29Z`.
- The exact candidate Preview is READY and was shown rendering in an
  authenticated Chrome session. This proves protected landing-page access,
  not the complete gameplay flow.
- Production route health and the categories API passed at `2026-08-12T07:12Z`.
- Production project identity is confirmed as `yfatwreicmiocdxzyznd` and
  `ACTIVE_HEALTHY`; no new production SQL was applied.
- The v3 verifier and migration-ledger SELECT remain `UNKNOWN` for this audit
  cycle. Vercel CLI redacted secret values, and the local Supabase CLI requires
  a production-linked IPv4/database credential path. No write path was used.
- The complete hosted three-client flow remains the highest-priority open
  acceptance gate. The automated production attempt was safely skipped because
  only rehearsal Supabase credentials were loaded; no test data was created.

This section is evidence reconciliation only. It does not authorize a new
production migration, Vercel environment change, PR promotion, or merge.

## Production client binding fingerprint

Capture: `2026-08-12T11:10:30Z`.

Read-only inspection of the live production client bundle confirms that the
compiled browser runtime points to
`https://yfatwreicmiocdxzyznd.supabase.co`, the intended Movie Buff production
project. The matching chunk was
`/_next/static/chunks/336-m59nm70c2.js` from deployment
`dpl_B2dGbKfNwe1mPttXwcyB6CYSyVS2`, with SHA-256
`0253ee7e18782fe0526b93f0e8f9e6297ab69baa6d3f9ec332938bdb0a40820c` and size
`232558` bytes.

This is client URL evidence only. It does not disclose the server secret,
prove the Preview target, or replace the missing fresh v3 verifier and
migration-ledger read.

## Controlling Vercel rebind and current hosted read evidence

Capture: `2026-08-12T11:50:04Z`.

Within the authorized window, the Vercel project `shaheed1/movie-buff` was
rebound without changing PR #224 or promoting a candidate. The three sensitive
Production Supabase variables now target production project
`yfatwreicmiocdxzyznd`; the three sensitive Preview variables target the
existing rehearsal project `eiamucxbestinitydkvu`. The corrected production
artifact was redeployed as READY deployment
`dpl_5nac8QihgHPXQHMzTLXhzWP48RFw` and aliased to
`https://movie-buff-sigma.vercel.app`.

The current compiled production client was independently checked: chunk
`/_next/static/chunks/2jpmv089c_ya6.js` from that deployment contains
`https://yfatwreicmiocdxzyznd.supabase.co`, has SHA-256
`1ab29bf37c27503adddc0bc152ad7066d681bb9c203004f72c73c5acd377e93e`, and is
`232396` bytes. No secret value is recorded here.

Post-redeploy route health passed 12 routes over five attempts each, and the
categories API returned HTTP `200`. A service-key Data API inventory captured
at `2026-08-12T11:50:04.725Z` returned HTTP `200` for all 14 expected
content-engine tables. That inventory proves API-visible table existence, not
catalog-level RLS/FORCE RLS, policies/ACLs, function contracts, or migration
ledger state.

The fresh production three-client smoke began at
`2026-08-12T11:43:13.841Z`, joined one common room, and reached live round 2,
but timed out while the clients converged after round 1. Final-results proof
therefore remains absent. Exact smoke-room and account cleanup completed.

The current catalog-level verifier and migration-ledger read remain pending:
the Supabase CLI's linked SQL path still cannot establish the production
IPv4/database connection, and the available browser connector cannot currently
be used from this session. The prior `2026-08-12T06:06:25Z` catalog snapshot is
retained as historical evidence, not a fresh post-rebind read.

## Exact-head acceptance correction

Capture: `2026-08-12T12:03:17Z`.

The earlier `2026-08-12T07:27:42Z` reconciliation wording that called the
`iecmail01-debug` review independent current-head approval is superseded. That
review at `2026-08-12T06:55:29Z` was submitted by the Seat-4
implementation/security writer and is `NOT APPLICABLE` to the sole independent
MOV-19 Watchtower gate, as recorded by the latest exact-head Watchtower
comment at `2026-08-12T09:41:02Z`. Independent post-run acceptance from a
reviewer outside Seats 1-4 remains required.

## Current browser-gate recheck

Capture: `2026-08-12T12:07:39Z`.

The existing Chrome extension/native-host diagnostics remain healthy, but a
fresh connection attempt still fails before browser selection with
`failed to write kernel assets`. The current post-rebind catalog verifier and
migration-ledger read therefore remain missing; the historical `2026-08-12`
catalog snapshot is not reused as fresh proof. No hosted mutation was
performed after the authorization window ended at `2026-08-12T12:00:00Z`.

## Exact-candidate local build and phase-contract recheck

Capture: `2026-08-12T12:18:43Z`.

The frozen candidate checkout remains at commit
`f53da415629135deb61cea2996fab431804b149e` and tree
`1209926102ab85abb8fdb4420effaacd2a888b9c`. With the production Supabase URL
and API keys supplied only in process, `npm run build` completed successfully;
no key material was persisted or recorded. The exact candidate's full local
phase-contract suite passed `171/171` tests. ESLint remains red on existing
React hook/purity rules, and the fresh production catalog read remains
missing; neither result is treated as hosted launch acceptance.

## Vercel binding read-only recheck

Capture: `2026-08-12T12:23:37Z`.

Vercel `env pull` confirmed the three required Supabase variable names are
present in both Production and Preview, but the CLI returned `[SENSITIVE]` for
every value, including the URL. Exact project-value fingerprints therefore
remain unavailable; the production client-bundle URL check remains the only
current binding evidence.

## Isolated local quality remediation

Capture: `2026-08-12T12:34:34Z`.

The frozen exact candidate remains unchanged. A separate worktree based on
candidate `f53da415629135deb61cea2996fab431804b149e` contains local branch
`codex/movie-buff-lint-fixes` commit `1349433`, which clears the existing React
hook/purity lint errors and the unused `roundService.ts` local. The branch
passed `npm run lint -- --max-warnings=0`, the full Movie Buff suite at
`171/171`, and an in-process production-environment webpack build. It has not
been pushed or deployed, so it does not change the hosted or production
disposition and requires a new exact-head proof packet if adopted.

## Fresh read-only production API recheck

Capture: `2026-08-12T12:47:12Z`.

The authenticated Supabase CLI supplied the existing production legacy
service-role API credential only in process. A fresh REST inventory returned
HTTP `200` for all `14/14` expected content-engine tables; no credential was
printed or persisted. This confirms current Data API readability only. It does
not replace the missing catalog-level RLS/FORCE RLS, policies/ACLs,
critical-function, or migration-ledger read. The production database host is
not reachable from this Windows session, so no broader claim is made.

## Current hosted-state recheck and access boundary

Capture: `2026-08-12T12:52:18Z`.

PR `#224` remains open, Draft, unmerged, and `CLEAN` at exact head
`f53da415629135deb61cea2996fab431804b149e`; its two listed Vercel checks are
passing. The production bundle still points at the production Supabase URL.
Exact Preview gameplay and Preview binding remain unproven because browser
control fails before tab selection.

One linked Supabase CLI retry at `2026-08-12T12:46:17Z` reached the platform's
temporary read-only login-role handshake but did not complete SQL. No schema,
data, policy, ACL, deployment, or application write was performed. Since the
handshake is a production control-plane operation, additional linked-query or
production/Vercel operations are paused pending a new authorization window.

## Local production-like proof boundary

Capture: `2026-08-12T13:04:15Z`.

The exact candidate's disposable localhost browser harness reached exact-build
identity and authenticated all three players, but public matchmaking returned
two room IDs and all three pages remained in the waiting-room loading state.
This result is not used as production evidence. A fresh local Supabase reset
also fails at the production-baseline reconciliation migration because the
helper function `public.is_movie_buff_room_member(uuid)` already exists from an
earlier migration; the later atomic three-player migration is consequently not
applied. The local proof environment is therefore independently blocked by a
non-reproducible migration chain, while the production catalog read remains
blocked by the expired access/browser gate described above.

## Current live-binding recheck

Capture: `2026-08-12T19:07:10Z`.

This section supersedes the earlier same-day statements in this file that
classified the live public alias as rehearsal-backed.

- latest Vercel production-target deployment:
  - `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`
  - created: `2026-08-12T17:20:17.378Z`
  - state: `READY`
  - target: `production`
  - commit: `2bc147792f6778a4f1b51186be70dbb606a36409`
- live alias checked:
  - `https://movie-buff-sigma.vercel.app`
- current live HTML fetch returned `11` unique JS assets
- current live bundle evidence:
  - chunk:
    `C:\Users\shapa\Documents\Codex\2026-08-09\https-chatgpt-com-share-6a781292-d98c\outputs\live-chunks\2jpmv089c_ya6.js`
  - SHA-256:
    `1ab29bf37c27503adddc0bc152ad7066d681bb9c203004f72c73c5acd377e93e`
  - contains production Supabase URL:
    `https://yfatwreicmiocdxzyznd.supabase.co`
  - does not contain rehearsal ref:
    `eiamucxbestinitydkvu`

Interpretation:

- the current public client served by `movie-buff-sigma.vercel.app` is now
  production-backed, not rehearsal-backed
- this is consistent with the newer production-target Vercel deployment above
- the earlier rehearsal-backed bundle artifact in this file remains historical
  evidence only

Current runtime signal for the newest production-target deployment:

- Vercel runtime logs for deployment `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`
  between `2026-08-12T17:06:57Z` and `2026-08-12T19:06:16Z` show:
  - HTTP `200`: `7`
  - error/fatal logs: none

Boundary that still remains:

- the current public client binding is `PASS`
- a fresh current-session read of the live server-side secret value remains
  `UNKNOWN`
- local repo env files are still rehearsal-backed:
  - `.env.local` -> `https://eiamucxbestinitydkvu.supabase.co`
  - `.env.production` -> `https://eiamucxbestinitydkvu.supabase.co`

Exact next dependency:

- if local repo env parity matters for further localhost or script-based
  validation, replace the local rehearsal-backed Supabase URL/key set with the
  current production values using an authorized production secret source, then
  rerun the admin-dependent hosted smoke path

## Current production catalog recheck

Capture: `2026-08-12T19:07:10Z`.

Direct read-only SQL against production project `yfatwreicmiocdxzyznd` now
confirms:

- migration ledger rows:
  - `37`
- auth users:
  - total: `312`
  - anonymous: `6`
  - permanent: `306`
- expected content-engine tables:
  - `14/14` present
- shared security helpers:
  - `movie_buff_security` schema: present
  - `ensure_rls` event trigger: present

Current table-security read is mixed, not unknown.

Tables showing `relrowsecurity=true`, `relforcerowsecurity=true`, and one
policy each include:

- `movie_buff_boards`
- `movie_buff_board_tiles`
- `movie_buff_board_categories`
- `movie_buff_board_events`
- `movie_buff_match_participant_seats`
- `movie_buff_match_phase_actions`
- `movie_buff_match_phase_events`
- `movie_buff_match_phase_state`

Tables still showing `relforcerowsecurity=false` in the current read include:

- `game_rooms`
- `match_players`
- `match_rounds`
- `movie_buff_round_events`
- `movie_buff_clip_analytics`
- `movie_buff_movie_analytics`

Current function-grant read for key gameplay RPCs:

- authenticated + service-role execute present:
  - `enter_movie_buff_round`
  - `prepare_movie_buff_round_playback`
  - `start_movie_buff_round_playback`
  - `advance_movie_buff_round`
  - `join_movie_buff_room`
  - `find_or_create_movie_buff_public_room`
- service-role only:
  - `pick_movie_buff_clip`
  - `start_movie_buff_match`

Reconciled classification after this read:

- current public client binding: `PASS`
- current production catalog read: `PARTIAL / MIXED`
- current live server-side secret binding: `UNKNOWN`

## Current deployment and production-data correction

Capture: `2026-08-12T19:25:59Z`.

The public `movie-buff-sigma.vercel.app` alias currently resolves to
`dpl_5nac8QihgHPXQHMzTLXhzWP48RFw` (commit
`7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`). The newer READY production-target
deployment `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG` (commit
`2bc147792f6778a4f1b51186be70dbb606a36409`) has different aliases and is not
the `sigma` deployment. This distinction matters for exact-candidate
acceptance: the public alias is production-bound, but it is not current proof
that the newer candidate is publicly promoted.

Fresh read-only production counts are:

- `50` movies and `50` clips;
- `50` content items, `50` content media rows, and `50` content answers;
- `8` categories and `8` content types;
- `6` content sources and `0` content source items;
- `0` challenge sets and `0` challenge-set items;
- `1,569` round events and `0` clip/movie analytics aggregate rows;
- `37` migration-ledger rows and `312` profiles/auth users.

The expected content-engine schema is therefore present and seeded for the
legacy playable pool, but the zero challenge-set/source-item/analytics rows
are material catalog facts. They prevent treating a broad production-content
or analytics-readiness claim as fully proven. Current RLS, FORCE-RLS, policy,
and function-grant observations remain the mixed posture recorded above.

The public API also independently returned `200` for
`/api/movie-buff/categories` and reported `50` playable clips. The four
unauthenticated admin API probes returned `401` with the expected access-gate
message. These are useful runtime checks, but they do not replace
authenticated MOV-19 acceptance or a fresh server-secret binding proof.

## Current match-visibility policy finding

Capture: `2026-08-12T19:40:33Z`.

The current production `pg_policies` definitions for the authenticated
SELECT policies named `Players view match participants` and `Players view
match rounds` contain the uncorrelated predicates `mine.match_id =
mine.match_id` and `mp.match_id = mp.match_id`, respectively. The production
`public.is_movie_buff_match_member(uuid)` helper itself is present and checks
the requested match against the signed-in user's membership, but the two
policies do not invoke it. This is a confirmed policy-correctness/security
blocker for authenticated match-scoped read acceptance.

The repository now contains the forward repair migration
`20260812130000_movie_buff_match_visibility_policy_repair.sql`, which drops and
recreates both policies using the membership helper. It is staged only; no
production DDL or migration was executed in this pass.

## Local quality recheck after round-scoped state repair

Capture: `2026-08-12T19:40:33Z`.

The repository recheck now reports `npm run lint` PASS with zero warnings and
zero errors, `npm run build` PASS with only the known informational
NFT-tracing warning, and local route health PASS for all `12` routes across
`5` attempts each. The local built server was stopped after validation.

The production security-advisor read returned `55` warnings: `29`
authenticated-callable `SECURITY DEFINER` functions, `25` anonymous-access
policy findings, and leaked-password protection disabled. These remain an
advisory/security backlog and were not changed in this pass.

The local acceptance and verifier-repair checks were completed in the later
`2026-08-12T20:16:43Z` window; the earlier `19:40:33Z` capture remains the
code-quality/policy snapshot.

## Current live API transient recheck

Capture: `2026-08-12T20:21:15Z`.

The public `sigma` alias recorded one `GET /api/movie-buff/categories` HTTP
`500` at `20:19:01Z` with `JWT issued at future`, followed by three successful
retries and a ten-request probe with `10/10` HTTP `200` responses and `50`
playable clips. This is consistent with a transient Supabase JWT time-skew
condition; the event is retained as a watch item. No key rotation or
production mutation was performed.

## Rehearsal policy repair verification

Capture: `2026-08-12T20:26:36Z`.

The staged policy repair was applied to rehearsal project
`eiamucxbestinitydkvu` only. A fresh `pg_policies` read confirms that both
authenticated match-scoped SELECT policies now call
`public.is_movie_buff_match_member(match_id)` and no longer contain the
uncorrelated self-comparisons found in production. The rehearsal migration
ledger records version `20260812202625` as
`movie_buff_match_visibility_policy_repair`.

This is a rehearsal validation result, not production proof. Production still
has the original policy definitions and requires ARM before migration and
authenticated cross-match isolation validation.

The rehearsal acceptance was then exercised with two temporary authenticated
personas and two isolated match rows. Each persona saw exactly its own
`match_players` and `match_rounds` rows and no row from the other match; the
temporary users and matches were deleted during cleanup. Production has not
been changed.

The repeatable repository check is
`MOVIE_BUFF_POLICY_ISOLATION_ALLOW_MUTATION=1 npm run
movie-buff:smoke-policy-isolation`; it refuses the known production URL and
cleans up temporary rehearsal data after each run.

## Current live and candidate recheck

Capture: `2026-08-12T20:36:31Z`.

The public sigma alias remains on READY deployment
`dpl_5nac8QihgHPXQHMzTLXhzWP48RFw`, commit
`7dc51935aefd3caf507c31bd6a5eb09a3bb3ae13`, with the compiled client bound to
production Supabase ref `yfatwreicmiocdxzyznd`. Ten category API probes were
HTTP `200` with `50` playable clips, and hosted route health passed all `12`
routes across `5` attempts. The deployment's only recent 5xx remains the
earlier `JWT issued at future` event at `20:19:01Z`; no later 5xx was present.

The other READY deployment, `dpl_897AsNVqhqttCjPZQtkoWrQ6P6fG`, is from the
separate playback-resync branch at commit
`2bc147792f6778a4f1b51186be70dbb606a36409`; it is not descended from the
current main deployment and is not the current Movie Buff release candidate.

The checked-in `.env.production` has all required variable names and values,
but still points to rehearsal ref `eiamucxbestinitydkvu`; it must not be used
as proof that Vercel's server-side production secret binding is correct.

## Production repair and current acceptance correction

Capture: `2026-08-13T01:03:32Z`.

The earlier statement that the policy repair was staged only is superseded.
The reviewed migration
`20260812130000_movie_buff_match_visibility_policy_repair.sql` was applied to
production project `yfatwreicmiocdxzyznd`; the remote ledger records
`20260813010036 movie_buff_match_visibility_policy_repair`.

A fresh production policy snapshot now shows:

- `Players view match participants` uses
  `player_id = (select auth.uid()) or is_movie_buff_match_member(match_id)`;
- `Players view match rounds` uses
  `is_movie_buff_match_member(match_id)`; and
- neither policy contains the former `mine.match_id = mine.match_id` or
  `mp.match_id = mp.match_id` tautology.

The production isolation acceptance passed in a transaction-scoped SQL
harness for two profiles with no prior match-player rows. Each persona saw
exactly one own `match_players` row and one own `match_rounds` row, with zero
cross-match rows; the transaction was rolled back and left no fixtures.
The public alias route-health suite then passed all `12` routes across `5`
attempts, and the Vercel runtime-error query for the last hour returned no
errors. The public alias remains on the existing main deployment; no Vercel
promotion was performed because the newer READY deployment is from a separate
branch and the current workspace candidate is uncommitted.

## Superseding source and advisor recheck — 2026-08-13

The gameplay source candidate is committed as
`699d7b2a1cd57e59e485da46124af2f977d5c6d9`, with the follow-up documentation
pushed separately. Vercel deployment `dpl_2i5rxw6CnTMvZVe9mfhwBsaf6oCt` is
READY on the public production alias.
Its compiled client targets `yfatwreicmiocdxzyznd`.

The production migration ledger now includes the policy repair plus the six
per-player playback/answer migrations. A fresh policy read confirms the
membership predicates remain repaired. The fresh advisor read reports 57
security notices (1 anonymous SECURITY DEFINER execution warning, 30
authenticated SECURITY DEFINER execution warnings, 25 anonymous-access policy
notices, and leaked-password protection disabled) and 108 performance notices
(50 unindexed foreign keys, 11 auth RLS init-plan notices, 26 unused-index
notices, 20 multiple-permissive-policy notices, and one absolute Auth
connection-allocation notice). These are intentionally unchanged and remain a
separate hardening review.

The ignored local `.env.production` is rehearsal-bound to
`eiamucxbestinitydkvu`; it must not be used as production secret-binding proof
or as the credential source for a production smoke run. The exact-commit
behavioral rerun was stopped by that target mismatch after static checks passed.
