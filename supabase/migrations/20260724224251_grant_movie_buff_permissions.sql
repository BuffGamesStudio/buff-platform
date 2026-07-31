grant usage on schema public to authenticated;

grant select, insert, update, delete
on table public.game_rooms
to authenticated;

grant select, insert, update, delete
on table public.room_players
to authenticated;

grant select, insert, update, delete
on table public.profiles
to authenticated;

grant select, insert, update, delete
on table public.answers
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

notify pgrst, 'reload schema';