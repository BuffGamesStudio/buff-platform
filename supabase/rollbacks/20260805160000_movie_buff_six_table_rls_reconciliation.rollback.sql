-- Fail-closed containment rollback. RLS and FORCE RLS remain enabled.
begin;
do $drop_policies$
declare v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname='public'
      and tablename in (
        'match_round_player_hints','match_round_player_playback',
        'movie_buff_boards','movie_buff_board_categories',
        'movie_buff_board_tiles','movie_buff_board_events'
      )
  loop
    execute pg_catalog.format('drop policy %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end;
$drop_policies$;

revoke all on table public.match_round_player_hints from public, anon, authenticated;
revoke all on table public.match_round_player_playback from public, anon, authenticated;
revoke all on table public.movie_buff_boards from public, anon, authenticated;
revoke all on table public.movie_buff_board_categories from public, anon, authenticated;
revoke all on table public.movie_buff_board_tiles from public, anon, authenticated;
revoke all on table public.movie_buff_board_events from public, anon, authenticated;

grant all on table public.match_round_player_hints to service_role;
grant all on table public.match_round_player_playback to service_role;
grant all on table public.movie_buff_boards to service_role;
grant all on table public.movie_buff_board_categories to service_role;
grant all on table public.movie_buff_board_tiles to service_role;
grant all on table public.movie_buff_board_events to service_role;

alter table public.match_round_player_hints enable row level security;
alter table public.match_round_player_hints force row level security;
alter table public.match_round_player_playback enable row level security;
alter table public.match_round_player_playback force row level security;
alter table public.movie_buff_boards enable row level security;
alter table public.movie_buff_boards force row level security;
alter table public.movie_buff_board_categories enable row level security;
alter table public.movie_buff_board_categories force row level security;
alter table public.movie_buff_board_tiles enable row level security;
alter table public.movie_buff_board_tiles force row level security;
alter table public.movie_buff_board_events enable row level security;
alter table public.movie_buff_board_events force row level security;
notify pgrst, 'reload schema';
commit;
