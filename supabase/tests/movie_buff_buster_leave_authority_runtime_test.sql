begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'mov17-leave-one@example.test',
    'not-used',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"MOV17 Leave One"}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'mov17-leave-two@example.test',
    'not-used',
    pg_catalog.clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"MOV17 Leave Two"}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

insert into public.game_rooms (
  id,
  room_code,
  host_id,
  room_type,
  status,
  difficulty,
  total_rounds,
  max_players,
  current_round,
  is_ranked,
  started_at
)
values (
  '20000000-0000-4000-8000-000000000001',
  'LV17RUN1',
  '10000000-0000-4000-8000-000000000001',
  'private',
  'active',
  'medium',
  2,
  2,
  1,
  false,
  pg_catalog.clock_timestamp()
);

insert into public.room_players (
  room_id,
  player_id,
  is_ready,
  is_host,
  score,
  joined_at,
  left_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    true,
    true,
    100,
    pg_catalog.clock_timestamp(),
    null
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    true,
    false,
    100,
    pg_catalog.clock_timestamp(),
    null
  );

insert into public.matches (
  id,
  room_id,
  difficulty,
  total_rounds,
  status,
  started_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'medium',
  2,
  'active',
  pg_catalog.clock_timestamp()
);

insert into public.match_players (match_id, player_id)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.match_rounds (
  id,
  match_id,
  round_number,
  time_limit_seconds,
  started_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  1,
  30,
  pg_catalog.clock_timestamp()
);

insert into public.movie_buff_match_phase_state (
  match_id,
  room_id,
  round_id,
  round_number,
  total_rounds,
  phase,
  phase_version,
  phase_started_at,
  phase_ends_at,
  selector_seat_index,
  selector_deadline_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  1,
  2,
  'vip_lock',
  1,
  pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp() + interval '30 seconds',
  1,
  pg_catalog.clock_timestamp() + interval '30 seconds'
);

insert into public.movie_buff_match_participant_seats (
  match_id,
  room_id,
  seat_index,
  original_player_id,
  controller_type,
  controller_player_id,
  participant_state,
  last_seen_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1,
    '10000000-0000-4000-8000-000000000001',
    'human',
    '10000000-0000-4000-8000-000000000001',
    'active',
    pg_catalog.clock_timestamp()
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    2,
    '10000000-0000-4000-8000-000000000002',
    'human',
    '10000000-0000-4000-8000-000000000002',
    'active',
    pg_catalog.clock_timestamp()
  );

-- Establish a genuine MOV-16 VIP window before either participant leaves. The
-- active-leave trigger must release the departing required human, while the
-- remaining human records an explicit no-VIP lock before board entry.
insert into public.movie_buff_vip_round_windows (
  round_id,
  match_id,
  room_id,
  round_number,
  opens_at,
  deadline_at,
  status,
  original_required_player_count
)
select
  state.round_id,
  state.match_id,
  state.room_id,
  state.round_number,
  state.phase_started_at,
  state.phase_ends_at,
  'open',
  2
from public.movie_buff_match_phase_state as state
where state.match_id = '30000000-0000-4000-8000-000000000001';

insert into public.movie_buff_vip_round_required_players (
  round_id,
  match_id,
  room_id,
  player_id
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  );

do $$
declare
  v_quote_one jsonb;
  v_quote_two jsonb;
  v_expired_quote jsonb;
  v_result_one jsonb;
  v_result_replay jsonb;
  v_message text;
  v_count integer;
  v_score integer;
  v_controller text;
  v_released_at timestamptz;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', '10000000-0000-4000-8000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );

  begin
    perform public.get_movie_buff_active_leave_quote(
      '20000000-0000-4000-8000-000000000001'
    );
    raise exception 'missing-policy quote unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'No active Movie Buff voluntary-leave policy is configured.%' then
        raise;
      end if;
  end;

  insert into public.movie_buff_leave_penalty_policies (
    policy_version,
    reason,
    penalty_points,
    quote_ttl_seconds,
    effective_from,
    is_active
  )
  values
    (
      'runtime-test-v1',
      'voluntary_active_leave',
      10,
      60,
      pg_catalog.clock_timestamp() - interval '1 minute',
      true
    ),
    (
      'runtime-test-v1',
      'disconnect_grace_expired',
      7,
      60,
      pg_catalog.clock_timestamp() - interval '1 minute',
      true
    );

  v_quote_one := public.get_movie_buff_active_leave_quote(
    '20000000-0000-4000-8000-000000000001'
  );
  if (v_quote_one ->> 'penaltyPoints')::integer <> 10
     or v_quote_one ->> 'policyVersion' <> 'runtime-test-v1'
     or v_quote_one ->> 'phase' <> 'vip_lock' then
    raise exception 'server quote did not bind policy, penalty, and phase';
  end if;

  v_result_one := public.confirm_movie_buff_active_leave(
    (v_quote_one ->> 'quoteToken')::uuid,
    'runtime-leave-one'
  );
  v_result_replay := public.confirm_movie_buff_active_leave(
    (v_quote_one ->> 'quoteToken')::uuid,
    'runtime-leave-one'
  );
  if v_result_one is distinct from v_result_replay then
    raise exception 'same-key active-leave replay changed its result';
  end if;

  begin
    perform public.confirm_movie_buff_active_leave(
      (v_quote_one ->> 'quoteToken')::uuid,
      'runtime-leave-contradiction'
    );
    raise exception 'contradictory replay unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'Contradictory duplicate active-leave confirmation.%' then
        raise;
      end if;
  end;

  select count(*)::integer, min(score_after)
  into v_count, v_score
  from public.movie_buff_leave_penalty_ledger
  where match_id = '30000000-0000-4000-8000-000000000001'
    and player_id = '10000000-0000-4000-8000-000000000001'
    and reason = 'voluntary_active_leave';
  if v_count <> 1 or v_score <> 90 then
    raise exception 'voluntary leave did not create exactly one 10-point ledger mutation';
  end if;

  select score
  into v_score
  from public.room_players
  where room_id = '20000000-0000-4000-8000-000000000001'
    and player_id = '10000000-0000-4000-8000-000000000001';
  if v_score <> 90 then
    raise exception 'voluntary leave score was not deducted exactly once';
  end if;

  select controller_type
  into v_controller
  from public.movie_buff_match_participant_seats
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000001';
  if v_controller <> 'human' then
    raise exception 'Buster became active inside vip_lock';
  end if;

  select required.released_at
  into v_released_at
  from public.movie_buff_vip_round_required_players as required
  where required.round_id = '40000000-0000-4000-8000-000000000001'
    and required.player_id = '10000000-0000-4000-8000-000000000001';
  if v_released_at is null then
    raise exception 'active leave did not release the departing VIP participant';
  end if;

  insert into public.movie_buff_vip_round_locks (
    room_id,
    match_id,
    round_id,
    player_id,
    vip_id,
    inventory_id,
    idempotency_key,
    locked_at
  )
  values (
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    null,
    null,
    'runtime-no-vip-two',
    pg_catalog.clock_timestamp()
  );

  update public.movie_buff_match_phase_state
  set
    phase = 'board_select',
    phase_version = phase_version + 1,
    phase_started_at = pg_catalog.clock_timestamp(),
    phase_ends_at = pg_catalog.clock_timestamp() + interval '30 seconds',
    selector_deadline_at = pg_catalog.clock_timestamp() + interval '30 seconds',
    updated_at = pg_catalog.clock_timestamp()
  where match_id = '30000000-0000-4000-8000-000000000001';

  select controller_type
  into v_controller
  from public.movie_buff_match_participant_seats
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000001';
  if v_controller <> 'buster' then
    raise exception 'Buster did not activate on authoritative board_select entry';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', '10000000-0000-4000-8000-000000000002',
      'role', 'authenticated'
    )::text,
    true
  );
  v_quote_two := public.get_movie_buff_active_leave_quote(
    '20000000-0000-4000-8000-000000000001'
  );

  update public.movie_buff_match_phase_state
  set
    phase = 'transition',
    phase_version = phase_version + 1,
    phase_started_at = pg_catalog.clock_timestamp(),
    phase_ends_at = pg_catalog.clock_timestamp() + interval '5 seconds',
    selector_deadline_at = null,
    updated_at = pg_catalog.clock_timestamp()
  where match_id = '30000000-0000-4000-8000-000000000001';

  begin
    perform public.confirm_movie_buff_active_leave(
      (v_quote_two ->> 'quoteToken')::uuid,
      'runtime-stale-quote'
    );
    raise exception 'stale quote unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'Active-leave quote is stale.%' then
        raise;
      end if;
  end;

  v_expired_quote := public.get_movie_buff_active_leave_quote(
    '20000000-0000-4000-8000-000000000001'
  );
  update public.movie_buff_active_leave_quotes
  set
    created_at = pg_catalog.clock_timestamp() - interval '2 seconds',
    expires_at = pg_catalog.clock_timestamp() - interval '1 second'
  where quote_token = (v_expired_quote ->> 'quoteToken')::uuid;

  begin
    perform public.confirm_movie_buff_active_leave(
      (v_expired_quote ->> 'quoteToken')::uuid,
      'runtime-expired-quote'
    );
    raise exception 'expired quote unexpectedly succeeded';
  exception
    when others then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'Active-leave quote expired.%' then
        raise;
      end if;
  end;

  update public.movie_buff_match_participant_seats
  set
    participant_state = 'abandoned',
    abandoned_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp()
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000002';

  update public.movie_buff_match_participant_seats
  set participant_state = 'abandoned'
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000002';

  select count(*)::integer, min(score_after)
  into v_count, v_score
  from public.movie_buff_leave_penalty_ledger
  where match_id = '30000000-0000-4000-8000-000000000001'
    and player_id = '10000000-0000-4000-8000-000000000002'
    and reason = 'disconnect_grace_expired';
  if v_count <> 1 or v_score <> 93 then
    raise exception 'disconnect abandonment did not create exactly one 7-point ledger mutation';
  end if;

  select controller_type
  into v_controller
  from public.movie_buff_match_participant_seats
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000002';
  if v_controller <> 'human' then
    raise exception 'mid-transition abandonment activated Buster before results';
  end if;

  update public.movie_buff_match_phase_state
  set
    phase = 'results',
    phase_version = phase_version + 1,
    phase_started_at = pg_catalog.clock_timestamp(),
    phase_ends_at = pg_catalog.clock_timestamp() + interval '8 seconds',
    results_end_at = pg_catalog.clock_timestamp() + interval '8 seconds',
    updated_at = pg_catalog.clock_timestamp()
  where match_id = '30000000-0000-4000-8000-000000000001';

  select controller_type
  into v_controller
  from public.movie_buff_match_participant_seats
  where match_id = '30000000-0000-4000-8000-000000000001'
    and original_player_id = '10000000-0000-4000-8000-000000000002';
  if v_controller <> 'buster' then
    raise exception 'mid-transition abandonment did not activate Buster at results';
  end if;
end;
$$;

rollback;
