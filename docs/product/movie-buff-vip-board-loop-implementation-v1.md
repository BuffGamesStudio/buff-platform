# Movie Buff VIP → Board → Clip → Results → Board Implementation v1

Date: 2026-08-04
Status: implementation-ready contract on draft PR #5; no merge, deploy, or hosted migration authorized

## Objective

Replace the current client-driven Movie Buff progression with one server-owned loop used by public and private matches:

`round_intro → vip_lock → board_select → transition → playback → answer → results → board_select`

The server owns phase, deadlines, selector, selected tile, clip, playback timestamp, answer deadline, result deadline, and phase revision. Browser timers are presentation only.

## Minimal additive state

Add an additive migration that introduces the smallest durable fields required by the existing schema. Prefer a dedicated `movie_buff_match_phase_state` row keyed by match when extending current tables would create ambiguous ownership.

Required columns:

- `match_id uuid primary key`
- `room_id uuid not null`
- `round_id uuid not null`
- `phase text not null`
- `phase_version bigint not null default 1`
- `phase_started_at timestamptz not null`
- `phase_ends_at timestamptz`
- `selector_player_id uuid`
- `selector_deadline_at timestamptz`
- `selected_tile_id uuid`
- `selected_clip_id uuid`
- `playback_starts_at timestamptz`
- `answer_deadline_at timestamptz`
- `results_end_at timestamptz`
- `selection_source text`
- `updated_at timestamptz not null default now()`

Add a private per-player VIP lock table:

- `match_id uuid`
- `round_id uuid`
- `player_id uuid`
- `vip_id uuid`
- `locked_at timestamptz`
- `consumed_at timestamptz`
- `idempotency_key text`
- unique `(match_id, round_id, player_id, vip_id)`

Do not expose another player's unconsumed VIP selection through browser-readable board or room payloads.

## Authoritative RPC surface

All state-changing functions must be `SECURITY DEFINER`, owned by `postgres`, use `SET search_path = pg_catalog`, schema-qualify every object, revoke `PUBLIC` and `anon`, and grant only the minimum intended roles.

### `get_movie_buff_match_view(p_match_id uuid)`

Returns the caller-safe synchronized view:

- canonical phase and deadlines;
- server `now()` for clock-offset calculation;
- board and used-tile state allowed for active members;
- selector identity;
- selected clip metadata only when phase permits;
- caller's own VIP inventory, locks, and consumption state;
- no other player's hidden VIP data.

Reject nonmembers and abandoned members.

### `lock_movie_buff_round_vip(p_match_id, p_round_id, p_vip_id, p_idempotency_key)`

Atomically verifies authenticated identity, active membership, ownership/quantity, current `vip_lock` phase, deadline, and permitted per-round count. Replays return the same result. It must never trust `player_id` from the caller.

### `advance_movie_buff_match_phase(p_match_id, p_expected_version)`

Idempotently advances expired phases under row lock. Any active member may race to call it, but only one transition wins. It must also be callable by a trusted scheduled worker. It must not require every client to be online.

Transitions:

1. `round_intro` → `vip_lock`
2. `vip_lock` → `board_select` when deadline expires or all required human locks are complete
3. `transition` → `playback` at `playback_starts_at`
4. `answer` → `results` at authoritative completion or deadline
5. `results` → `board_select` when usable tiles remain, otherwise next round or finished

### `select_movie_buff_board_tile(p_match_id, p_tile_id, p_expected_version, p_idempotency_key)`

Under one transaction and lock:

1. derive caller from `auth.uid()`;
2. verify active membership and non-abandoned state;
3. verify `board_select` phase and selector authority;
4. verify tile belongs to this room/match board;
5. verify tile is available and unused;
6. resolve category, era/time period, genre/theme, difficulty, and point value;
7. select exactly one eligible clip satisfying rights, media policy, quality, diversity, same-clip, and same-movie repeat gates;
8. fail closed on null or contradictory rights/media fields;
9. lock tile and clip assignment atomically;
10. set `transition`, future `playback_starts_at`, and answer deadline;
11. record exact rejection reason in server-safe event data.

No thin-pool fallback may silently relax eligibility.

### `use_movie_buff_vip(...)` and `request_movie_buff_hint(...)`

Verify caller ownership, lock, timing window, and non-consumption. Consumption is idempotent. A personal VIP or hint cannot pause, reset, or extend the shared timer unless the VIP is explicitly modeled as a shared effect.

### `submit_movie_buff_answer(...)`

Checks the shared answer deadline server-side. Stale client countdowns do not extend eligibility.

### `leave_movie_buff_active_match(p_match_id, p_idempotency_key)`

Voluntary active-match leave must atomically:

- show a server-returned penalty before confirmation;
- apply the confirmed penalty exactly once;
- create an immutable abandonment event;
- deactivate membership;
- block rejoin/resume;
- schedule low-level Buster replacement at the next safe phase boundary.

Waiting-room leave has no penalty. Disconnect uses server-observed presence and reconnect grace before abandonment.

## Selector timeout and Buster

If `selector_deadline_at` expires:

- if the selector remains an active human, choose the first eligible tile in canonical board order and record `selection_source = timeout`;
- if the selector abandoned, activate low-level Buster/system selection after a short server-owned delay;
- never award Buster retroactive points;
- never grant Buster persistent human rewards, VIPs, ranking, or achievements;
- close the match when no humans remain.

## Client integration

The client should poll or subscribe to one canonical match view and render by phase. Reconnecting clients derive remaining time from server `now()` and canonical deadlines.

Remove normal-path controls and labels:

- `Start Round`
- `Continue to Clip Round`
- `Next Round`
- `Current live flow`

Required surfaces:

- synchronized Round N intro;
- private VIP selection/lock countdown;
- full cinematic PR #3 board shell;
- selector-only tile interaction;
- curtain/film-slate transition;
- synchronized playback and answer screen;
- synchronized results;
- automatic return to updated board;
- persistent game menu and explicit leave confirmation.

The used tile remains visible, disabled, desaturated, and stamped with Buster/film-slate `Scene Complete`. Other tiles in that category remain usable.

## Rive, Blender, and Figma boundary

- Figma remains the editable source for screen states, responsive layout, components, and prototype flow.
- Rive controls interactive Buster idle/select/stamp/replacement states, curtains, slate, countdown urgency, VIP armed/use, and Stay Bonus motion.
- Blender is limited to rendered opening, theater fly-through, hero Buster, and match-complete cinematics.
- Animation cannot mutate authoritative game state or delay a passed server deadline.
- Every animation requires reduced-motion and static-fallback behavior.

## Required tests

### VIP and phase privacy

- caller sees only own unconsumed VIP locks;
- another member cannot enumerate them;
- nonmember receives no match view;
- duplicate VIP lock/consume is idempotent;
- expired lock request is rejected;
- inactive client cannot stall phase advance.

### Board and clip assignment

- nonselector denied;
- cross-room tile denied;
- used tile denied;
- duplicate selection returns the original assignment;
- category/era/genre/difficulty/value constrain selection;
- rights/media null or contradiction fails closed;
- repeat gates remain enforced;
- selector timeout creates one deterministic selection;
- used tile receives permanent stamped state while category remains available.

### Playback and results

- every client receives the same `playback_starts_at`;
- clock-skewed clients calculate the same remaining time;
- reconnect joins the current phase/offset;
- hint and personal VIP do not reset the shared deadline;
- result transition happens once;
- scores, selector, and board refresh together;
- all active clients return automatically to the board.

### Leave and bot protection

- waiting-room leave has no penalty;
- confirmed active leave applies one penalty;
- abandoned player cannot rejoin;
- reconnect within grace applies no penalty;
- grace expiry applies one penalty;
- duplicate workers cannot double-charge;
- Buster activates at a safe boundary;
- selector abandonment cannot stall;
- Stay Bonus is capped and awarded once;
- bot/quit farming cannot alter persistent competitive rating.

## Rollout order

1. Reconcile schema and call sites against current PR #5 head.
2. Add additive migration and rollback SQL.
3. Add pgTAP tests for ownership, grants, RLS, phase transitions, privacy, idempotency, and race behavior.
4. Add route/persona tests for bearer-token identity, membership, selector authority, and cross-room isolation.
5. Integrate the PR #3 cinematic board shell without weakening PR #5 authorization.
6. Run lint, typecheck, targeted tests, build, and exact-SHA local Watchtower.
7. Rehearse against isolated staging and capture raw evidence.
8. Stop before merge, production deployment, or hosted migration until explicitly authorized.

## Stop conditions

Stop and classify NO-GO if any of the following remains true:

- browser-local time controls authoritative progression;
- each player can obtain a different playback start;
- VIP selections leak between players;
- a nonselector or nonmember can select a tile;
- service-role routes act before JWT/member/authority verification;
- thin pools relax rights/media/repeat gates;
- duplicate leave can charge twice;
- abandoned players can rejoin;
- a disconnected selector can stall the room;
- PR #3's full board is replaced by a reduced prototype;
- rollback or staging evidence is incomplete.
