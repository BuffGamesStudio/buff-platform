-- Data-preserving rollback for 20260804083720.

do $$
begin
  if current_setting(
    'movie_buff.allow_answer_phase_preflight_rollback',
    true
  ) is distinct from 'on' then
    raise exception
      'Set movie_buff.allow_answer_phase_preflight_rollback=on for this rollback.';
  end if;
end;
$$;

drop function if exists public.submit_movie_buff_answer(uuid,text);

alter function public.submit_movie_buff_answer_legacy_unchecked(uuid,text)
  rename to submit_movie_buff_answer;

alter function public.submit_movie_buff_answer(uuid,text)
  owner to postgres;
revoke all on function public.submit_movie_buff_answer(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_movie_buff_answer(uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
