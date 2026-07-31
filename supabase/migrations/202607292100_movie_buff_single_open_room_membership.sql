with ranked_open_memberships as (
  select
    rp.room_id,
    rp.player_id,
    row_number() over (
      partition by rp.player_id
      order by rp.joined_at desc, rp.room_id desc
    ) as membership_rank
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where rp.left_at is null
    and gr.status in ('waiting', 'starting', 'active')
)
update public.room_players as rp
set is_ready = false,
    is_host = false,
    left_at = timezone('utc', now())
from ranked_open_memberships as ranked
where rp.room_id = ranked.room_id
  and rp.player_id = ranked.player_id
  and ranked.membership_rank > 1;

update public.game_rooms as gr
set status =
      case
        when gr.status in ('finished', 'cancelled') then gr.status
        else 'cancelled'
      end,
    finished_at =
      case
        when gr.status = 'active' and gr.finished_at is null
          then timezone('utc', now())
        else gr.finished_at
      end
where gr.status in ('waiting', 'starting', 'active')
  and not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = gr.id
      and rp.left_at is null
  );

with next_hosts as (
  select distinct on (rp.room_id)
    rp.room_id,
    rp.player_id as next_host_id
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where gr.status in ('waiting', 'starting', 'active')
    and rp.left_at is null
    and not exists (
      select 1
      from public.room_players as active_host
      where active_host.room_id = rp.room_id
        and active_host.left_at is null
        and active_host.is_host = true
    )
  order by rp.room_id, rp.joined_at asc, rp.player_id asc
)
update public.room_players as rp
set is_host = (
  rp.player_id = next_hosts.next_host_id
  and rp.left_at is null
)
from next_hosts
where rp.room_id = next_hosts.room_id;

with next_hosts as (
  select distinct on (rp.room_id)
    rp.room_id,
    rp.player_id as next_host_id
  from public.room_players as rp
  join public.game_rooms as gr
    on gr.id = rp.room_id
  where gr.status in ('waiting', 'starting', 'active')
    and rp.left_at is null
    and rp.is_host = true
  order by rp.room_id, rp.joined_at asc, rp.player_id asc
)
update public.game_rooms as gr
set host_id = next_hosts.next_host_id
from next_hosts
where gr.id = next_hosts.room_id;

create or replace function public.enforce_movie_buff_single_open_room_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.left_at is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.room_players as rp
    join public.game_rooms as gr
      on gr.id = rp.room_id
    where rp.player_id = new.player_id
      and rp.left_at is null
      and rp.room_id <> new.room_id
      and gr.status in ('waiting', 'starting', 'active')
  ) then
    raise exception 'You are already in another Movie Buff room. Leave that room before joining a new one.';
  end if;

  return new;
end;
$$;

drop trigger if exists room_players_single_open_room_membership_trg
on public.room_players;

create trigger room_players_single_open_room_membership_trg
before insert or update of player_id, room_id, left_at
on public.room_players
for each row
execute function public.enforce_movie_buff_single_open_room_membership();

notify pgrst, 'reload schema';
