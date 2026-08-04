# Movie Buff Authoritative Phase, VIP, Participant, and Leave Contract v1

Date: 2026-08-04
Status: authoritative product and integration decision for MOV-14 through MOV-19

This contract does not authorize merge, deployment, hosted migration, production mutation, or paid-resource creation.

## Core authority

One durable server-owned state row controls every active client. It contains the canonical match, room, round, phase, monotonic phase version, phase timestamps, selector seat, selected tile and clip, shared playback timestamp, answer deadline, results deadline, and terminal reason.

Every state-changing request supplies an expected phase version and idempotency key. Under one database transaction and row lock, exactly one transition wins. Stale or contradictory requests fail. A real match never falls back to demo or client-local replacement state.

## Phases and launch timing

Canonical phases:

1. `round_intro`
2. `vip_lock`
3. `board_select`
4. `transition`
5. `playback`
6. `answer`
7. `results`
8. terminal `finished`
9. terminal `abandoned`
10. fail-closed `blocked`

Versioned server launch configuration:

- round introduction: 4 seconds
- VIP lock: 15 seconds
- selector window: 20 seconds
- curtain/slate transition: 3 seconds
- playback: authoritative clip duration
- answer window: 15 seconds
- results: 8 seconds
- reconnect grace: 45 seconds
- abandoned-selector Buster takeover delay: 2 seconds

Missing or contradictory clip timing, rights, media, authorization, or state binding enters `blocked`; the browser may not invent a value or continue with preview data.

## Transition rules

- Match/round creation enters `round_intro`.
- `round_intro` advances at its deadline to `vip_lock` and opens the MOV-16 VIP window in the same transaction.
- `vip_lock` advances when all required humans lock an eligible VIP or explicit no-VIP pass, or at deadline after the server writes idempotent no-VIP passes for missing required humans.
- `board_select` advances only after one authorized atomic tile-to-clip assignment. Selector timeout performs one deterministic canonical-order selection. An abandoned selector uses Buster after the takeover delay.
- `transition` advances at shared `playback_starts_at`.
- `playback` advances at the authoritative clip end.
- `answer` advances when all currently required humans finalize or at deadline. Disconnection cannot extend it.
- `results` advances at `results_end_at` to board, next-round intro, or `finished`.
- No remaining reconnect-eligible human enters `abandoned` with no competitive rewards.

## Canonical route navigation

The caller-safe match view returns canonical phase, version, timestamps, and route target.

- `round_intro`, `vip_lock` → `/games/movie-buff/round-intro`
- `board_select` → `/games/movie-buff/board-preview`
- `transition`, `playback`, `answer` → `/games/movie-buff/play`
- `results` → `/games/movie-buff/round-results`
- `finished` → `/games/movie-buff/final-results`
- `abandoned`, `blocked` → server-reason containment surface

Clients derive time from server `now()`, ignore older phase versions, and replace routes only when the canonical target changes. Refresh, browser back, and reconnect must return to the canonical route. Network failure keeps the current surface with reconnect/error UI. Normal-path `Start Round`, `Continue to Clip Round`, `Current live flow`, and `Next Round` controls are prohibited. Animation callbacks never advance state.

## Match participants and controllers

Lobby membership is not active-match authority. Match start creates an authoritative participant/seat snapshot containing stable seat order, original human player where applicable, controller kind, participation state, reconnect deadline, abandonment reason, and replacement relationship.

Controller kinds:

- `human`: authenticated profile-backed controller
- `buster`: server-controlled replacement controller

Participation states:

- `active`
- `reconnect_grace`
- `abandoned`
- `completed`

The `system` is a trusted non-seat actor for deadlines, transitions, auto-passes, timeout selection, disconnect finalization, and Buster decisions.

An active human is a real authenticated match seat whose controller is human, whose state is active or unexpired reconnect grace, whose match/room binding is current, and which has no abandonment event. `room_players.left_at is null` alone is not sufficient.

Buster is not a fake user profile. Buster never owns or locks VIPs, never counts toward required-human completion, may inherit future selector turns, acts only through trusted low-difficulty server execution, and receives no persistent human rewards, rating, achievements, inventory, Stay Bonus, or retroactive points.

The system is never a participant or selector and cannot receive rewards.

Selector rotation runs over active seats, including Buster-controlled replacement seats.

## MOV-16 and MOV-17 VIP integration

MOV-16 owns VIP definitions, inventory, eligibility, private locks, private caller views, and consumption.

MOV-17 owns round/phase timing, participant classification, required-human snapshots, phase advance, and activation-phase handoff.

The `round_intro` → `vip_lock` transaction must verify expected phase version, bind the round, derive the required-human set from match participants, open the MOV-16 window with the exact deadline, persist the auditable required-human snapshot, enter `vip_lock`, and increment phase version.

A valid lock is an eligible owned VIP or explicit `vip_id = null` pass. Both count. Identical replays return the original record; contradictory choices fail.

Deadline expiry creates server no-VIP pass records and consumes no inventory. Abandonment releases the human from the required set; Buster never receives a VIP. Reconnect before abandonment preserves the requirement, lock, and deadline.

MOV-16 must not count Buster/system or raw non-left lobby memberships. MOV-17 sets the MOV-16 activation phase at each canonical phase entry. Personal effects cannot reset or extend shared deadlines unless explicitly modeled as shared server effects.

## Active-match leave authority

The browser may request leave, but only the server may quote, confirm, finalize, penalize, abandon, release phase requirements, block rejoin, or schedule Buster.

### Waiting room

Waiting-room leave is immediate, penalty-free, deactivates membership atomically, permits joining another room, and creates no Buster. This remains lobby/MOV-15 behavior.

### Voluntary active leave

Two-step flow:

1. `get_movie_buff_active_leave_quote` returns server penalty, policy version, match/seat binding, phase version, expiration, and opaque token.
2. `confirm_movie_buff_active_leave` accepts the token and idempotency key.

The confirm transaction verifies caller and quote, applies the configured penalty exactly once through an immutable ledger, writes an immutable abandonment event, sets the seat to abandoned, ends reconnect eligibility, blocks rejoin/resume, releases current required-human sets, schedules Buster at a safe boundary, and closes the match as abandoned when no humans remain.

The numeric penalty is versioned server configuration, not a component constant. Missing policy fails closed with no charge and no abandonment. The Figma 250-point example is not authoritative by itself.

### Disconnect

Connection loss enters `reconnect_grace` for 45 seconds without penalty. Reconnect restores the same seat, phase, deadlines, VIP lock, and score. A trusted worker finalizes grace expiry once, applying the configured disconnect-abandonment penalty, writing the event, releasing required sets, blocking rejoin, and scheduling Buster. Duplicate workers cannot double-charge.

### Safe Buster boundaries

- During intro/VIP: release the human immediately; Buster controls the seat on entry to board select.
- During board select: abandoned selector triggers deterministic Buster selection after 2 seconds; nonselector takeover does not interrupt the current selector.
- During transition/playback/answer: preserve clip and timer; activate Buster at the next results/board boundary.
- During results: activate before the next board/round transition.

Moderation removal and system fault are separate reasons and do not automatically use the voluntary penalty unless policy explicitly says so.

## Lane ownership

- MOV-16 amends required-human logic and behavioral tests while retaining private VIP authority.
- MOV-17 implements participant/seat state, phase/navigation, VIP handshake, active leave, grace, and Buster safe-boundary behavior.
- MOV-18 renders canonical phase, quote, reconnect, and Buster states only; motion cannot mutate gameplay.
- MOV-19 independently tests classification, privacy, stale versions, races, grace, duplicate penalties, selector abandonment, and no-human termination.

## Acceptance evidence

Exact-SHA evidence must prove three-client agreement; canonical refresh/back navigation; no manual progression; Buster/system exclusion from required-human counts; explicit pass and deadline auto-pass; abandonment during VIP without stall; at-most-once leave/disconnect charge; penalty-free reconnect within grace; rejoin denial after abandonment; safe-boundary Buster takeover; no-human no-reward termination; and MOV-19 authorization, RLS, search-path, rollback, staging, and hosted-state requirements.

Until executable evidence exists, release classification remains **NO-GO / validation pending**.
