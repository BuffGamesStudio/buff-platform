# Movie Buff server-owned phase machine v1

Linear owner: MOV-17

Authoritative source: `docs/product/movie-buff-authoritative-phase-vip-participant-leave-v1.md`.

This file is the implementation summary. If it conflicts with the authoritative source, the authoritative source wins.

## Canonical graph

`round_intro → vip_lock → board_select → transition → playback → answer → results → board_select|round_intro|finished`

Terminal containment states are `abandoned` and `blocked`.

No browser, host, selector, animation callback, local timer, browser history action, or visual completion event may advance the shared phase.

## Authority model

The database stores one phase row per match. Every transition:

- locks the phase row;
- verifies expected phase version;
- verifies room, match, round, participant, selector, tile, and clip bindings;
- verifies completion or deadline predicates;
- writes canonical server timestamps and one transition event;
- is idempotent for the same version and key;
- rejects stale or contradictory requests;
- fails closed to `blocked` when an invariant cannot be satisfied.

Clients call one caller-safe match view and may race to request an advance. The server decides whether advancement is legal.

## Timing

Launch timing is versioned server configuration:

- 4-second `round_intro`
- 15-second `vip_lock`
- 20-second selector deadline
- 3-second `transition`
- clip-derived `playback`
- 15-second `answer`
- 8-second `results`
- 45-second reconnect grace
- 2-second abandoned-selector Buster delay

Components may interpolate countdowns from server `now()`, but local countdown completion cannot advance the match.

## Start boundary

MOV-15 owns public admission, strict-three readiness, and waiting-room leave. MOV-17 begins only after an authoritative match and match-participant snapshot exist. MOV-17 must not weaken the public three-human start predicate.

## Participant boundary

Lobby `room_players` membership is not enough to classify an active-match human.

The match participant/seat snapshot records stable seat order, original human, controller kind (`human` or `buster`), state (`active`, `reconnect_grace`, `abandoned`, `completed`), reconnect deadline, abandonment reason, and replacement relationship.

The system is a trusted non-seat actor. Buster is a controller, not a fake profile. Buster/system never count toward required-human VIP or answer completion.

## VIP boundary

MOV-16 owns inventory, eligibility, private locks, caller-private views, and consumption. MOV-17 owns the 15-second phase deadline, required-human snapshot, atomic window opening, deadline auto-passes, abandonment release, closure, and activation-phase handshake.

A VIP lock may contain an eligible VIP or explicit no-VIP pass. Deadline expiry writes idempotent no-VIP pass records. Buster never owns or locks a VIP.

Missing VIP model/window fails closed. A client cannot open, extend, close, or navigate from the VIP window by itself.

## Board and playback boundary

PR #3 is the visual baseline. PR #5 is the authorization baseline.

Board creation, selector verification, tile lock, clip resolution, and transition must be atomic and idempotent. Real-room failures never return demo board data.

The active round has one shared playback start, playback end, answer deadline, and results deadline. Reconnect derives the current offset from server time.

## Leave and Buster boundary

Waiting-room leave is penalty-free and MOV-15-owned.

Active leave is MOV-17-owned and uses a server quote followed by idempotent confirmation. Confirmation atomically applies the versioned penalty once, writes abandonment, blocks rejoin, releases required-human sets, and schedules Buster at a safe boundary.

Disconnect enters 45-second reconnect grace. Reconnect before expiry restores the same seat and state without penalty. Trusted expiry finalization is idempotent and cannot double-charge.

Buster takeover never changes an assigned clip or shared timer. An abandoned selector receives deterministic Buster selection after the 2-second delay. No remaining human closes the match as `abandoned` without competitive rewards.

## Canonical routes

- intro/VIP → `/games/movie-buff/round-intro`
- board → `/games/movie-buff/board-preview`
- transition/playback/answer → `/games/movie-buff/play`
- results → `/games/movie-buff/round-results`
- finished → `/games/movie-buff/final-results`
- abandoned/blocked → `/games/movie-buff/match-status`

Clients replace routes only when the persisted canonical target changes and ignore older phase versions.

Manual controls such as `Start Round`, `Continue to Clip Round`, `Current live flow`, `Next Round`, and `Waiting for host to click` are prohibited.

## Security and evidence

All definer functions use owner `postgres`, `search_path = pg_catalog`, fully qualified objects, no PUBLIC/anon execute, and minimum grants. Browser routes verify bearer identity and active match authority before service-role mutation.

Implementation presence is not runtime proof. Exact-SHA concurrency, route persona, three-client, reconnect, stale-version, duplicate-leave, Buster, lint, TypeScript, build, rollback, staging, and hosted evidence remain UNKNOWN until actually executed.
