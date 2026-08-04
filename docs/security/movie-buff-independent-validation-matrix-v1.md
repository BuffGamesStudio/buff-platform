# Movie Buff independent validation matrix v1

Date: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA reviewed: `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Hosted Supabase project observed read-only: `yfatwreicmiocdxzyznd`  
Release classification: **NO-GO**

`PASS` is deliberately narrow. Repository-static evidence may prove a directly present defect or a precise source invariant. It may not prove runtime behavior, race safety, synchronization, hosted state, accessibility, or rollback execution.

## Exact lane relay

| Lane | Exact state reviewed | Classification | Relay state | Next safe action |
|---|---|---|---|---|
| MOV-15 | PR #9, `ce1f49bef7bf4f911e1949ef5fd626c0f92132dd` | strict-three source invariants present; runtime and rollback UNKNOWN | `WAITING_FOR_LOCAL_EVIDENCE` | harden evidence harness, execute fresh races/negative cases locally, reconcile start RPC with MOV-17 |
| MOV-16 | PR #6, `3683c1ec2b70b8fabc85d70b77242e794b505c7e` | confirmed concurrency/participant/phase/rollback defects | `CHANGES_REQUESTED` | repair owning-lane defects and return database/persona evidence |
| MOV-17 | PR #10, `9b8a46aad207cd7ecc7aa99d99cf3580fd4ac73f` | useful contract only; runtime state/routes/RPCs absent | `AGENT_WORKING` | implement state model, authorization, atomic transitions, rollback, and three-client proof |
| MOV-18 | PR #8, `900e9877d11b1ecd18ed6b4d847437af48b9b49b` | exact-SHA Vercel build PASS; runtime/accessibility blockers remain | `CHANGES_REQUESTED` | connect actual Rive failure channel, complete modal behavior, provide rendered/browser evidence |
| MOV-19 | PR #7; validation-tool head before this document refresh `3a1fe747587b52245a53cc9216321115f3d18523` | hosted security FAIL; validator source corrected; executable suite UNKNOWN | `WAITING_FOR_LOCAL_EVIDENCE` | independently execute validators against exact integrated SHA/target and re-probe staging/hosted state |

The final MOV-19 PR head after documentation commits is recorded in PR #7 and Linear MOV-19; it supersedes the pre-refresh validator SHA above without changing the eight-file claim.

## MOV-15 — public matchmaking

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Server-owned public size exactly three | PASS — source invariant | immutable helper returns 3; caller `p_max_players` does not set capacity |
| Canonical compatibility key | PASS — source invariant | category/null, lower-trimmed difficulty, round count, and server size are persisted |
| Duplicate waiting-room boundary | PASS — source invariant | partial unique index covers public waiting rooms by key |
| Admission serialization | PASS — source invariant | per-player and compatibility advisory transaction locks; no `SKIP LOCKED` |
| Known two-player/350 ms browser start removed | PASS — source invariant | public browser only marks ready and observes server start |
| Three simultaneous players converge | UNKNOWN | no executed exact-SHA race artifact |
| Repeated fresh races | UNKNOWN | lane harness is unexecuted |
| Late third / duplicate / incompatible / stale / full behavior | UNKNOWN | scenario code exists; no execution output |
| Lock-contention regression | UNKNOWN | external candidate-row lock case is not implemented/executed |
| Evidence integrity | FAIL — source defect | lane harness can label PASS without exact Git SHA, command, exit code, or immutable artifact hashes; deletion lacks separate consent/failure cleanup |
| Full-room cohort policy | NEEDS PRODUCT RECORD | a fourth same-settings caller is rejected while the first three remain waiting; intended queue/cohort policy must be explicit |
| Hosted post-fix behavior | UNKNOWN | migration absent from hosted ledger |
| Rollback | FAIL for completeness / UNKNOWN execution | no rollback SQL or tested containment evidence |

Coordination: MOV-15 redefines `start_movie_buff_match(uuid)`. MOV-17 must preserve only the strict-three admission predicate while replacing legacy phase effects.

## MOV-16 — private VIP authority

| Requirement | Classification | Evidence / reason |
|---|---|---|
| No invented definitions or ownership | PASS — source invariant | no definition/inventory seed data |
| Bearer-derived caller identity | PASS — source invariant | verified bearer identity; no caller player ID authority |
| Private table grants and fixed search path | PASS — source invariant | browser-private tables; definer functions declare `pg_catalog` |
| Concurrent first window open | FAIL — static defect | check-then-insert can expose unique violation rather than one authoritative replay |
| Concurrent identical lock | FAIL — static defect | same first-lock race exists |
| Immutable required-human snapshot | FAIL — static defect | count only, not authoritative human identities/system/Buster classification |
| Canonical phase handoff | FAIL — static defect | Round Intro can navigate from VIP readiness instead of MOV-17 phase |
| Contradictory activation replay | FAIL — static defect | supplied activation key is not fully bound to persisted consumption replay |
| Ownership/privacy/deadline/reconnect/exactly-once personas | UNKNOWN | structural/pure tests only; no executed database personas |
| Hosted behavior | UNKNOWN | migration absent from hosted ledger |
| Post-write rollback | FAIL | rollback drops entitlement and audit history |

## MOV-17 — server-owned phase machine

PR #10 is an authoritative contract and typed client boundary, not a functional phase machine.

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Canonical phase/version/timestamp contract | PASS — source contract only | phases, routes, versions, shared timing, blocked/terminal states are explicit |
| Human/Buster/system classification contract | PASS — source contract only | authority, reconnect, leave, penalties, and no-human closure are specified |
| Authenticated match view/advance routes | FAIL / absent | client calls `/api/movie-buff/match/view` and `/advance`; routes do not exist |
| Durable phase/participant/leave state | FAIL / absent | no migration or tables |
| Atomic selector/tile/clip transition | FAIL / absent | no transactional RPC/version/affected-row implementation |
| Shared playback timestamp | FAIL on current integration; absent in lane | current hosted/base model is per player |
| No manual controls / canonical page navigation | FAIL on integration | shared pages are not rewired |
| Reconnect grace/Buster/no-human execution | UNKNOWN | contract only; no worker/RPC behavior |
| Three-client agreement | UNKNOWN | no journey harness or output |
| Contract test portability | UNKNOWN | direct TypeScript import with repository aliases has not run |
| Rollback | UNKNOWN | no rollback SQL or containment rehearsal |

PR #5 must be reconciled deliberately: its bearer/member helpers are useful, but its resolve route still returns HTTP 200 `boardUnavailable` on real-room schema/content failure.

## MOV-18 — visual runtime

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Motion cannot mutate gameplay | PASS — source invariant | visual boundary exposes no authoritative mutation callback |
| Exact-SHA production build | PASS — Vercel narrow | deployment `dpl_3gWEhvPNo8wnpjo2VHESqGYFtp62` READY for `900e9877…`; compile, TypeScript, static generation, route manifest completed |
| Build cleanliness | WARN | Turbopack NFT trace warning through generated-media route; outside MOV-18 files but retained as integration evidence |
| Missing URL/non-OK HTTP fallback | PASS — source invariant | HEAD failure selects static surface |
| Malformed/parse/init failure fallback | FAIL — static design gap | HEAD 200 cannot prove valid `.riv` parsing or runtime initialization; actual adapter failure channel absent |
| Actual Rive runtime/package integration | UNKNOWN / absent | selected package documented; manifest/lock and production adapter/assets absent |
| Reduced-motion browser behavior | UNKNOWN | state begins false until effect; no hydration/browser proof |
| Reconnect skips expired transition | PASS — source invariant | derivation does not replay expired transition as participation gate |
| Dialog accessibility | FAIL — static defect | no initial focus, Escape handling, focus containment/background inert, or focus restoration |
| Responsive/rendered preview | UNKNOWN | protected route remained behind Vercel SSO; no authenticated rendered-page inspection |
| Authoritative leave quote/penalty | UNKNOWN | presentation prop exists; MOV-17 server quote does not |

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
| pgTAP plan integrity | PASS — source invariant | plan corrected to 111 assertions |
| MOV-19 executable suite | UNKNOWN | no Actions or operator-supplied local output |
| Hosted post-remediation proof | UNKNOWN | no authorized apply occurred |

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

## Reproducible validation commands

Unexecuted unless accompanied by exact output:

```bash
node --test tests/movie-buff-independent-security-validation.test.mjs
MOVIE_BUFF_EVIDENCE_JSON=<bundle.json> node --test tests/movie-buff-release-evidence-integrity.test.mjs
node scripts/movie-buff-security-evidence.mjs
node scripts/movie-buff-three-client-validation.mjs
supabase test db supabase/tests/movie_buff_security_validation_test.sql
npm run lint
npx tsc --noEmit
npm run build
git diff --check
git rev-parse HEAD
git status --short
```

The three-client command must target only localhost/loopback, use disposable authenticated identities and a local service-role key, and require explicit targeted-deletion consent.

## Remaining UNKNOWN

- all local Node, pgTAP, lint, TypeScript, build, and diff-check results except the narrow MOV-18 Vercel build;
- MOV-15 database/race/lock-contention behavior;
- MOV-16 database persona and concurrency behavior;
- MOV-17 functional implementation and end-to-end synchronization;
- MOV-18 rendered runtime, malformed asset, reduced-motion, hydration, accessibility, and responsive behavior;
- one exact integrated SHA containing reconciled PR #3, PR #5, and all lanes;
- staging/production application SHA and post-remediation database state;
- rollback/containment rehearsal after new state writes.

No UNKNOWN becomes PASS without exact command, exit status, SHA, target identity, timestamps, and raw artifacts.
