-- Containment rollback for 20260801082852_movie_buff_private_room_verified_email_secure_helper.sql
-- Restores the known-safe insert policy and removes the helper/schema.

drop policy if exists "game_rooms_insert" on public.game_rooms;

create policy "game_rooms_insert"
on public.game_rooms
for insert
to authenticated
with check (auth.uid() = host_id);

drop function if exists movie_buff_security.current_user_email_is_confirmed();

drop schema if exists movie_buff_security;

notify pgrst, 'reload schema';
