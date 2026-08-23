-- The durable live runner uses the service-role key for its server-side
-- provider bridge. The read-only projection is SECURITY DEFINER and exposes
-- the sanitized public show state, so grant only this function to the runner.
grant execute on function public.get_movie_buff_live_show_view(text)
  to service_role;

notify pgrst, 'reload schema';
