-- 20260805194400 is a read-only fail-closed preflight.
-- It creates no schema or data changes and therefore requires no mutation on
-- rollback. Preserve this artifact so the migration/rollback manifest remains
-- one-to-one and portable.
select true as movie_buff_buster_leave_authority_preflight_rollback_noop;
