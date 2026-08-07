begin;
create extension if not exists pgtap;
select plan(5);

select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_room_member(uuid)') is null,
  'containment removes Agent 6 active_room_member helper'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_board_member(uuid)') is null,
  'containment removes Agent 6 active_board_member helper'
);
select ok(
  pg_catalog.to_regprocedure('movie_buff_security.active_round_member(uuid)') is null,
  'containment removes Agent 6 active_round_member helper'
);
select ok(
  pg_catalog.to_regnamespace('movie_buff_security') is not null,
  'containment preserves the shared movie_buff_security schema'
);
select ok(
  pg_catalog.to_regprocedure(
    'movie_buff_security.current_user_email_is_confirmed()'
  ) is not null,
  'containment preserves the MOV-15 shared-schema helper'
);

select * from finish();
rollback;
