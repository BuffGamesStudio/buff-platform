#!/usr/bin/env bash
set -euo pipefail
EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-current4-source}"
SOURCE_SCRIPT="scripts/movie-buff-core-v6-source-v3.sh"
TEMP_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-source-v4-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}.sh"
mkdir -p "$EVIDENCE_ROOT"
cleanup(){ rm -f "$TEMP_SCRIPT"; }
trap cleanup EXIT
bootstrap_fail(){ printf '%s\n' "$1" >"$EVIDENCE_ROOT/bootstrap-failure.txt"; { echo 'lane=movie-buff-core-v6-current4-source-bootstrap'; echo 'classification=FAIL'; echo "source_sha=$EXPECTED_SHA"; echo "source_tree=$EXPECTED_TREE"; echo 'raw_composition_sha=5010be9ad7440d65ca9e21fe35541433c2e16917'; echo 'raw_composition_tree=b15f7f490a6face44c69ab6b8565dfe594eb1894'; echo 'mov15_sha=dc9804cdae03d8627a89980dbcdf2292d2055372'; echo 'mov15_tree=86db75f79444b02c972ba4771244950cbec41b38'; echo "failure_step=$1"; echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } >"$EVIDENCE_ROOT/bootstrap-metadata.txt"; (cd "$EVIDENCE_ROOT" && find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt); echo 'MOVIE_BUFF_CORE_SOURCE=FAIL'; exit 1; }
[[ -f "$SOURCE_SCRIPT" ]] || bootstrap_fail "missing source wrapper: $SOURCE_SCRIPT"
python3 - "$SOURCE_SCRIPT" "$TEMP_SCRIPT" <<'PY'
import pathlib,sys
s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
r={
'61a7ab96904323e1cb6dfae0e54e900d12a83db0':'5010be9ad7440d65ca9e21fe35541433c2e16917',
'167191fe2a143bae2f197218949fbe5b2195726a':'b15f7f490a6face44c69ab6b8565dfe594eb1894',
'295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d':'dc9804cdae03d8627a89980dbcdf2292d2055372',
'fb92eb3331cd1aac2e918603f449aadbd177935c':'86db75f79444b02c972ba4771244950cbec41b38',
}
for old,new in r.items():
    if old not in s: raise SystemExit(f'missing identity token {old}')
    s=s.replace(old,new)
pathlib.Path(sys.argv[2]).write_text(s,encoding='utf-8')
PY
bash -n "$TEMP_SCRIPT" || bootstrap_fail 'generated source wrapper parse failure'
bash "$TEMP_SCRIPT" "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
