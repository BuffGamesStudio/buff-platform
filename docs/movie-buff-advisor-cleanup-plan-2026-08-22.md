# Movie Buff Supabase Advisor cleanup plan — 2026-08-22

Status: plan only. This lane did not apply SQL, change RLS/ACLs, deploy, rotate secrets, or mutate production.

## Candidate and evidence identity

- Repository: `C:\Users\shapa\BuffGames\buff-platform`
- Branch: `codex/movie-buff-live-board-preview`
- Starting commit: `fda631a5f5bc306972e32cb2b70215ac9529bc07`
- Starting tree: `4ff8f25f452de1442e94ca1d9650f1f22c39f8a3`
- Production project inspected through the read-only Supabase Advisor connector: `yfatwreicmiocdxzyznd`
- Current live-runner migration: `supabase/migrations/20260822072017_movie_buff_live_show_runner.sql`
- Historical baseline: `docs/movie-buff-live-status-2026-08-21.md` records 26 authenticated SECURITY DEFINER warnings and 70 performance notices before the live-runner migration.

The current snapshot was collected on 2026-08-22 with `mcp__codex_apps__supabase_get_advisors`:

| Advisor | Current result | Interpretation |
|---|---:|---|
| Security | 34: 31 WARN, 3 INFO | 3 live-runner RLS/no-policy INFO rows; 5 live-runner RPC WARN rows; 26 WARN rows match the prior authenticated-RPC baseline |
| Performance | 42 INFO | 4 rows map directly to the live-runner migration; 38 are outside that migration. The historical 70-row aggregate cannot be diffed per finding from the checked-in note |

The direct attribution above is by exact object name and migration evidence. It is not a claim that every historical Advisor row is otherwise unchanged.

### Fresh live-runner catalog snapshot

A read-only production catalog query on 2026-08-22 confirmed the current
function boundary:

| Function group | `SECURITY DEFINER` | Execute ACL |
|---|---:|---|
| `get_movie_buff_live_show_view(text)` | yes | `anon`, `authenticated` |
| `join/heartbeat/leave_movie_buff_live_queue(text)` | yes | `authenticated` |
| `tick_movie_buff_live_show(text,text)` | yes | `service_role` |
| private `movie_buff_live_show_view(text)` | yes | owner only |

The live tables remain RLS-enabled/forced with direct table access denied to
the client roles; the public view and authenticated queue functions are the
intended API boundary. This confirms the Advisor findings are contract-review
items, not an instruction to add broad table policies or revoke gameplay RPCs.

## Stage 1 — urgent security review

Do this before performance cleanup. The objective is to preserve the current fail-closed table boundary while making every privileged RPC intentional, least-privileged, and independently verified.

### S1. Freeze the access contract before changing anything

Owner: security/database implementer. Validator: independent database/security reviewer, not the implementer.

1. Capture a read-only baseline from production for `pg_proc`, `pg_roles`, `pg_namespace`, `pg_class`, `pg_attribute`, `pg_policies`, and `information_schema.role_table_grants`/`role_routine_grants`. Record `pg_get_functiondef`, `prosecdef`, `proconfig`, function ACLs, table ACLs, `relrowsecurity`, and `relforcerowsecurity`. Do not record secret values.
2. Confirm the product contract for each route: anonymous public show read, authenticated queue join/heartbeat/leave, authenticated gameplay actions, and service-role worker tick.
3. Freeze the exact function signatures and expected execute roles in a review artifact. Do not use a blanket `REVOKE` or `SECURITY INVOKER` conversion: existing gameplay RPCs depend on deliberate privilege boundaries and may silently stop working.

Acceptance: the contract, current ACLs, RLS state, and final remote function bodies are captured and reviewed before a migration is authored. Production ARM is required for any DDL, grant/revoke, function replacement, policy change, or deployment.

### S1.1 — New live-runner tables: RLS enabled with no direct policies

Advisor rows:

- `public.movie_buff_live_queue`
- `public.movie_buff_live_show_episodes`
- `public.movie_buff_live_shows`

Evidence: migration lines 92–97 enable and force RLS; lines 99–104 revoke all table privileges from `public`, `anon`, and `authenticated`, granting table access only to `service_role`. The RPCs are the intended access path. No direct policies are defined in the migration.

Risk: the Advisor INFO is not evidence of a data leak. With `FORCE ROW LEVEL SECURITY`, no direct table grants, and RPC-only access, adding broad policies just to clear the lint could weaken the design. Conversely, a future grant or invoker function could make the empty-policy state unsafe.

Smallest safe repair:

- First verify the direct-table deny boundary and the function-only contract.
- If the contract remains RPC-only, retain empty policies and document this as an intentional exception; do not add broad `USING (true)` policies.
- If direct client access is required, add narrowly scoped policies per table and role, with ownership predicates and matching `WITH CHECK`; grant only the required table operations. Re-run negative tests before production.

Validation:

- `relrowsecurity = true` and `relforcerowsecurity = true` for all three tables.
- `has_table_privilege('anon', table, ...)` and `has_table_privilege('authenticated', table, ...)` are false for direct reads/writes.
- REST/Data API direct table requests fail closed for anonymous and authenticated callers.
- Public view and authenticated queue flows continue to pass.

Rollback: revert only the exact policy/grant migration after capturing the prior ACL/policy snapshot. Do not drop live tables or disable RLS. ARM: required for production.

### S1.2 — New live-runner SECURITY DEFINER RPCs

Evidence: `20260822072017_movie_buff_live_show_runner.sql` defines the implementation at line 110, the public wrapper at line 236, queue controls at lines 247, 342, and 377, and the service worker tick at line 422. All functions set `search_path = pg_catalog`; the migration revokes function access at lines 838–849 and grants only the intended roles at lines 851–860.

Current Advisor findings:

- WARN/anon and WARN/authenticated: `public.get_movie_buff_live_show_view(text)`.
- WARN/authenticated: `public.join_movie_buff_live_queue(text)`.
- WARN/authenticated: `public.heartbeat_movie_buff_live_queue(text)`.
- WARN/authenticated: `public.leave_movie_buff_live_queue(text)`.
- `public.tick_movie_buff_live_show(text,text)` is granted only to `service_role` and is not in the current anonymous/authenticated Advisor warnings.

Risk: SECURITY DEFINER bypasses invoker RLS. The functions read/write protected tables and must remain constrained by `auth.uid()`, fixed show-key handling, role ACLs, and a hardened `search_path`. The public read function intentionally exposes a sanitized projection, but its anonymous execution must be a product decision rather than an accidental public endpoint.

Smallest safe repair decision tree:

1. For `get_movie_buff_live_show_view`, decide whether anonymous live-board viewing is required. If not, revoke anonymous execute and require authenticated access. If yes, either keep a formally reviewed, read-only, allowlisted SECURITY DEFINER contract with an explicit exception, or move the privileged implementation behind a private schema/server route and expose only a sanitized application endpoint. Do not convert it to invoker until equivalent read policies and table grants exist.
2. For the three authenticated queue controls, prefer an invoker/RLS design only if it can preserve atomic queue selection and user ownership. Otherwise retain SECURITY DEFINER but verify `auth.uid()` ownership, input bounds, fixed show-key allowlisting, and least-privilege execute ACLs; record the Advisor exception with an owner and expiry.
3. Keep `tick_movie_buff_live_show` service-role-only. Add a negative test proving `anon` and `authenticated` cannot execute it.

Validation:

- `has_function_privilege` matches the contract exactly: public read only if approved; queue controls only to `authenticated`; tick only to `service_role`.
- Anonymous callers cannot join/heartbeat/leave or tick.
- Authenticated user A cannot read/update user B's queue entry or use a non-allowlisted show key.
- A three-account authenticated smoke still queues positions 1/2/3, starts one live episode, and advances phases.
- Re-run the security Advisor and disposition every remaining warning; no “cleared” result is accepted without the negative-path proof.

Rollback: restore the exact prior function definitions and ACLs from the captured snapshot in a reviewed migration. Rehearse rollback locally or in a non-production project first. ARM: required for production.

### S1.3 — Existing authenticated SECURITY DEFINER RPCs

The current 26 baseline warning entries are:

`activate_movie_buff_round_vip(uuid, uuid, text)`, `advance_movie_buff_match_phase(uuid, bigint)`, `advance_movie_buff_round(uuid)`, `confirm_movie_buff_active_leave(uuid, text, text)`, `enter_movie_buff_round(uuid)`, `find_or_create_movie_buff_public_room(uuid, text, integer, integer)`, `get_movie_buff_active_leave_quote(uuid)`, `get_movie_buff_final_results(uuid)`, `get_movie_buff_match_phase_view(uuid)`, `get_movie_buff_round(uuid)`, `get_movie_buff_round_results(uuid)`, `get_movie_buff_round_results(uuid, uuid)`, `get_movie_buff_vip_round_view(uuid, uuid)`, `join_movie_buff_room(text)`, `leave_movie_buff_room(uuid)`, `lock_movie_buff_round_vip(uuid, uuid, uuid, text)`, `mark_movie_buff_round_media_ready(uuid)`, `prepare_movie_buff_round_playback(uuid)`, `select_movie_buff_match_tile(uuid, uuid, bigint, text)`, `set_movie_buff_player_ready(uuid, boolean)`, `start_movie_buff_match(uuid)`, `start_movie_buff_round_playback(uuid)`, `submit_movie_buff_answer(uuid, text)`, `touch_movie_buff_match_participant(uuid)`, `touch_movie_buff_room_presence(uuid)`, and `use_movie_buff_round_hint(uuid, integer)`.

Local migration evidence groups the functions as follows:

- VIP authority: `20260804073000_movie_buff_vip_authority.sql`.
- Phase, playback, and readiness: `20260804083000_movie_buff_server_phase_machine.sql`, `20260804083100_movie_buff_server_phase_machine_hardening.sql`, `20260811185746_movie_buff_shared_playback_clock_sync.sql`, `20260813020000_movie_buff_individual_player_round_flow.sql`, `20260816043318_movie_buff_media_playback_readiness.sql`, and `20260816232539_movie_buff_playback_timer_gate.sql`.
- Matchmaking/room membership: `202607291330_movie_buff_public_matchmaking.sql`, `202607291730_movie_buff_atomic_private_join.sql`, `20260804081500_movie_buff_atomic_three_player_matchmaking.sql`, and `202607300250_movie_buff_leave_room_rpc_analytics.sql`.
- Active-leave/Buster boundary: `20260804083700_movie_buff_active_leave_and_buster_boundary.sql` and `20260804083500_movie_buff_reconnect_buster_boundary_repair.sql`.
- Results and VIP views: `202607291930_movie_buff_round_completion_fairness.sql`, `20260804073000_movie_buff_vip_authority.sql`, and `20260814031456_movie_buff_authenticated_rpc_allowlist.sql`.

Repair instructions:

1. Audit each function body for `auth.uid()`/room membership, caller-controlled identifiers, `search_path`, writes, and error behavior.
2. Compare the final migration-ledger definitions with the local ordered migration history; repeated `CREATE OR REPLACE` statements mean an early migration is not proof of the current remote body.
3. Preserve the existing authenticated allowlist where gameplay requires it. Revoke only unintended roles, not all authenticated access.
4. Convert to invoker only with equivalent RLS policies, grants, and end-to-end gameplay proof. Private-schema relocation is a larger design change and requires an API contract review.

Validation and rollback are the same as S1.2, expanded to every signature above. ARM is required for production. The prior status note does not contain a per-function historical snapshot, so exact function-by-function “new versus old” provenance beyond the live-runner names is UNKNOWN until a remote catalog read is performed.

## Stage 2 — performance notices

Do not drop indexes from an INFO notice alone. “Unused” means unused in the Advisor observation window; the current statistics reset time, workload coverage, and query plans were not available in this read-only lane.

### P1. Live-runner foreign-key indexes — current warnings

Advisor reports these unindexed foreign keys:

- `public.movie_buff_live_queue.player_id` / `movie_buff_live_queue_player_id_fkey`
- `public.movie_buff_live_show_episodes.winner_player_id` / `movie_buff_live_show_episodes_winner_player_id_fkey`
- `public.movie_buff_live_shows.current_episode_id` / `movie_buff_live_show_current_episode_fk`

Evidence: the live migration defines these foreign keys at lines 36–77 and the current-episode foreign key at lines 53–59. The migration adds queue-selection/episode indexes at lines 79–89 but not these three FK-leading indexes.

Smallest safe repair: first run `EXPLAIN (ANALYZE, BUFFERS)` for queue selection, episode completion/winner updates, and show lease reads against a production-like dataset. If plans or write/delete volume justify it, add one narrow index per FK column (using `CREATE INDEX CONCURRENTLY` in an operational migration where appropriate). Do not add speculative composites.

Validation: Advisor clears the three FK notices; representative plans use the index where expected; queue admission, episode completion, and worker lease behavior remain unchanged. Rollback is `DROP INDEX CONCURRENTLY` only after confirming no dependent constraint or query plan regression. ARM: required for production.

### P2. Live-runner unused index

Advisor reports `movie_buff_live_episode_status_idx` on `public.movie_buff_live_show_episodes` as unused. It originates at migration lines 89–90 and is intended for show status/episode rotation queries.

Smallest safe repair: exercise the worker and public view under a representative episode/queue workload, inspect the plan, and retain the index if it supports the lifecycle query. Only propose removal after an agreed observation window proves it is redundant; do not remove it merely to make the Advisor count zero.

### P3. Existing unused indexes — 37 current rows outside the live migration

Origin evidence and review buckets:

- `movies_title_idx` — `20260724222329_init_movie_buff.sql`.
- `content_items_active_idx`, `content_items_release_year_idx`, `content_items_legacy_movie_idx`, `content_items_title_search_idx`, `content_media_type_idx`, `content_media_position_idx`, `content_media_active_idx`, `content_tags_tag_idx`, `challenge_set_items_media_idx` — `202607270002_buff_games_content_engine.sql`.
- `movie_buff_round_events_clip_idx`, `movie_buff_round_events_movie_idx`, `movie_buff_clip_analytics_content_idx`, `movie_buff_clip_analytics_status_idx`, `movie_buff_clip_analytics_rotation_idx` — `202607300100_movie_buff_clip_analytics_and_round_timing.sql`.
- `movie_buff_boards_status_idx` — `202607311900_movie_buff_board_mvp_schema.sql`.
- `content_sources_active_idx`, `content_sources_clip_ingest_suitability_idx`, `content_source_items_source_id_idx`, `content_source_items_content_id_idx`, `content_source_items_validation_status_idx` — `202607311950_movie_buff_source_registry.sql`.
- `fkidx_game_rooms_category_id`, `fkidx_match_rounds_clip_id`, `fkidx_matches_category_id`, `fkidx_movie_buff_active_leave_quotes_policy_version`, `fkidx_movie_buff_board_events_tile_id`, `fkidx_movie_buff_board_tiles_clip_id`, `fkidx_movie_buff_boards_current_tile_id`, `fkidx_movie_buff_match_phase_state_selected_clip_id`, `fkidx_movie_buff_match_phase_state_selected_tile_id`, `fkidx_movie_buff_round_events_legacy_clip_id`, `fkidx_movie_buff_vip_consumptions_inventory_id`, `fkidx_movie_buff_vip_consumptions_vip_id`, `fkidx_movie_buff_vip_inventory_vip_id`, `fkidx_movie_buff_vip_round_locks_inventory_id`, `fkidx_movie_buff_vip_round_locks_vip_id`, `fkidx_user_achievements_achievement_id` — `20260817054904_movie_buff_foreign_key_index_advisor_cleanup.sql`.

Review procedure for every bucket:

1. Read `pg_stat_user_indexes` and `pg_stat_all_indexes` with reset timestamps; inspect `pg_stat_statements` if enabled.
2. Search application queries and RPC bodies for the indexed columns.
3. Compare `EXPLAIN` plans before any removal and run a representative Movie Buff gameplay/analytics workload.
4. Retain indexes used by foreign-key enforcement, write-heavy deletes/updates, or expected launch queries even if the current observation window is quiet.
5. If removal remains justified, stage one small reversible migration per bucket, capture dependent constraints, monitor latency/error rates, and retain a recreate script.

Acceptance: every index has a KEEP, DROP, or WATCH disposition with observed usage window, query-plan evidence, owner, and rollback script. ARM is required for any production index change.

### P4. Auth connection allocation

Advisor reports `auth_db_connections_absolute`: Auth is capped at 10 connections rather than a percentage allocation. This is a platform capacity/configuration decision, not a SQL index repair.

Validate current plan size, Auth concurrency, pool saturation, error rate, and expected scaling before changing it. Record the decision and owner. A platform configuration change requires production ARM and an operational rollback plan; no change is recommended from this snapshot alone.

## Required validation packet and independent acceptance

The implementer must produce, and the independent validator must rerun or inspect, all of the following:

1. Exact candidate commit/tree and migration name.
2. Read-only pre/post catalog snapshots for function definitions, ACLs, RLS/FORCE RLS, policies, and relevant indexes.
3. Security negative tests for anonymous, authenticated user A, authenticated user B, and service-role-only worker calls.
4. Authenticated three-contestant smoke: queue positions 1/2/3, one authoritative episode, phase advancement, completion, cleanup/rotation, and no cross-user data access.
5. Performance plans and usage-window evidence for every index touched; no blanket index deletion.
6. Fresh security and performance Advisor snapshots with each notice mapped to PASS, FIXED, INTENTIONAL EXCEPTION, or UNKNOWN.
7. Rollback rehearsal outside production and a production ARM packet containing exact SQL, affected objects, expected Advisor deltas, monitoring window, and rollback SQL.

The independent validator must not be the implementation agent, migration author, or production deployer. The validator signs the exact frozen candidate; an agent handback or successful transport call alone is not acceptance evidence.

## Current UNKNOWNs / blockers

- UNKNOWN: full function bodies, policy definitions, migration-ledger parity,
  and `pg_stat_*` usage/reset-window evidence still need a separate read-only
  capture; the current catalog query verified the live-runner function ACLs and
  `SECURITY DEFINER` flags only.
- UNKNOWN: the exact per-finding diff between the 2026-08-21 aggregate baseline and the current 2026-08-22 performance rows. The current names allow direct attribution of four live-runner rows, but the historical note does not list all 70 names.
- UNKNOWN: whether anonymous live-board read is a required product contract or can be authenticated-only.
- UNKNOWN: Data API exposed-schema settings and the production observation-window/reset time for index usage.
- UNKNOWN: whether the current production migration ledger exactly matches the local ordered migration chain; verify before authoring a repair migration.
- BLOCKED for implementation: this lane has no authorization to apply SQL, alter RLS/ACLs, change functions/indexes, deploy, or change secrets. Production ARM is the next dependency for any repair.

## Commands and tool calls completed

- Read `AGENTS.md` first.
- Read the Supabase skill instructions.
- `git rev-parse HEAD` and quoted `git rev-parse 'HEAD^{tree}'`.
- `rg` over `supabase/migrations`, `docs`, and source for live-runner objects, RLS/ACL/function/index evidence.
- Read `docs/movie-buff-live-show-runner.md`, `docs/movie-buff-live-status-2026-08-21.md`, and the historical Supabase audit.
- Read-only Supabase Advisor calls for project `yfatwreicmiocdxzyznd`, both `security` and `performance`.

Results: no production mutation, repository mutation outside this document, deployment, secret exposure, or migration application occurred. The parallel support agents were dispatched with disjoint read-only scopes, but did not return a visible final handback before this lane was finalized; their outputs are therefore not treated as evidence.
