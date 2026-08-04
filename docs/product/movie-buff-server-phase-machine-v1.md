# Movie Buff server-owned phase machine v1

Linear owner: MOV-17

## Goal

One authoritative match timeline is observed by every room member:

`round_intro → vip_selection → board → board_transition → clip_ready → clip_playback → answer → results → board|match_complete`

No browser, host, selector, animation callback, or local timer may advance the shared phase.

## Authority model

The database stores one phase row per active match. Every phase transition:

- locks the phase row;
- verifies the expected phase and monotonically increasing version;
- verifies the room/match/round relationship;
- verifies completion/deadline predicates;
- records server timestamps;
- writes one transition event;
- is idempotent for the same expected version and transition key;
- rejects contradictory or stale requests.

Clients may request a read-only tick, but the server decides whether time and completion predicates permit transition.

## Public/private start boundary

MOV-15 owns public admission and strict-three readiness. MOV-17 begins only after an authoritative match exists. It must not weaken the three-player public start predicate.

Private start behavior remains host-authorized until a separate product rule changes it.

## VIP boundary

MOV-16 owns private inventory, locks, deadlines, and activation. MOV-17 opens the VIP window and sets activation phases through service-only calls. VIP `advanceReady` is a predicate consumed by the phase machine; it is not permission for a client route change.

Missing VIP model/window fails closed. No placeholder inventory is invented.

## Board boundary

PR #3 is the visual baseline. PR #5 is the authorization baseline.

Board creation, tile selection, selector verification, clip resolution, and event insertion must be atomic and idempotent. Real-room failures return errors; they never return demo board data or HTTP-200 fallback state.

## Playback boundary

The active round has one shared `playback_started_at` and one shared answer deadline. Per-player media-ready state may be collected, but no caller writes a private playback start timestamp.

Reconnect derives current position from server time and the shared timestamp.

## Results and selector rotation

Results open only after the authoritative answer deadline or explicit all-complete predicate. The next selector is derived once and persisted. A completed round returns to board for the next round or enters `match_complete`.

## Phase view

Authenticated active members may read a caller-safe phase view containing:

- room, match, and round IDs;
- phase and version;
- phase start/deadline timestamps;
- selector ID;
- selected tile and clip identifiers when disclosure is allowed;
- shared playback timestamp;
- reconnect position metadata;
- transition readiness without private VIP choices or hidden answers.

## Security

All SECURITY DEFINER functions use `search_path = pg_catalog`, fully qualified objects, owner `postgres`, no PUBLIC/anon execute, and minimum authenticated/service-role grants. Browser entry points derive identity from verified bearer authentication and preserve active membership checks.

## Idempotency

Every mutation carries an idempotency/transition key. Identical replay returns the persisted transition. A different requested outcome for the same key or stale expected version fails.

## Client behavior

Shared pages render the phase view and navigate only when the persisted phase changes. They may show local countdown interpolation from server timestamps, but local countdown completion cannot advance state.

Manual controls such as `Start Round`, `Continue to Clip Round`, `Current live flow`, host `Next Round`, and `Waiting for host to click` are removed from shared flow.

## Evidence classification

Implementation presence is not runtime proof. Acceptance requires exact-SHA database concurrency tests, route personas, three-client phase/timestamp agreement, reconnect, duplicate/stale transition tests, lint, TypeScript, build, and rollback evidence. Until executed, those results are UNKNOWN.
