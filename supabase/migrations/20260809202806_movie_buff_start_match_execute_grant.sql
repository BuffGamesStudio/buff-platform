grant execute on function public.start_movie_buff_match(uuid) to authenticated;

notify pgrst, 'reload schema';
