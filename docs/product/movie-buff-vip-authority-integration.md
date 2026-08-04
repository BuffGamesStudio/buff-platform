# MOV-16 VIP authority integration contract

This file records the narrow integration dependency between MOV-16 and the server-owned phase machine without changing shared phase files.

## Fail-closed model

- The MOV-16 migration seeds no VIP definitions or inventory.
- An absent `movie_buff_vip_round_windows` row returns `status = unavailable` and an empty inventory.
- Inventory is granted only by explicit trusted server/admin operations outside browser authority.
- The browser cannot open or extend a VIP deadline.

## MOV-17 calls

At the authoritative Round Intro boundary, a trusted service-role transaction calls:

```sql
select public.open_movie_buff_vip_round_window(
  p_room_id,
  p_match_id,
  p_round_id,
  p_deadline_at
);
```

The function snapshots the current active-human count and preserves the original deadline on identical retries. A contradictory retry fails.

Before a locked VIP can be activated, the shared phase machine calls:

```sql
select public.set_movie_buff_vip_activation_phase(
  p_room_id,
  p_round_id,
  p_activation_phase
);
```

The activation RPC fails closed while this phase is null or does not match the VIP definition.

The shared phase machine may advance when the private view reports `advanceReady = true`. This becomes true when the server deadline closes or all snapshotted required players have locked. A disconnected client cannot extend the deadline.

## Privacy boundary

No VIP table is browser-readable. Authenticated callers receive only their own inventory and lock through `get_movie_buff_vip_round_view`; other players are represented only by aggregate lock counts.

## Consumption boundary

Locking does not decrement inventory. `activate_movie_buff_round_vip` decrements one unit and inserts a unique consumption row in one transaction. Replayed activation for the same lock returns the existing consumption without decrementing again.
