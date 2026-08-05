-- MOV-15 data-preserving containment for the admission-to-phase handoff.
--
-- The preceding MOV-15 start implementation selected clips and started the
-- shared timeline, so restoring it would cross the MOV-17 authority boundary.
-- This rollback therefore disables browser match starts without deleting or
-- rewriting rooms, memberships, matches, rounds, actions, events, or scores.
--
-- Run only in an explicitly authorized database session after:
--   set movie_buff.allow_admission_handoff_containment = 'on';

begin;

do $$
begin
  if coalesce(
    current_setting(
      'movie_buff.allow_admission_handoff_containment',
      true
    ),
    'off'
  ) <> 'on' then
    raise exception
      'MOV-15 handoff containment blocked: set movie_buff.allow_admission_handoff_containment = on in this authorized session.';
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
    'Movie Buff match start is contained until the MOV-17 authoritative handoff is restored.';
end;
$$;

alter function public.start_movie_buff_match(uuid) owner to postgres;

revoke all on function public.start_movie_buff_match(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.start_movie_buff_match(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
