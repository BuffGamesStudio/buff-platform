begin;
create extension if not exists pgtap;
select plan(4);

select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_room_member(uuid)') is null,
  'containment removes active_room_member helper'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_board_member(uuid)') is null,
  'containment removes active_board_member helper'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_round_member(uuid)') is null,
  'containment removes active_round_member helper'
);
select ok(
  pg_catalog.to_regnamespace('movie_buff_security') is null,
  'containment removes the dedicated policy-helper schema'
);

select * from finish();
rollback;
