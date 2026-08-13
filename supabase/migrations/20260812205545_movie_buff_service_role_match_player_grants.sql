-- Keep the local migration replay aligned with the hosted Movie Buff runtime.
-- Server-side smoke/admin paths use service_role to seed and clean up
-- match_players rows; the other match runtime tables already have this grant.
grant select, insert, update, delete
on table public.match_players
to service_role;
