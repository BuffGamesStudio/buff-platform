-- Movie Buff Live: support foreign-key maintenance and episode lookups.
--
-- These indexes are intentionally limited to the new live-show tables. The
-- broader advisor list includes many older, low-confidence unused-index and
-- SECURITY DEFINER notices that require workload and authorization review.

create index if not exists movie_buff_live_shows_current_episode_id_idx
  on public.movie_buff_live_shows (current_episode_id)
  where current_episode_id is not null;

create index if not exists movie_buff_live_show_episodes_winner_player_id_idx
  on public.movie_buff_live_show_episodes (winner_player_id)
  where winner_player_id is not null;

create index if not exists movie_buff_live_queue_player_id_idx
  on public.movie_buff_live_queue (player_id);
