-- Movie Buff performance advisor cleanup.
--
-- Preserve the existing row-access semantics while making row-independent auth
-- checks init-plan eligible and consolidating overlapping permissive policies.

-- Cache auth lookups in the room/participant policies.
drop policy if exists game_rooms_delete on public.game_rooms;
create policy game_rooms_delete
on public.game_rooms
for delete
to authenticated
using ((select auth.uid()) = host_id);

drop policy if exists game_rooms_update on public.game_rooms;
create policy game_rooms_update
on public.game_rooms
for update
to authenticated
using ((select auth.uid()) = host_id)
with check ((select auth.uid()) = host_id);

drop policy if exists room_players_insert on public.room_players;
create policy room_players_insert
on public.room_players
for insert
to authenticated
with check ((select auth.uid()) = player_id);

drop policy if exists room_players_update on public.room_players;
create policy room_players_update
on public.room_players
for update
to authenticated
using ((select auth.uid()) = player_id)
with check ((select auth.uid()) = player_id);

drop policy if exists room_players_delete on public.room_players;
create policy room_players_delete
on public.room_players
for delete
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists "Admins delete content" on public.content_items;
create policy "Admins delete content"
on public.content_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.platform_role = 'admin'
  )
);

drop policy if exists "Admins delete media" on public.content_media;
create policy "Admins delete media"
on public.content_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.platform_role = 'admin'
  )
);

-- Service-only catalog management should be role-scoped, not a PUBLIC policy
-- whose auth.role() expression is evaluated for every candidate row.
drop policy if exists "service role can manage content_sources" on public.content_sources;
drop policy if exists "content_sources are viewable by everyone" on public.content_sources;
create policy "service role can manage content_sources"
on public.content_sources
for all
to service_role
using (true)
with check (true);

create policy "content_sources are viewable by everyone"
on public.content_sources
for select
to anon, authenticated
using (true);

drop policy if exists "service role can manage content_source_items" on public.content_source_items;
drop policy if exists "content_source_items are viewable by everyone" on public.content_source_items;
create policy "service role can manage content_source_items"
on public.content_source_items
for all
to service_role
using (true)
with check (true);

create policy "content_source_items are viewable by everyone"
on public.content_source_items
for select
to anon, authenticated
using (true);

-- Consolidate the manager ALL policy with the public SELECT policy for each
-- content/catalog table. Anonymous users retain the existing public-read
-- predicate; authenticated users get one SELECT policy that combines public
-- visibility with manager access. Manager writes remain manager-only.

drop policy if exists "Managers manage challenge items" on public.challenge_set_items;
drop policy if exists "Published challenge items are publicly readable" on public.challenge_set_items;
create policy "Managers create challenge items"
on public.challenge_set_items
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update challenge items"
on public.challenge_set_items
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete challenge items"
on public.challenge_set_items
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view challenge items"
on public.challenge_set_items
for select
to authenticated
using (
  (select movie_buff_security.is_content_manager())
  or exists (
    select 1
    from public.challenge_sets cs
    where cs.id = challenge_set_items.challenge_set_id
      and cs.is_active = true
      and cs.publication_status = 'published'
  )
);
create policy "Published challenge items are publicly readable"
on public.challenge_set_items
for select
to anon
using (
  exists (
    select 1
    from public.challenge_sets cs
    where cs.id = challenge_set_items.challenge_set_id
      and cs.is_active = true
      and cs.publication_status = 'published'
  )
);

drop policy if exists "Managers manage challenge sets" on public.challenge_sets;
drop policy if exists "Published challenges are publicly readable" on public.challenge_sets;
create policy "Managers create challenge sets"
on public.challenge_sets
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update challenge sets"
on public.challenge_sets
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete challenge sets"
on public.challenge_sets
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view challenge sets"
on public.challenge_sets
for select
to authenticated
using (
  (select movie_buff_security.is_content_manager())
  or (is_active = true and publication_status = 'published')
);
create policy "Published challenges are publicly readable"
on public.challenge_sets
for select
to anon
using (is_active = true and publication_status = 'published');

drop policy if exists "Managers manage content answers" on public.content_answers;
drop policy if exists "Active content answers are readable" on public.content_answers;
create policy "Managers create content answers"
on public.content_answers
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update content answers"
on public.content_answers
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete content answers"
on public.content_answers
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view content answers"
on public.content_answers
for select
to authenticated
using (
  (select movie_buff_security.is_content_manager())
  or is_active = true
);

drop policy if exists "Managers manage content categories" on public.content_categories;
drop policy if exists "Content categories are publicly readable" on public.content_categories;
create policy "Managers create content categories"
on public.content_categories
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update content categories"
on public.content_categories
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete content categories"
on public.content_categories
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view content categories"
on public.content_categories
for select
to authenticated
using (true);
create policy "Content categories are publicly readable"
on public.content_categories
for select
to anon
using (true);

drop policy if exists "Managers view all content" on public.content_items;
drop policy if exists "Published content is publicly readable" on public.content_items;
create policy "Managers view all content"
on public.content_items
for select
to authenticated
using (
  (select movie_buff_security.is_content_manager())
  or (is_active = true and publication_status = 'published')
);
create policy "Published content is publicly readable"
on public.content_items
for select
to anon
using (is_active = true and publication_status = 'published');

drop policy if exists "Managers view all media" on public.content_media;
drop policy if exists "Published media is publicly readable" on public.content_media;
create policy "Managers view all media"
on public.content_media
for select
to authenticated
using (
  (select movie_buff_security.is_content_manager())
  or (
    is_active = true
    and is_hidden = false
    and exists (
      select 1
      from public.content_items ci
      where ci.id = content_media.content_id
        and ci.is_active = true
        and ci.publication_status = 'published'
    )
  )
);
create policy "Published media is publicly readable"
on public.content_media
for select
to anon
using (
  is_active = true
  and is_hidden = false
  and exists (
    select 1
    from public.content_items ci
    where ci.id = content_media.content_id
      and ci.is_active = true
      and ci.publication_status = 'published'
  )
);

drop policy if exists "Managers manage content tags" on public.content_tags;
drop policy if exists "Content tags are publicly readable" on public.content_tags;
create policy "Managers create content tags"
on public.content_tags
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update content tags"
on public.content_tags
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete content tags"
on public.content_tags
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view content tags"
on public.content_tags
for select
to authenticated
using (true);
create policy "Content tags are publicly readable"
on public.content_tags
for select
to anon
using (true);

drop policy if exists "Managers manage tags" on public.tags;
drop policy if exists "Tags are publicly readable" on public.tags;
create policy "Managers create tags"
on public.tags
for insert
to authenticated
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers update tags"
on public.tags
for update
to authenticated
using ((select movie_buff_security.is_content_manager()))
with check ((select movie_buff_security.is_content_manager()));
create policy "Managers delete tags"
on public.tags
for delete
to authenticated
using ((select movie_buff_security.is_content_manager()));
create policy "Managers view tags"
on public.tags
for select
to authenticated
using (true);
create policy "Tags are publicly readable"
on public.tags
for select
to anon
using (true);

notify pgrst, 'reload schema';

