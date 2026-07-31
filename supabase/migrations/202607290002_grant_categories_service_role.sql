grant usage on schema public
to service_role;

grant select
on table
  public.categories
to service_role;

notify pgrst, 'reload schema';
