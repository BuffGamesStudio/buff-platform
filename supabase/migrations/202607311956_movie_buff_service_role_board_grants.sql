revoke all on table public.movie_buff_boards from service_role;
revoke all on table public.movie_buff_board_categories from service_role;
revoke all on table public.movie_buff_board_tiles from service_role;
revoke all on table public.movie_buff_board_events from service_role;

grant select, insert, update, delete on table public.movie_buff_boards to service_role;
grant select, insert, update, delete on table public.movie_buff_board_categories to service_role;
grant select, insert, update, delete on table public.movie_buff_board_tiles to service_role;
grant select, insert, update, delete on table public.movie_buff_board_events to service_role;
