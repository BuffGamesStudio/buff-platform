import { spawnSync } from "node:child_process";

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed.\n${
        result.stderr || result.stdout
      }`,
    );
  }

  return result.stdout;
}

function resolveDbContainerName() {
  const projectId =
    process.env.SUPABASE_LOCAL_PROJECT_ID ??
    "buff-platform";
  const output = runCommand("docker", [
    "ps",
    "--filter",
    `label=com.supabase.cli.project=${projectId}`,
    "--format",
    "{{.Names}}",
  ]);

  const containerName = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) =>
      line.startsWith("supabase_db_"),
    );

  if (!containerName) {
    throw new Error(
      `Could not find a running Supabase DB container for local project "${projectId}".`,
    );
  }

  return containerName;
}

function runSql(containerName, sql) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
    ],
    {
      encoding: "utf8",
      input: sql,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `SQL verification failed.\n${result.stderr || ""}${
        result.stdout ? `\n${result.stdout}` : ""
      }`,
    );
  }

  return result.stdout;
}

function extractJsonLine(output) {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const jsonStart = line.indexOf("{");
      return jsonStart >= 0
        ? line.slice(jsonStart)
        : "";
    })
    .find((line) => line.startsWith("{"));

  if (!jsonLine) {
    throw new Error(
      `No JSON payload found in SQL output.\n${output}`,
    );
  }

  return JSON.parse(jsonLine);
}

const AGGREGATE_SQL = `
begin;
create temp table temp_mb_verify_clip on commit drop as
select cm.id as content_media_id, cm.content_id, cm.legacy_clip_id
from public.content_media as cm
where cm.media_type = 'video'
  and cm.legacy_clip_id is not null
order by cm.created_at asc
limit 1;

create temp table temp_mb_verify_match on commit drop as
with inserted_match as (
  insert into public.matches (
    room_id,
    category_id,
    difficulty,
    total_rounds,
    status
  )
  values (
    null,
    null,
    'medium',
    1,
    'active'
  )
  returning id
)
select id as match_id
from inserted_match;

create temp table temp_mb_verify_round on commit drop as
with inserted_round as (
  insert into public.match_rounds (
    match_id,
    clip_id,
    round_number,
    time_limit_seconds
  )
  select
    verify_match.match_id,
    verify_clip.legacy_clip_id,
    1,
    30
  from temp_mb_verify_match as verify_match
  cross join temp_mb_verify_clip as verify_clip
  returning id, match_id
)
select
  id as round_id,
  match_id
from inserted_round;

insert into public.movie_buff_round_events (
  event_type,
  match_id,
  round_id,
  content_id,
  content_media_id,
  legacy_clip_id,
  payload
)
select
  event_row.event_type,
  verify_round.match_id,
  verify_round.round_id,
  chosen.content_id,
  chosen.content_media_id,
  chosen.legacy_clip_id,
  event_row.payload
from temp_mb_verify_clip as chosen
cross join temp_mb_verify_round as verify_round
cross join (
  values
    ('clip_loaded', '{}'::jsonb),
    ('clip_started', '{}'::jsonb),
    ('hint_requested', '{"usedBeforePlayback": true}'::jsonb),
    ('answer_submitted', '{"answer_time_seconds": 12.5}'::jsonb),
    ('answer_correct', '{}'::jsonb)
) as event_row(event_type, payload);

select public.movie_buff_refresh_clip_analytics(content_media_id)
from temp_mb_verify_clip;

select json_build_object(
  'contentMediaId', analytics.content_media_id,
  'visibleEventCount', (
    select count(*)
    from public.movie_buff_round_events
    where content_media_id = analytics.content_media_id
  ),
  'totalPlays', analytics.total_plays,
  'totalCorrect', analytics.total_correct,
  'totalHintsUsed', analytics.total_hints_used,
  'avgAnswerTimeSeconds', analytics.avg_answer_time_seconds,
  'difficultyScore', analytics.difficulty_score,
  'systemDifficultyLabel', analytics.system_difficulty_label,
  'qualityScore', analytics.quality_score,
  'rotationWeight', analytics.rotation_weight
)
from public.movie_buff_clip_analytics as analytics
join temp_mb_verify_clip as chosen
  on chosen.content_media_id = analytics.content_media_id;
rollback;
`;

const ROTATION_SQL = `
begin;
create temp table temp_mb_pick_clips on commit drop as
select *
from (
  select
    ca.content_media_id,
    ca.content_id,
    ca.legacy_clip_id,
    c.movie_id,
    row_number() over (
      partition by c.movie_id
      order by ca.content_media_id
    ) as movie_rank,
    row_number() over (
      order by c.movie_id, ca.content_media_id
    ) as overall_rank
  from public.movie_buff_clip_analytics as ca
  join public.content_media as cm
    on cm.id = ca.content_media_id
  join public.clips as c
    on c.id = ca.legacy_clip_id
  join public.movies as m
    on m.id = c.movie_id
  where cm.media_type = 'video'
    and c.is_active = true
    and m.is_active = true
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
) ranked
where movie_rank = 1
limit 2;

create temp table temp_mb_pick_category (
  category_id uuid
) on commit drop;

with inserted_category as (
  insert into public.categories (name, slug, description)
  select
    'Temp Picker Verify',
    'temp-picker-verify-' || substr(gen_random_uuid()::text, 1, 8),
    'Temporary verification category'
  returning id
)
insert into temp_mb_pick_category (category_id)
select id
from inserted_category;

insert into public.movie_categories (movie_id, category_id)
select clip.movie_id, category.category_id
from temp_mb_pick_clips as clip
cross join temp_mb_pick_category as category;

update public.movie_buff_clip_analytics
set
  rotation_weight = 100,
  status = 'featured',
  quality_score = 100,
  system_difficulty_label = 'Buff'
where content_media_id = (
  select content_media_id
  from temp_mb_pick_clips
  where overall_rank = 1
);

update public.movie_buff_clip_analytics
set
  rotation_weight = 1,
  status = 'active',
  quality_score = 100,
  system_difficulty_label = 'Buff'
where content_media_id = (
  select content_media_id
  from temp_mb_pick_clips
  where overall_rank = 2
);

create temp table temp_mb_weighted_picks on commit drop as
with created_matches as (
  insert into public.matches (
    room_id,
    category_id,
    difficulty,
    total_rounds,
    status
  )
  select
    null,
    (select category_id from temp_mb_pick_category),
    'medium',
    1,
    'active'
  from generate_series(1, 120)
  returning id
)
select public.pick_movie_buff_clip(
  id,
  (select category_id from temp_mb_pick_category),
  'medium'
) as clip_id
from created_matches;

update public.movie_buff_clip_analytics
set status = 'retired'
where content_media_id = (
  select content_media_id
  from temp_mb_pick_clips
  where overall_rank = 2
);

create temp table temp_mb_gated_picks on commit drop as
with created_matches as (
  insert into public.matches (
    room_id,
    category_id,
    difficulty,
    total_rounds,
    status
  )
  select
    null,
    (select category_id from temp_mb_pick_category),
    'medium',
    1,
    'active'
  from generate_series(1, 60)
  returning id
)
select public.pick_movie_buff_clip(
  id,
  (select category_id from temp_mb_pick_category),
  'medium'
) as clip_id
from created_matches;

select json_build_object(
  'highWeightClipId', (
    select legacy_clip_id
    from temp_mb_pick_clips
    where overall_rank = 1
  ),
  'lowWeightClipId', (
    select legacy_clip_id
    from temp_mb_pick_clips
    where overall_rank = 2
  ),
  'weightedPickCounts', (
    select json_object_agg(coalesce(clip_id::text, 'null'), pick_count)
    from (
      select clip_id, count(*) as pick_count
      from temp_mb_weighted_picks
      group by clip_id
    ) weighted_counts
  ),
  'gatedPickCounts', (
    select json_object_agg(coalesce(clip_id::text, 'null'), pick_count)
    from (
      select clip_id, count(*) as pick_count
      from temp_mb_gated_picks
      group by clip_id
    ) gated_counts
  )
);
rollback;
`;

const ADMIN_OVERRIDE_SQL = `
begin;

create temp table temp_mb_admin_pick_clips on commit drop as
select *
from (
  select
    ca.content_media_id,
    ca.content_id,
    ca.legacy_clip_id,
    c.movie_id,
    row_number() over (
      partition by c.movie_id
      order by ca.content_media_id
    ) as movie_rank,
    row_number() over (
      order by c.movie_id, ca.content_media_id
    ) as overall_rank
  from public.movie_buff_clip_analytics as ca
  join public.content_media as cm
    on cm.id = ca.content_media_id
  join public.clips as c
    on c.id = ca.legacy_clip_id
  join public.movies as m
    on m.id = c.movie_id
  where cm.media_type = 'video'
    and c.is_active = true
    and m.is_active = true
    and nullif(btrim(coalesce(c.media_url, '')), '') is not null
) ranked
where movie_rank = 1
limit 3;

update public.movie_buff_clip_analytics
set
  total_plays = 24,
  total_correct = 12,
  total_wrong = 12,
  total_hints_used = 4,
  total_timeouts = 0,
  total_load_success = 24,
  total_load_failures = 0,
  avg_answer_time_seconds = 14,
  sample_size = 24,
  difficulty_score = 50,
  system_difficulty_label = 'Buff',
  quality_score = 100,
  status = 'active',
  admin_boost = 0,
  quality_flags = '[]'::jsonb
where content_media_id in (
  select content_media_id
  from temp_mb_admin_pick_clips
);

select public.movie_buff_refresh_clip_analytics(content_media_id)
from temp_mb_admin_pick_clips;

create temp table temp_mb_admin_baseline on commit drop as
select
  content_media_id,
  rotation_weight,
  admin_boost,
  status,
  quality_score
from public.movie_buff_clip_analytics
where content_media_id in (
  select content_media_id
  from temp_mb_admin_pick_clips
);

update public.movie_buff_clip_analytics
set admin_boost = 3
where content_media_id = (
  select content_media_id
  from temp_mb_admin_pick_clips
  where overall_rank = 1
);

update public.movie_buff_clip_analytics
set
  admin_boost = 3,
  quality_score = 20
where content_media_id = (
  select content_media_id
  from temp_mb_admin_pick_clips
  where overall_rank = 2
);

update public.movie_buff_clip_analytics
set
  admin_boost = 3,
  status = 'cooling_down'
where content_media_id = (
  select content_media_id
  from temp_mb_admin_pick_clips
  where overall_rank = 3
);

select public.movie_buff_refresh_clip_analytics(content_media_id)
from temp_mb_admin_pick_clips;

select json_build_object(
  'baseline', (
    select json_object_agg(
      content_media_id::text,
      json_build_object(
        'rotationWeight', rotation_weight,
        'adminBoost', admin_boost,
        'status', status,
        'qualityScore', quality_score
      )
    )
    from temp_mb_admin_baseline
  ),
  'afterOverride', (
    select json_object_agg(
      content_media_id::text,
      json_build_object(
        'rotationWeight', rotation_weight,
        'adminBoost', admin_boost,
        'status', status,
        'qualityScore', quality_score
      )
    )
    from public.movie_buff_clip_analytics
    where content_media_id in (
      select content_media_id
      from temp_mb_admin_pick_clips
    )
  )
);

rollback;
`;

const LIFECYCLE_SQL = `
begin;

-- A clean Supabase reset has no auth users. Provision only two disposable
-- verifier personas inside this transaction so lifecycle coverage does not
-- depend on unrelated local state. The auth trigger creates their profiles.
with fixture_users (id, email, display_name) as (
  values
    (
      gen_random_uuid(),
      'moviebuff-analytics-host@example.com',
      'Movie Buff analytics host'
    ),
    (
      gen_random_uuid(),
      'moviebuff-analytics-guest@example.com',
      'Movie Buff analytics guest'
    )
), missing_fixture_users as (
  select fixture.*
  from fixture_users as fixture
  where not exists (
    select 1
    from auth.users as existing
    where existing.email = fixture.email
  )
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
)
select
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', fixture.display_name),
  now(),
  now(),
  false
from missing_fixture_users as fixture;

create temp table temp_mb_verify_users on commit drop as
select id
from auth.users
where email in (
  'moviebuff-analytics-host@example.com',
  'moviebuff-analytics-guest@example.com'
)
order by email;

do $$
begin
  if (select count(*) from temp_mb_verify_users) <> 2 then
    raise exception 'Analytics verifier could not provision its two disposable users.';
  end if;
end
$$;

create temp table temp_mb_verify_host on commit drop as
select id as player_id
from temp_mb_verify_users
order by id asc
limit 1;

create temp table temp_mb_verify_guest on commit drop as
select id as player_id
from temp_mb_verify_users
order by id desc
limit 1;

create temp table temp_mb_verify_clip_seed on commit drop as
select
  c.id as legacy_clip_id,
  mo.id as movie_id,
  mo.title,
  ci.id as content_id,
  cm.id as content_media_id
from public.clips as c
join public.movies as mo
  on mo.id = c.movie_id
left join public.content_items as ci
  on ci.legacy_movie_id = mo.id
left join public.content_media as cm
  on cm.legacy_clip_id = c.id
where c.is_active = true
  and mo.is_active = true
  and c.clip_type = 'video'
  and nullif(btrim(coalesce(c.media_url, '')), '') is not null
order by c.created_at asc nulls first, c.id asc
limit 1;

create temp table temp_mb_verify_room on commit drop as
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid as room_id,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid as match_id,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid as round_id;

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_verify_host),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.game_rooms (
  id,
  room_code,
  host_id,
  room_type,
  difficulty,
  total_rounds,
  max_players,
  is_ranked,
  status,
  current_round,
  started_at
)
select
  room.room_id,
  'LFCYCL',
  host.player_id,
  'private',
  'medium',
  1,
  4,
  false,
  'waiting',
  0,
  now()
from temp_mb_verify_room as room
cross join temp_mb_verify_host as host;

insert into public.room_players (
  room_id,
  player_id,
  is_ready,
  is_host,
  score,
  current_streak,
  lives
)
select
  room.room_id,
  host.player_id,
  false,
  true,
  0,
  0,
  3
from temp_mb_verify_room as room
cross join temp_mb_verify_host as host;

insert into public.room_players (
  room_id,
  player_id,
  is_ready,
  is_host,
  score,
  current_streak,
  lives
)
select
  room.room_id,
  guest.player_id,
  false,
  false,
  0,
  0,
  3
from temp_mb_verify_room as room
cross join temp_mb_verify_guest as guest;

update public.room_players
set is_ready = true
where room_id = (select room_id from temp_mb_verify_room)
  and player_id in (
    select player_id from temp_mb_verify_host
    union all
    select player_id from temp_mb_verify_guest
  );

insert into public.matches (
  id,
  room_id,
  difficulty,
  total_rounds,
  status,
  started_at
)
select
  room.match_id,
  room.room_id,
  'medium',
  1,
  'active',
  now()
from temp_mb_verify_room as room;

insert into public.match_players (
  match_id,
  player_id,
  final_score,
  correct_answers,
  incorrect_answers,
  xp_earned,
  coins_earned
)
select
  room.match_id,
  players.player_id,
  0,
  0,
  0,
  0,
  0
from temp_mb_verify_room as room
cross join (
  select player_id from temp_mb_verify_host
  union all
  select player_id from temp_mb_verify_guest
) as players;

insert into public.match_rounds (
  id,
  match_id,
  clip_id,
  round_number,
  time_limit_seconds,
  started_at
)
select
  room.round_id,
  room.match_id,
  clip.legacy_clip_id,
  1,
  30,
  now()
from temp_mb_verify_room as room
cross join temp_mb_verify_clip_seed as clip;

update public.game_rooms
set
  status = 'active',
  current_round = 1
where id = (select room_id from temp_mb_verify_room);

insert into public.movie_buff_round_events (
  event_type,
  room_id,
  match_id,
  round_id,
  player_id,
  content_id,
  content_media_id,
  legacy_clip_id,
  payload
)
select
  'round_started',
  room.room_id,
  room.match_id,
  room.round_id,
  host.player_id,
  clip.content_id,
  clip.content_media_id,
  clip.legacy_clip_id,
  '{"trigger":"verify_lifecycle"}'::jsonb
from temp_mb_verify_room as room
cross join temp_mb_verify_host as host
cross join temp_mb_verify_clip_seed as clip;

create temp table temp_mb_media_ready_result on commit drop as
select *
from public.mark_movie_buff_round_media_ready(
  (select room_id from temp_mb_verify_room)
);

create temp table temp_mb_clip_loaded_event on commit drop as
select public.record_movie_buff_event(
  'clip_loaded',
  (select room_id from temp_mb_verify_room),
  (select match_id from temp_mb_verify_room),
  (select round_id from temp_mb_verify_room),
  null,
  (select content_id from temp_mb_verify_clip_seed),
  (select content_media_id from temp_mb_verify_clip_seed),
  (select legacy_clip_id from temp_mb_verify_clip_seed),
  '{"clipType":"video"}'::jsonb
) as event_id;

create temp table temp_mb_hint_result on commit drop as
select *
from public.use_movie_buff_round_hint(
  (select room_id from temp_mb_verify_room),
  5
);

create temp table temp_mb_hint_requested_event on commit drop as
select public.record_movie_buff_event(
  'hint_requested',
  (select room_id from temp_mb_verify_room),
  (select match_id from temp_mb_verify_room),
  (select round_id from temp_mb_verify_room),
  null,
  (select content_id from temp_mb_verify_clip_seed),
  (select content_media_id from temp_mb_verify_clip_seed),
  (select legacy_clip_id from temp_mb_verify_clip_seed),
  '{"penaltySeconds":5,"clipType":"video"}'::jsonb
) as event_id;

create temp table temp_mb_prepare_playback_result on commit drop as
select *
from public.prepare_movie_buff_round_playback(
  (select room_id from temp_mb_verify_room)
);

create temp table temp_mb_clip_start_requested_event on commit drop as
select public.record_movie_buff_event(
  'clip_start_requested',
  (select room_id from temp_mb_verify_room),
  (select match_id from temp_mb_verify_room),
  (select round_id from temp_mb_verify_room),
  null,
  (select content_id from temp_mb_verify_clip_seed),
  (select content_media_id from temp_mb_verify_clip_seed),
  (select legacy_clip_id from temp_mb_verify_clip_seed),
  '{"clipType":"video"}'::jsonb
) as event_id;

create temp table temp_mb_start_playback_result on commit drop as
select *
from public.start_movie_buff_round_playback(
  (select room_id from temp_mb_verify_room)
);

-- The lifecycle fixture still exercises the legacy media helpers directly, but
-- answers are now guarded by the server-owned phase machine. Bootstrap the
-- authoritative row and fast-forward this disposable transaction to the
-- answer window without weakening the production trigger or RPC path.
select public.ensure_movie_buff_match_phase_state(
  (select room_id from temp_mb_verify_room)
);

update public.movie_buff_match_phase_state
set
  phase = 'answer',
  phase_version = phase_version + 1,
  phase_started_at = now(),
  phase_ends_at = now() + interval '30 seconds',
  answer_deadline_at = now() + interval '30 seconds',
  selected_clip_id = (select legacy_clip_id from temp_mb_verify_clip_seed),
  selection_source = 'system',
  playback_starts_at = coalesce(playback_starts_at, now()),
  updated_at = now()
where match_id = (select match_id from temp_mb_verify_room)
  and round_id = (select round_id from temp_mb_verify_room);

create temp table temp_mb_clip_started_event on commit drop as
select public.record_movie_buff_event(
  'clip_started',
  (select room_id from temp_mb_verify_room),
  (select match_id from temp_mb_verify_room),
  (select round_id from temp_mb_verify_room),
  null,
  (select content_id from temp_mb_verify_clip_seed),
  (select content_media_id from temp_mb_verify_clip_seed),
  (select legacy_clip_id from temp_mb_verify_clip_seed),
  '{"clipType":"video"}'::jsonb
) as event_id;

create temp table temp_mb_submit_answer_result on commit drop as
select *
from public.submit_movie_buff_answer(
  (select room_id from temp_mb_verify_room),
  (select title from temp_mb_verify_clip_seed)
);

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_verify_guest),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table temp_mb_leave_result on commit drop as
select public.leave_movie_buff_room(
  (select room_id from temp_mb_verify_room)
) as lifecycle_leave_result;

select json_build_object(
  'eventsByType',
  (
    select json_object_agg(event_type, event_count)
    from (
      select event_type, count(*) as event_count
      from public.movie_buff_round_events
      where room_id = (select room_id from temp_mb_verify_room)
      group by event_type
      order by event_type
    ) as counted
  ),
  'clipAnalytics',
  (
    select json_build_object(
      'totalPlays', ca.total_plays,
      'totalCorrect', ca.total_correct,
      'totalHintsUsed', ca.total_hints_used,
      'totalLoadSuccess', ca.total_load_success,
      'sampleSize', ca.sample_size,
      'difficultyLabel', ca.system_difficulty_label
    )
    from public.movie_buff_clip_analytics as ca
    where ca.content_media_id = (
      select content_media_id from temp_mb_verify_clip_seed
    )
  ),
  'movieAnalytics',
  (
    select json_build_object(
      'totalClipCount', ma.total_clip_count,
      'playableClipCount', ma.playable_clip_count,
      'totalPlays', ma.total_plays,
      'totalHintsUsed', ma.total_hints_used
    )
    from public.movie_buff_movie_analytics as ma
    where ma.content_id = (
      select content_id from temp_mb_verify_clip_seed
    )
  )
);

rollback;
`;

const RUNTIME_EDGE_SQL = `
begin;

with fixture_user (id, email) as (
  values (gen_random_uuid(), 'moviebuff-analytics-edge@example.com')
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
)
select
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
from fixture_user as fixture
where not exists (
  select 1
  from auth.users as existing
  where existing.email = fixture.email
);

select set_config(
  'request.jwt.claim.sub',
  (
    select u.id::text
    from auth.users as u
    where u.email = 'moviebuff-analytics-edge@example.com'
  ),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table temp_mb_edge_host on commit drop as
select auth.uid() as player_id;

create temp table temp_mb_edge_clip_seed on commit drop as
select
  cm.id as content_media_id,
  cm.content_id,
  cm.legacy_clip_id,
  ci.title
from public.content_media as cm
join public.content_items as ci
  on ci.id = cm.content_id
where cm.media_type = 'video'
  and cm.legacy_clip_id is not null
order by cm.created_at asc
limit 1;

create temp table temp_mb_edge_room on commit drop as
with inserted_room as (
  insert into public.game_rooms (
    host_id,
    room_code,
    room_type,
    status,
    max_players,
    total_rounds,
    difficulty,
    current_round
  )
  select
    host.player_id,
    upper(substr(md5(random()::text), 1, 6)),
    'private',
    'starting',
    2,
    1,
    'medium',
    1
  from temp_mb_edge_host as host
  returning id, host_id
)
select
  room.id as room_id,
  room.host_id as host_id,
  gen_random_uuid() as match_id,
  gen_random_uuid() as round_id
from inserted_room as room;

insert into public.room_players (
  room_id,
  player_id,
  is_host,
  is_ready,
  joined_at
)
select
  room.room_id,
  room.host_id,
  true,
  true,
  now()
from temp_mb_edge_room as room;

insert into public.matches (
  id,
  room_id,
  category_id,
  difficulty,
  total_rounds,
  status,
  started_at
)
select
  room.match_id,
  room.room_id,
  null,
  'medium',
  1,
  'active',
  now()
from temp_mb_edge_room as room;

insert into public.match_players (
  match_id,
  player_id,
  final_score,
  correct_answers,
  incorrect_answers,
  xp_earned,
  coins_earned
)
select
  room.match_id,
  room.host_id,
  0,
  0,
  0,
  0,
  0
from temp_mb_edge_room as room;

insert into public.match_rounds (
  id,
  match_id,
  clip_id,
  round_number,
  time_limit_seconds,
  started_at
)
select
  room.round_id,
  room.match_id,
  clip.legacy_clip_id,
  1,
  30,
  now()
from temp_mb_edge_room as room
cross join temp_mb_edge_clip_seed as clip;

create temp table temp_mb_edge_media_ready_result on commit drop as
select *
from public.mark_movie_buff_round_media_ready(
  (select room_id from temp_mb_edge_room)
);

create temp table temp_mb_edge_media_ready_event on commit drop as
select public.record_movie_buff_event(
  'media_ready',
  (select room_id from temp_mb_edge_room),
  (select match_id from temp_mb_edge_room),
  (select round_id from temp_mb_edge_room),
  null,
  (select content_id from temp_mb_edge_clip_seed),
  (select content_media_id from temp_mb_edge_clip_seed),
  (select legacy_clip_id from temp_mb_edge_clip_seed),
  '{"clipType":"video"}'::jsonb
) as event_id;

create temp table temp_mb_edge_timeout_event on commit drop as
select public.record_movie_buff_event(
  'timeout',
  (select room_id from temp_mb_edge_room),
  (select match_id from temp_mb_edge_room),
  (select round_id from temp_mb_edge_room),
  (select host_id from temp_mb_edge_room),
  (select content_id from temp_mb_edge_clip_seed),
  (select content_media_id from temp_mb_edge_clip_seed),
  (select legacy_clip_id from temp_mb_edge_clip_seed),
  '{"clipType":"video","reason":"verify_runtime_edges"}'::jsonb
) as event_id;

create temp table temp_mb_edge_failed_event on commit drop as
select public.record_movie_buff_event(
  'clip_failed_to_load',
  (select room_id from temp_mb_edge_room),
  (select match_id from temp_mb_edge_room),
  (select round_id from temp_mb_edge_room),
  (select host_id from temp_mb_edge_room),
  (select content_id from temp_mb_edge_clip_seed),
  (select content_media_id from temp_mb_edge_clip_seed),
  (select legacy_clip_id from temp_mb_edge_clip_seed),
  '{"clipType":"video","reason":"verify_runtime_edges"}'::jsonb
) as event_id;

create temp table temp_mb_edge_leave_result on commit drop as
select public.leave_movie_buff_room(
  (select room_id from temp_mb_edge_room)
) as leave_result;

select json_build_object(
  'eventsByType',
  (
    select json_object_agg(event_type, event_count)
    from (
      select event_type, count(*) as event_count
      from public.movie_buff_round_events
      where room_id = (select room_id from temp_mb_edge_room)
      group by event_type
      order by event_type
    ) as counted
  ),
  'clipAnalytics',
  (
    select json_build_object(
      'totalTimeouts', ca.total_timeouts,
      'totalLoadFailures', ca.total_load_failures,
      'totalLoadSuccess', ca.total_load_success,
      'qualityScore', ca.quality_score,
      'rotationWeight', ca.rotation_weight,
      'status', ca.status
    )
    from public.movie_buff_clip_analytics as ca
    where ca.content_media_id = (
      select content_media_id from temp_mb_edge_clip_seed
    )
  ),
  'roomStatus',
  (
    select gr.status
    from public.game_rooms as gr
    where gr.id = (select room_id from temp_mb_edge_room)
  )
);

rollback;
`;

const MATCH_COMPLETION_SQL = `
begin;

with fixture_user (id, email) as (
  values (gen_random_uuid(), 'moviebuff-analytics-completion@example.com')
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
)
select
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
from fixture_user as fixture
where not exists (
  select 1
  from auth.users as existing
  where existing.email = fixture.email
);

select set_config(
  'request.jwt.claim.sub',
  (
    select u.id::text
    from auth.users as u
    where u.email = 'moviebuff-analytics-completion@example.com'
  ),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table temp_mb_complete_host on commit drop as
select auth.uid() as player_id;

create temp table temp_mb_complete_clip_seed on commit drop as
select
  c.id as legacy_clip_id,
  c.movie_id,
  m.title
from public.clips as c
join public.movies as m
  on m.id = c.movie_id
where c.is_active = true
  and m.is_active = true
  and c.clip_type = 'video'
  and nullif(btrim(coalesce(c.media_url, '')), '') is not null
order by c.created_at asc nulls first, c.id asc
limit 1;

create temp table temp_mb_complete_room on commit drop as
with inserted_room as (
  insert into public.game_rooms (
    host_id,
    room_code,
    room_type,
    status,
    max_players,
    total_rounds,
    difficulty,
    current_round
  )
  select
    host.player_id,
    upper(substr(md5(random()::text), 1, 6)),
    'private',
    'waiting',
    2,
    2,
    'medium',
    0
  from temp_mb_complete_host as host
  returning id, host_id
)
select
  room.id as room_id,
  room.host_id as host_id
from inserted_room as room;

insert into public.room_players (
  room_id,
  player_id,
  is_host,
  is_ready,
  score,
  current_streak,
  lives,
  joined_at
)
select
  room.room_id,
  room.host_id,
  true,
  true,
  0,
  0,
  3,
  now()
from temp_mb_complete_room as room;

create temp table temp_mb_complete_started on commit drop as
select *
from public.start_movie_buff_match(
  (select room_id from temp_mb_complete_room)
);

create temp table temp_mb_complete_round1 on commit drop as
select *
from public.enter_movie_buff_round(
  (select room_id from temp_mb_complete_room)
);

-- The authoritative start RPC creates an inert round shell. Bind the
-- disposable fixture to its local clip and put the phase row in the answer
-- window so this completion check exercises the real answer trigger.
update public.match_rounds
set
  clip_id = (select legacy_clip_id from temp_mb_complete_clip_seed),
  started_at = now(),
  playback_started_at = now()
where id = (select created_round_id from temp_mb_complete_started);

update public.movie_buff_match_phase_state
set
  round_id = (select created_round_id from temp_mb_complete_started),
  round_number = 1,
  phase = 'answer',
  phase_version = phase_version + 1,
  phase_started_at = now(),
  phase_ends_at = now() + interval '30 seconds',
  answer_deadline_at = now() + interval '30 seconds',
  selected_clip_id = (select legacy_clip_id from temp_mb_complete_clip_seed),
  selection_source = 'system',
  playback_starts_at = coalesce(playback_starts_at, now()),
  updated_at = now()
where room_id = (select room_id from temp_mb_complete_room);

create temp table temp_mb_complete_answer1 on commit drop as
select *
from public.submit_movie_buff_answer(
  (select room_id from temp_mb_complete_room),
  (select title from temp_mb_complete_clip_seed)
);

create temp table temp_mb_complete_advance1 on commit drop as
select *
from public.advance_movie_buff_round(
  (select room_id from temp_mb_complete_room)
);

create temp table temp_mb_complete_round2 on commit drop as
select *
from public.enter_movie_buff_round(
  (select room_id from temp_mb_complete_room)
);

update public.match_rounds
set
  clip_id = (select legacy_clip_id from temp_mb_complete_clip_seed),
  started_at = now(),
  playback_started_at = now()
where id = (select result_round_id from temp_mb_complete_round2);

update public.movie_buff_match_phase_state
set
  round_id = (select result_round_id from temp_mb_complete_round2),
  round_number = 2,
  phase = 'answer',
  phase_version = phase_version + 1,
  phase_started_at = now(),
  phase_ends_at = now() + interval '30 seconds',
  answer_deadline_at = now() + interval '30 seconds',
  selected_clip_id = (select legacy_clip_id from temp_mb_complete_clip_seed),
  selection_source = 'system',
  playback_starts_at = coalesce(playback_starts_at, now()),
  updated_at = now()
where room_id = (select room_id from temp_mb_complete_room);

create temp table temp_mb_complete_answer2 on commit drop as
select *
from public.submit_movie_buff_answer(
  (select room_id from temp_mb_complete_room),
  (select title from temp_mb_complete_clip_seed)
);

create temp table temp_mb_complete_advance2 on commit drop as
select *
from public.advance_movie_buff_round(
  (select room_id from temp_mb_complete_room)
);

create temp table temp_mb_complete_final on commit drop as
select *
from public.get_movie_buff_final_results(
  (select room_id from temp_mb_complete_room)
);

select json_build_object(
  'roomStatus', (
    select status
    from public.game_rooms
    where id = (select room_id from temp_mb_complete_room)
  ),
  'advanceStatuses', json_build_object(
    'afterRound1', (
      select result_status
      from temp_mb_complete_advance1
      limit 1
    ),
    'afterRound2', (
      select result_status
      from temp_mb_complete_advance2
      limit 1
    )
  ),
  'currentRound', (
    select current_round
    from public.game_rooms
    where id = (select room_id from temp_mb_complete_room)
  ),
  'completedRounds', (
    select result_completed_rounds
    from temp_mb_complete_final
    limit 1
  ),
  'totalRounds', (
    select result_total_rounds
    from temp_mb_complete_final
    limit 1
  ),
  'finalResultsStatus', (
    select result_room_status
    from temp_mb_complete_final
    limit 1
  ),
  'standingsCount', (
    select jsonb_array_length(result_standings)
    from temp_mb_complete_final
    limit 1
  ),
  'eventsByType', (
    select json_object_agg(event_type, event_count)
    from (
      select event_type, count(*) as event_count
      from public.movie_buff_round_events
      where room_id = (select room_id from temp_mb_complete_room)
      group by event_type
      order by event_type
    ) as counted
  )
);

rollback;
`;

const PUBLIC_MATCH_SQL = `
begin;

with fixture_users (id, email) as (
  values
    (
      gen_random_uuid(),
      'moviebuff-analytics-public-host@example.com'
    ),
    (
      gen_random_uuid(),
      'moviebuff-analytics-public-guest@example.com'
    )
)
insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_anonymous
)
select
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
from fixture_users as fixture
where not exists (
  select 1
  from auth.users as existing
  where existing.email = fixture.email
);

create temp table temp_mb_public_verify_users on commit drop as
select id
from auth.users
where email in (
  'moviebuff-analytics-public-host@example.com',
  'moviebuff-analytics-public-guest@example.com'
)
order by email;

create temp table temp_mb_public_verify_host on commit drop as
select id as player_id
from temp_mb_public_verify_users
order by id asc
limit 1;

create temp table temp_mb_public_verify_guest on commit drop as
select id as player_id
from temp_mb_public_verify_users
order by id desc
limit 1;

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_public_verify_host),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table temp_mb_public_room_a on commit drop as
select *
from public.find_or_create_movie_buff_public_room(
  null,
  'medium',
  3,
  3
);

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_public_verify_guest),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temp table temp_mb_public_room_b on commit drop as
select *
from public.find_or_create_movie_buff_public_room(
  null,
  'medium',
  3,
  3
);

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_public_verify_host),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.set_movie_buff_player_ready(
  (select id from temp_mb_public_room_a limit 1),
  true
);

select set_config(
  'request.jwt.claim.sub',
  (select player_id::text from temp_mb_public_verify_guest),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.set_movie_buff_player_ready(
  (select id from temp_mb_public_room_b limit 1),
  true
);

select json_build_object(
  'sameRoom', (
    select
      (select id from temp_mb_public_room_a limit 1) =
      (select id from temp_mb_public_room_b limit 1)
  ),
  'roomId', (
    select id
    from temp_mb_public_room_a
    limit 1
  ),
  'roomStatus', (
    select status
    from public.game_rooms
    where id = (select id from temp_mb_public_room_a limit 1)
  ),
  'currentRound', (
    select current_round
    from public.game_rooms
    where id = (select id from temp_mb_public_room_a limit 1)
  ),
  'startedAtPresent', (
    select started_at is not null
    from public.game_rooms
    where id = (select id from temp_mb_public_room_a limit 1)
  ),
  'activePlayers', (
    select count(*)
    from public.room_players
    where room_id = (select id from temp_mb_public_room_a limit 1)
      and left_at is null
  ),
  'readyPlayers', (
    select count(*)
    from public.room_players
    where room_id = (select id from temp_mb_public_room_a limit 1)
      and left_at is null
      and is_ready = true
  ),
  'matchStatus', (
    select status
    from public.matches
    where room_id = (select id from temp_mb_public_room_a limit 1)
    order by started_at desc
    limit 1
  ),
  'roundCount', (
    select count(*)
    from public.match_rounds
    where match_id = (
      select id
      from public.matches
      where room_id = (select id from temp_mb_public_room_a limit 1)
      order by started_at desc
      limit 1
    )
  ),
  'eventsByType', (
    select json_object_agg(event_type, event_count)
    from (
      select event_type, count(*) as event_count
      from public.movie_buff_round_events
      where room_id = (select id from temp_mb_public_room_a limit 1)
      group by event_type
      order by event_type
    ) counted
  ),
  'roundStartedTrigger', (
    select payload ->> 'trigger'
    from public.movie_buff_round_events
    where room_id = (select id from temp_mb_public_room_a limit 1)
      and event_type = 'round_started'
    order by created_at desc
    limit 1
  )
);

rollback;
`;

try {
  const containerName = resolveDbContainerName();
  const aggregateVerification = extractJsonLine(
    runSql(containerName, AGGREGATE_SQL),
  );
  const rotationVerification = extractJsonLine(
    runSql(containerName, ROTATION_SQL),
  );
  const adminOverrideVerification =
    extractJsonLine(
      runSql(containerName, ADMIN_OVERRIDE_SQL),
    );
  const lifecycleVerification = extractJsonLine(
    runSql(containerName, LIFECYCLE_SQL),
  );
  const runtimeEdgeVerification = extractJsonLine(
    runSql(containerName, RUNTIME_EDGE_SQL),
  );
  const matchCompletionVerification =
    extractJsonLine(
      runSql(containerName, MATCH_COMPLETION_SQL),
    );
  const publicMatchVerification =
    extractJsonLine(
      runSql(containerName, PUBLIC_MATCH_SQL),
    );

  console.log(
    JSON.stringify(
      {
        containerName,
        aggregateVerification,
        rotationVerification,
        adminOverrideVerification,
        lifecycleVerification,
        runtimeEdgeVerification,
        matchCompletionVerification,
        publicMatchVerification,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : String(error),
  );
  process.exit(1);
}
