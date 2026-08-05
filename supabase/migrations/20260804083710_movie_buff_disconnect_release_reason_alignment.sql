-- MOV-17 additive repair: canonicalize the semantically identical
-- disconnect-grace expiry release reason at the MOV-17 -> MOV-16 boundary.
--
-- The public abandonment policy/audit reason remains
-- `disconnect_grace_expired`. Only the immutable MOV-16 required-player
-- snapshot release uses its existing canonical reason
-- `reconnect_grace_expired`, so identical replay remains idempotent while
-- unrelated contradictory reasons still fail closed.

create or replace function public.movie_buff_phase_release_vip_participant(
  p_room_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_release_reason text;
begin
  if v_reason = '' then
    raise exception 'Release reason is required.';
  end if;

  v_release_reason := case v_reason
    when 'disconnect_grace_expired' then 'reconnect_grace_expired'
    else v_reason
  end;

  if to_regprocedure(
    'public.release_movie_buff_vip_required_player(uuid,uuid,uuid,text)'
  ) is null then
    return;
  end if;

  begin
    execute 'select public.release_movie_buff_vip_required_player($1,$2,$3,$4)'
      using p_room_id, p_round_id, p_player_id, v_release_reason;
  exception
    when others then
      if sqlerrm not ilike '%snapshot entry not found%' then
        raise;
      end if;
  end;
end;
$$;

alter function public.movie_buff_phase_release_vip_participant(
  uuid, uuid, uuid, text
) owner to postgres;

revoke all on function public.movie_buff_phase_release_vip_participant(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.movie_buff_phase_release_vip_participant(
  uuid, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';
