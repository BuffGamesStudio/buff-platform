# Movie Buff independent validation matrix v1

Date: 2026-08-04  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA reviewed: `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Hosted Supabase project observed read-only: `yfatwreicmiocdxzyznd`  
Release classification: **NO-GO**

`PASS` below is deliberately narrow. Repository-static inspection may prove a directly present defect or an exact source invariant. It may not prove runtime behavior, race safety, synchronization, hosted state, accessibility, or rollback execution.

## Relay matrix

| Lane | Exact branch/PR state reviewed | Validation | Relay state | Next safe action |
|---|---|---|---|---|
| MOV-15 | PR #9, HEAD `3cea9b9f5e5436a834adf459834e7196890d2ac1`, five commits ahead of integration | strict-three source structure improved; runtime/race evidence UNKNOWN; PR body stale | `READY_FOR_REVIEW` only after body/evidence correction; currently `AGENT_WORKING` | amend file claim for the contract test, update PR body, run fresh local race/negative matrix, then return exact evidence |
| MOV-16 | PR #6, HEAD `3683c1ec2b70b8fabc85d70b77242e794b505c7e` | static blockers confirmed; no Actions; behavior UNKNOWN | `CHANGES_REQUESTED` | resolve concurrency, immutable participant snapshot, canonical phase handoff, contradictory activation replay, and behavioral tests |
| MOV-17 | branch identical to integration, no PR | current integration FAIL; no lane implementation | `AGENT_WORKING` | implement authoritative phase/version/deadline RPCs and three-client journey while preserving MOV-15/16 and PR #3/#5 boundaries |
| MOV-18 | PR #8, HEAD `d9139c7a7f6628efdc032326db4b099999b2e8c3`, ten commits ahead | scaffold present; missing-asset callback and accessibility defects; no Actions | `CHANGES_REQUESTED` | wire failure to an actual loader, add dialog keyboard/focus behavior, then supply executable and browser evidence |
| MOV-19 | PR #7; validation artifacts being corrected from original HEAD `40e706b279eb6c620b4216aacdf092527f59888c` | hosted security FAIL; validator integrity corrections in progress | `AGENT_WORKING` | finish exact-SHA matrix, run only when a real runner/target is available, independently retest each amended lane |

## Lane validation matrix

### MOV-15 — public matchmaking

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Server-owned public size exactly three | PASS — source invariant only | migration defines immutable `movie_buff_public_match_size()` returning `3`; caller `p_max_players` is retained but not used for capacity |
| Normalized compatibility key | PASS — source invariant only | category/null sentinel, lower-trimmed difficulty, rounds, and server size feed `public_matchmaking_key` |
| Durable duplicate waiting-room guard | PASS — source invariant only | partial unique index covers public `waiting` rows by compatibility key |
| No `SKIP LOCKED` convergence bypass | PASS — source invariant only | candidate selection waits under a compatibility advisory lock |
| Per-player open-membership serialization | PASS — source invariant only | per-user advisory lock precedes open-membership check |
| Browser two-player/350 ms start removed | PASS — source invariant only | reviewed waiting-room source uses strict three and preserves private host start |
| Three simultaneous compatible players | UNKNOWN | no GitHub Actions or user-supplied local race output exists |
| Repeated fresh race execution | UNKNOWN | harness exists but has not run on an exact SHA/target |
| Late third / duplicate request / active other-room rejection | UNKNOWN | scenario source exists; no executable output |
| Full room, incompatible settings, stale room | UNKNOWN | full required negative matrix is not evidenced |
| Exactly one room and three memberships | UNKNOWN | source cannot prove transaction behavior |
| Hosted post-fix behavior | UNKNOWN | MOV-15 migration is not in hosted ledger |
| Rollback | UNKNOWN | no lane rollback SQL or tested rollback evidence was observed |

Coordination findings:

- PR #9’s body still says the waiting-room defect is present although HEAD source removes it. Evidence text must match the exact diff.
- `tests/movie-buff-public-matchmaking-contract.test.mjs` was added after the earlier three-file claim and must be recorded in MOV-15.
- MOV-15 redefines `start_movie_buff_match(uuid)` to preserve legacy start effects. MOV-17 must compare final definitions and retain only the strict-three admission contract when adding canonical phases.

### MOV-16 — private VIP authority

| Requirement | Classification | Evidence / reason |
|---|---|---|
| No invented definitions or ownership | PASS — source invariant only | migration seeds neither definitions nor inventory |
| Bearer-derived caller identity | PASS — source invariant only | routes verify bearer token and do not accept caller player identity |
| Private table grants/search path | PASS — source invariant only | tables are browser-private; definer functions declare `pg_catalog` |
| Concurrent first window open | FAIL — static defect | check-then-insert path can expose a unique violation instead of returning one authoritative window |
| Concurrent identical lock | FAIL — static defect | same check-then-insert race exists for first lock |
| Immutable required-human snapshot | FAIL — static defect | window stores count, not authoritative required player identities/system classification |
| Canonical phase transition | FAIL — static defect | Round Intro navigates from VIP readiness rather than MOV-17 canonical phase |
| Contradictory activation replay | FAIL — static defect | existing consumption lookup by lock does not prove supplied activation key matches persisted key |
| Owned/unowned/exhausted/deadline/privacy/reconnect/exactly-once behavior | UNKNOWN | current tests are structural/pure; no database/persona execution |
| Hosted behavior | UNKNOWN | migration absent from hosted ledger |
| Post-write rollback | FAIL | rollback drops inventory, windows, locks, and consumption history |

### MOV-17 — phase machine

| Requirement | Classification | Evidence / reason |
|---|---|---|
| No manual shared progression | FAIL | integration still exposes Start/Continue/Next controls |
| One authoritative phase/version/deadline | FAIL | no lane implementation exists |
| Selector-only tile selection | FAIL on integration | base service-role board paths are not one transactional authorized phase boundary |
| Concurrent tile selection/duplicate transition | FAIL on integration | no version token and affected-row proof |
| Shared playback timestamp | FAIL on hosted/base | current playback state is per player |
| Reconnect/grace/deadline preservation | UNKNOWN/FAIL on current model | no authoritative phase implementation or executable evidence |
| Selector rotation/abandonment/Buster/no-human closure | UNKNOWN | no lane implementation |
| Three-client end-to-end agreement | UNKNOWN | no exact-SHA journey exists |
| Hosted behavior | UNKNOWN | no MOV-17 migration/application SHA exists |
| Rollback | UNKNOWN | no phase rollback/containment design exists |

PR #5’s bearer/member helpers are useful, but its resolve route remains fail-open by returning HTTP 200 `boardUnavailable` for schema/content failures. PR #5 also targets `main`, so its content must be deliberately reconciled rather than assumed integrated.

### MOV-18 — visual runtime

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Visual code cannot advance gameplay | PASS — source invariant only | pure API returns false and no authoritative mutation surface is introduced |
| Missing Rive asset fallback | FAIL — static defect | `onError` is attached to a `<div>`; no actual Rive loader exists to report `.riv` failure |
| Reduced-motion state derivation | PASS — source invariant only | pure derivation chooses static fallback for reduced motion |
| Browser reduced-motion behavior | UNKNOWN | no browser evidence |
| Reconnect skips completed transition | PASS — source invariant only | derivation refuses transition replay while reconnecting/expired |
| Runtime Rive integration | UNKNOWN/not present | package dependency and production `.riv` assets are absent |
| Hydration/build safety | UNKNOWN | no Actions/local output |
| Dialog accessibility | FAIL — static defect | Game Menu lacks initial focus, focus containment, Escape handling, and focus restoration |
| Responsive visual parity | UNKNOWN | no screenshots or shared-page integration |
| Authoritative leave penalty binding | UNKNOWN | component accepts supplied label but MOV-17 state is absent |

### MOV-19 — security and release evidence

| Requirement | Classification | Evidence / reason |
|---|---|---|
| Six-table hosted RLS | FAIL | all six inspected tables have RLS disabled, no policies |
| Six-table hosted grants | FAIL | anon and authenticated have effective CRUD on all six |
| Critical anon RPC EXECUTE | FAIL | broad anon execution remains on high-risk Movie Buff definer functions |
| Fixed search path | FAIL | most critical hosted definer functions use `search_path=public` |
| `join_movie_buff_room(text)` hardening | PASS — hosted narrow | `postgres`, definer, `pg_catalog`, anon denied, authenticated/service role allowed |
| Service-role table continuity | PASS — hosted narrow | service role retains CRUD on the six inspected tables |
| Migration ledger | PASS — observation only | hosted ledger contains only `20260803233057` and `20260803235116`; lane migrations are not hosted |
| Static evidence integrity | PASS — source invariant after MOV-19 correction | proof scope and claim type prohibit behavioral/hosted PASS from static matches |
| Executable validator output | UNKNOWN | no Actions/local execution for PR #7 |
| Hosted post-remediation proof | UNKNOWN | no authorized hosted apply occurred |

## Hosted database evidence snapshot

Target identity: `yfatwreicmiocdxzyznd` (`Movie Buff`, `us-east-1`, PostgreSQL `17.6.1.147`).

Observed migration ledger:

- `20260803233057 remote_schema`
- `20260803235116 movie_buff_join_room_rpc_hardening`

Six-table result at observation time:

| Table | RLS | Policies | anon CRUD | authenticated CRUD | service role CRUD |
|---|---|---:|---|---|---|
| `match_round_player_hints` | disabled | 0 | all true | all true | all true |
| `match_round_player_playback` | disabled | 0 | all true | all true | all true |
| `movie_buff_boards` | disabled | 0 | all true | all true | all true |
| `movie_buff_board_categories` | disabled | 0 | all true | all true | all true |
| `movie_buff_board_tiles` | disabled | 0 | all true | all true | all true |
| `movie_buff_board_events` | disabled | 0 | all true | all true | all true |

Selected hosted RPC observations:

| Function | Definer | search path | anon EXECUTE | service role EXECUTE | Definition MD5 |
|---|---:|---|---:|---:|---|
| `find_or_create_movie_buff_public_room(uuid,text,integer,integer)` | yes | `public` | yes | yes | `a4cd7a68ba49fa26cef4cf11e4694946` |
| `advance_movie_buff_round(uuid)` | yes | `public` | yes | yes | `1ae2fbd8f8c3455f83ad688ebef8e720` |
| `mark_movie_buff_round_media_ready(uuid)` | yes | `public` | yes | yes | `80117f90917b228be82b59b0b06e6ee0` |
| `start_movie_buff_match(uuid)` | yes | `public` | yes | yes | `e3e6f72bbb45101a2e1f44c32811ed52` |
| `start_movie_buff_round_playback(uuid)` | yes | `public` | yes | yes | `54869671c8c2957ba62ab63aa987036f` |
| `submit_movie_buff_answer(uuid,text)` | yes | `public` | yes | yes | `4231afa86b3d9ff1bea8f6e80ecb70f9` |
| `join_movie_buff_room(text)` | yes | `pg_catalog` | no | yes | `b1be09c91c8a9ff3f3ed877cacf18ffc` |

## Reproducible validation commands

These commands are required evidence producers; none is marked executed here:

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

The three-client command must target only `localhost`, `127.0.0.1`, or `::1`, use three disposable authenticated identities and a local service-role key, and set `MOVIE_BUFF_ALLOW_LOCAL_TEST_DATA_DELETE=YES` before targeted cleanup.

## Remaining UNKNOWN items

- all lane lint, TypeScript, production-build, test, and diff-check outputs;
- every database persona/race result for the proposed migrations;
- three-client VIP → board → transition → shared playback → answer → results → reconnect agreement;
- clock-skew, deadline-reset, selector-abandonment, Buster, and no-human closure behavior;
- preview/staging/production application SHA and database ledger after remediation;
- rollback rehearsal and post-write data preservation;
- responsive, reduced-motion, hydration, asset-failure, and accessibility browser proof.

No UNKNOWN item may be converted to PASS without exact command, exit status, target identity, exact SHA, timestamps, and raw artifacts.
