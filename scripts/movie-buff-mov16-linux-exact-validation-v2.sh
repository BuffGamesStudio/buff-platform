#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SCRIPT="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly EXPECTED_SOURCE_BLOB="a04985abe5e4ed83eab3ce8805824220f0321a3e"
readonly DERIVED_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-linux-exact-validation-v2-derived.sh"

actual_blob="$(git rev-parse "HEAD:${SOURCE_SCRIPT}")"
if [[ "${actual_blob}" != "${EXPECTED_SOURCE_BLOB}" ]]; then
  printf 'Unexpected MOV-16 controller blob: %s\n' "${actual_blob}" >&2
  exit 1
fi

python3 - "${SOURCE_SCRIPT}" "${DERIVED_SCRIPT}" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
old = '''if "p_required_player_ids" not in source:
    raise SystemExit("MOV-17 does not supply the exact required-human identity snapshot")
'''
new = '''for token in [
    "public.open_movie_buff_vip_round_window(uuid,uuid,uuid,timestamptz,uuid[])",
    "v_required_ids",
    "array_agg(seat.original_player_id order by seat.seat_index)",
]:
    if token not in source:
        raise SystemExit(f"MOV-17 required-human snapshot contract is missing {token}")
'''
if source.count(old) != 1:
    raise SystemExit("Expected exactly one obsolete MOV-17 binder block.")
pathlib.Path(sys.argv[2]).write_text(source.replace(old, new), encoding="utf-8")
PY

bash -n "${DERIVED_SCRIPT}"
exec bash "${DERIVED_SCRIPT}"
