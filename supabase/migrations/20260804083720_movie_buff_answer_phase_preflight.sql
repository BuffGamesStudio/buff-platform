-- MOV-17 exact-race repair: reject direct answers from any non-answer phase
-- before legacy round/clip resolution can obscure the authoritative failure.

alter function public.submit_movie_buff_answer(uuid,text)
  rename to submit_movie_buff_answer_legacy_unchecked;

revoke all on function public.submit_movie_buff_answer_legacy_unchecked(uuid,text)
  from public, anon, authenticated, service_role;

create function public.submit_movie_buff_answer(
  p_room_id uuid,
  p_submitted_answer text
)
returns table (
  result_answer_id uuid,
  result_is_correct boolean,
  result_base_points integer,
  result_speed_bonus integer,
  result_streak_bonus integer,
  result_total_points integer,
  result_new_score integer,
  result_new_streak integer,
  result_new_lives integer,
  result_correct_title text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.room_id = p_room_id
  for share;

  if not found
     or v_state.phase <> 'answer'
     or v_state.answer_deadline_at is null
     or v_now > v_state.answer_deadline_at then
    raise exception 'Movie Buff answer window is not open.';
  end if;

  return query
  select *
  from public.submit_movie_buff_answer_legacy_unchecked(
    p_room_id,
    p_submitted_answer
  );
end;
$$;

alter function public.submit_movie_buff_answer(uuid,text)
  owner to postgres;

revoke all on function public.submit_movie_buff_answer(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_movie_buff_answer(uuid,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
