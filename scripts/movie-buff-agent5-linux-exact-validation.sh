#!/usr/bin/env bash
set -uo pipefail

EXPECTED_SHA="${1:?expected controller SHA required}"
EXPECTED_BRANCH="${2:?expected branch required}"
PRODUCT_SHA="${3:?product SHA required}"
PRODUCT_TREE="${4:?product tree required}"
PREVIOUS_PRODUCT_SHA="${5:?previous product SHA required}"
EVIDENCE="${6:?evidence directory required}"
export EXPECTED_SHA EXPECTED_BRANCH PRODUCT_SHA PRODUCT_TREE PREVIOUS_PRODUCT_SHA EVIDENCE
mkdir -p "${EVIDENCE}"

record_exit() {
  printf '%s\n' "$2" >"${EVIDENCE}/$1.exit"
}

run_logged() {
  local name="$1"
  shift
  set +e
  "$@" 2>&1 | tee "${EVIDENCE}/${name}.log"
  local code=${PIPESTATUS[0]}
  set -e
  record_exit "${name}" "${code}"
  return 0
}

set +e
python3 - <<'PY' 2>&1 | tee "${EVIDENCE}/source-assembly.log"
import json
import os
import pathlib
import subprocess
import time
import urllib.request

repo = "BuffGamesStudio/buff-platform"
product_sha = os.environ["PRODUCT_SHA"]
product_tree = os.environ["PRODUCT_TREE"]
observed_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
observed_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
observed_branch = os.environ.get("GITHUB_REF_NAME") or subprocess.check_output(
    ["git", "branch", "--show-current"], text=True
).strip()
assert observed_branch == os.environ["EXPECTED_BRANCH"]
assert observed_sha == os.environ["EXPECTED_SHA"]
assert observed_sha == os.environ.get("GITHUB_SHA", observed_sha)
assert subprocess.check_output(["git", "rev-parse", f"{product_sha}^{{tree}}"], text=True).strip() == product_tree
subprocess.run(["git", "merge-base", "--is-ancestor", product_sha, "HEAD"], check=True)

headers = {"User-Agent": "movie-buff-agent5"}
def read_json(url):
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

pr = None
for _ in range(12):
    pr = read_json(f"https://api.github.com/repos/{repo}/pulls/110")
    if pr["head"]["sha"] == observed_sha:
        break
    time.sleep(5)
assert pr is not None and pr["head"]["sha"] == observed_sha
commit = read_json(f"https://api.github.com/repos/{repo}/git/commits/{observed_sha}")
expected_tree = commit["tree"]["sha"]
assert expected_tree == observed_tree

manifest = json.loads(pathlib.Path(
    "docs/validation/movie-buff-integrated-candidate-v1.manifest.json"
).read_text(encoding="utf-8"))
assert manifest["composition"]["product"] == {"sha": product_sha, "tree": product_tree}

component_rows = []
for component in manifest["composition"]["components"]:
    sha = component["sha"]
    tree = component["tree"]
    branch = component["branch"]
    actual_tree = subprocess.check_output(["git", "rev-parse", f"{sha}^{{tree}}"], text=True).strip()
    assert actual_tree == tree, component["id"]
    if component["id"] != "integration":
        subprocess.run(["git", "merge-base", "--is-ancestor", sha, product_sha], check=True)
    output = subprocess.check_output(
        ["git", "ls-remote", "origin", f"refs/heads/{branch}"], text=True
    ).strip()
    remote = output.split("\t")[0] if output else ""
    assert remote == sha, f"moved component: {component['id']} {remote} != {sha}"
    component_rows.append("\t".join([component["id"], branch, sha, tree]))
pathlib.Path(os.environ["EVIDENCE"], "components.tsv").write_text(
    "\n".join(component_rows) + "\n", encoding="utf-8"
)

for path, blob in manifest["protectedReconciliation"]["blobs"].items():
    actual = subprocess.check_output(["git", "rev-parse", f"HEAD:{path}"], text=True).strip()
    assert actual == blob, path

expected_delta = sorted(item["path"] for item in manifest["composition"]["deltaFiles"])
observed_delta = subprocess.check_output(
    ["git", "diff", "--name-only", os.environ["PREVIOUS_PRODUCT_SHA"], product_sha], text=True
).splitlines()
assert sorted(observed_delta) == expected_delta
pathlib.Path(os.environ["EVIDENCE"], "expected-delta.txt").write_text(
    "\n".join(expected_delta) + "\n", encoding="utf-8"
)
pathlib.Path(os.environ["EVIDENCE"], "observed-delta.txt").write_text(
    "\n".join(sorted(observed_delta)) + "\n", encoding="utf-8"
)

identity = {
    "repository": repo,
    "branch": observed_branch,
    "expectedSha": observed_sha,
    "prHeadSha": pr["head"]["sha"],
    "githubSha": os.environ.get("GITHUB_SHA", observed_sha),
    "observedSha": observed_sha,
    "expectedTree": expected_tree,
    "observedTree": observed_tree,
    "productSha": product_sha,
    "productTree": product_tree,
}
pathlib.Path(os.environ["EVIDENCE"], "identity.json").write_text(
    json.dumps(identity, indent=2) + "\n", encoding="utf-8"
)
PY
source_code=${PIPESTATUS[0]}
set -e
record_exit source_assembly "${source_code}"

run_logged dependency_install npm ci --ignore-scripts --no-audit --no-fund

set +e
node --test tests/movie-buff-*.test.mjs 2>&1 | tee "${EVIDENCE}/focused-tests.tap"
focused_code=${PIPESTATUS[0]}
set -e
record_exit focused_static_tests "${focused_code}"

run_logged typescript npx tsc --noEmit
run_logged production_build npm run build

set +e
node scripts/movie-buff-migration-encoding-check.mjs \
  supabase/migrations supabase/rollbacks supabase/tests \
  2>&1 | tee "${EVIDENCE}/sql-encoding.log"
sql_code=${PIPESTATUS[0]}
for file in \
  supabase/migrations/20260805155000_movie_buff_function_security_finalizer.sql \
  supabase/migrations/20260805160000_movie_buff_six_table_rls_reconciliation.sql \
  supabase/migrations/20260805160500_public_rls_auto_enable_event_trigger_contract.sql \
  supabase/migrations/20260805161000_public_rls_auto_enable_acl_lockdown.sql \
  supabase/rollbacks/20260805155000_movie_buff_function_security_finalizer.rollback.sql \
  supabase/rollbacks/20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql \
  supabase/rollbacks/20260805160500_public_rls_auto_enable_event_trigger_contract.rollback.sql \
  supabase/rollbacks/20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql \
  supabase/tests/movie_buff_current_security_finalizer_test.sql \
  supabase/tests/movie_buff_current_security_finalizer_rollback_test.sql \
  supabase/tests/movie_buff_agent6_persona_behavior_test.sql \
  supabase/tests/movie_buff_agent6_policy_helper_rollback_test.sql \
  supabase/tests/movie_buff_agent6_policy_helper_security_test.sql \
  docs/security/movie-buff-agent6-expected-state.json \
  docs/security/movie-buff-agent6-isolated-staging-runbook.md \
  scripts/movie-buff-agent6-security-package.sh
do
  test -s "${file}" || sql_code=1
done
set -e
record_exit sql_encoding "${sql_code}"

secret_code=0
if grep -RInE '(sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)' \
  docs/validation public/movie-buff-build-marker.json "${EVIDENCE}"; then
  secret_code=1
fi
record_exit secret_scan "${secret_code}"

clean_code=0
git diff --check || clean_code=1
if test -n "$(git status --porcelain -- next-env.d.ts)"; then
  git checkout -- next-env.d.ts
fi
test -z "$(git status --porcelain)" || clean_code=1
record_exit clean_worktree "${clean_code}"

python3 - <<'PY'
import json
import os
import pathlib
root = pathlib.Path(os.environ["EVIDENCE"])
names = [
    "source_assembly", "dependency_install", "focused_static_tests", "typescript",
    "production_build", "sql_encoding", "secret_scan", "clean_worktree"
]
result = {}
for name in names:
    path = root / f"{name}.exit"
    code = int(path.read_text().strip()) if path.exists() else 99
    result[name] = "PASS" if code == 0 else "FAIL"
result.update({
    "local_database":"UNKNOWN", "pgTAP":"UNKNOWN", "personas":"UNKNOWN", "races":"UNKNOWN",
    "browser":"UNKNOWN", "accessibility":"UNKNOWN", "vercel_provenance":"UNKNOWN",
    "hosted_supabase":"UNKNOWN", "staging":"UNKNOWN", "rollback":"UNKNOWN",
    "containment":"UNKNOWN", "forward_reapply":"UNKNOWN", "backup_pitr":"UNKNOWN",
    "production_target":"UNKNOWN", "release":"NO-GO"
})
(root / "status.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY

(
  cd "${EVIDENCE}"
  find . -type f ! -name sha256.txt -print0 | sort -z | xargs -0 sha256sum >sha256.txt
  sha256sum -c sha256.txt
)

controller_code=0
for name in source_assembly dependency_install focused_static_tests typescript production_build sql_encoding secret_scan clean_worktree; do
  test "$(cat "${EVIDENCE}/${name}.exit")" = "0" || controller_code=1
done
record_exit controller "${controller_code}"
exit "${controller_code}"
