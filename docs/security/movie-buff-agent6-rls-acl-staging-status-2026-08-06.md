# Movie Buff Agent 6 — RLS, ACL, and staging security status

Date: 2026-08-06  
Lane: Agent 6 — database security, RLS, ACL, and staging migration package  
Repository: `BuffGamesStudio/buff-platform`  
Branch: `security/movie-buff-rls-acl-staging`  
Base: `integration/movie-buff` at `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Base tree: `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

## Safety boundary

- Draft only into `integration/movie-buff`.
- No merge, production deployment, production alias, hosted-production Supabase mutation, secret access or disclosure, paid resource, force-push, or hosted deletion is authorized.
- The historical hosted project `yfatwreicmiocdxzyznd` remains read-only and could not be re-fetched through the current connector permission set.
- The isolated staging project is `movie-buff-staging`, ref `eddwkxcillhzkvwmavsc`, organization `tleuzztdjpajaltwcclj`, region `us-east-1`.
- Overall release classification remains `NO-GO`.

## Live source identities

### Current integration baseline

- SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
- tree: `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`

### Existing committed security source

- branch: `work/movie-buff-current-security-finalizer-20260805`
- SHA: `c950a2fea5c9846789542c001e4d76cff0f192bf`
- tree: `6e5b5b6d3110c44f6ae20d93f81dde849a30b300`
- classification: `FAIL` for its exact standalone workflow because run `31047165102`, job `92445393273`, failed during the disposable database rehearsal.
- artifact: `8946964128`
- artifact digest: `sha256:3d3470b218c3caf3d2e80adccd24cce04970f4b76e2c4c543d45cbc3ebbd13f2`

That branch is not a valid clean Agent 6 PR source because its ancestry includes extensive MOV-17 product, route, migration, and test files outside Agent 6 ownership.

### Event-trigger prerequisite repair

- PR: `#80`
- branch: `work/movie-buff-rls-event-trigger-contract-20260805`
- SHA: `066697b36be3a8a9def046bd6f7b0c640c905b78`
- tree: `68b45d3adcf5d43b8a6f318f8692889794abfd1b`
- parent security source: `c950a2fea5c9846789542c001e4d76cff0f192bf`

PR #80 adds the missing clean-database prerequisite:

- `20260805160500_public_rls_auto_enable_event_trigger_contract.sql`
- matching containment rollback;
- focused source contract.

Its ancestry is also cross-lane and must not be used as the clean Agent 6 branch without ownership-safe extraction.

### Current integrated candidate supplied for compatibility

- PR: `#100`
- branch: `release-candidate/movie-buff-canonical-20260805-agent8-v3`
- SHA: `4c27ae357e16a48ccc5d8885d11cc5411643b218`
- tree: `ab9c6301eba48d4119ffa4f0909ac4c4452ec14c`
- classification: `NO-GO`; exact integrated evidence still requires independent acceptance.

## Isolated staging migration ledger

The live staging ledger contains the security sequence:

1. `20260805155000_movie_buff_function_security_finalizer`
2. `20260805160000_movie_buff_six_table_rls_reconciliation`
3. `20260805160500_public_rls_auto_enable_event_trigger_contract`
4. `20260805161000_public_rls_auto_enable_acl_lockdown`

The ledger also records staging containment rollback and forward-reapply rehearsal entries for the event-trigger contract and lockdown.

## Six-table staging catalog result

Classification: `PASS` for the current read-only catalog capture on isolated staging only.

All six target tables are owned by `postgres`, have RLS enabled, and have FORCE RLS enabled:

- `match_round_player_hints`
- `match_round_player_playback`
- `movie_buff_boards`
- `movie_buff_board_categories`
- `movie_buff_board_tiles`
- `movie_buff_board_events`

Current effective access:

- `anon`: no SELECT, INSERT, UPDATE, or DELETE on any target table.
- `authenticated`: SELECT-only access where an explicit self or active-room-member policy exists; no INSERT, UPDATE, or DELETE.
- `movie_buff_board_events`: no authenticated table privilege and no policy, intentionally fail-closed.
- `service_role`: SELECT, INSERT, UPDATE, and DELETE retained on all six tables.

This catalog capture does not substitute for a fresh exact-candidate HTTP/persona artifact.

## Function security staging result

Classification: `PASS` for the current read-only catalog capture on isolated staging only.

Observed security floor:

- Movie Buff functions are owned by `postgres`.
- PUBLIC and `anon` effective EXECUTE are denied.
- browser-facing RPCs are reopened only to `authenticated` and `service_role` according to the committed allowlist.
- internal/service RPCs remain service-only or postgres-only.
- `finalize_movie_buff_vip_round_window(uuid,uuid,timestamptz)` is owned by `postgres`, is `SECURITY DEFINER`, has `search_path=pg_catalog`, denies PUBLIC/anon/authenticated, and permits `service_role`.
- `rls_auto_enable()` is owned by `postgres`, is `SECURITY DEFINER`, has `search_path=pg_catalog`, and grants no direct EXECUTE to PUBLIC, anon, authenticated, or service_role.

Generic Supabase advisor warnings for authenticated `SECURITY DEFINER` RPCs are not accepted as either PASS or FAIL by themselves. Each intentional browser RPC still requires exact persona, membership, cross-room, spoofed-ID, stale-membership, and service-role continuity probes.

## Current classification matrix

| Gate | Classification | Basis |
|---|---|---|
| Clean Agent 6 branch identity | PASS | Created from the live integration SHA without cross-lane changes |
| Existing standalone security source workflow | FAIL | Exact run failed at disposable database rehearsal |
| Six-table isolated-staging RLS catalog | PASS | RLS and FORCE RLS enabled on all six; effective grants captured |
| Isolated-staging function owner/ACL catalog | PASS | Owner, SECURITY DEFINER state, search paths, and effective EXECUTE captured |
| Fresh exact-candidate persona/effect probes | UNKNOWN | Not executed in this Agent 6 continuation yet |
| Clean ownership-safe migration extraction | UNKNOWN | Existing source ancestry contains cross-lane files |
| Historical hosted project current state | UNKNOWN | Current connector lacks permission to re-fetch `yfatwreicmiocdxzyznd` |
| Production state | NOT APPLICABLE | No production action is authorized |
| Overall release | FAIL | Mandatory release gates remain incomplete; release remains `NO-GO` |

## Next owned work

1. Extract only Agent 6-owned security migrations, rollbacks, pgTAP, persona harnesses, workflows, and security documentation into this branch.
2. Bind compatibility testing to the exact Agent 5/current composition identity without importing or modifying lane-owned logic.
3. Run disposable-local apply, pgTAP, persona authorization, containment rollback, forward reapply, migration-ledger, redaction, cleanup, and portable-hash evidence.
4. Rehearse the same exact package only against the isolated staging project under the approved staging runbook.
5. Send the exact expected-state manifest and evidence hashes to Agent 10 and the rollback/dependency order to Agent 9.

No completion, hosted-production repair, staging release readiness, or production readiness is claimed by this document.
