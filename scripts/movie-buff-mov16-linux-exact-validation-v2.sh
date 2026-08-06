#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_SCRIPT="scripts/movie-buff-mov16-linux-exact-validation.sh"
readonly EXPECTED_SOURCE_BLOB="a04985abe5e4ed83eab3ce8805824220f0321a3e"
readonly SOURCE_GUARD="scripts/movie-buff-mov16-evidence-guard.mjs"
readonly EXPECTED_GUARD_BLOB="676c1a21f868a0463e286d314816d3c66e8350f2"
readonly DERIVED_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-linux-exact-validation-v2-derived.sh"
readonly DERIVED_GUARD="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-evidence-guard-derived.mjs"

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
source = source.replace(old, new)
guard_call = "node scripts/movie-buff-mov16-evidence-guard.mjs"
if source.count(guard_call) < 3:
    raise SystemExit("Expected MOV-16 guard calls were not found.")
source = source.replace(guard_call, f"node {derived_guard}")
pathlib.Path(sys.argv[2]).write_text(source, encoding="utf-8")
PY

node --check "${DERIVED_GUARD}"
bash -n "${DERIVED_SCRIPT}"
exec bash "${DERIVED_SCRIPT}"
