grant usage on schema public
to service_role;

grant select
on table
  public.movie_buff_round_events,
  public.movie_buff_clip_analytics,
  public.movie_buff_movie_analytics
to service_role;

grant insert, update, delete
on table
  public.movie_buff_clip_analytics,
  public.movie_buff_movie_analytics
to service_role;

grant execute
on function public.movie_buff_refresh_clip_analytics(uuid)
to service_role;

grant execute
on function public.movie_buff_refresh_movie_analytics(uuid)
to service_role;

notify pgrst, 'reload schema';
