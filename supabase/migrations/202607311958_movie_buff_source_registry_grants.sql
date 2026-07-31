grant select on table public.content_sources
to anon, authenticated, service_role;

grant select on table public.content_source_items
to anon, authenticated, service_role;

grant insert, update, delete on table public.content_sources
to service_role;

grant insert, update, delete on table public.content_source_items
to service_role;
