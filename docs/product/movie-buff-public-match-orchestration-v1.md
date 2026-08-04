# Movie Buff Public Match Orchestration and Leaver Penalty v1

Date: 2026-08-04
Status: implementation contract; no merge, deployment, or hosted migration authorized
Canonical integration target: PR #5 draft branch

## 1. Product decision

A public Movie Buff match is one synchronized show. After all active players are ready, no player should need to click **Start Round**, **Continue to Clip Round**, or **Next Round**. The server owns the phase, deadlines, and playback timestamp for the whole room.

Private matches may retain host controls where explicitly desired, but all active-match timing and leaver penalties remain server-authoritative.

## 2. Confirmed current behavior and gaps

Fresh hosted inspection confirms:

- `start_movie_buff_match` creates round 1 with `started_at = now()` and marks the room active immediately.
- `advance_movie_buff_round` is host-only and also sets the next round `started_at = now()`.
- `enter_movie_buff_round` creates a per-player playback row but does not advance a shared phase.
- `start_movie_buff_round_playback` writes `playback_started_at = now()` per player, so each browser can start at a different time.
- `leave_movie_buff_room` marks `left_at`, records `player_left`, and can cancel an empty room, but it applies no point penalty and has no reconnect grace state.
- `touch_movie_buff_room_presence` updates `last_seen_at`, so the existing presence model can support grace-period detection.
- The current round-intro and board-preview pages expose manual progression buttons and misleading lobby navigation.

These facts mean public matches are presently client-driven at multiple points and cannot guarantee synchronized playback.

## 3. Required public-match phase model

Add a server-owned phase model. The smallest durable form is to extend the active match or current round with:

- `phase`: `intro | board | transition | playback | answer | results | finished`
- `phase_started_at timestamptz`
- `phase_ends_at timestamptz`
- `playback_starts_at timestamptz`
- `selector_deadline_at timestamptz`
- `results_end_at timestamptz`
- `phase_version bigint` or equivalent monotonic revision

The authoritative flow is:

1. all active players ready;
2. atomic match start;
3. timed intro;
4. curtain/transition;
5. shared board phase;
6. selector chooses one valid tile, or server fallback chooses at deadline;
7. clip preloading window;
8. one shared `playback_starts_at` timestamp;
9. answer/hint/VIP deadline;
10. timed results;
11. automatic next round or final results.

No individual client action may pause or extend the shared timeline.

## 4. Orchestration rules

### 4.1 Match start

For public rooms, any active member may race to invoke an idempotent start RPC after all active members are ready. The RPC must lock the room, create the match and first round once, initialize the first phase timestamps once, and return the canonical phase state.

### 4.2 Intro and transition

The intro page becomes a passive synchronized screen with a countdown derived from server time. At `phase_ends_at`, every client navigates to the next phase. A curtain-close animation is visual only and must not be trusted as the clock.

### 4.3 Board phase

All players see the same board. Only `selector_player_id` may select. Selection must be atomic and idempotent. If no valid selection occurs by `selector_deadline_at`, the server selects a valid remaining tile deterministically and records `selection_source = timeout`.

### 4.4 Playback

The server sets one `playback_starts_at` in the future after the clip is resolved. Every client preloads and seeks against that timestamp. Late or reconnecting clients compute their playback offset from server time and join in progress. A slow client never delays the room.

Per-player playback rows remain useful for telemetry and readiness, but they must not define the room's canonical playback start.

### 4.5 Answers, hints, and VIP actions

All answer, hint, and VIP eligibility is checked against the shared answer deadline. An individual player's choice cannot stop or extend the room clock. Server-side validation must reject late submissions even when the browser displays stale time.

### 4.6 Results and next round

Results are shown until `results_end_at`. The next phase transition is server-owned and idempotent. Public matches do not expose a normal Next Round control.

## 5. Failure and reconnection behavior

- A disconnected player does not stall the room.
- Reconnecting clients load the canonical phase and remaining time.
- If the selector disconnects, the selector deadline still expires and fallback selection proceeds.
- Every phase transition is idempotent and safe under multiple clients racing.
- Server timestamps are authoritative; client clocks are presentation-only.
- Stale phase versions are rejected to prevent replay or double advancement.

## 6. Active-match menu and navigation

Every active-match page must expose a consistent game menu:

- Resume Game
- How to Play
- Sound/accessibility controls
- Leave Match

Replace `Current live flow` with explicit navigation. Do not send an active player to the lobby without performing a leave action. `Continue to Clip Round` and `Start Round` are removed from the normal public-match path.

The Leave Match confirmation must display the current penalty before confirmation.

## 7. Leaver penalty contract

### 7.1 Scope

Leaving any active public or private match costs points. Leaving a waiting room before the match starts does not.

### 7.2 Server authority and idempotency

The penalty must be applied in one server transaction and exactly once per player/match abandonment. Use a durable row or unique event key such as:

`match_abandonment:{match_id}:{player_id}`

Required fields:

- `match_id`
- `room_id`
- `player_id`
- `reason`
- `detected_at`
- `grace_expires_at`
- `penalty_points`
- `penalty_status`
- `idempotency_key`
- `applied_at`

### 7.3 Voluntary leave

An explicit Leave Match action may apply the penalty immediately after confirmation. The transaction must lock the relevant player state, insert the abandonment record, apply the point deduction once, mark the room membership inactive, and record an immutable event.

### 7.4 Disconnect grace

Closing the tab, losing power, or losing network starts a reconnect grace period rather than an immediate penalty. Presence is derived from server-observed heartbeats using `last_seen_at`.

If the player reconnects before `grace_expires_at`, clear the pending abandonment and apply no penalty. If the grace expires while the match remains active, mark the abandonment and apply the penalty once.

Refreshing or navigating within the match must not create a penalty.

### 7.5 Escalation

The initial penalty and repeated-abandon escalation must be configurable. Recommended provisional values for testing only:

- first abandonment in a rolling window: 250 ranking points;
- repeated abandonment: increasing tiers;
- no balance below zero unless product explicitly approves negative balances.

Final amounts and rolling-window rules are human-owned product decisions.

## 8. Security constraints

- Never accept penalty amount, player ID, phase, or timestamps from the browser as authoritative.
- Service-role routes must verify the user's token and active membership before acting.
- Remove `PUBLIC` and `anon` execute from state-changing definer RPCs.
- Fix mutable `search_path` and schema-qualify all referenced objects.
- Do not let a player penalize another player or forge disconnect status.
- Do not expose hidden board state to nonmembers.

## 9. Required tests

### Synchronization

- three clients observe the same phase and deadlines;
- only selector can choose;
- selector timeout produces one fallback selection;
- playback start timestamp is identical for all players;
- reconnect joins at correct phase and playback offset;
- clock-skewed clients cannot gain time;
- duplicate transition requests produce one transition;
- one disconnected client does not stall the match.

### Navigation

- public match has no normal Start Round, Continue, or Next Round requirement;
- menu is present on intro, board, playback, and results;
- active Back action opens menu or confirms leave rather than silently navigating;
- misleading `Current live flow` label is removed.

### Leaver penalties

- waiting-room leave: no penalty;
- explicit active-match leave: one penalty;
- refresh/navigation within match: no penalty;
- disconnect then reconnect within grace: no penalty;
- disconnect beyond grace: one penalty;
- duplicate workers/events: still one penalty;
- repeated abandon uses configured escalation;
- player cannot target another player;
- match completion never triggers abandonment penalty.

## 10. Rollout and stop conditions

1. Reconcile PR #3 visual shell with PR #5 authorization changes; preserve the richer board UI.
2. Add schema and RPC changes in additive migrations.
3. Add route/client phase synchronization without production deployment.
4. Validate locally and in isolated staging with at least three clients.
5. Run exact-SHA Watchtower journey and adversarial personas.
6. Stop before production migration, merge, or deployment without explicit authorization.

Stop immediately if:

- phase ownership remains client-controlled;
- playback timestamps differ per player;
- a disconnected selector can stall the room;
- duplicate penalty application is possible;
- a refresh is classified as abandonment;
- PR #3's richer design is replaced by the reduced prototype UI;
- rollback and evidence capture are incomplete.
