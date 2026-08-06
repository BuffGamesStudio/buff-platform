#!/usr/bin/env bash
set -euo pipefail

EXPECTED_SHA="${1:-}"
EXPECTED_TREE="${2:-}"
EVIDENCE_ROOT="${3:-${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-db-current}"
SOURCE_SCRIPT="scripts/movie-buff-core-v6-db.sh"
TEMP_SCRIPT="${RUNNER_TEMP:-/tmp}/movie-buff-core-v6-db-current-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}.sh"
RAW_COMPOSITION="f03a4d74434551e1bcafb067478d4eab6b7993a5"
RAW_TREE="02a579e275d4efeaa7bf0f077cab2e686cc5e448"
MOV16_SHA="8eab77a63042911417d6ef16d52ab9b308fc8f0d"
MOV16_TREE="a4aa7c9962389b9894c8a90afe69fdb276313953"

mkdir -p "$EVIDENCE_ROOT"
cleanup() { rm -f "$TEMP_SCRIPT"; }
trap cleanup EXIT

bootstrap_fail() {
  local message="$1"
  printf '%s\n' "$message" >"$EVIDENCE_ROOT/bootstrap-failure.txt"
  {
    echo "lane=movie-buff-core-v6-database-current-bootstrap"
    echo "classification=FAIL"
    echo "source_sha=$EXPECTED_SHA"
    echo "source_tree=$EXPECTED_TREE"
    echo "raw_composition_sha=$RAW_COMPOSITION"
    echo "raw_composition_tree=$RAW_TREE"
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
 '91b8b65f85d53a950eae15544af39e2efd108c5c':'f03a4d74434551e1bcafb067478d4eab6b7993a5',
 '40d72195ced550771ad257054a6325c51f183a28':'02a579e275d4efeaa7bf0f077cab2e686cc5e448',
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
