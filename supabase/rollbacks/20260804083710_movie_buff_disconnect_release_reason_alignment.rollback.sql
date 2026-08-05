-- Data-preserving containment rollback for MOV-17 disconnect release alignment.
--
-- Reverting the canonical alias after a required-player snapshot has already
-- been released as `reconnect_grace_expired` would reintroduce the exact
-- contradictory-reason transaction abort this migration repairs. Containment
-- therefore preserves the adapter and only reasserts its internal-only ACL.

do $$
begin
  if coalesce(
    pg_catalog.current_setting(
      'movie_buff.allow_disconnect_release_alignment_containment',
      true
    ),
    ''
  ) <> 'on' then
    raise exception
      'Set movie_buff.allow_disconnect_release_alignment_containment=on to apply containment.';
  end if;
end;
$$;

revoke all on function public.movie_buff_phase_release_vip_participant(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.movie_buff_phase_release_vip_participant(
  uuid, uuid, uuid, text
) to service_role;

-- Preserve the canonical alias and all immutable MOV-16 snapshot history.
-- Do not rewrite release_reason values or weaken contradictory-reason checks.

notify pgrst, 'reload schema';
