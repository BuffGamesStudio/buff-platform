create or replace function public.log_movie_buff_room_player_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
begin
  select gr.*
  into v_room
  from public.game_rooms as gr
  where gr.id = coalesce(new.room_id, old.room_id);

  if not found then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.left_at is null then
      insert into public.movie_buff_round_events (
        event_type,
        room_id,
        player_id,
        payload
      )
      values (
        'player_joined',
        new.room_id,
        new.player_id,
        jsonb_build_object(
          'roomType', v_room.room_type,
          'isHost', coalesce(new.is_host, false)
        )
      );
    end if;

    return new;
  end if;

  if
    tg_op = 'UPDATE'
    and new.left_at is null
    and coalesce(new.is_ready, false) = true
    and coalesce(old.is_ready, false) = false
  then
    insert into public.movie_buff_round_events (
      event_type,
      room_id,
      player_id,
      payload
    )
    values (
      'player_ready',
      new.room_id,
      new.player_id,
      jsonb_build_object(
        'isReady', true
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists movie_buff_room_player_event_trg
on public.room_players;

create trigger movie_buff_room_player_event_trg
after insert or update on public.room_players
for each row
execute function public.log_movie_buff_room_player_event();

revoke all on function public.log_movie_buff_room_player_event()
from public;
