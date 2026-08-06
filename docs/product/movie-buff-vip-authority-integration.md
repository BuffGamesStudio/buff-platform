# MOV-16 VIP authority integration contract

This file records the narrow service-only dependency between MOV-16 and the MOV-17 server-owned phase machine. MOV-16 owns private VIP definitions, inventory, eligibility, locks, caller-private views, activation, consumption, window closure, deadline no-VIP records, and participant release from the required set. MOV-17 owns canonical phase timing, the exact human-seat snapshot, shared navigation, abandonment timing, and activation-phase handoff.

## Fail-closed model

- The MOV-16 migrations seed no VIP definitions or inventory.
- An absent `movie_buff_vip_round_windows` row returns unavailable caller state and cannot authorize phase advance.
- Inventory is granted only by explicit trusted operations outside browser authority.
- The browser cannot open, extend, finalize, release participants from, or select the deadline for a VIP window.
- `advanceReady` is a VIP condition only. It never chooses a route and never calls MOV-17 phase advance.

## MOV-17 service-only calls

### 1. Open the immutable VIP window

During the authoritative `round_intro -> vip_lock` transaction, MOV-17 supplies the exact required-human seat identities and the server-owned deadline:

```sql
select public.open_movie_buff_vip_round_window(
  p_room_id,
  p_match_id,
  p_round_id,
  p_deadline_at,
  p_required_player_ids
);
```

`p_required_player_ids` must contain each active or reconnect-grace human seat exactly once. Buster and system actors are excluded. The four-argument count-derived overload intentionally raises and must not be used. Identical calls return the same window; contradictory room, match, deadline, or identity snapshots fail closed.

### 2. Finalize the VIP deadline before board selection

Before MOV-17 commits `vip_lock -> board_select`, it calls:

```sql
select public.finalize_movie_buff_vip_round_window(
  p_room_id,
  p_round_id,
  p_deadline_at
);
```

The supplied deadline must exactly match the persisted window. Before the deadline, an incomplete window returns `advanceReady = false`. At or after the deadline, the finalizer atomically writes one explicit `vip_id = null` and `inventory_id = null` pass lock for every missing unreleased required human, consumes no inventory, closes the window, and returns stable aggregate state with `advanceReady = true`. Identical and concurrent retries are idempotent. Contradictory deadlines fail closed.

MOV-17 must not advance unless the returned object reports `advanceReady = true`.

### 3. Release an abandoned required human

When MOV-17 makes an authoritative abandonment decision, it calls:

```sql
select public.release_movie_buff_vip_required_player(
  p_room_id,
  p_round_id,
  p_player_id,
  p_release_reason
);
```

The same reason is idempotent. A contradictory reason fails. A reconnect-grace expiry before a window exists is a safe unavailable no-op. Released identities and their prior locks do not contribute to readiness or receive deadline pass records.

### 4. Set the canonical activation phase

On entry to each supported activation phase, MOV-17 calls:

```sql
select public.set_movie_buff_vip_activation_phase(
  p_room_id,
  p_round_id,
  p_activation_phase
);
```

The activation RPC revalidates current membership, unreleased participant state, definition, inventory, context, eligibility, quantity, expiration, cooldown, and exact activation phase before one exactly-once decrement.

## Privacy boundary

No VIP table is browser-readable. Authenticated callers receive only their own inventory and lock through `get_movie_buff_vip_round_view`; other participants are represented only by aggregate lock progress. Caller-supplied player IDs, inventory quantities, and ownership values have no authority.

## Navigation boundary

Round Intro consumes only MOV-17 `/api/movie-buff/match/view`. Missing MOV-17 route state means remain on Round Intro. Stale phase versions, unknown phases, and contradictory phase/route pairs fail closed. MOV-16 never calls `/api/movie-buff/match/advance`.

## Rollback classification

- `20260804073300_movie_buff_vip_deadline_finalize.rollback.sql` removes only the finalizer function and preserves all data.
- The main MOV-16 drop-all rollback remains destructive after durable VIP data exists and is guarded for explicitly authorized disposable targets only.

## Evidence status

Repository source and test artifacts do not prove database execution. SQL apply, pgTAP, concurrency, persona privacy, exact-once consumption, MOV-17 compatibility, browser behavior, and rollback rehearsal remain **UNKNOWN** until exact-SHA executable output is independently reviewed by MOV-19.
