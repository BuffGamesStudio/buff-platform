grant select
on table
  public.match_rounds,
  public.clips,
  public.movies
to service_role;

notify pgrst, 'reload schema';
