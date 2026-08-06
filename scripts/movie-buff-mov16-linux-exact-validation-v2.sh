#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SCRIPT="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly EXPECTED_SOURCE_BLOB="a04985abe5e4ed83eab3ce8805824220f0321a3e"
readonly DERIVED_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-linux-exact-validation-v2-derived.sh"
readonly RUN_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-exact-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

actual_blob="$(git rev-parse "HEAD:${SOURCE_SCRIPT}")"
if [[ "${actual_blob}" != "${EXPECTED_SOURCE_BLOB}" ]]; then
  printf 'Unexpected MOV-16 controller blob: %s\n' "${actual_blob}" >&2
  exit 1
fi

mkdir -p "${RUN_ROOT}"
if [[ ! -e "${RUN_ROOT}/node_modules" ]]; then
  ln -s "${GITHUB_WORKSPACE:-$(pwd)}/node_modules" "${RUN_ROOT}/node_modules"
fi

python3 - "${SOURCE_SCRIPT}" "${DERIVED_SCRIPT}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
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
]
for old, new in substitutions:
    if source.count(old) != 1:
        raise SystemExit("Expected exactly one controller substitution: " + repr(old[:80]))
    source = source.replace(old, new)
pathlib.Path(sys.argv[2]).write_text(source, encoding="utf-8")
PY

bash -n "${DERIVED_SCRIPT}"
exec bash "${DERIVED_SCRIPT}"
