create or replace function public.is_movie_buff_room_member(
  p_room_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.game_rooms as gr
    where gr.id = p_room_id
      and (
        gr.host_id = auth.uid()
        or exists (
          select 1
          from public.room_players as rp
          where rp.room_id = gr.id
            and rp.player_id = auth.uid()
            and rp.left_at is null
        )
      )
  );
$$;

create or replace function public.is_movie_buff_match_member(
  p_match_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.match_players as mp
    where mp.match_id = p_match_id
      and mp.player_id = auth.uid()
  );
$$;

create or replace function public.is_movie_buff_round_member(
  p_round_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.match_rounds as mr
    join public.match_players as mp
      on mp.match_id = mr.match_id
    where mr.id = p_round_id
      and mp.player_id = auth.uid()
  );
$$;

create or replace function public.set_movie_buff_player_ready(
  p_room_id uuid,
  p_is_ready boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to update ready status.';
  end if;

  if not exists (
    select 1
    from public.game_rooms as gr
    join public.room_players as rp
      on rp.room_id = gr.id
    where gr.id = p_room_id
      and gr.status = 'waiting'
      and rp.player_id = v_user_id
      and rp.left_at is null
  ) then
    raise exception 'You can only change ready status for your current waiting room.';
  end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id
    and player_id = v_user_id
    and left_at is null;

  if not found then
    raise exception 'Ready status could not be updated.';
  end if;
end;
$$;

revoke all on function public.is_movie_buff_room_member(uuid) from public;
revoke all on function public.is_movie_buff_match_member(uuid) from public;
revoke all on function public.is_movie_buff_round_member(uuid) from public;
revoke all on function public.set_movie_buff_player_ready(uuid, boolean) from public;

grant execute on function public.is_movie_buff_room_member(uuid) to authenticated;
grant execute on function public.is_movie_buff_match_member(uuid) to authenticated;
grant execute on function public.is_movie_buff_round_member(uuid) to authenticated;
grant execute on function public.set_movie_buff_player_ready(uuid, boolean) to authenticated;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_playback enable row level security;

drop policy if exists "Players can view rooms" on public.game_rooms;
drop policy if exists "game_rooms_select" on public.game_rooms;
drop policy if exists "Hosts update their rooms" on public.game_rooms;
drop policy if exists "game_rooms_update" on public.game_rooms;
drop policy if exists "game_rooms_delete" on public.game_rooms;

create policy "game_rooms_select"
on public.game_rooms
for select
to authenticated
using (public.is_movie_buff_room_member(id));

create policy "game_rooms_delete"
on public.game_rooms
for delete
to authenticated
using (
  auth.uid() = host_id
  and status = 'waiting'
  and current_round = 0
  and not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = public.game_rooms.id
  )
);

drop policy if exists "Players view room members" on public.room_players;
drop policy if exists "room_players_select" on public.room_players;
drop policy if exists "Players join rooms" on public.room_players;
drop policy if exists "room_players_insert" on public.room_players;
drop policy if exists "Players update their room status" on public.room_players;
drop policy if exists "room_players_update" on public.room_players;
drop policy if exists "Players leave rooms" on public.room_players;
drop policy if exists "room_players_delete" on public.room_players;

create policy "room_players_select"
on public.room_players
for select
to authenticated
using (
  player_id = auth.uid()
  or (
    left_at is null
    and public.is_movie_buff_room_member(room_id)
  )
);

create policy "room_players_insert"
on public.room_players
for insert
to authenticated
with check (
  player_id = auth.uid()
  and exists (
    select 1
    from public.game_rooms as gr
    where gr.id = room_id
      and gr.host_id = auth.uid()
      and gr.status = 'waiting'
      and gr.current_round = 0
  )
);

drop policy if exists "Players view their matches" on public.matches;

create policy "Players view their matches"
on public.matches
for select
to authenticated
using (public.is_movie_buff_match_member(id));

drop policy if exists "Players view match participants" on public.match_players;

create policy "Players view match participants"
on public.match_players
for select
to authenticated
using (
  player_id = auth.uid()
  or public.is_movie_buff_match_member(match_id)
);

drop policy if exists "Players view match rounds" on public.match_rounds;

create policy "Players view match rounds"
on public.match_rounds
for select
to authenticated
using (public.is_movie_buff_match_member(match_id));

drop policy if exists "Players submit their own answers" on public.answers;
drop policy if exists "Players view answers from their matches" on public.answers;

create policy "Players view answers from their matches"
on public.answers
for select
to authenticated
using (
  player_id = auth.uid()
  or public.is_movie_buff_round_member(round_id)
);

create policy "Players view their own hint state"
on public.match_round_player_hints
for select
to authenticated
using (
  player_id = auth.uid()
  and public.is_movie_buff_round_member(round_id)
);

create policy "Players view their own playback state"
on public.match_round_player_playback
for select
to authenticated
using (
  player_id = auth.uid()
  and public.is_movie_buff_round_member(round_id)
);

notify pgrst, 'reload schema';
