#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-current2-db}"
SOURCE_SCRIPT="scripts/movie-buff-core-v6-db.sh"
TEMP_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-db-current2-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}.sh"
RAW_COMPOSITION="61a7ab96904323e1cb6dfae0e54e900d12a83db0"
RAW_TREE="167191fe2a143bae2f197218949fbe5b2195726a"
MOV15_SHA="295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d"
MOV15_TREE="fb92eb3331cd1aac2e918603f449aadbd177935c"
MOV16_SHA="8eab77a63042911417d6ef16d52ab9b308fc8f0d"
MOV16_TREE="a4aa7c9962389b9894c8a90afe69fdb276313953"

mkdir -p "$EVIDENCE_ROOT"
cleanup() { rm -f "$TEMP_SCRIPT"; }
trap cleanup EXIT

bootstrap_fail() {
  local message="$1"
  printf '%s\n' "$message" >"$EVIDENCE_ROOT/bootstrap-failure.txt"
  {
    echo "lane=movie-buff-core-v6-database-current2-bootstrap"
    echo "classification=FAIL"
    echo "source_sha=$EXPECTED_SHA"
    echo "source_tree=$EXPECTED_TREE"
    echo "raw_composition_sha=$RAW_COMPOSITION"
    echo "raw_composition_tree=$RAW_TREE"
    echo "mov15_sha=$MOV15_SHA"
    echo "mov15_tree=$MOV15_TREE"
    echo "mov16_sha=$MOV16_SHA"
    echo "mov16_tree=$MOV16_TREE"
    echo "failure_step=$message"
    echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$EVIDENCE_ROOT/bootstrap-metadata.txt"
  (cd "$EVIDENCE_ROOT" && find . -maxdepth 1 -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt)
  echo 'MOVIE_BUFF_CORE_DATABASE=FAIL'
  exit 1
}

[[ -f "$SOURCE_SCRIPT" ]] || bootstrap_fail "missing source wrapper: $SOURCE_SCRIPT"
[[ "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || bootstrap_fail 'invalid expected SHA'
[[ "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]] || bootstrap_fail 'invalid expected tree'

python3 - "$SOURCE_SCRIPT" "$TEMP_SCRIPT" <<'PY'
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
replacements={
 '91b8b65f85d53a950eae15544af39e2efd108c5c':'61a7ab96904323e1cb6dfae0e54e900d12a83db0',
 '40d72195ced550771ad257054a6325c51f183a28':'167191fe2a143bae2f197218949fbe5b2195726a',
 '4906147038a5a2deda5c13fdafc6f07b66ae100b':'295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d',
 'aab4b0256683ec77a4d9e3373fd84f60ba682e88':'fb92eb3331cd1aac2e918603f449aadbd177935c',
 'd50a2417b95b6a37548bba914584cef309d707a9':'8eab77a63042911417d6ef16d52ab9b308fc8f0d',
 '0a30efee906e28cbeeb76c6efd9232f07ede163d':'a4aa7c9962389b9894c8a90afe69fdb276313953',
}
for old,new in replacements.items():
    if old not in source:
        raise SystemExit(f'missing expected identity token: {old}')
    source=source.replace(old,new)
pathlib.Path(sys.argv[2]).write_text(source,encoding='utf-8')
PY

bash -n "$TEMP_SCRIPT" || bootstrap_fail 'generated database wrapper parse failure'
bash "$TEMP_SCRIPT" "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
