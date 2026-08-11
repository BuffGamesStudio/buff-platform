grant execute on function public.enter_movie_buff_round(uuid) to authenticated;
grant execute on function public.prepare_movie_buff_round_playback(uuid) to authenticated;
grant execute on function public.start_movie_buff_round_playback(uuid) to authenticated;
grant execute on function public.advance_movie_buff_round(uuid) to authenticated;

notify pgrst, 'reload schema';
