-- The hosted Movie Buff projects expose these tables through PostgREST with
-- RLS as the access boundary. Keep the local migration replay equivalent.
grant select, insert, update, delete
on table public.matches, public.match_players, public.match_rounds
to anon, authenticated, service_role;
