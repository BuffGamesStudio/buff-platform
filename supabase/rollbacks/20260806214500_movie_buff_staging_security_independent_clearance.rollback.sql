-- Restore the exact pre-clearance staging posture observed immediately before
-- the successful additive migration. Containment evidence only; this is not the
-- desired final security state.

begin;

revoke all on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer) from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_completion(uuid,uuid,timestamptz,integer) to authenticated, service_role;
revoke all on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer) from public, anon, authenticated, service_role;
grant execute on function public.get_movie_buff_round_player_time_left(uuid,uuid,timestamptz,integer) to authenticated, service_role;
revoke all on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer) from public, anon, authenticated, service_role;
grant execute on function public.is_movie_buff_round_player_finished(uuid,uuid,timestamptz,integer) to authenticated, service_role;

create or replace function public.mark_movie_buff_round_media_ready(p_room_id uuid)
returns table(
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_round_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select mr.id
    into v_round_id
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  insert into public.match_round_player_playback (
    round_id, player_id, started_at, play_requested_at, playback_started_at
  )
  values (v_round_id, auth.uid(), now(), null, null)
  on conflict (round_id, player_id) do update
  set started_at = coalesce(
    public.match_round_player_playback.started_at,
    excluded.started_at
  );

  return query select * from public.get_movie_buff_round(p_room_id);
end;
$function$;

alter function public.mark_movie_buff_round_media_ready(uuid) owner to postgres;
alter function public.mark_movie_buff_round_media_ready(uuid) set search_path = pg_catalog, public;
revoke all on function public.mark_movie_buff_round_media_ready(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_movie_buff_round_media_ready(uuid) to authenticated, service_role;

alter function public.is_buff_content_manager() owner to postgres;
alter function public.is_buff_content_manager() set search_path = public;
revoke all on function public.is_buff_content_manager() from public, anon, authenticated, service_role;
grant execute on function public.is_buff_content_manager() to authenticated;

-- Prior FORCE RLS posture at the frozen staging snapshot:
-- five current server ledgers were forced; ten were RLS-enabled but not forced.
do $restore_internal_tables$
declare
  v_table text;
  v_forced_tables constant text[] := array[
    'movie_buff_active_leave_penalty_ledger',
    'movie_buff_active_leave_policies',
    'movie_buff_active_leave_quotes',
    'movie_buff_board_events',
    'movie_buff_match_abandonment_events'
  ];
  v_not_forced_tables constant text[] := array[
    'movie_buff_match_participant_seats',
    'movie_buff_match_phase_actions',
    'movie_buff_match_phase_events',
    'movie_buff_match_phase_state',
    'movie_buff_vip_consumptions',
    'movie_buff_vip_definitions',
    'movie_buff_vip_inventory',
    'movie_buff_vip_round_locks',
    'movie_buff_vip_round_required_players',
    'movie_buff_vip_round_windows'
  ];
begin
  foreach v_table in array v_forced_tables loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise exception 'required rollback table is absent: public.%', v_table;
    end if;
    execute pg_catalog.format('drop policy if exists movie_buff_internal_browser_deny on public.%I', v_table);
    execute pg_catalog.format('alter table public.%I force row level security', v_table);
  end loop;

  foreach v_table in array v_not_forced_tables loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise exception 'required rollback table is absent: public.%', v_table;
    end if;
    execute pg_catalog.format('drop policy if exists movie_buff_internal_browser_deny on public.%I', v_table);
    execute pg_catalog.format('alter table public.%I no force row level security', v_table);
  end loop;
end;
$restore_internal_tables$;

notify pgrst, 'reload schema';
commit;
