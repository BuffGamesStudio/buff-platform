drop policy if exists "game_rooms_insert" on public.game_rooms;

create policy "game_rooms_insert"
on public.game_rooms
for insert
to authenticated
with check (
  auth.uid() = host_id
  and (
    room_type <> 'private'
    or exists (
      select 1
      from auth.users as users
      where users.id = auth.uid()
        and users.email_confirmed_at is not null
    )
  )
);

notify pgrst, 'reload schema';
