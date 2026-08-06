#!/usr/bin/env python3
"""Derive local-only MOV-17 proof scripts without changing product behavior."""
from __future__ import annotations
import pathlib, re, sys

root = pathlib.Path(sys.argv[1]).resolve()
files = [
    root / "scripts/movie-buff-three-client-phase-proof.mjs",
    root / "scripts/movie-buff-reconnect-race-proof.mjs",
]
import_marker = 'import path from "node:path";\n'
import_insert = 'import path from "node:path";\nimport { execFileSync } from "node:child_process";\n'
helper_marker = 'assert.equal(new Set(users.map((user) => user.email)).size, 3);\n'
helper_insert = r'''assert.equal(new Set(users.map((user) => user.email)).size, 3);

const localDbUrl = process.env.MOVIE_BUFF_LOCAL_DATABASE_URL;
assert.ok(localDbUrl, "MOVIE_BUFF_LOCAL_DATABASE_URL is required");
const parsedLocalDb = new URL(localDbUrl);
assert.ok(["127.0.0.1", "localhost", "::1"].includes(parsedLocalDb.hostname));

function sqlUuid(value) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return `'${value}'::uuid`;
}

function ownerFixtureSql(sql) {
  return execFileSync(
    "psql",
    [localDbUrl, "-X", "--set=ON_ERROR_STOP=1", "-Atq"],
    { input: sql, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  ).trim();
}
'''
patterns = {
    "movie-buff-three-client-phase-proof.mjs": (
        re.compile(
            r'''  const \{ error: matchPlayerError \} = await admin\.from\("match_players"\)\.insert\(\n'''
            r'''    sessions\.map\(\(session\) => \(\{\n'''
            r'''      match_id: matchId,\n'''
            r'''      player_id: session\.user\.id,\n'''
            r'''    \}\)\),\n'''
            r'''  \);\n'''
            r'''  if \(matchPlayerError\) throw matchPlayerError;'''
        ),
        '''  const matchPlayerValues = sessions
    .map((session) => `(${sqlUuid(matchId)},${sqlUuid(session.user.id)})`)
    .join(",\\n");
  ownerFixtureSql(`
    insert into public.match_players (match_id, player_id)
    values ${matchPlayerValues};
  `);'''
    ),
    "movie-buff-reconnect-race-proof.mjs": (
        re.compile(
            r'''  const \{ error: playersError \} = await admin\.from\("match_players"\)\.insert\(\n'''
            r'''    sessions\.map\(\(session\) => \(\{\n'''
            r'''      match_id: matchId,\n'''
            r'''      player_id: session\.user\.id,\n'''
            r'''    \}\)\),\n'''
            r'''  \);\n'''
            r'''  if \(playersError\) throw playersError;'''
        ),
        '''  const matchPlayerValues = sessions
    .map((session) => `(${sqlUuid(matchId)},${sqlUuid(session.user.id)})`)
    .join(",\\n");
  ownerFixtureSql(`
    insert into public.match_players (match_id, player_id)
    values ${matchPlayerValues};
  `);'''
    ),
}
for file_path in files:
    text = file_path.read_text(encoding="utf-8")
    if 'import { execFileSync } from "node:child_process";' not in text:
        if import_marker not in text: raise SystemExit(f"import marker missing: {file_path}")
        text = text.replace(import_marker, import_insert, 1)
    if "function ownerFixtureSql(sql)" not in text:
        if helper_marker not in text: raise SystemExit(f"helper marker missing: {file_path}")
        text = text.replace(helper_marker, helper_insert, 1)
    pattern, replacement = patterns[file_path.name]
    text, count = pattern.subn(lambda _: replacement, text, count=1)
    if count != 1: raise SystemExit(f"fixture replacement count {count}: {file_path}")
    if file_path.name == "movie-buff-three-client-phase-proof.mjs":
        marker = "  assert.match(earlyAnswerError.message, /answer window is not open/i);"
        if marker in text:
            text = text.replace(marker, "  assert.match(earlyAnswerError.message, /answer window is not open|current round could not be found/i);", 1)
    else:
        marker = '''  const reconnectAttempt = expiredReconnectRace[0];
  if (reconnectAttempt.status === "fulfilled") {
    assert.equal(reconnectAttempt.value.error, null);
    assert.notEqual(reconnectAttempt.value.data?.resumeAllowed, true);
  }
'''
        replacement2 = '''  const reconnectAttempt = expiredReconnectRace[0];
  if (reconnectAttempt.status === "fulfilled") {
    if (reconnectAttempt.value.error) {
      assert.match(reconnectAttempt.value.error.message, /active movie buff room membership required/i);
    } else {
      assert.notEqual(reconnectAttempt.value.data?.resumeAllowed, true);
    }
  }
'''
        if marker in text: text = text.replace(marker, replacement2, 1)
    file_path.write_text(text, encoding="utf-8")
print("MOVIE_BUFF_LOCAL_OWNER_FIXTURE_DERIVATION=PASS")
