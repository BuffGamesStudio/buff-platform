revoke all on table public.matches from service_role;
revoke all on table public.match_rounds from service_role;
revoke all on table public.match_round_player_playback from service_role;
revoke all on table public.match_round_player_hints from service_role;
revoke all on table public.answers from service_role;

grant select, insert, update, delete on table public.matches to service_role;
grant select, insert, update, delete on table public.match_rounds to service_role;
grant select, insert, update, delete on table public.match_round_player_playback to service_role;
grant select, insert, update, delete on table public.match_round_player_hints to service_role;
grant select, insert, update, delete on table public.answers to service_role;
