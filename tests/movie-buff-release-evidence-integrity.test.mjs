import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const evidencePath = process.env.MOVIE_BUFF_EVIDENCE_JSON
  ? path.resolve(process.env.MOVIE_BUFF_EVIDENCE_JSON)
  : null;

function loadEvidence() {
  if (!evidencePath || !fs.existsSync(evidencePath)) return null;
  return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
}

test("PASS classifications carry exact executable evidence", (t) => {
  const evidence = loadEvidence();
  if (!evidence) {
    t.skip("Set MOVIE_BUFF_EVIDENCE_JSON to a collected evidence bundle.");
    return;
  }

  assert.match(evidence.repository ?? "", /^[^/]+\/[^/]+$/);
  assert.match(evidence.sha ?? "", /^[0-9a-f]{40}$/i);
  assert.ok(evidence.target?.kind, "target kind is required");
  assert.ok(evidence.target?.identity, "target identity is required");
  assert.ok(Array.isArray(evidence.checks), "checks must be an array");

  for (const check of evidence.checks) {
    assert.match(check.classification, /^(PASS|FAIL|UNKNOWN)$/);
    if (check.classification !== "PASS") continue;

    assert.ok(check.command, `${check.name}: PASS requires a command`);
    assert.equal(check.exitCode, 0, `${check.name}: PASS requires exit code 0`);
    assert.ok(check.startedAt, `${check.name}: PASS requires startedAt`);
    assert.ok(check.finishedAt, `${check.name}: PASS requires finishedAt`);
    assert.ok(
      Array.isArray(check.artifacts) && check.artifacts.length > 0,
      `${check.name}: PASS requires raw artifact references`,
    );
  }
});

test("hosted proof includes immutable hosted identity", (t) => {
  const evidence = loadEvidence();
  if (!evidence) {
    t.skip("Set MOVIE_BUFF_EVIDENCE_JSON to a collected evidence bundle.");
    return;
  }

  if (evidence.target?.kind !== "hosted") return;

  assert.ok(evidence.target.projectId, "hosted target requires projectId");
  assert.ok(evidence.target.applicationSha, "hosted target requires applicationSha");
  assert.ok(evidence.target.databaseVersion, "hosted target requires databaseVersion");
  assert.ok(evidence.target.migrationLedgerHash, "hosted target requires migration ledger hash");
});

test("UNKNOWN is retained for commands that were not executed", (t) => {
  const evidence = loadEvidence();
  if (!evidence) {
    t.skip("Set MOVIE_BUFF_EVIDENCE_JSON to a collected evidence bundle.");
    return;
  }

  for (const check of evidence.checks) {
    if (check.executed === false) {
      assert.equal(
        check.classification,
        "UNKNOWN",
        `${check.name}: unexecuted evidence cannot be PASS`,
      );
    }
  }
});
