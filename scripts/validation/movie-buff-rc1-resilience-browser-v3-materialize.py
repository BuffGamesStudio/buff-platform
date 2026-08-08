from pathlib import Path
import shutil
import sys

v1_workflow = Path(sys.argv[1])
v1_harness = Path(sys.argv[2])
out_harness = Path(sys.argv[3])
out_run = Path(sys.argv[4])

text = v1_harness.read_text(encoding="utf-8")
anchor = '''function pass(name, details = {}) {\n  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });\n}\n'''
helper = '''function pass(name, details = {}) {\n  evidence.checks.push({ name, classification: "PASS", observedAt: new Date().toISOString(), details });\n}\n\nfunction failureRecord(error, extras = {}) {\n  if (error instanceof Error) {\n    return { ...extras, type: error.name || "Error", message: redact(error.message || ""), stack: redact(error.stack || "") };\n  }\n  if (error && typeof error === "object") {\n    const record = { ...extras, type: error.constructor?.name || "Object" };\n    for (const key of ["code", "message", "details", "hint", "status", "statusText"]) {\n      if (key in error && error[key] != null) record[key] = redact(error[key]);\n    }\n    try { record.serialized = redact(JSON.stringify(error)); }\n    catch { record.serialized = "[UNSERIALIZABLE_OBJECT]"; }\n    return record;\n  }\n  return { ...extras, type: typeof error, message: redact(error) };\n}\n'''
if text.count(anchor) != 1:
    raise SystemExit("failure helper anchor mismatch")
text = text.replace(anchor, helper, 1)
old = '''  evidence.failures.push({\n    message: redact(error instanceof Error ? error.message : error),\n    stack: redact(error instanceof Error ? error.stack ?? "" : ""),\n  });'''
new = '''  evidence.failures.push(failureRecord(error, { stage: "resilience-browser" }));'''
if text.count(old) != 1:
    raise SystemExit("primary catch anchor mismatch")
text = text.replace(old, new, 1)
old_cleanup = '''      evidence.failures.push({ cleanup: roomId, message: redact(error) });'''
new_cleanup = '''      evidence.failures.push(failureRecord(error, { stage: "cleanup", cleanup: roomId }));'''
if text.count(old_cleanup) != 1:
    raise SystemExit("cleanup catch anchor mismatch")
text = text.replace(old_cleanup, new_cleanup, 1)
out_harness.write_text(text, encoding="utf-8")

source = v1_workflow.read_text(encoding="utf-8").splitlines()
marker = "- name: Run disposable localhost resilience browser lab"
start = next(i for i, line in enumerate(source) if line.strip() == marker)
run_line = next(i for i in range(start + 1, len(source)) if source[i].strip() == "run: |")
run_indent = len(source[run_line]) - len(source[run_line].lstrip())
body = []
for line in source[run_line + 1:]:
    if line.strip() and len(line) - len(line.lstrip()) <= run_indent:
        break
    body.append(line[run_indent + 2:] if line.strip() else "")
script = "\n".join(body) + "\n"
old_run = 'node scripts/validation/movie-buff-rc1-resilience-browser-v1.mjs >"${raw}/resilience-browser.log" 2>&1'
runtime_rel = "scripts/validation/.movie-buff-rc1-resilience-v3-runtime.mjs"
new_run = f'node "{runtime_rel}" >"${{raw}}/resilience-browser.log" 2>&1'
if script.count(old_run) != 1:
    raise SystemExit("harness invocation anchor mismatch")
script = script.replace(old_run, new_run, 1)
redaction_anchor = 'cp "${RUNNER_TEMP}/composition-paths.txt" "${evidence}/composition-paths.txt"'
pre_hash = (
    f'rm -f "{runtime_rel}"\n'
    'test -z "$(git status --porcelain)"\n'
    'python3 scripts/validation/movie-buff-rc1-resilience-browser-v3-redact.py "${evidence}"\n'
)
if script.count(redaction_anchor) != 1:
    raise SystemExit("redaction insertion anchor mismatch")
script = script.replace(redaction_anchor, pre_hash + redaction_anchor, 1)
out_run.write_text(script, encoding="utf-8")
shutil.rmtree(Path(__file__).parent / "__pycache__", ignore_errors=True)
