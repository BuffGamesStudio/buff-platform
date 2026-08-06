begin;
create extension if not exists pgtap;
select no_plan();

-- Fixed disposable identities. The surrounding transaction is rolled back.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-host@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-member@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-nonmember@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-other-room@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-abandoned@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-reconnecting@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000001007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','agent6-system@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;

insert into public.game_rooms (
  id, room_code, host_id, room_type, status, max_players, total_rounds
)
values
  ('00000000-0000-0000-0000-000000002001','A6ROOMA','00000000-0000-0000-0000-000000001001','private','active',3,10),
  ('00000000-0000-0000-0000-000000002002','A6ROOMB','00000000-0000-0000-0000-000000001004','private','active',3,10);

insert into public.room_players (
  room_id, player_id, is_ready, is_host, left_at, last_seen_at
)
values
  ('00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000001001',true,true,null,now()),
  ('00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000001002',true,false,null,now()),
  ('00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000001005',true,false,now(),now()-interval '1 hour'),
  ('00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000001006',true,false,null,now()-interval '30 seconds'),
  ('00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000001004',true,true,null,now());

insert into public.matches (id, room_id, status)
values
  ('00000000-0000-0000-0000-000000003001','00000000-0000-0000-0000-000000002001','active'),
  ('00000000-0000-0000-0000-000000003002','00000000-0000-0000-0000-000000002002','active');

insert into public.match_rounds (id, match_id, round_number)
values
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000003001',1),
  ('00000000-0000-0000-0000-000000004002','00000000-0000-0000-0000-000000003002',1);

insert into public.movie_buff_boards (
  id, room_id, status, selector_player_id, total_tiles_count
)
values
  ('00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','active','00000000-0000-0000-0000-000000001001',1),
  ('00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-000000002002','active','00000000-0000-0000-0000-000000001004',1);

insert into public.movie_buff_board_categories (id, board_id, display_order, label)
values
  ('00000000-0000-0000-0000-000000006001','00000000-0000-0000-0000-000000005001',0,'Agent 6 A'),
  ('00000000-0000-0000-0000-000000006002','00000000-0000-0000-0000-000000005002',0,'Agent 6 B');

insert into public.movie_buff_board_tiles (
  id, board_id, board_category_id, tile_order, band, point_value
)
values
  ('00000000-0000-0000-0000-000000007001','00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000006001',0,'fan_200',200),
  ('00000000-0000-0000-0000-000000007002','00000000-0000-0000-0000-000000005002','00000000-0000-0000-0000-000000006002',0,'fan_200',200);

insert into public.movie_buff_board_events (
  id, board_id, room_id, event_type, payload
)
values
  ('00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000005001','00000000-0000-0000-0000-000000002001','board_created','{}');

insert into public.match_round_player_hints (round_id, player_id, penalty_seconds)
values
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001001',5),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001002',5),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001004',5),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001005',5),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001006',5);

insert into public.match_round_player_playback (round_id, player_id)
values
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001002'),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001004'),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001005'),
  ('00000000-0000-0000-0000-000000004001','00000000-0000-0000-0000-000000001006');

-- Anonymous / unauthenticated browser: no table access.
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select throws_ok(
  $$select count(*) from public.movie_buff_boards$$,
  '42501',
  'permission denied for table movie_buff_boards',
  'anon cannot read boards'
);
select throws_ok(
  $$select count(*) from public.match_round_player_hints$$,
  '42501',
  'permission denied for table match_round_player_hints',
  'anon cannot read hints'
);
reset role;

-- Authenticated nonmember: grants exist, but RLS returns no rows.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),0,'nonmember sees no board');
select is((select count(*)::integer from public.movie_buff_board_categories),0,'nonmember sees no category');
select is((select count(*)::integer from public.movie_buff_board_tiles),0,'nonmember sees no tile');
select is((select count(*)::integer from public.match_round_player_hints),0,'nonmember sees no hint');
select is((select count(*)::integer from public.match_round_player_playback),0,'nonmember sees no playback');
select throws_ok(
  $$select count(*) from public.movie_buff_board_events$$,
  '42501',
  'permission denied for table movie_buff_board_events',
  'nonmember cannot read raw events'
);
reset role;

-- Host and selector: active-room read, self-only hint/playback, no writes.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),1,'host selector sees own room board');
select is((select count(*)::integer from public.movie_buff_board_categories),1,'host selector sees own room category');
select is((select count(*)::integer from public.movie_buff_board_tiles),1,'host selector sees own room tile');
select is((select count(*)::integer from public.match_round_player_hints),1,'host selector sees only own hint');
select is((select count(*)::integer from public.match_round_player_playback),1,'host selector sees only own playback');
select throws_ok(
  $$update public.movie_buff_boards set status=status where id='00000000-0000-0000-0000-000000005001'$$,
  '42501',
  'permission denied for table movie_buff_boards',
  'host selector cannot update board directly'
);
select throws_ok(
  $$select count(*) from public.movie_buff_board_events$$,
  '42501',
  'permission denied for table movie_buff_board_events',
  'host selector cannot read raw events'
);
reset role;

-- Active nonselector: observer read, self-only private rows, no writes.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),1,'nonselector sees own room board');
select is((select count(*)::integer from public.movie_buff_board_categories),1,'nonselector sees own room category');
select is((select count(*)::integer from public.movie_buff_board_tiles),1,'nonselector sees own room tile');
select is((select count(*)::integer from public.match_round_player_hints),1,'nonselector sees only own hint');
select is((select count(*)::integer from public.match_round_player_playback),1,'nonselector sees only own playback');
select throws_ok(
  $$update public.movie_buff_board_tiles set is_used=true where id='00000000-0000-0000-0000-000000007001'$$,
  '42501',
  'permission denied for table movie_buff_board_tiles',
  'nonselector cannot update tile directly'
);
reset role;

-- Cross-room identity: only its own room board; spoofed private rows stay hidden.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001004',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001004","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),1,'other-room member sees only own room board');
select is((select count(*)::integer from public.movie_buff_board_categories),1,'other-room member sees only own room category');
select is((select count(*)::integer from public.movie_buff_board_tiles),1,'other-room member sees only own room tile');
select is((select count(*)::integer from public.match_round_player_hints),0,'other-room member cannot read spoofed hint in room A');
select is((select count(*)::integer from public.match_round_player_playback),0,'other-room member cannot read spoofed playback in room A');
reset role;

-- Abandoned/stale membership: left_at closes all browser reads.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001005',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001005","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),0,'abandoned player sees no board');
select is((select count(*)::integer from public.match_round_player_hints),0,'abandoned player sees no hint');
select is((select count(*)::integer from public.match_round_player_playback),0,'abandoned player sees no playback');
reset role;

-- Reconnecting member remains active while left_at is null.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001006',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001006","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),1,'reconnecting active member sees board');
select is((select count(*)::integer from public.match_round_player_hints),1,'reconnecting active member sees own hint');
select is((select count(*)::integer from public.match_round_player_playback),1,'reconnecting active member sees own playback');
reset role;

-- Buster/system identity is not a human member and receives no browser rows.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001007',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000001007","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.movie_buff_boards),0,'system identity sees no browser board');
select is((select count(*)::integer from public.match_round_player_hints),0,'system identity sees no private hint');
reset role;

-- Service role retains server continuity, including raw events and writes.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is((select count(*)::integer from public.movie_buff_boards),2,'service role reads all boards');
select is((select count(*)::integer from public.movie_buff_board_categories),2,'service role reads all categories');
select is((select count(*)::integer from public.movie_buff_board_tiles),2,'service role reads all tiles');
select is((select count(*)::integer from public.movie_buff_board_events),1,'service role reads raw events');
select is((select count(*)::integer from public.match_round_player_hints),5,'service role reads all hints');
select is((select count(*)::integer from public.match_round_player_playback),5,'service role reads all playback rows');
select lives_ok(
  $$update public.movie_buff_boards set status=status where id='00000000-0000-0000-0000-000000005001'$$,
  'service role retains board update continuity'
);
reset role;

select * from finish();
rollback;
