# Movie Buff independent validation matrix v1

Date: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA reviewed: `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Hosted Supabase project observed read-only: `yfatwreicmiocdxzyznd`  
Release classification: **NO-GO**

`PASS` is deliberately narrow. Repository-static evidence may prove a directly present defect or precise source invariant. It may not prove runtime behavior, race safety, synchronization, hosted state, accessibility, or rollback execution.

## Exact lane relay

| Lane | Exact state reviewed | Classification | Relay state | Next safe action |
|---|---|---|---|---|
| MOV-15 | PR #9, `cf95ade4f050a70f73077561ea95fbb0c0d82b6a` | exact-SHA build PASS; strict-three/evidence source repaired; database/race/rollback UNKNOWN | `WAITING_FOR_LOCAL_EVIDENCE` | execute migration, pgTAP, contract tests, fresh races, lock contention, browser, and containment locally |
| MOV-16 | PR #6, `95c292ead66fc83cf13d7154bd3cf691610f549d` | exact-SHA build PASS; finalizer/source contract present; SQL/persona/concurrency UNKNOWN | `WAITING_FOR_LOCAL_EVIDENCE` | execute ordered migrations, pgTAP, persona/adversarial/finalizer proof, rollback, and combined MOV-17 handshake |
| MOV-17 | PR #10, `e40f639c761b6f1e61e36b0c807c9beafad7349c` | exact-SHA build PASS; phase/Buster/evidence source repaired; synchronized runtime UNKNOWN | `WAITING_FOR_LOCAL_EVIDENCE` | execute SQL/pgTAP/Node and exact-SHA three-client wrapper on combined MOV-16/MOV-17 checkout |
| MOV-18 | PR #8, `6bd23661743d82914ea9c922221883a83be84582` | exact-SHA Actions dependency/tests/TypeScript/build/artifact PASS; rendered runtime/accessibility UNKNOWN | `READY_FOR_REVIEW` | supply production assets/names and browser/reduced-motion/accessibility/rollback evidence |
| MOV-19 | PR #7, pre-refresh `8b81c7c2a57aa720de9516349171e8af8aa356a6` | hosted security FAIL; current lane reviews recorded; integrated execution UNKNOWN | `AGENT_WORKING` | maintain NO-GO, validate each new SHA/evidence bundle, then inspect one reconciled integration SHA |

GitHub records the final MOV-19 head after this document refresh. It supersedes the pre-refresh validator SHA without changing the lane scope.

## MOV-15 — public matchmaking

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Server-owned public size exactly three | PASS — source invariant | immutable helper returns 3; caller `p_max_players` does not set capacity |
| Canonical compatibility key | PASS — source invariant | category/null, lower-trimmed difficulty, round count, and server size are persisted |
| Duplicate waiting-room boundary | PASS — source invariant | partial unique index covers public waiting rooms by compatibility key |
| Admission serialization | PASS — source invariant | per-player and compatibility advisory transaction locks; ordinary `FOR UPDATE`; no `SKIP LOCKED` |
| Known two-player/350 ms browser start removed | PASS — source invariant | public browser marks ready and observes server start only |
| Waiting-room TypeScript/build | PASS — exact Vercel SHA | `dpl_8MgC3s81XUiYEXpUDmQZWyU7dniT`; compile, TypeScript, page generation, READY |
| Evidence SHA binding | PASS — source invariant | wrapper checks checkout HEAD, propagates one exact SHA to child, and records both values |
| Three simultaneous players converge | UNKNOWN | no executed exact-SHA race artifact |
| Repeated fresh races and late-third behavior | UNKNOWN | scenario code exists; no execution output |
| External row-lock contention | UNKNOWN | helper and scenario exist; not executed |
| Full waiting cohort rejects a fourth caller | PASS — documented source behavior | explicit failure while the three-player waiting room remains intact; runtime UNKNOWN |
| Hosted post-fix behavior | UNKNOWN | migration absent from hosted ledger |
| Containment/rollback | PASS — source design / UNKNOWN execution | guarded non-destructive containment preserves data and service-role continuity; not rehearsed |
| MOV-17 start compatibility | UNKNOWN | no integrated SQL/function-order execution |

## MOV-16 — private VIP authority

| Requirement | Classification | Evidence / reason |
|---|---|---|
| No invented definitions or ownership | PASS — source invariant | no definition/inventory seed data |
| Bearer-derived caller identity | PASS — source invariant | verified bearer identity; no caller player ID authority |
| Private table grants and fixed search path | PASS — source invariant | browser-private tables; definer functions declare `pg_catalog` |
| Concurrent first window/lock/activation source serialization | PASS — source invariant | round/player advisory locks and replay checks present |
| Immutable required-human identity snapshot | PASS — source invariant | exact deduplicated identities persisted; count overload fails closed |
| Participant release semantics | PASS — source invariant | same-reason replay, contradictory-reason rejection, released-player exclusion |
| Canonical phase navigation | PASS — source invariant | VIP readiness chooses no route; MOV-17 view/phase-route binding controls navigation |
| MOV-17 finalizer signature | PASS — source invariant | `finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)` exists |
| Deadline no-VIP passes | PASS — source invariant | deterministic null-VIP/null-inventory locks for missing unreleased humans after exact deadline |
| Finalizer direct authority | PASS — source invariant | postgres owner, definer, `pg_catalog`, service-role-only direct grant |
| Exact-SHA production build | PASS — Vercel narrow | `dpl_DRaxAj1Eta65Ty9RGjxkousPug2Q`; compile, TypeScript, all pages, READY |
| Ownership/privacy/deadline/reconnect/exactly-once personas | UNKNOWN | harnesses committed; no executed database artifact |
| Finalizer concurrency/idempotency | UNKNOWN | source/harness present; not executed |
| Hosted behavior | UNKNOWN | migrations absent from hosted ledger |
| Main rollback | FAIL for durable-data removal without explicit disposable authority | guarded but destructive after VIP data exists |
| Ordered finalizer/release rollback | PASS — source design / UNKNOWN execution | function-only or immediately preceding behavior restored; no durable data deletion; not rehearsed |

## MOV-17 — server-owned phase machine

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Canonical phase/version/timestamp state | PASS — source invariant | durable tables/RPCs and route mapping are present in lane migrations/source |
| Authenticated member-bound routes | PASS — source invariant | bearer/member policy exists for view/select/advance surfaces |
| Atomic selector/tile/clip transition | PASS — source invariant | version/idempotency guarded mutation path present; execution UNKNOWN |
| Shared playback/answer/results timestamps | PASS — source invariant | one phase state owns shared timestamps; execution UNKNOWN |
| MOV-16 finalization guard | PASS — source invariant | `vip_lock -> board_select` fails closed unless finalizer exists and returns ready |
| Human/Buster/system classification | PASS — source invariant | seats permit only human/Buster; system is non-seat |
| Grace-expiry staging | PASS — corrected source invariant | abandoned seat remains original-human controlled until safe-boundary replacement |
| Safe-boundary Buster activation | PASS — source invariant | only allowed phases and expired replacement delay permit controller switch |
| Canonical page navigation | PASS — source invariant | routes and layout consumers follow authoritative phase view |
| Exact-SHA production build | PASS — Vercel narrow | `dpl_GekqaYCKWYFS77QH2Mw6Gh5VrDvF`; compile, TypeScript, all pages, READY |
| Three-client evidence integrity | PASS — source invariant | wrapper binds local targets/SHA/command/hashes/exit and restores profiles |
| Three-client synchronized journey | UNKNOWN | wrapper/child unexecuted |
| Reconnect/Buster/no-human execution | UNKNOWN | no database/browser artifact |
| SQL/pgTAP/Node | UNKNOWN | no Actions or local output |
| Safe-boundary correction rollback | PASS — source design / UNKNOWN execution | self-contained restoration of prior view and correction removal; not rehearsed |
| Main phase rollback | guarded/designed; UNKNOWN execution | durable state implications require authorized rehearsal |
| MOV-15 strict-three compatibility | UNKNOWN | no reconciled integrated SQL order/execution |

## MOV-18 — visual runtime

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Motion cannot mutate gameplay | PASS — source invariant | visual boundary exposes no authoritative mutation callback |
| Exact dependency pair | PASS — Actions | React WebGL2 4.30.0 / WebGL2 2.39.1 registry-validated |
| Minimal lock boundary | PASS — Actions | stripped committed lock deep-equals integration lock |
| Focused authority/fallback tests | PASS — Actions | 13/13 in run `30923902972` |
| TypeScript | PASS — Actions | `tsc --noEmit` completed |
| Production build and preview route | PASS — Actions | Next build completed, 14/14 pages including preview |
| Evidence artifact | PASS — Actions | artifact `8898290290`, digest `sha256:4bca98b5ca8b9868f7bb0d19769f0d33dc86b160a81bc712aea2b87e5a0e5b28` |
| Package/lock mutation during final step | PASS — no-op | workflow reported already synchronized and made no commit |
| Missing URL/non-OK HTTP fallback | PASS — source/test scope | static surface selected |
| Renderer-error and reduced-motion fallback | PASS — source/test scope | passive canvas reports load failure; surface selects static presentation |
| Actual production `.riv` asset initialization | UNKNOWN | assets and verified artboard/state-machine names absent |
| WebGL context loss/malformed asset browser behavior | UNKNOWN | no rendered browser execution |
| Reduced-motion hydration/responsive behavior | UNKNOWN | no browser artifact |
| Dialog keyboard/focus/screen-reader behavior | UNKNOWN | no browser/accessibility proof |
| Reconnect and final journey composition | UNKNOWN | not integrated with final MOV-17 runtime |
| Rollback | DESIGNED / UNKNOWN execution | isolated units documented; no rehearsal |

## MOV-19 — security and evidence integrity

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Six-table hosted RLS | FAIL | all six inspected tables have RLS disabled and no policies |
| Six-table hosted grants | FAIL | anon and authenticated effective CRUD on all six |
| Critical anonymous RPC EXECUTE | FAIL | broad anonymous execution remains |
| Fixed definer search paths | FAIL | most critical hosted functions use `search_path=public` |
| Hardened `join_movie_buff_room(text)` | PASS — hosted narrow | owner `postgres`, definer, `pg_catalog`, anon denied, authenticated/service role retained |
| Service-role table continuity | PASS — hosted narrow | service role retains CRUD on six inspected tables |
| Hosted migration ledger observation | PASS — observation only | only `20260803233057` and `20260803235116` are hosted |
| Static evidence proof scopes | PASS — source invariant | static evidence cannot classify behavior/hosted state PASS |
| pgTAP plan integrity | PASS — source invariant | plan declares 111 assertions |
| Current functional SHA reviews | PASS — review process | PR comments and Linear records identify current SHAs/evidence limits |
| MOV-19 executable suite | UNKNOWN | no Actions or operator-supplied local output |
| Hosted post-remediation proof | UNKNOWN | no authorized apply occurred |
| Integrated launch proof | UNKNOWN | no reconciled integration SHA exists |

## Hosted database snapshot

Target: `yfatwreicmiocdxzyznd` (`Movie Buff`, `us-east-1`, PostgreSQL `17.6.1.147`).

Ledger:

- `20260803233057 remote_schema`
- `20260803235116 movie_buff_join_room_rpc_hardening`

All six target tables—`match_round_player_hints`, `match_round_player_playback`, `movie_buff_boards`, `movie_buff_board_categories`, `movie_buff_board_tiles`, and `movie_buff_board_events`—were observed with RLS disabled, zero policies, and effective anon/authenticated/service-role CRUD.

Selected RPC definition hashes:

| Function | search path | anon EXECUTE | MD5 |
|---|---|---:|---|
| `find_or_create_movie_buff_public_room(uuid,text,integer,integer)` | `public` | yes | `a4cd7a68ba49fa26cef4cf11e4694946` |
| `advance_movie_buff_round(uuid)` | `public` | yes | `1ae2fbd8f8c3455f83ad688ebef8e720` |
| `mark_movie_buff_round_media_ready(uuid)` | `public` | yes | `80117f90917b228be82b59b0b06e6ee0` |
| `start_movie_buff_match(uuid)` | `public` | yes | `e3e6f72bbb45101a2e1f44c32811ed52` |
| `start_movie_buff_round_playback(uuid)` | `public` | yes | `54869671c8c2957ba62ab63aa987036f` |
| `submit_movie_buff_answer(uuid,text)` | `public` | yes | `4231afa86b3d9ff1bea8f6e80ecb70f9` |
| `join_movie_buff_room(text)` | `pg_catalog` | no | `b1be09c91c8a9ff3f3ed877cacf18ffc` |

## Required integrated validation

Unexecuted until accompanied by exact output:

```bash
node --test tests/movie-buff-independent-security-validation.test.mjs
MOVIE_BUFF_EVIDENCE_JSON=<bundle.json> node --test tests/movie-buff-release-evidence-integrity.test.mjs
node scripts/movie-buff-security-evidence.mjs
supabase test db supabase/tests/movie_buff_security_validation_test.sql
npm run lint
npx tsc --noEmit
npm run build
git diff --check
git rev-parse HEAD
git status --short
```

Lane behavioral wrappers must target localhost/loopback, use disposable authenticated identities and a local service-role key, require explicit targeted mutation/deletion consent, bind exact checkout SHA and command, capture exit status and raw artifacts, and restore any reversible identity fixture changes.

## Remaining UNKNOWN

- MOV-15 database/race/lock-contention/containment behavior;
- MOV-16 database persona/concurrency/finalizer/exact-once behavior;
- MOV-17 synchronized journey/reconnect/Buster/no-human behavior;
- MOV-18 rendered production asset/accessibility behavior;
- one exact integrated SHA containing reconciled PR #3, PR #5, and all lanes;
- staging/production application SHA and post-remediation database state;
- rollback/containment rehearsal after durable writes.

No UNKNOWN becomes PASS without exact command, exit status, SHA, target identity, timestamps, and raw artifacts.
