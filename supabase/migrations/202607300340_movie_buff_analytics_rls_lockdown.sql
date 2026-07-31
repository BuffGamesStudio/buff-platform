revoke all on table public.movie_buff_round_events from anon;
revoke all on table public.movie_buff_round_events from authenticated;

revoke all on table public.movie_buff_clip_analytics from anon;
revoke all on table public.movie_buff_clip_analytics from authenticated;

revoke all on table public.movie_buff_movie_analytics from anon;
revoke all on table public.movie_buff_movie_analytics from authenticated;

alter table public.movie_buff_round_events
  enable row level security;

alter table public.movie_buff_clip_analytics
  enable row level security;

alter table public.movie_buff_movie_analytics
  enable row level security;

drop policy if exists "service_role_full_access_movie_buff_round_events"
  on public.movie_buff_round_events;
drop policy if exists "service_role_full_access_movie_buff_clip_analytics"
  on public.movie_buff_clip_analytics;
drop policy if exists "service_role_full_access_movie_buff_movie_analytics"
  on public.movie_buff_movie_analytics;

create policy "service_role_full_access_movie_buff_round_events"
on public.movie_buff_round_events
as permissive
for all
to service_role
using (true)
with check (true);

create policy "service_role_full_access_movie_buff_clip_analytics"
on public.movie_buff_clip_analytics
as permissive
for all
to service_role
using (true)
with check (true);

create policy "service_role_full_access_movie_buff_movie_analytics"
on public.movie_buff_movie_analytics
as permissive
for all
to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
