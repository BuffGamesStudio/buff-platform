-- Secure verified-email enforcement for private Movie Night room inserts.
-- Avoids granting authenticated/anon SELECT on auth.users by using a
-- no-argument SECURITY DEFINER helper in a non-exposed schema.

create schema if not exists movie_buff_security;

revoke all on schema movie_buff_security from public;
revoke all on schema movie_buff_security from anon;
revoke all on schema movie_buff_security from authenticated;

grant usage on schema movie_buff_security to authenticated;

create or replace function movie_buff_security.current_user_email_is_confirmed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as users
    where users.id = (select auth.uid())
      and users.email_confirmed_at is not null
  );
$$;

alter function movie_buff_security.current_user_email_is_confirmed()
  owner to postgres;

revoke all on function movie_buff_security.current_user_email_is_confirmed()
  from public;
revoke all on function movie_buff_security.current_user_email_is_confirmed()
  from anon;
revoke all on function movie_buff_security.current_user_email_is_confirmed()
  from authenticated;

grant execute on function movie_buff_security.current_user_email_is_confirmed()
  to authenticated;

drop policy if exists "game_rooms_insert" on public.game_rooms;

create policy "game_rooms_insert"
on public.game_rooms
for insert
to authenticated
with check (
  (select auth.uid()) = host_id
  and (
    room_type <> 'private'
    or (
      select movie_buff_security.current_user_email_is_confirmed()
    )
  )
);

notify pgrst, 'reload schema';
