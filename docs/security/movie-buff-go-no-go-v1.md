# Movie Buff independent GO/NO-GO — v1

Captured: 2026-08-05  
Reviewer lane: MOV-19  
Repository: `BuffGamesStudio/buff-platform`  
Integration target: `integration/movie-buff`  
Integration SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

## Verdict

# **NO-GO**

Evidence is classified only as **PASS**, **FAIL**, **UNKNOWN**, or **NOT APPLICABLE**. Missing, stale, unexecuted, cross-SHA, local-only, preview-only, or documentation-only evidence is never converted into PASS.

## Exact lane heads reviewed

- MOV-15 PR #9: `cf95ade4f050a70f73077561ea95fbb0c0d82b6a`
- MOV-16 PR #6: `95c292ead66fc83cf13d7154bd3cf691610f549d`
- MOV-17 PR #10: `e9984841e5e0e323feaf835e4ddc0fc1ccf4d3a1`
- MOV-18 PR #8: `e335a07eed20c97bc2487962ad0cf67c4f9dcc03`
- MOV-19 PR #7 before this record refresh: `9a00afcca8310fe849ec60eb0818e9d6a85b54e3`

All lane PRs remain open, draft, unmerged, isolated, and targeted to `integration/movie-buff`. The integration branch still contains none of the current functional lane heads.

## Hosted read-only security capture

Target project: `yfatwreicmiocdxzyznd`  
Captured: `2026-08-05T04:19:02Z`

### FAIL — six exposed tables

The following six public tables all have RLS disabled, zero policies, effective anon SELECT/INSERT/UPDATE/DELETE, effective authenticated SELECT/INSERT/UPDATE/DELETE, and retained service-role CRUD:

- `match_round_player_hints`
- `match_round_player_playback`
- `movie_buff_boards`
- `movie_buff_board_categories`
- `movie_buff_board_tiles`
- `movie_buff_board_events`

### FAIL — critical legacy SECURITY DEFINER posture

The following hosted functions exist, are SECURITY DEFINER, retain service-role execution, remain executable by anon and authenticated, and use `search_path=public`:

- `advance_movie_buff_round(uuid)`
- `find_or_create_movie_buff_public_room(uuid,text,integer,integer)`
- `mark_movie_buff_round_media_ready(uuid)`
- `prepare_movie_buff_round_playback(uuid)`
- `start_movie_buff_match(uuid)`
- `start_movie_buff_round_playback(uuid)`
- `submit_movie_buff_answer(uuid,text)`
- `use_movie_buff_round_hint(uuid,integer)`

### PASS — narrow hosted exception

`join_movie_buff_room(text)` remains owned by `postgres`, SECURITY DEFINER, fixed to `search_path=pg_catalog`, denied to anon, and executable by authenticated and service_role.

### FAIL — hosted lane migration state

Hosted migration ledger contains only:

- `20260803233057 remote_schema`
- `20260803235116 movie_buff_join_room_rpc_hardening`

None of the current MOV-15 through MOV-19 lane migrations is hosted. `finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)` is absent from the hosted database.

## MOV-15

Exact SHA: `cf95ade4f050a70f73077561ea95fbb0c0d82b6a`

### PASS — narrow source/preview scope

- strict-three public admission and canonical compatibility source are present;
- waiting-room uniqueness, advisory locking, ordinary row waits, and no `SKIP LOCKED` divergence are represented in source;
- browser two-player/timer start authority is removed;
- exact-SHA evidence wrapper source binds checkout and child expectations;
- the recorded Vercel preview compiled, completed TypeScript, generated pages, and reached READY for this SHA.

### UNKNOWN

- migration apply and pgTAP;
- Node/race harness execution;
- repeated simultaneous three-player convergence;
- external row-lock contention;
- browser behavior;
- containment and rollback rehearsal;
- combined MOV-15/MOV-17 start compatibility.

Relay: `WAITING_FOR_LOCAL_EVIDENCE`.

## MOV-16

Exact SHA: `95c292ead66fc83cf13d7154bd3cf691610f549d`

### PASS — narrow source contract

The required service-only function now exists in PR #6 source:

`finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)`

Its migration source:

- binds the exact persisted deadline;
- uses the same round advisory-lock namespace as the VIP window;
- creates deterministic explicit no-VIP pass records only for missing unreleased required humans at or after deadline;
- consumes no inventory;
- returns `advanceReady=false` before deadline when incomplete and `advanceReady=true` only after all required records exist;
- owns no shared phase transition;
- is SECURITY DEFINER, owned by `postgres`, fixed to `search_path=pg_catalog`, and directly executable only by `service_role`;
- has a data-preserving function-only rollback.

The recorded Vercel preview compiled, completed TypeScript, generated pages, and reached READY for this SHA.

### UNKNOWN

- GitHub Actions at this exact SHA;
- SQL parse/apply and pgTAP;
- persona/adversarial execution;
- concurrent finalization and contradictory-deadline behavior against a real database;
- privacy and exact-once inventory consumption;
- rollback rehearsal;
- combined MOV-16/MOV-17 runtime behavior.

Relay: `WAITING_FOR_LOCAL_EVIDENCE`.

## MOV-17

Exact SHA: `e9984841e5e0e323feaf835e4ddc0fc1ccf4d3a1`

### PASS — repository/static/build scope

GitHub Actions run `30969424653`, job `92190331697` completed successfully at the exact SHA and proved:

- exact branch/SHA and clean checkout;
- committed-lock install;
- proof/wrapper syntax;
- focused MOV-17 repository contract tests;
- TypeScript;
- localhost-placeholder production build;
- final clean checkout and artifact upload.

The current source requires the MOV-16 finalizer and fails closed on missing or contradictory finalization. Because PR #6 now contains the exact signature, MOV-16/MOV-17 **source-contract compatibility is PASS** at the reviewed lane heads.

### FAIL — disposable local database rehearsal

GitHub Actions run `30969424659`, job `92190331772` failed in the checked-in disposable local Supabase wrapper step at this exact SHA. The source checkout remained clean and evidence artifact `8915979775` was uploaded with digest `sha256:8e9c3f7cc1382c7b48d59d4f90484340eaeac366a3b9828001f52aeb803a5ca7`.

The workflow failure is a FAIL for the attempted local database evidence gate. The exact SQL/test failure cause remains UNKNOWN until the uploaded evidence is independently classified.

### UNKNOWN

- successful migration apply and pgTAP;
- rollback and forward-after-rollback rehearsal;
- actual phase, tile, playback, answer, reconnect, abandonment, and Buster races;
- three-client synchronization;
- combined MOV-15/MOV-16/MOV-17 execution;
- browser behavior;
- hosted and production state.

Relay: `CHANGES_REQUESTED` until the failed local database gate is explained and rerun successfully.

## MOV-18

Exact SHA: `e335a07eed20c97bc2487962ad0cf67c4f9dcc03`

### PASS — repository/static/build scope

The PR records successful exact-SHA GitHub Actions evidence for:

- exact branch/SHA and clean checkout;
- synchronized `@rive-app/react-webgl2@4.30.0` and `@rive-app/webgl2@2.39.1` dependency boundary;
- committed-lock install;
- focused visual-authority tests;
- TypeScript and localhost-placeholder production build;
- artifact upload.

### UNKNOWN

- production `.riv` assets and verified artboard/state-machine names;
- actual load, parse, initialization, and WebGL context-loss behavior;
- rendered fallback and reduced-motion behavior;
- hydration, responsive, keyboard, screen-reader, and modal-focus proof;
- reconnect and synchronized-journey composition;
- Figma parity;
- rollback rehearsal;
- hosted and production state.

Relay: `READY_FOR_REVIEW` for the isolated scope only.

## MOV-19

Exact pre-refresh SHA: `9a00afcca8310fe849ec60eb0818e9d6a85b54e3`

### PASS — exact-SHA repository validation scope

GitHub Actions run `30968167375`, job `92186561717` completed successfully and proved:

- exact branch/SHA and clean checkout;
- validator self-guards;
- repository-static collector execution with deterministic accepted exit semantics;
- evidence-integrity proof scopes;
- TypeScript;
- localhost-placeholder production build;
- final clean checkout;
- artifact `8915532575`, digest `sha256:d29f6f9c0365cd5c1a8fc11e1ff15b6ac26f0e87a9b5ec67065d725c4a711246`.

This document refresh creates a later MOV-19 SHA. Exact-SHA workflow evidence for that later SHA remains UNKNOWN until its automatically triggered workflow completes and is recorded.

### FAIL

- overall release acceptance;
- hosted six-table RLS and grants;
- hosted critical RPC execution/search-path posture;
- MOV-17 disposable database evidence gate;
- integrated-candidate existence.

Relay: `AGENT_WORKING`.

## GO exit contract

GO requires all of the following on one immutable integrated SHA:

1. reviewed integration diff preserving PR #3 rich visuals and PR #5 security hardening;
2. exact-SHA clean-checkout lint, TypeScript, focused tests, pgTAP, production build, and diff check;
3. fresh repeated matchmaking, VIP, phase, board, playback, answer, reconnect, Buster, duplicate, stale-client, cross-room, and no-human race evidence;
4. three isolated clients agreeing on canonical phases, timestamps, tiles, media, answers, results, selector rotation, leave/reconnect, and Buster substitution;
5. rendered browser, native media, Rive failure, reduced-motion, hydration, responsive, keyboard, screen-reader, and modal-focus evidence;
6. staging target identity plus exact migration ledger, object definitions/hashes, owners, fixed search paths, direct/effective ACLs, RLS/policies, service-role continuity, and negative personas;
7. tested rollback/containment with exact artifacts, authority, stop conditions, and data-loss classification;
8. exact deployed staging and production SHAs and post-change evidence;
9. independent MOV-19 GO recommendation;
10. explicit human ARM authorization before any production merge, migration, deployment, or target mutation.

## Safety statement

No merge, deployment, hosted mutation, production mutation, secret disclosure, paid-resource creation, force-push, hosted deletion, or production traffic was performed by this validation update.
