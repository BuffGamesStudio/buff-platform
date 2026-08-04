# Movie Buff Security Hardening Packet v1

Date: 2026-08-04  
Canonical base: `main` at `bf316a15a2120e32d8a32e479df2ae439081f9a1`  
Status: implementation packet only; no production migration or deployment authorized

## 1. Objective

Close the current Movie Buff launch blockers in one coordinated but fail-closed packet:

1. enable RLS and remove broad table grants on six exposed public tables;
2. remove unintended `PUBLIC`/`anon` execution from Movie Buff `SECURITY DEFINER` RPCs;
3. replace mutable `search_path = public` with fixed safe search paths and schema-qualified references;
4. enforce room/match membership and actor authorization for board reads, board mutation, tile selection, board ensure/create, and board resolve;
5. prove service-role server routes do not bypass user authorization merely because they use `supabaseAdmin`;
6. preserve intended authenticated gameplay and service-role continuity;
7. add rollback, pgTAP/static tests, and hosted proof requirements.

This packet does not authorize merge, deploy, or hosted database mutation.

## 2. Confirmed hosted current state

### 2.1 Six tables have RLS disabled

All six are owned by `postgres`, exposed in `public`, have no policies, and currently grant broad privileges to `anon` and `authenticated`.

- `public.match_round_player_hints`
- `public.match_round_player_playback`
- `public.movie_buff_boards`
- `public.movie_buff_board_categories`
- `public.movie_buff_board_tiles`
- `public.movie_buff_board_events`

The current grants include `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and in several cases `TRUNCATE`, `REFERENCES`, and `TRIGGER` for `anon` and `authenticated`.

### 2.2 Board table relationship keys

- `movie_buff_boards.room_id -> room context`
- `movie_buff_board_categories.board_id -> movie_buff_boards.id`
- `movie_buff_board_tiles.board_id -> movie_buff_boards.id`
- `movie_buff_board_events.board_id -> movie_buff_boards.id`
- `movie_buff_board_events.room_id` is nullable and cannot be the sole authorization anchor
- `movie_buff_board_tiles.selected_by_player_id` and `resolved_by_player_id` are nullable actor references

### 2.3 Round-player tables

- `match_round_player_hints(round_id, player_id, used_at, penalty_seconds, created_at)`
- `match_round_player_playback(round_id, player_id, started_at, created_at, play_requested_at, playback_started_at)`

Authorization must derive from the round's match/room membership and must not trust caller-supplied `player_id` alone.

### 2.4 RPC exposure

The following `SECURITY DEFINER` functions are currently owned by `postgres`, use `search_path=public`, and are executable by `anon`, `authenticated`, and `service_role`:

- `advance_movie_buff_round(uuid)`
- `cleanup_movie_buff_waiting_room(uuid,uuid)`
- `enter_movie_buff_round(uuid)`
- `find_or_create_movie_buff_public_room(uuid,text,integer,integer)`
- `get_movie_buff_final_results(uuid)`
- `get_movie_buff_round(uuid)`
- `get_movie_buff_round_completion(uuid,uuid,timestamptz,integer)`
- `get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer)`
- `get_movie_buff_round_results(uuid)`
- `get_movie_buff_round_results(uuid,uuid)`
- `is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer)`
- `leave_movie_buff_room(uuid)`
- `mark_movie_buff_round_media_ready(uuid)`
- `pick_movie_buff_clip(uuid,uuid,text)`
- `prepare_movie_buff_round_playback(uuid)`
- `set_movie_buff_player_ready(uuid,boolean)`
- `start_movie_buff_match(uuid)`
- `start_movie_buff_round_playback(uuid)`
- `submit_movie_buff_answer(uuid,text)`
- `touch_movie_buff_room_presence(uuid)`
- `use_movie_buff_round_hint(uuid,integer)`

`join_movie_buff_room(text)` is already hardened to `search_path=pg_catalog`, denies `anon`, and permits `authenticated` plus `service_role`.

Non-definer helpers with mutable/no explicit search path include:

- `set_updated_at()`
- `normalize_movie_answer(text)`
- `movie_buff_clip_difficulty_label(numeric)`
- `movie_buff_requested_difficulty_label(text)`

## 3. Security model

### 3.1 Actor identity

Browser-originated actions must derive identity from the verified Supabase access token. Do not accept a user/player identifier from JSON, query parameters, local storage, or cookies as proof of identity.

Server routes that instantiate `supabaseAdmin` must first:

1. require a bearer token;
2. verify the token and obtain `auth.users.id`;
3. map that user to the active room/match player record;
4. verify membership and action-specific authority;
5. only then perform service-role reads/writes.

A service-role client bypasses RLS by design, so RLS alone cannot close server-route authorization gaps.

### 3.2 Minimum access rules

- `anon`: no direct access to any of the six tables; no execution of Movie Buff state-changing definer RPCs.
- `authenticated`: only member-scoped reads and explicitly intended gameplay RPCs.
- `service_role`: direct table access retained for trusted server code, migrations, and operational continuity, but every user-facing server route must perform an explicit membership/authority check before use.
- `postgres`: ownership retained.

### 3.3 Board roles

- Active room member: may read the board, categories, tiles, and authorized event subset for that room.
- Current selector: may select one unlocked unused tile.
- Current round/room authority: may resolve the currently selected tile only when the game state permits.
- Host/system: may ensure/create a board only through an authenticated, membership-checked path.
- Nonmember: no board enumeration, creation, selection, resolution, or event access.

## 4. Implementation structure

Use two additive migrations and one application-auth change set so rollback and proof are isolated.

### Migration A — table RLS and grants

Suggested filename:

`supabase/migrations/20260804xxxxxx_movie_buff_six_table_rls.sql`

Required actions:

1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all six tables.
2. Revoke all privileges from `PUBLIC`, `anon`, and `authenticated` on all six tables.
3. Re-grant only required `SELECT` to `authenticated` where browser direct reads remain intentional.
4. Keep full access for `service_role` and ownership for `postgres`.
5. Create member-scoped policies using existing canonical room/match membership tables.
6. Do not use permissive `USING (true)` or caller-controlled `player_id = auth.uid()` shortcuts unless `player_id` is proven to be the auth user ID type and relationship.

Policy intent:

- `movie_buff_boards`: authenticated active member of `board.room_id` may select.
- `movie_buff_board_categories`: authenticated active member of parent board's room may select.
- `movie_buff_board_tiles`: authenticated active member of parent board's room may select.
- `movie_buff_board_events`: authenticated active member of parent board's room may select only columns/events approved for clients; otherwise remove direct client select and expose a filtered RPC/view.
- `match_round_player_hints`: player may read own row for a round in their active match; writes only through RPC.
- `match_round_player_playback`: player may read own row for a round in their active match; writes only through RPC.

Fail-closed default: no direct authenticated `INSERT`, `UPDATE`, or `DELETE` policies unless a current browser call is proven to require them. Prefer definer RPCs with actor checks for writes.

### Migration B — RPC ACL and search-path hardening

Suggested filename:

`supabase/migrations/20260804xxxxxx_movie_buff_rpc_acl_search_path.sql`

For each Movie Buff `SECURITY DEFINER` function:

1. `ALTER FUNCTION ... OWNER TO postgres`.
2. set a fixed search path, preferably `pg_catalog`, and schema-qualify every referenced object;
3. `REVOKE ALL ON FUNCTION ... FROM PUBLIC`;
4. `REVOKE EXECUTE ON FUNCTION ... FROM anon`;
5. grant only the minimum intended roles;
6. retain `service_role` where server continuity requires it;
7. retain `authenticated` only for RPCs with internal actor/membership/host/state guards.

Initial classification to verify against application call sites:

Authenticated gameplay candidates:

- `find_or_create_movie_buff_public_room`
- `join_movie_buff_room`
- `leave_movie_buff_room`
- `set_movie_buff_player_ready`
- `touch_movie_buff_room_presence`
- `enter_movie_buff_round`
- `get_movie_buff_round`
- `get_movie_buff_round_completion`
- `get_movie_buff_round_player_time_left`
- `get_movie_buff_round_results`
- `get_movie_buff_final_results`
- `submit_movie_buff_answer`
- `use_movie_buff_round_hint`

Likely host/system-only or service-role-only unless exact internal guards are proven:

- `advance_movie_buff_round`
- `cleanup_movie_buff_waiting_room`
- `mark_movie_buff_round_media_ready`
- `pick_movie_buff_clip`
- `prepare_movie_buff_round_playback`
- `start_movie_buff_match`
- `start_movie_buff_round_playback`
- `is_movie_buff_round_player_finished` when it accepts arbitrary `player_id`

Do not blindly revoke `authenticated` from all definer RPCs. First prove the call graph and preserve intended direct client gameplay. The mandatory immediate change is removal of `PUBLIC`/`anon`, fixed search paths, and guard enforcement.

For helper functions used only internally by triggers or other functions, revoke direct API execution from `PUBLIC`, `anon`, and `authenticated` unless an external call is proven necessary.

### Application change C — board route authorization

Audit and harden all board API routes, including at minimum the known resolve path and all select/ensure paths.

Expected paths to reconcile against repository HEAD:

- `src/app/api/movie-buff/board/resolve/route.ts`
- board select route
- board ensure/create route
- any shared board loader used by preview/play pages

Each route must:

1. reject missing or malformed bearer tokens with `401`;
2. verify the token and resolve the authenticated user ID;
3. reject missing active room/match membership with `403`;
4. reject room/board mismatches with `404` or `403` without confirming resource existence;
5. enforce current selector/host/round authority as appropriate;
6. execute selection/resolution atomically to prevent double selection or replay;
7. never trust localStorage session identifiers as authorization;
8. avoid caching user-specific board or selector state across users;
9. return no board metadata to nonmembers;
10. log rejection reasons without tokens or sensitive payloads.

Preferred design: move board mutations into narrowly scoped database RPCs with explicit auth/membership/state guards and call them using the user's JWT where possible. If service-role is retained, perform equivalent explicit checks in the route before mutation and add adversarial route tests.

## 5. Required tests

### 5.1 pgTAP/static database tests

For each of the six tables:

- RLS enabled;
- no `PUBLIC` or `anon` table privileges;
- no authenticated write privileges unless explicitly approved;
- nonmember cannot select;
- active member can select only intended rows;
- one room's member cannot read another room's board rows;
- player cannot read another player's hint/playback row;
- service-role continuity remains intact.

For each definer RPC:

- owner is `postgres`;
- `SECURITY DEFINER` status matches design;
- fixed search path is present;
- no effective `PUBLIC` or `anon` execute, including OID 0/public inheritance checks;
- authenticated execute matches the approved matrix;
- service-role execute matches the approved matrix;
- membership/host/actor negative tests fail closed;
- arbitrary `player_id` parameters cannot be used to impersonate another player.

### 5.2 Route tests

Personas:

- anonymous caller;
- authenticated nonmember;
- inactive former member;
- active room member but not selector;
- current selector;
- host;
- service-role internal caller.

Adversarial cases:

- enumerate board IDs;
- use a valid board ID from another room;
- create/ensure a board for another room;
- select two tiles concurrently;
- resolve an unselected tile;
- resolve another room's tile;
- replay selection/resolution;
- substitute `player_id`/`room_id` from localStorage;
- cache leakage between two authenticated users;
- stale selector state;
- malformed/null actor and contradictory room/board relationships.

### 5.3 End-to-end proof

Run against the exact integrated SHA after every clean product integration:

1. user A creates/joins room;
2. user B joins;
3. nonmember C cannot enumerate or mutate board;
4. selector chooses tile;
5. other member cannot choose during selector turn;
6. round playback and hint paths work;
7. answer and scoring complete;
8. next selector rotates correctly;
9. final results are member-scoped;
10. service-role maintenance paths continue.

## 6. Rollout order

1. Capture immutable base SHA and hosted project ID.
2. Capture migration ledger, table ACL/RLS, function definitions/hashes/owners/search paths, and direct/effective execute grants.
3. Reconcile all application call sites before changing authenticated RPC grants.
4. Apply Migration A to an isolated/staging database.
5. Run database negative personas and application smoke tests.
6. Apply Migration B to staging.
7. Run complete RPC matrix and two-player journey.
8. Deploy application authorization changes to preview/staging.
9. Run adversarial board tests against exact SHA.
10. Produce evidence bundle and decision report.
11. Stop before production until literal apply/deploy authorization is recorded.
12. Production order, once authorized: database migrations first, then application deployment, then postflight and Watchtower journey.

## 7. Stop conditions

Stop immediately if any of the following occurs:

- canonical main SHA changes without reconciliation;
- an existing browser flow depends on direct table writes not covered by a safe policy/RPC;
- an authenticated RPC call site cannot be mapped;
- service-role continuity test fails;
- a nonmember can infer board existence;
- selector/host authority remains ambiguous;
- migration changes more objects than listed;
- rollback is not tested;
- any test requires production secrets or live production mutation before authorization.

## 8. Rollback

Rollback must be a separate reviewed migration, not an ad hoc dashboard edit.

- Application: redeploy the previous known-good SHA.
- RPC ACL/search path: restore previous definitions and grants only from captured preflight evidence.
- RLS: prefer correcting policies rather than disabling RLS. Disable RLS only under explicit emergency authorization and only after traffic containment.
- If production behavior fails after Migration A, temporarily route affected mutations through verified service-role server paths while maintaining user authorization checks; do not restore `anon` broad grants.
- Preserve raw logs, SQL outputs, timestamps, SHAs, project ID, and actor role used for every proof.

## 9. Human-owned decisions

These require explicit product/security ownership before implementation is considered complete:

- whether board events are directly readable by members or only through a filtered view/RPC;
- which state-transition RPCs are host-callable versus service-role-only;
- whether selector identity is stored as auth user ID or a separate player row ID;
- whether inactive/reconnecting members retain board read access;
- whether public matchmaking permits direct authenticated invocation of room creation;
- exact error semantics (`403` vs existence-hiding `404`) for cross-room access.

## 10. Acceptance contract

This packet is complete only when:

- all six tables have RLS enabled and minimum grants;
- all table policies pass member/nonmember cross-room tests;
- all Movie Buff definer functions deny `PUBLIC` and `anon` unless an explicit exception is approved;
- all definer functions have fixed safe search paths and schema-qualified references;
- board routes verify JWT identity and membership before any service-role access;
- selector/host/state guards pass concurrency and replay tests;
- service-role continuity passes;
- staging/preview two-player journey passes on the exact integrated SHA;
- rollback is rehearsed;
- hosted raw evidence is archived;
- production remains NO-GO until explicit merge/apply/deploy authorization.
