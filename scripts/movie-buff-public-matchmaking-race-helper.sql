-- MOV-15 local-only compatibility-lock contention helper.
--
-- Apply only to a disposable local Supabase database before running
-- scripts/movie-buff-public-matchmaking-race.mjs. The JavaScript harness refuses
-- any Supabase hostname other than localhost, 127.0.0.1, or ::1.
--
-- The production admission RPC serializes a compatibility cohort with the
-- transaction-scoped advisory key derived from public_matchmaking_key. This
-- helper deliberately holds that same key so the proof observes the actual
-- serialization boundary instead of an unrelated row lock.
--
-- Remove after the proof run with:
--   drop function if exists public.movie_buff_test_hold_waiting_room_lock(uuid, integer, text);

create or replace function public.movie_buff_test_hold_waiting_room_lock(
  p_room_id uuid,
  p_hold_milliseconds integer,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_compatibility_key text;
begin
  if p_confirmation is distinct from 'LOCAL_MATCHMAKING_LOCK_TEST' then
    raise exception 'Explicit local lock-test confirmation is required.';
  end if;

  if p_hold_milliseconds < 250 or p_hold_milliseconds > 5000 then
    raise exception 'Hold duration must be between 250 and 5000 milliseconds.';
  end if;

  select gr.public_matchmaking_key
  into v_compatibility_key
  from public.game_rooms as gr
  where gr.id = p_room_id
    and gr.room_type = 'public'
    and gr.status = 'waiting';

  if v_compatibility_key is null then
    raise exception 'Disposable public waiting room with compatibility key not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'movie-buff-public-compatibility|' || v_compatibility_key,
      0
    )
  );

  perform pg_catalog.pg_sleep(p_hold_milliseconds::double precision / 1000.0);
end;
$$;

alter function public.movie_buff_test_hold_waiting_room_lock(uuid, integer, text)
  owner to postgres;

revoke all on function public.movie_buff_test_hold_waiting_room_lock(uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.movie_buff_test_hold_waiting_room_lock(uuid, integer, text)
  to service_role;

comment on function public.movie_buff_test_hold_waiting_room_lock(uuid, integer, text)
  is 'MOV-15 disposable local-only helper for proving compatibility advisory-lock wait behavior; remove after evidence capture.';

notify pgrst, 'reload schema';
