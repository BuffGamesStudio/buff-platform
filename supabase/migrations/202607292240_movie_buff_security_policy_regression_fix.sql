drop policy if exists "game_rooms_select" on public.game_rooms;

create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (
  host_id = auth.uid()
  or public.is_movie_buff_room_member(id)
);

notify pgrst, 'reload schema';
