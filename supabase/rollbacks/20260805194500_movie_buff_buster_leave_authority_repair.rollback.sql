-- Data-preserving containment rollback for
-- 20260805194500_movie_buff_buster_leave_authority_repair.sql.
--
-- The policy, quote, ledger, seat audit columns, and immutable evidence rows are
-- intentionally retained. Browser mutation is revoked, active-leave RPCs fail
-- closed, and automatic Buster takeover is suspended until the forward repair
-- is reapplied or an independently reviewed successor is installed.

revoke all on function public.get_movie_buff_active_leave_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_movie_buff_active_leave(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.get_movie_buff_active_leave_quote(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Movie Buff active-leave containment is active.';
end;
$$;

create or replace function public.confirm_movie_buff_active_leave(
  p_quote_token uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Movie Buff active-leave containment is active.';
end;
$$;

create or replace function public.movie_buff_activate_ready_busters(p_room_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog
as $$
  select 0;
$$;

alter function public.get_movie_buff_active_leave_quote(uuid) owner to postgres;
alter function public.confirm_movie_buff_active_leave(uuid, text) owner to postgres;
alter function public.movie_buff_activate_ready_busters(uuid) owner to postgres;

revoke all on function public.get_movie_buff_active_leave_quote(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_movie_buff_active_leave(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_activate_ready_busters(uuid)
  from public, anon, authenticated, service_role;

-- Retain service-role execution only for a deterministic fail-closed diagnostic.
grant execute on function public.get_movie_buff_active_leave_quote(uuid)
  to service_role;
grant execute on function public.confirm_movie_buff_active_leave(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
