grant usage on schema public
to service_role;

grant select
on table
  public.content_types,
  public.content_items,
  public.content_categories,
  public.tags,
  public.content_tags,
  public.content_media,
  public.challenge_sets,
  public.challenge_set_items
to service_role;

grant select, insert, update, delete
on table
  public.content_items,
  public.content_categories,
  public.tags,
  public.content_tags,
  public.content_media,
  public.content_answers,
  public.challenge_sets,
  public.challenge_set_items
to service_role;

notify pgrst, 'reload schema';
