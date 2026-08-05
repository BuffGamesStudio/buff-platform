-- MOV-17 successor preflight for the policy-backed abandonment repair.
--
-- The successor adds mandatory immutable policy/penalty identity for every new
-- abandonment. Existing abandoned seats cannot be assigned a fabricated policy
-- or penalty during migration. Stop before schema mutation so an operator can
-- inventory and explicitly reconcile them under an approved backfill plan.

do $$
declare
  v_abandoned_count bigint;
begin
  if pg_catalog.to_regclass(
    'public.movie_buff_match_participant_seats'
  ) is null then
    raise exception 'MOV-17 participant-seat state is unavailable.';
  end if;

  select count(*)
  into v_abandoned_count
  from public.movie_buff_match_participant_seats as seat
  where seat.participant_state = 'abandoned';

  if v_abandoned_count <> 0 then
    raise exception using
      message = pg_catalog.format(
        'Movie Buff leave-authority preflight found %s existing abandoned seat(s). Stop and reconcile them with an approved immutable policy/penalty backfill before applying 20260805194500.',
        v_abandoned_count
      ),
      errcode = 'check_violation';
  end if;
end;
$$;
