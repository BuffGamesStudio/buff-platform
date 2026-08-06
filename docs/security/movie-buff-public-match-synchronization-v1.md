# Movie Buff Public Match Synchronization Contract v1

Date: 2026-08-04  
Scope: public matches only unless explicitly stated  
Status: implementation contract; no production deploy or hosted database mutation authorized

## Product decision captured from live testing

A public Movie Buff match is one synchronized show, not a set of independent client walkthroughs.

Once all required players are ready, the server owns the match timeline. Individual players must not be required to click **Start Round**, **Continue to Clip Round**, or any equivalent progression control. One slow, disconnected, or inactive client must not stall the room.

Private matches remain separately classified. Host-controlled pacing may remain available for private rooms, but it must not leak into public-match behavior.

## Confirmed current behavior to remove

The current public flow still contains client-driven progression points:

1. the waiting room auto-starts the room when all public players are ready;
2. every client is redirected to `/games/movie-buff/round-intro`;
3. the round-intro page requires each client to click **Start Round**;
4. that click navigates each client independently to `/games/movie-buff/board-preview`;
5. the board preview exposes **Continue to Clip Round** and a misleading **Current live flow** link;
6. clip entry and playback preparation contain client-triggered RPC calls, so phase entry and playback can occur at different wall-clock times per player.

This creates split-screen match state: players can be on different pages and can begin a round or clip at different times.

## Required public match state machine

Use one server-owned phase and one server-owned deadline per room/round.

Suggested phases:

- `waiting`
- `round_intro`
- `board_select`
- `board_transition`
- `clip_countdown`
- `clip_playing`
- `answer_lock`
- `round_results`
- `next_round_transition`
- `finished`

Minimum server-owned fields, either on the room, match, or round state:

- `phase`
- `phase_started_at`
- `phase_ends_at`
- `playback_starts_at`
- `answer_deadline_at`
- `selector_player_id`
- `selected_tile_id`
- `transition_version` or monotonic phase sequence

Do not compute authoritative phase changes from a client-local timer. Clients may animate locally, but must derive the target phase and deadlines from server timestamps.

## Required sequence

### 1. Ready and match start

When the minimum public player count is present and every active player is ready:

- atomically transition the room from `waiting` to `round_intro`;
- create or activate round 1;
- set a shared `phase_started_at` and `phase_ends_at`;
- all clients observe the same state and navigate/render accordingly.

Only one transition may win under concurrent readiness updates.

### 2. Round intro

Display the existing round information for a fixed shared duration.

Recommended initial duration: 4–6 seconds.

- no **Start Round** button in public matches;
- show a visible countdown or progress indicator;
- near the end, play the curtain-closing transition;
- when `phase_ends_at` is reached, the server-authoritative phase becomes `board_select`.

A reconnecting player computes the remaining intro time from `phase_ends_at`; it does not restart the intro.

### 3. Board selection

All players see the same board.

- only `selector_player_id` may choose an available tile;
- non-selectors see a clear waiting state, not disabled navigation confusion;
- selection is atomic and records the selected tile;
- selection has a server deadline so a disconnected selector cannot stall the room;
- if the selector times out, use a deterministic server fallback, such as the first eligible tile in canonical board order, and record the fallback reason;
- after selection, transition all clients to `board_transition`.

Recommended initial selection window: 8–12 seconds.

### 4. Board-to-clip transition

- show the chosen category/tile and a curtain or cinematic transition;
- no **Continue to Clip Round** button in public matches;
- set a shared `playback_starts_at` sufficiently in the future to allow clients to preload media;
- clients preload while the countdown runs;
- missing readiness from one client must not move the shared start time.

Recommended lead time before playback: 2–4 seconds.

### 5. Synchronized clip playback

Every client uses the same `playback_starts_at`.

- before the timestamp, media remains paused and the countdown is shown;
- at or after the timestamp, each client seeks to the expected elapsed position: `server_now - playback_starts_at`;
- late joiners and reconnecting clients catch up instead of starting from zero;
- the server sets one shared `answer_deadline_at`;
- browser autoplay failures display a recovery control, but using it must seek to the current shared position and must not restart or extend the round;
- one client must not be able to call a playback-start RPC that changes the shared start for everyone.

The answer clock, hint window, and VIP decision window all derive from the same shared deadline.

### 6. Personal hint/VIP choices

Players may independently use a hint or VIP benefit within the shared window.

- the choice affects only that player;
- it never pauses, delays, restarts, or extends the room timeline;
- authorization is derived from the authenticated actor and active membership;
- repeated/replayed benefit use is idempotently rejected.

### 7. Round completion and results

The round moves to results when either:

- every active player has reached a terminal answer state; or
- `answer_deadline_at` expires.

Disconnected players are treated as timed out after the shared deadline. They do not stall results.

Display results for a fixed shared duration, then automatically advance:

- `round_results` -> `next_round_transition` -> next `round_intro`; or
- `round_results` -> `finished` after the final round.

No host or individual **Next Round** click is required for public matches.

## Navigation and menu requirements

Every in-match public page must provide a consistent game menu or header containing:

- match status/round indicator;
- sound and accessibility controls where applicable;
- **Leave Match**;
- confirmation before leaving an active match;
- no ordinary **Back** action that leaves the browser in a stale active membership without calling the leave RPC.

Board-preview cleanup:

- remove **Current live flow**;
- remove **Continue to Clip Round** from the normal public path;
- **How to Play** may live inside the menu, but opening it must not disrupt the shared match state;
- if a recovery navigation control is retained, label it precisely, such as **Return to Match**, and route it from authoritative room phase rather than a hard-coded lobby/play URL.

## Server transition ownership

The implementation must not depend on an always-open browser to advance phases.

Preferred order of designs:

1. atomic database transition RPCs that compare current phase/version and server time;
2. trusted server route or scheduled worker that invokes the same transition primitive;
3. clients may opportunistically request a due transition, but the database decides whether it is due and exactly one request wins.

Client requests are triggers, not authority. A malicious or clock-skewed client cannot skip a phase, extend a deadline, or restart playback.

## Smallest additive implementation shape

### Database migration

Add the minimum shared phase/timestamp fields or a dedicated `movie_buff_match_phases` record. Add narrow transition RPCs such as:

- `advance_movie_buff_public_phase(p_room_id uuid, p_expected_version bigint)`
- `select_movie_buff_board_tile(...)` with selector, membership, deadline, and state guards
- a deterministic selector-timeout fallback path

Each definer function must:

- use a fixed safe `search_path` with schema-qualified objects;
- deny `PUBLIC` and `anon` execute;
- derive the actor from `auth.uid()` for player actions;
- use row locks or advisory locking for one-winner transitions;
- be replay-safe and return the current authoritative phase after a lost race.

### Application

Create one shared client hook/component that:

- loads authoritative phase state;
- subscribes to room/round changes;
- periodically reconciles against server time;
- routes or renders the correct phase;
- handles reconnect and stale tabs;
- never resets a shared countdown from local mount time.

Do not duplicate progression logic independently across waiting-room, round-intro, board-preview, play, and results pages.

### Visual preservation

Preserve the richer PR #3 board layout, categories, scoreboard, current-turn treatment, and cinematic visual hierarchy. Integrate the authenticated PR #5 API route and membership protections into that design. Do not replace the board with the reduced six-column prototype currently present on the security branch.

## Tests required before integration

### Multi-client

- three public players become ready concurrently and only one match-start transition occurs;
- all three observe the same phase version and deadlines;
- no player clicks a progression button;
- selector selection appears for all clients;
- all clients calculate the same playback start;
- answer deadline is identical for all players.

### Stall and reconnect

- one client closes during intro; remaining clients continue;
- selector disconnects; deterministic timeout fallback advances the match;
- client reconnects during clip and seeks to the correct elapsed point;
- client reconnects during results and does not replay the clip;
- inactive member cannot regain selector authority without active membership.

### Clock and race

- clients with +30 seconds and -30 seconds local clock skew still follow server deadlines;
- two clients race to advance a due phase and only one transition commits;
- duplicate/replayed transition requests are harmless;
- browser refresh does not restart intro, transition, playback, or answer time.

### Authorization

- anon and authenticated nonmember cannot read or advance the room phase;
- active non-selector cannot choose a tile;
- another room's player cannot read board/phase metadata;
- service-role routes verify the user actor before performing user-originated mutations.

### Navigation

- Leave Match removes active membership and routes to lobby;
- browser back/forward cannot silently create two active room memberships;
- misleading **Current live flow** label is absent;
- public flow contains no required **Start Round**, **Continue to Clip Round**, or **Next Round** button.

## Stop conditions

Stop integration if:

- the authoritative server timestamp cannot be read consistently by every client;
- phase transitions still require one designated browser to remain online;
- playback start can be reset by a client RPC;
- selector timeout has no deterministic fallback;
- PR #3 visual behavior is lost during security integration;
- public and private pacing rules are mixed without an explicit product rule;
- local tests pass but exact-SHA multi-client preview proof is unavailable.

## Acceptance contract

Public-match synchronization is complete only when an exact preview SHA demonstrates, with at least three authenticated clients:

1. all players ready;
2. match begins automatically;
3. round intro advances automatically;
4. board is shared and only the selector acts;
5. transition advances automatically;
6. clip starts from one shared server timestamp;
7. personal hint/VIP decisions do not pause the shared clock;
8. results appear on the same shared timeline;
9. the next round begins automatically;
10. disconnect, reconnect, stale tab, and selector-timeout cases do not stall or desynchronize the room.

Production remains NO-GO until the database migration, application integration, rollback, and exact-SHA multi-client evidence are reviewed and explicitly authorized.