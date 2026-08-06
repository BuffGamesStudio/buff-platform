#!/usr/bin/env bash
set -uo pipefail

MODE="${1:-}"
EXPECTED_SHA="${2:-}"
EXPECTED_TREE="${3:-}"
EVIDENCE_ROOT="${4:-}"
SOURCE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
PRODUCT_SHA="d70d758c730d32d71525c9381b9f98b80e0e1e83"
PRODUCT_TREE="b0e9cfa1963d8fbca9c72dfe7fc64a9dbe2cbe8f"
EXPECTED_BRANCH="validation/MOV-17-encoding-twin-v2"

if [[ "$MODE" != "mov16-diagnostic" && "$MODE" != "remaining-races" ]]; then
  echo "usage: $0 <mov16-diagnostic|remaining-races> <expected-sha> <expected-tree> <evidence-root>" >&2
  exit 64
fi
if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-fA-F]{40}$ || ! "$EXPECTED_TREE" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "invalid exact identity" >&2
  exit 64
fi
if [[ -z "$SOURCE_ROOT" || -z "$EVIDENCE_ROOT" ]]; then
  echo "missing source or evidence root" >&2
  exit 64
fi

mkdir -p "$EVIDENCE_ROOT"
WORK_WRAPPER="$RUNNER_TEMP/agent7-${MODE}-wrapper.sh"
cp "$SOURCE_ROOT/scripts/movie-buff-core-v6-race-browser.sh" "$WORK_WRAPPER"

python3 - "$WORK_WRAPPER" "$MODE" "$RUNNER_TEMP" <<'PY'
from pathlib import Path
import re, sys
wrapper=Path(sys.argv[1]); mode=sys.argv[2]; temp=Path(sys.argv[3])
text=wrapper.read_text(encoding='utf-8')
replacements={
  'BRANCH="validation/movie-buff-core-v6"':'BRANCH="validation/MOV-17-encoding-twin-v2"',
  'RAW_COMPOSITION="91b8b65f85d53a950eae15544af39e2efd108c5c"':'RAW_COMPOSITION="d70d758c730d32d71525c9381b9f98b80e0e1e83"',
  'RAW_TREE="40d72195ced550771ad257054a6325c51f183a28"':'RAW_TREE="b0e9cfa1963d8fbca9c72dfe7fc64a9dbe2cbe8f"',
}
for old,new in replacements.items():
  if text.count(old)!=1: raise SystemExit(f'identity anchor mismatch: {old}')
  text=text.replace(old,new)

block=re.compile(r'''    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \\\n    MOVIE_BUFF_EXPECTED_GIT_SHA="\$EXPECTED_SHA" \\\n    MOVIE_BUFF_EVIDENCE_COMMAND="node scripts/movie-buff-vip-authority-adversarial\.mjs" \\\n    MOVIE_BUFF_VIP_TEST_USERS="\$users_json" \\\n    MOVIE_BUFF_EVIDENCE_OUTPUT="\$EVIDENCE_ROOT/mov16-vip-authority\.json" \\\n      run_step mov16-vip-authority node "\$SOURCE_ROOT/scripts/movie-buff-vip-authority-adversarial\.mjs" \|\| \{ fail mov16-vip-authority; return 1; \}
''')
if mode=='mov16-diagnostic':
  diag=temp/'movie-buff-vip-authority-adversarial-diagnostic.mjs'
  source=Path('scripts/movie-buff-vip-authority-adversarial.mjs').read_text(encoding='utf-8')
  old='evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);'
  new='evidence.error = error instanceof Error ? error.stack ?? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error));'
  if source.count(old)!=1: raise SystemExit('MOV-16 catch anchor mismatch')
  diag.write_text(source.replace(old,new),encoding='utf-8')
  replacement=f'''    MOVIE_BUFF_ALLOW_LOCAL_DELETIONS=YES \\
    MOVIE_BUFF_EXPECTED_GIT_SHA="$EXPECTED_SHA" \\
    MOVIE_BUFF_EVIDENCE_COMMAND="node {diag}" \\
    MOVIE_BUFF_VIP_TEST_USERS="$users_json" \\
    MOVIE_BUFF_EVIDENCE_OUTPUT="$EVIDENCE_ROOT/mov16-vip-authority.json" \\
      run_step mov16-vip-authority node "{diag}" || {{ fail mov16-vip-authority; return 1; }}
'''
else:
  replacement='''    cat >"$EVIDENCE_ROOT/mov16-vip-authority-skipped.json" <<'JSON'
{"classification":"NOT APPLICABLE","reason":"executed independently in Agent 7 MOV-16 diagnostic job"}
JSON
    printf '0\n' >"$EVIDENCE_ROOT/mov16-vip-authority-skipped.exit.txt"
'''
text,n=block.subn(replacement,text,count=1)
if n!=1: raise SystemExit('MOV-16 wrapper block mismatch')
wrapper.write_text(text,encoding='utf-8')
PY
patch_code=$?
if [[ "$patch_code" -ne 0 ]]; then
  echo "$patch_code" >"$EVIDENCE_ROOT/patch.exit.txt"
  exit "$patch_code"
fi

chmod +x "$WORK_WRAPPER"
bash -n "$WORK_WRAPPER" || exit $?
sha256sum "$WORK_WRAPPER" >"$EVIDENCE_ROOT/patched-wrapper.sha256.txt"
if [[ "$MODE" == "mov16-diagnostic" ]]; then
  sha256sum "$RUNNER_TEMP/movie-buff-vip-authority-adversarial-diagnostic.mjs" >"$EVIDENCE_ROOT/patched-mov16-harness.sha256.txt"
fi

"$WORK_WRAPPER" race "$EXPECTED_SHA" "$EXPECTED_TREE" "$EVIDENCE_ROOT"
exit_code=$?
printf '%s\n' "$exit_code" >"$EVIDENCE_ROOT/diagnostic-wrapper.exit.txt"

{
  echo "mode=$MODE"
  echo "source_sha=$EXPECTED_SHA"
  echo "source_tree=$EXPECTED_TREE"
  echo "product_sha=$PRODUCT_SHA"
  echo "product_tree=$PRODUCT_TREE"
  echo "branch=$EXPECTED_BRANCH"
  echo "wrapper_exit=$exit_code"
  echo "release=NO-GO"
} >"$EVIDENCE_ROOT/agent7-diagnostic-status.txt"

if [[ -z "$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)" ]]; then
  echo "clean_worktree=PASS" >>"$EVIDENCE_ROOT/agent7-diagnostic-status.txt"
else
  echo "clean_worktree=FAIL" >>"$EVIDENCE_ROOT/agent7-diagnostic-status.txt"
  exit_code=1
fi

(
  cd "$EVIDENCE_ROOT"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
)
exit "$exit_code"
