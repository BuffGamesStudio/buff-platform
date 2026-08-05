-- MOV-17 data-preserving containment for authoritative match start.
--
-- This packet does not restore legacy host/browser clip selection or local
-- round timing. It disables new match starts while preserving all durable room,
-- membership, match, round, phase, action, event, answer, and score data.
--
-- Run only in an explicitly authorized database session after:
--   set movie_buff.allow_match_start_containment = 'on';

begin;

do $$
begin
  if coalesce(
    current_setting('movie_buff.allow_match_start_containment', true),
    'off'
  ) <> 'on' then
    raise exception
      'MOV-17 match-start containment blocked: set movie_buff.allow_match_start_containment = on in this authorized session.';
  end if;
end;
$$;

create or replace function public.start_movie_buff_match(
  p_room_id uuid
)
returns table (
  created_match_id uuid,
  created_round_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform p_room_id;
  raise exception
    'Movie Buff match start is contained pending restoration of the authoritative MOV-17 handoff.';
end;
$$;

alter function public.start_movie_buff_match(uuid) owner to postgres;

revoke all on function public.start_movie_buff_match(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_movie_buff_match_from_admission(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
