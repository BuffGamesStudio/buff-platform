#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-mov16-v3-evidence}"
SOURCE_ROOT="$(git rev-parse --show-toplevel)"
BASE_WRAPPER="${SOURCE_ROOT}/scripts/movie-buff-core-v9-mov16-v2.sh"
RUN_TOKEN="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-mov16-v3"
TEMP_WRAPPER="${RUNNER_TEMP:-/tmp}/movie-buff-core-v9-mov16-v3-${RUN_TOKEN}.sh"
PATCH_REPORT="${EVIDENCE_ROOT}/v3-wrapper-patch.json"

cleanup() {
  rm -f "$TEMP_WRAPPER"
}
trap cleanup EXIT

[[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "invalid expected SHA" >&2; exit 2; }
[[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "invalid expected tree" >&2; exit 2; }
[[ -f "$BASE_WRAPPER" ]] || { echo "missing v2 base wrapper" >&2; exit 2; }
mkdir -p "$EVIDENCE_ROOT"

python3 - "$BASE_WRAPPER" "$TEMP_WRAPPER" "$PATCH_REPORT" <<'PY'
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
report = pathlib.Path(sys.argv[3])
text = source.read_text(encoding="utf-8")
original = text

old = """helper='''\\nfunction insertMatchPlayersDirect(matchId, playerIds) {\\n  assert.equal(process.env.MOVIE_BUFF_ALLOW_LOCAL_POSTGRES_FIXTURE, \"YES\");\\n  const host = process.env.MOVIE_BUFF_LOCAL_DB_HOST ?? \"\";\\n  const port = process.env.MOVIE_BUFF_LOCAL_DB_PORT ?? \"\";\\n  assert.ok([\"127.0.0.1\", \"localhost\", \"::1\"].includes(host), \"local PostgreSQL fixture host required\");\\n  assert.equal(port, \"55322\", \"expected disposable local PostgreSQL port\");\\n  assert.ok(playerIds.length > 0);\\n  execFileSync(\\n    \"psql\",\\n    [\\n      \"-h\", host, \"-p\", port, \"-U\", \"postgres\", \"-d\", \"postgres\",\\n      \"-v\", \"ON_ERROR_STOP=1\",\\n      \"-v\", `match_id=${matchId}`,\\n      \"-v\", `player_ids=${playerIds.join(\",\")}`,\\n      \"-c\",\\n      \"insert into public.match_players (match_id, player_id) \" +\\n        \"select :'match_id'::uuid, ids.player_id::uuid \" +\\n        \"from unnest(string_to_array(:'player_ids', ',')) as ids(player_id);\",\\n    ],\\n    { encoding: \"utf8\", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? \"postgres\" } },\\n  );\\n}\\n'''
"""
new = """helper='''\\nfunction insertMatchPlayersDirect(matchId, playerIds) {\\n  assert.equal(process.env.MOVIE_BUFF_ALLOW_LOCAL_POSTGRES_FIXTURE, \"YES\");\\n  const host = process.env.MOVIE_BUFF_LOCAL_DB_HOST ?? \"\";\\n  const port = process.env.MOVIE_BUFF_LOCAL_DB_PORT ?? \"\";\\n  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\\n  assert.ok([\"127.0.0.1\", \"localhost\", \"::1\"].includes(host), \"local PostgreSQL fixture host required\");\\n  assert.equal(port, \"55322\", \"expected disposable local PostgreSQL port\");\\n  assert.match(matchId, uuidPattern, \"fixture match ID must be a UUID\");\\n  assert.ok(playerIds.length > 0);\\n  for (const playerId of playerIds) assert.match(playerId, uuidPattern, \"fixture player ID must be a UUID\");\\n  const values = playerIds.map((playerId) => `('${matchId}'::uuid, '${playerId}'::uuid)`).join(\",\");\\n  execFileSync(\\n    \"psql\",\\n    [\\n      \"-h\", host, \"-p\", port, \"-U\", \"postgres\", \"-d\", \"postgres\",\\n      \"-v\", \"ON_ERROR_STOP=1\",\\n      \"-c\", `insert into public.match_players (match_id, player_id) values ${values};`,\\n    ],\\n    { encoding: \"utf8\", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? \"postgres\" } },\\n  );\\n}\\n'''
"""

if text.count(old) != 1:
    raise SystemExit("v2 helper block did not match exactly once")
text = text.replace(old, new, 1)
text = text.replace("movie-buff-core-v9-mov16-authority-v2", "movie-buff-core-v9-mov16-authority-v3", 1)
text = text.replace("MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V2", "MOVIE_BUFF_CORE_V9_MOV16_AUTHORITY_V3", 1)
text = text.replace("mov16-v2", "mov16-v3")
target.write_text(text, encoding="utf-8")
target.chmod(0o700)
report.write_text(json.dumps({
    "classification": "PASS",
    "baseWrapper": str(source.relative_to(pathlib.Path.cwd())),
    "baseWrapperSha256": hashlib.sha256(original.encode()).hexdigest(),
    "patchedWrapperSha256": hashlib.sha256(text.encode()).hexdigest(),
    "change": "replace unsupported psql variable syntax with UUID-validated direct VALUES fixture insertion",
    "productGrantChange": False,
    "productSourceChange": False,
}, indent=2) + "\n", encoding="utf-8")
PY

bash -n "$TEMP_WRAPPER"
exec bash "$TEMP_WRAPPER" "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
