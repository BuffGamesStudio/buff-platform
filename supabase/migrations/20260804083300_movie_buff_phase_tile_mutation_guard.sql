-- MOV-17 follow-up: service-role board code cannot bypass the canonical phase
-- helper. Only the helper sets this transaction-local authorization marker.

create or replace function public.movie_buff_guard_phase_tile_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.is_used = false
     and new.is_used = true
     and coalesce(
       current_setting('movie_buff.phase_tile_mutation', true),
       ''
     ) <> 'authorized' then
    raise exception
      'Board tile selection must use the authoritative Movie Buff phase route.';
  end if;

  return new;
end;
$$;

drop trigger if exists movie_buff_board_tiles_require_phase_authority
  on public.movie_buff_board_tiles;
create trigger movie_buff_board_tiles_require_phase_authority
before update of is_used on public.movie_buff_board_tiles
for each row execute function public.movie_buff_guard_phase_tile_mutation();

create or replace function public.movie_buff_apply_phase_tile_selection(
  p_room_id uuid,
  p_match_id uuid,
  p_tile_id uuid,
  p_actor_player_id uuid,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state public.movie_buff_match_phase_state%rowtype;
  v_board_id uuid;
  v_clip_id uuid;
  v_movie_id uuid;
  v_clip_type text;
  v_media_url text;
  v_licensing_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_playback_at timestamptz;
begin
  select state.*
  into v_state
  from public.movie_buff_match_phase_state as state
  where state.match_id = p_match_id
    and state.room_id = p_room_id
  for update;

  if not found or v_state.phase <> 'board_select' then
    raise exception 'Movie Buff match is not accepting a board selection.';
  end if;

  select
    board.id,
    tile.clip_id,
    clip.movie_id,
    clip.clip_type,
    clip.media_url,
    clip.licensing_status
  into
    v_board_id,
    v_clip_id,
    v_movie_id,
    v_clip_type,
    v_media_url,
    v_licensing_status
  from public.movie_buff_boards as board
  join public.movie_buff_board_tiles as tile
    on tile.board_id = board.id
  join public.clips as clip
    on clip.id = tile.clip_id
  join public.movies as movie
    on movie.id = clip.movie_id
  where board.room_id = p_room_id
    and board.status in ('ready', 'active')
    and tile.id = p_tile_id
    and tile.is_used = false
    and clip.is_active = true
    and movie.is_active = true
  for update of board, tile;

  if not found then
    raise exception 'Board tile is unavailable or has no authoritative clip.';
  end if;

  if v_licensing_status is null
     or v_licensing_status not in (
       'licensed', 'public_domain', 'promotional', 'user_connected'
     ) then
    raise exception 'Board tile clip is not rights-eligible.';
  end if;

  if v_clip_type not in ('video', 'audio')
     or nullif(pg_catalog.btrim(coalesce(v_media_url, '')), '') is null then
    raise exception 'Board tile clip is not synchronized-media eligible.';
  end if;

  if exists (
    select 1
    from public.match_rounds as previous_round
    join public.clips as previous_clip
      on previous_clip.id = previous_round.clip_id
    where previous_round.match_id = p_match_id
      and previous_round.id <> v_state.round_id
      and (
        previous_round.clip_id = v_clip_id
        or previous_clip.movie_id = v_movie_id
      )
  ) then
    raise exception 'Board tile clip violates match repeat protection.';
  end if;

  perform pg_catalog.set_config(
    'movie_buff.phase_tile_mutation',
    'authorized',
    true
  );

  update public.movie_buff_board_tiles
  set
    is_used = true,
    selected_by_player_id = p_actor_player_id,
    locked_at = coalesce(locked_at, v_now),
    updated_at = v_now
  where id = p_tile_id
    and board_id = v_board_id
    and is_used = false;

  if not found then
    raise exception 'Board tile was selected concurrently.';
  end if;

  update public.movie_buff_boards
  set
    status = 'active',
    current_tile_id = p_tile_id,
    tiles_used_count = (
      select count(*)::integer
      from public.movie_buff_board_tiles as used_tile
      where used_tile.board_id = v_board_id
        and used_tile.is_used = true
    ),
    updated_at = v_now
  where id = v_board_id;

  update public.match_rounds
  set
    clip_id = v_clip_id,
    started_at = coalesce(started_at, v_now),
    ended_at = null
  where id = v_state.round_id
    and match_id = p_match_id;

  v_playback_at := v_now + pg_catalog.make_interval(
    secs => public.movie_buff_phase_duration_seconds('transition')
  );

  update public.movie_buff_match_phase_state
  set
    phase = 'transition',
    phase_version = phase_version + 1,
    phase_started_at = v_now,
    phase_ends_at = v_playback_at,
    selected_tile_id = p_tile_id,
    selected_clip_id = v_clip_id,
    selection_source = p_source,
    playback_starts_at = v_playback_at,
    selector_deadline_at = null,
    answer_deadline_at = null,
    results_end_at = null,
    blocked_reason = null,
    updated_at = v_now
  where match_id = p_match_id
  returning * into v_state;

  insert into public.movie_buff_board_events (
    board_id,
    room_id,
    tile_id,
    player_id,
    event_type,
    payload
  )
  values (
    v_board_id,
    p_room_id,
    p_tile_id,
    p_actor_player_id,
    'tile_selected',
    pg_catalog.jsonb_build_object(
      'matchId', p_match_id,
      'roundId', v_state.round_id,
      'clipId', v_clip_id,
      'selectionSource', p_source,
      'phaseVersion', v_state.phase_version
    )
  );

  perform public.movie_buff_phase_event(
    p_match_id,
    p_room_id,
    v_state.round_id,
    v_state.phase_version,
    'board_select',
    'transition',
    p_source,
    p_actor_player_id,
    pg_catalog.jsonb_build_object(
      'tileId', p_tile_id,
      'clipId', v_clip_id,
      'playbackStartsAt', v_playback_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'matchId', p_match_id,
    'roundId', v_state.round_id,
    'phase', v_state.phase,
    'phaseVersion', v_state.phase_version,
    'tileId', p_tile_id,
    'clipId', v_clip_id,
    'playbackStartsAt', v_playback_at,
    'selectionSource', p_source
  );
end;
$$;

alter function public.movie_buff_guard_phase_tile_mutation() owner to postgres;
alter function public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text)
  owner to postgres;

revoke all on function public.movie_buff_guard_phase_tile_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.movie_buff_apply_phase_tile_selection(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
