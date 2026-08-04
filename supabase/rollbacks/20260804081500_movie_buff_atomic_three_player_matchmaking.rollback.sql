-- MOV-15 fail-closed containment packet.
--
-- This file intentionally does not guess or restore superseded pre-MOV-15
-- function bodies. Those definitions allowed unsafe admission behavior and are
-- not a trustworthy rollback target without an immutable verified backup.
--
-- The safe reversible action available here is containment: stop new browser
-- matchmaking, readiness changes, and match starts while preserving schema,
-- room/membership/match history, and service-role continuity for diagnosis.
--
-- Run only in an explicitly authorized database session after:
--   set movie_buff.allow_matchmaking_containment = 'on';

begin;

do $$
begin
  if coalesce(
    current_setting('movie_buff.allow_matchmaking_containment', true),
    'off'
  ) <> 'on' then
    raise exception
      'MOV-15 containment blocked: set movie_buff.allow_matchmaking_containment = on in this authorized session.';
  end if;
end;
$$;

revoke execute on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
  from authenticated;
revoke execute on function public.set_movie_buff_player_ready(uuid, boolean)
  from authenticated;
revoke execute on function public.start_movie_buff_match(uuid)
  from authenticated;

-- Keep anonymous/public denied explicitly.
revoke all on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
  from public, anon;
revoke all on function public.set_movie_buff_player_ready(uuid, boolean)
  from public, anon;
revoke all on function public.start_movie_buff_match(uuid)
  from public, anon;

-- Preserve trusted continuity for investigation and an explicitly reviewed
-- replacement migration. No browser role receives these grants.
grant execute on function public.find_or_create_movie_buff_public_room(uuid, text, integer, integer)
  to service_role;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean)
  to service_role;
grant execute on function public.start_movie_buff_match(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
