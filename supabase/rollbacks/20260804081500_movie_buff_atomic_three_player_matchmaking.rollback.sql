-- MOV-15 fail-closed containment rollback.
--
-- This rollback intentionally DOES NOT restore the prior public matchmaking
-- definitions because those definitions permit two-player starts, caller-owned
-- capacity, mutable search paths, broad execution, and SKIP LOCKED divergence.
-- Applying this file disables public matchmaking until an explicitly reviewed
-- replacement migration is applied.
--
-- Execute only with explicit environment-specific rollback authorization.

begin;

lock table public.game_rooms in share row exclusive mode;
lock table public.room_players in share row exclusive mode;

-- Do not remove the strict-three schema boundary while any open public match can
-- still depend on it. Operators must first drain or contain those rooms under an
-- approved incident plan.
do $$
begin
  if exists (
    select 1
    from public.game_rooms gr
    where gr.room_type = 'public'
      and gr.status in ('waiting', 'starting', 'active')
  ) then
    raise exception
      'MOV-15 rollback blocked: open public Movie Buff rooms still exist.';
  end if;
end;
$$;

-- Fail closed: browser callers cannot create, join, ready, or start public rooms
-- after containment. Service-role access is also removed until a replacement is
-- explicitly authorized.
revoke all on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.set_movie_buff_player_ready(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.start_movie_buff_match(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_movie_buff_strict_three_ready(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_public_compatibility_key(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_public_match_size()
  from public, anon, authenticated, service_role;

-- Remove only MOV-15-owned schema objects after the open-room guard passes.
drop index if exists public.game_rooms_one_public_waiting_compatibility_key_idx;

alter table public.game_rooms
  drop constraint if exists movie_buff_public_waiting_room_key_required;

alter table public.game_rooms
  drop column if exists public_matchmaking_key;

drop function if exists public.assert_movie_buff_strict_three_ready(uuid);
drop function if exists public.movie_buff_public_compatibility_key(uuid, text, integer);
drop function if exists public.movie_buff_public_match_size();

-- The three replaced public RPCs remain installed but inaccessible. This avoids
-- silently reviving the known-unsafe predecessors and preserves an auditable,
-- fail-closed incident state.

notify pgrst, 'reload schema';

commit;
