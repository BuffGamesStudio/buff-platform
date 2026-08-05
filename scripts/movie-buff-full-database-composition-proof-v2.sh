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

output.write_text(source, encoding="utf-8")
PY

bash -n "$TMP_SCRIPT"
bash "$TMP_SCRIPT" "$@"
