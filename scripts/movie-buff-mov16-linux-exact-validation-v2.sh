#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SCRIPT="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly EXPECTED_SOURCE_BLOB="a04985abe5e4ed83eab3ce8805824220f0321a3e"
readonly SOURCE_GUARD="scripts/movie-buff-mov16-evidence-guard.mjs"
readonly EXPECTED_GUARD_BLOB="676c1a21f868a0463e286d314816d3c66e8350f2"
readonly DERIVED_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-linux-exact-validation-v2-derived.sh"
readonly DERIVED_GUARD="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-evidence-guard-derived.mjs"
readonly RUN_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-exact-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

actual_blob="$(git rev-parse "HEAD:${SOURCE_SCRIPT}")"
if [[ "${actual_blob}" != "${EXPECTED_SOURCE_BLOB}" ]]; then
  printf 'Unexpected MOV-16 controller blob: %s\n' "${actual_blob}" >&2
  exit 1
fi

actual_guard_blob="$(git rev-parse "HEAD:${SOURCE_GUARD}")"
if [[ "${actual_guard_blob}" != "${EXPECTED_GUARD_BLOB}" ]]; then
  printf 'Unexpected MOV-16 guard blob: %s\n' "${actual_guard_blob}" >&2
  exit 1
fi

mkdir -p "${RUN_ROOT}"
if [[ ! -e "${RUN_ROOT}/node_modules" ]]; then
  ln -s "${GITHUB_WORKSPACE:-$(pwd)}/node_modules" "${RUN_ROOT}/node_modules"
fi

python3 - "${SOURCE_GUARD}" "${DERIVED_GUARD}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
old = 'const EXPECTED_BRANCH = "copilot/MOV-16-vip-authority";'
new = 'const EXPECTED_BRANCH = process.env.EXPECTED_BRANCH ?? "copilot/MOV-16-vip-authority";'
if source.count(old) != 1:
    raise SystemExit("Expected exactly one MOV-16 branch guard constant.")
pathlib.Path(sys.argv[2]).write_text(source.replace(old, new), encoding="utf-8")
PY

python3 - "${SOURCE_SCRIPT}" "${DERIVED_SCRIPT}" "${DERIVED_GUARD}" <<'PY'
import pathlib, shlex, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
derived_guard = shlex.quote(sys.argv[3])
substitutions = [
    (
'''if "p_required_player_ids" not in source:
    raise SystemExit("MOV-17 does not supply the exact required-human identity snapshot")
''',
'''for token in [
    "public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])",
    "v_required_ids",
    "array_agg(seat.original_player_id order by seat.seat_index)",
]:
    if token not in source:
        raise SystemExit(f"MOV-17 required-human snapshot contract is missing {token}")
'''
    ),
    (
'''  echo "branch=$(git branch --show-current)"
''',
'''  echo "branch=${EXPECTED_BRANCH}"
'''
    ),
    (
'''    node scripts/movie-buff-mov16-deadline-release-race.mjs \\
''',
'''    node scripts/movie-buff-mov16-deadline-release-race-v2.mjs \\
'''
    ),
    (
'''    node "${HARNESS}" >"${RAW}/adversarial-${suffix}.log" 2>&1
''',
'''    node scripts/movie-buff-mov16-adversarial-v3-wrapper.mjs "${HARNESS}" >"${RAW}/adversarial-${suffix}.log" 2>&1
'''
    ),
    (
'''if require_ready; then
  run_pgtap "pgtap-after-reapply"
fi
''',
'''if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \\
    -v room_id="${room_id}" -v definition_id="${definition_id}" <<'SQL' \\
    >"${RAW}/sentinel-data-pre-pgtap-cleanup.log" 2>&1
begin;
delete from public.game_rooms where id=:'room_id'::uuid;
delete from public.movie_buff_vip_inventory where vip_id=:'definition_id'::uuid;
delete from public.movie_buff_vip_definitions where id=:'definition_id'::uuid;
commit;
SQL
  record_exit "sentinel-data-pre-pgtap-cleanup" $?
fi

if require_ready; then
  run_pgtap "pgtap-after-reapply"
fi
'''
    ),
]
for old, new in substitutions:
    if source.count(old) != 1:
        raise SystemExit("Expected exactly one controller substitution: " + repr(old[:80]))
    source = source.replace(old, new)
old_encoding = '''    if not current.startswith(b"\\xef\\xbb\\xbf") or current[3:] != repaired:
        raise SystemExit(f"encoding repair mismatch for {rel}")
    target = work / rel
'''
new_encoding = '''    if current == repaired:
        pass
    elif current.startswith(b"\\xef\\xbb\\xbf") and current[3:] == repaired:
        pass
    else:
        raise SystemExit(f"encoding repair mismatch for {rel}")
    target = work / rel
'''
if source.count(old_encoding) != 1:
    raise SystemExit("Expected exactly one encoding-composition block.")
source = source.replace(old_encoding, new_encoding)
guard_call = "node scripts/movie-buff-mov16-evidence-guard.mjs"
if source.count(guard_call) < 3:
    raise SystemExit("Expected MOV-16 guard calls were not found.")
source = source.replace(guard_call, f"node {derived_guard}")
pathlib.Path(sys.argv[2]).write_text(source, encoding="utf-8")
PY

node --check "${DERIVED_GUARD}"
bash -n "${DERIVED_SCRIPT}"
exec bash "${DERIVED_SCRIPT}"
