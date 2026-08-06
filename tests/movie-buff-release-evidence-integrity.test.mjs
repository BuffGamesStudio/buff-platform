import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const evidencePath = process.env.MOVIE_BUFF_EVIDENCE_JSON
  ? path.resolve(process.env.MOVIE_BUFF_EVIDENCE_JSON)
  : null;

const allowedScopes = new Set([
  "repository-static",
  "local-executable",
  "preview",
  "staging",
  "hosted",
  "production",
]);
const behavioralClaims = new Set([
  "behavior",
  "race-safety",
  "synchronization",
  "accessibility",
  "rollback-execution",
  "hosted-state",
]);

function loadEvidence() {
  if (!evidencePath || !fs.existsSync(evidencePath)) return null;
  return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
}

function requireBundle(t) {
  const evidence = loadEvidence();
  if (!evidence) {
    t.skip("Set MOVIE_BUFF_EVIDENCE_JSON to a collected evidence bundle.");
    return null;
  }
  return evidence;
}

test("evidence bundle identifies repository, SHA, and target", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  assert.match(evidence.repository ?? "", /^[^/]+\/[^/]+$/);
  assert.match(evidence.sha ?? "", /^[0-9a-f]{40}$/i);
  assert.ok(evidence.target?.kind, "target kind is required");
  assert.ok(evidence.target?.identity, "target identity is required");
  assert.ok(Array.isArray(evidence.checks), "checks must be an array");
});

test("every classification has an explicit proof scope and claim type", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  for (const check of evidence.checks) {
    assert.match(check.classification, /^(PASS|FAIL|UNKNOWN)$/);
    assert.ok(allowedScopes.has(check.proofScope), `${check.name}: invalid proof scope`);
    assert.ok(check.claimType, `${check.name}: claimType is required`);
    assert.equal(typeof check.executed, "boolean", `${check.name}: executed is required`);
  }
});

test("repository-static evidence cannot PASS behavior or hosted state", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  for (const check of evidence.checks) {
    if (
      check.proofScope === "repository-static" &&
      behavioralClaims.has(check.claimType)
    ) {
      assert.notEqual(
        check.classification,
        "PASS",
        `${check.name}: static evidence cannot prove ${check.claimType}`,
      );
    }
  }
});

test("PASS classifications carry exact executable or source evidence", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  for (const check of evidence.checks) {
    if (check.classification !== "PASS") continue;

    assert.ok(check.command, `${check.name}: PASS requires a command`);
    assert.equal(check.exitCode, 0, `${check.name}: PASS requires exit code 0`);
    assert.ok(check.startedAt, `${check.name}: PASS requires startedAt`);
    assert.ok(check.finishedAt, `${check.name}: PASS requires finishedAt`);
    assert.ok(
      Array.isArray(check.artifacts) && check.artifacts.length > 0,
      `${check.name}: PASS requires raw artifact references`,
    );

    if (check.proofScope !== "repository-static") {
      assert.ok(
        check.targetIdentity || evidence.target?.identity,
        `${check.name}: executable PASS requires target identity`,
      );
      assert.match(
        check.sha ?? evidence.sha ?? "",
        /^[0-9a-f]{40}$/i,
        `${check.name}: executable PASS requires exact SHA`,
      );
    }
  }
});

test("hosted and production proof includes immutable hosted identity", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  if (!["hosted", "production"].includes(evidence.target?.kind)) return;

  assert.ok(evidence.target.projectId, "hosted target requires projectId");
  assert.ok(evidence.target.applicationSha, "hosted target requires applicationSha");
  assert.ok(evidence.target.databaseVersion, "hosted target requires databaseVersion");
  assert.ok(
    evidence.target.migrationLedgerHash,
    "hosted target requires migration ledger hash",
  );
  assert.ok(evidence.target.observedAt, "hosted target requires observedAt");
});

test("unexecuted or aborted checks remain UNKNOWN", (t) => {
  const evidence = requireBundle(t);
  if (!evidence) return;

  for (const check of evidence.checks) {
    if (check.executed === false || check.aborted === true) {
      assert.equal(
        check.classification,
        "UNKNOWN",
        `${check.name}: unexecuted or aborted evidence cannot be PASS/FAIL`,
      );
    }
  }
});
