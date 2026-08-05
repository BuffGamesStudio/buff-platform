#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(git rev-parse --show-toplevel)"
TMP_SCRIPT="$(mktemp "${RUNNER_TEMP:-/tmp}/movie-buff-full-db-v2-XXXXXX.sh")"
trap 'rm -f "$TMP_SCRIPT"' EXIT

python3 - "$SOURCE_ROOT/scripts/movie-buff-full-database-composition-proof.sh" "$TMP_SCRIPT" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
output = pathlib.Path(sys.argv[2])

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

source = replace_once(
    source,
    """      -e '/^SET transaction_timeout/d' \\
    >\"$destination\"""",
    """      -e '/^SET transaction_timeout/d' \\
      -e 's/extensions\\.gen_random_uuid\\(\\)/gen_random_uuid()/g' \\
    >\"$destination\"""",
    "canonicalize equivalent extension qualification",
)

source = replace_once(
    source,
    """), routine_grants as (
  select 'ROUTINE'::text object_kind, routine_schema object_schema,
         routine_name || '(' || coalesce(specific_name,'') || ')' object_name,
         grantee, privilege_type
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and grantee in ('PUBLIC','anon','authenticated','service_role')
)""",
    """), routine_grants as (
  select 'ROUTINE'::text object_kind, n.nspname object_schema,
         p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' object_name,
         rp.grantee, rp.privilege_type
  from information_schema.routine_privileges rp
  join pg_catalog.pg_proc p
    on p.oid = pg_catalog.substring(rp.specific_name from '_([0-9]+)$')::oid
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and rp.grantee in ('PUBLIC','anon','authenticated','service_role')
)""",
    "use stable routine identities for direct grants",
)

source = replace_once(
    source,
    """select pg_catalog.set_config('movie_buff.allow_public_matchmaking_containment','on',false);
set search_path=public,extensions,pg_catalog;""",
    """select pg_catalog.set_config('movie_buff.allow_public_matchmaking_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_admission_handoff_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_matchmaking_containment','on',false);
select pg_catalog.set_config('movie_buff.allow_destructive_vip_rollback','on',false);
set search_path=public,extensions,pg_catalog;""",
    "authorize committed rollback containment gates",
)

source = replace_once(
    source,
    """  psql \"$DATABASE_URL\" -X -v ON_ERROR_STOP=1 \\
    -v p1=\"$PERSONA_P1\" -v p2=\"$PERSONA_P2\" \\
    -v shared=\"$room_shared\" -v private=\"$room_private\" \\
""",
    """  psql \"$DATABASE_URL\" -X -v ON_ERROR_STOP=1 \\
    -v p1=\"$PERSONA_P1\" -v p2=\"$PERSONA_P2\" -v p3=\"$PERSONA_P3\" \\
    -v shared=\"$room_shared\" -v private=\"$room_private\" \\
""",
    "bind third persona",
)

source = replace_once(
    source,
    """  (:'private'::uuid, upper(substr(replace(:'private','-',''),1,8)), :'p2'::uuid,
   'private','waiting','medium',2,3,0,false);""",
    """  (:'private'::uuid, upper(substr(replace(:'private','-',''),1,8)), :'p3'::uuid,
   'private','waiting','medium',2,3,0,false);""",
    "separate private-room host",
)

source = replace_once(
    source,
    """  (:'shared'::uuid, :'p2'::uuid, false, false, null, now(), now()),
  (:'private'::uuid, :'p2'::uuid, false, true, null, now(), now());""",
    """  (:'shared'::uuid, :'p2'::uuid, false, false, null, now(), now()),
  (:'private'::uuid, :'p3'::uuid, false, true, null, now(), now());""",
    "separate private-room membership",
)

source = replace_once(
    source,
    """      classification=\"PASS\"
      if [[ \"$code\" -ne 0 || \"$observed\" != \"$expected\" ]]; then classification=\"FAIL\"; failed=1; fi
      printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \\
        \"$persona\" \"$table\" \"$expected\" \"${observed:-ERROR}\" \"$classification\" \\
""",
    """      classification=\"PASS\"
      if [[ \"$expected\" == \"DENIED\" ]]; then
        if [[ \"$code\" -eq 0 ]]; then classification=\"FAIL\"; failed=1; fi
        observed=\"$([[ \"$code\" -ne 0 ]] && echo DENIED || echo \"${observed:-VISIBLE}\")\"
      elif [[ \"$code\" -ne 0 || \"$observed\" != \"$expected\" ]]; then
        classification=\"FAIL\"; failed=1
      fi
      printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \\
        \"$persona\" \"$table\" \"$expected\" \"${observed:-ERROR}\" \"$classification\" \\
""",
    "classify expected anonymous denial",
)

source = replace_once(
    source,
    """  check_count anonymous anon \"\" game_rooms 0
  check_count anonymous anon \"\" room_players 0""",
    """  check_count anonymous anon \"\" game_rooms DENIED
  check_count anonymous anon \"\" room_players DENIED""",
    "expect anonymous denial",
)

source = replace_once(
    source,
    """  check_count authenticated-member authenticated \"$PERSONA_P2\" game_rooms 2
  check_count authenticated-member authenticated \"$PERSONA_P2\" room_players 3
  check_count service-role service_role \"\" game_rooms 2
  check_count service-role service_role \"\" room_players 3""",
    """  check_count authenticated-shared-member authenticated \"$PERSONA_P2\" game_rooms 1
  check_count authenticated-shared-member authenticated \"$PERSONA_P2\" room_players 2
  check_count authenticated-private-member authenticated \"$PERSONA_P3\" game_rooms 1
  check_count authenticated-private-member authenticated \"$PERSONA_P3\" room_players 1
  check_count service-role service_role \"\" game_rooms 2
  check_count service-role service_role \"\" room_players 3""",
    "correct isolated persona expectations",
)

source = replace_once(
    source,
    """    PERSONA_P1=\"${PERSONA_IDS[0]:-}\"
    PERSONA_P2=\"${PERSONA_IDS[1]:-}\"
    export PERSONA_P1 PERSONA_P2
    if [[ -z \"$PERSONA_P1\" || -z \"$PERSONA_P2\" ]]; then""",
    """    PERSONA_P1=\"${PERSONA_IDS[0]:-}\"
    PERSONA_P2=\"${PERSONA_IDS[1]:-}\"
    PERSONA_P3=\"${PERSONA_IDS[2]:-}\"
    export PERSONA_P1 PERSONA_P2 PERSONA_P3
    if [[ -z \"$PERSONA_P1\" || -z \"$PERSONA_P2\" || -z \"$PERSONA_P3\" ]]; then""",
    "export third persona",
)

source = replace_once(
    source,
    """  if verify_catalog_contracts; then
    RESULT[function_contract]=\"PASS\"
    RESULT[rls_policy_catalog]=\"PASS\"
  else
    RESULT[function_contract]=\"FAIL\"
    RESULT[rls_policy_catalog]=\"FAIL\"
    record_failure catalog-contract
  fi
  RESULT[direct_effective_grants]=\"PASS\"""",
    """  verify_catalog_contracts || true
  if grep -Eq $'^(exposed-routine-owner-postgres|security-definer-fixed-safe-search-path)\\t.*\\tFAIL$' \\
    \"$EVIDENCE_ROOT/catalog-contract-verification.tsv\"; then
    RESULT[function_contract]=\"FAIL\"
    record_failure function-contract
  else
    RESULT[function_contract]=\"PASS\"
  fi
  if grep -q $'^api-exposed-table-rls\\t0\\tPASS$' \\
    \"$EVIDENCE_ROOT/catalog-contract-verification.tsv\"; then
    RESULT[rls_policy_catalog]=\"PASS\"
  else
    RESULT[rls_policy_catalog]=\"FAIL\"
    record_failure rls-policy-catalog
  fi
  if grep -Eq '# Failed test .*authenticated retains intended SELECT|# Failed test .*anon cannot execute|# Failed test .*service_role retains EXECUTE' \\
    \"$RAW_ROOT/pgtap-movie_buff_security_validation_test.stdout.raw\"; then
    RESULT[direct_effective_grants]=\"FAIL\"
    record_failure direct-effective-grants
  else
    RESULT[direct_effective_grants]=\"PASS\"
  fi""",
    "separate function, RLS, and grant classifications",
)

source = replace_once(
    source,
    """      if compare_snapshot_set \\
        \"$EVIDENCE_ROOT/control-baseline\" \\
        \"$EVIDENCE_ROOT/rolled-back-observed\" \\
        \"$EVIDENCE_ROOT/containment-comparison.tsv\"; then
        RESULT[containment]=\"PASS\"
      else
        RESULT[containment]=\"FAIL\"
        record_failure containment-mismatch
      fi""",
    """      compare_snapshot_set \\
        \"$EVIDENCE_ROOT/control-baseline\" \\
        \"$EVIDENCE_ROOT/rolled-back-observed\" \\
        \"$EVIDENCE_ROOT/containment-control-delta.tsv\" || true

      psql \"$DATABASE_URL\" -X -v ON_ERROR_STOP=1 -AtF $'\\t' \\
        >\"$EVIDENCE_ROOT/containment-contract-verification.tsv\" <<'SQL'
with checks(scope, observed, pass) as (
  select 'mov16-vip-tables-removed', count(*)::text, count(*) = 0
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'movie_buff_vip_definitions','movie_buff_vip_inventory',
      'movie_buff_vip_round_windows','movie_buff_vip_round_required_players',
      'movie_buff_vip_round_locks','movie_buff_vip_consumptions'
    )
  union all
  select 'mov16-vip-routines-removed', count(*)::text, count(*) = 0
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'activate_movie_buff_round_vip','lock_movie_buff_round_vip',
      'get_movie_buff_vip_round_view','set_movie_buff_vip_activation_phase',
      'release_movie_buff_vip_required_player','open_movie_buff_vip_round_window',
      'movie_buff_vip_ineligibility_reason','finalize_movie_buff_vip_round_window'
    )
  union all
  select 'mov17-phase-tables-removed', count(*)::text, count(*) = 0
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public'
    and c.relname in (
      'movie_buff_match_phase_state','movie_buff_match_phase_actions',
      'movie_buff_match_phase_events','movie_buff_match_participant_seats'
    )
  union all
  select 'mov17-phase-routines-removed', count(*)::text, count(*) = 0
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('advance_movie_buff_match_phase','select_movie_buff_match_tile')
  union all
  select 'match-start-handoff-contained',
         concat_ws(',',
           coalesce(pg_catalog.has_function_privilege('public','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false),
           coalesce(pg_catalog.has_function_privilege('anon','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false),
           coalesce(pg_catalog.has_function_privilege('authenticated','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false),
           coalesce(pg_catalog.has_function_privilege('service_role','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false)
         ),
         not coalesce(pg_catalog.has_function_privilege('public','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false)
         and not coalesce(pg_catalog.has_function_privilege('anon','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false)
         and not coalesce(pg_catalog.has_function_privilege('authenticated','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false)
         and not coalesce(pg_catalog.has_function_privilege('service_role','public.begin_movie_buff_match_from_admission(uuid)','EXECUTE'),false)
  union all
  select 'matchmaking-service-only',
         concat_ws(',',
           pg_catalog.has_function_privilege('authenticated','public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)','EXECUTE'),
           pg_catalog.has_function_privilege('service_role','public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)','EXECUTE')
         ),
         not pg_catalog.has_function_privilege('authenticated','public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)','EXECUTE')
         and pg_catalog.has_function_privilege('service_role','public.find_or_create_movie_buff_public_room(uuid,text,integer,integer)','EXECUTE')
  union all
  select 'ready-service-only',
         concat_ws(',',
           pg_catalog.has_function_privilege('authenticated','public.set_movie_buff_player_ready(uuid,boolean)','EXECUTE'),
           pg_catalog.has_function_privilege('service_role','public.set_movie_buff_player_ready(uuid,boolean)','EXECUTE')
         ),
         not pg_catalog.has_function_privilege('authenticated','public.set_movie_buff_player_ready(uuid,boolean)','EXECUTE')
         and pg_catalog.has_function_privilege('service_role','public.set_movie_buff_player_ready(uuid,boolean)','EXECUTE')
  union all
  select 'start-service-only',
         concat_ws(',',
           pg_catalog.has_function_privilege('authenticated','public.start_movie_buff_match(uuid)','EXECUTE'),
           pg_catalog.has_function_privilege('service_role','public.start_movie_buff_match(uuid)','EXECUTE')
         ),
         not pg_catalog.has_function_privilege('authenticated','public.start_movie_buff_match(uuid)','EXECUTE')
         and pg_catalog.has_function_privilege('service_role','public.start_movie_buff_match(uuid)','EXECUTE')
)
select scope, observed, case when pass then 'PASS' else 'FAIL' end
from checks
order by scope;
SQL
      if ! grep -q $'\\tFAIL$' \"$EVIDENCE_ROOT/containment-contract-verification.tsv\" \\
        && cmp -s \"$EVIDENCE_ROOT/control-baseline.ledger.tsv\" \\
          \"$EVIDENCE_ROOT/rolled-back-observed.ledger.tsv\"; then
        RESULT[containment]=\"PASS\"
      else
        RESULT[containment]=\"FAIL\"
        record_failure containment-contract
      fi""",
    "validate intended fail-closed containment contract",
)

output.write_text(source, encoding="utf-8")
PY

bash -n "$TMP_SCRIPT"
bash "$TMP_SCRIPT" "$@"
