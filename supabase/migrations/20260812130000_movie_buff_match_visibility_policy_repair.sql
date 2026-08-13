-- Keep match-scoped reads limited to matches the signed-in player belongs to.
-- The original policies used unqualified match_id references inside their
-- subqueries, which can collapse the correlation into a tautology.

drop policy if exists "Players view match participants" on public.match_players;

create policy "Players view match participants"
on public.match_players
for select
to authenticated
using (
  player_id = (select auth.uid())
  or public.is_movie_buff_match_member(match_id)
);

drop policy if exists "Players view match rounds" on public.match_rounds;

create policy "Players view match rounds"
on public.match_rounds
for select
to authenticated
using (public.is_movie_buff_match_member(match_id));
