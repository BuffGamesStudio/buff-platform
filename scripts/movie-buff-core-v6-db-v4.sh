#!/usr/bin/env bash
set -euo pipefail
EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-current3-db}"
SOURCE_SCRIPT="scripts/movie-buff-core-v6-db-v3.sh"
TEMP_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-db-v4-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}.sh"
mkdir -p "$EVIDENCE_ROOT"
cleanup(){ rm -f "$TEMP_SCRIPT"; }
trap cleanup EXIT
bootstrap_fail(){ printf '%s\n' "$1" >"$EVIDENCE_ROOT/bootstrap-failure.txt"; { echo 'lane=movie-buff-core-v6-current3-db-bootstrap'; echo 'classification=FAIL'; echo "source_sha=$EXPECTED_SHA"; echo "source_tree=$EXPECTED_TREE"; echo 'raw_composition_sha=88ea15071e5d8393adf54a947fef4afe6ac86630'; echo 'raw_composition_tree=538590b96a4ce45f7ebe5f1220dd4db682bc8003'; echo 'mov15_sha=597c5edf37c53a35a37168ad7e7899e7fe4c8225'; echo 'mov15_tree=e094cb006a564ae48ef5cba1e99cc4716509ede6'; echo "failure_step=$1"; echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } >"$EVIDENCE_ROOT/bootstrap-metadata.txt"; (cd "$EVIDENCE_ROOT" && find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt); echo 'MOVIE_BUFF_CORE_DATABASE=FAIL'; exit 1; }
[[ -f "$SOURCE_SCRIPT" ]] || bootstrap_fail "missing database wrapper: $SOURCE_SCRIPT"
python3 - "$SOURCE_SCRIPT" "$TEMP_SCRIPT" <<'PY'
import pathlib,sys
s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
r={
'61a7ab96904323e1cb6dfae0e54e900d12a83db0':'88ea15071e5d8393adf54a947fef4afe6ac86630',
'167191fe2a143bae2f197218949fbe5b2195726a':'538590b96a4ce45f7ebe5f1220dd4db682bc8003',
'295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d':'597c5edf37c53a35a37168ad7e7899e7fe4c8225',
'fb92eb3331cd1aac2e918603f449aadbd177935c':'e094cb006a564ae48ef5cba1e99cc4716509ede6',
}
for old,new in r.items():
    if old not in s: raise SystemExit(f'missing identity token {old}')
    s=s.replace(old,new)
pathlib.Path(sys.argv[2]).write_text(s,encoding='utf-8')
PY
bash -n "$TEMP_SCRIPT" || bootstrap_fail 'generated database wrapper parse failure'
bash "$TEMP_SCRIPT" "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
