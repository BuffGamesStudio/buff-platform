-- Keep PostgREST table privileges aligned with the existing public-read RLS
-- policies used by the Movie Buff lobby and authenticated game flow.

grant select
on table
  public.categories,
  public.movie_categories,
  public.movies
to anon, authenticated;

grant select
on table public.clips
to authenticated;

notify pgrst, 'reload schema';
