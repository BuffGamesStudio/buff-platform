create or replace function public.log_movie_buff_private_room_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.room_type, 'private') <> 'private' then
    return new;
  end if;

  insert into public.movie_buff_round_events (
    event_type,
    room_id,
    player_id,
    payload
  )
  values (
    'room_created',
    new.id,
    new.host_id,
    jsonb_build_object(
      'roomType', new.room_type,
      'difficulty', new.difficulty,
      'totalRounds', new.total_rounds,
      'maxPlayers', new.max_players
    )
  );

  return new;
end;
$$;

drop trigger if exists movie_buff_private_room_created_trg
on public.game_rooms;

create trigger movie_buff_private_room_created_trg
after insert on public.game_rooms
for each row
execute function public.log_movie_buff_private_room_created();

revoke all on function public.log_movie_buff_private_room_created()
from public;
