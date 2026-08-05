#!/usr/bin/env python3
"""Derive local-only MOV-17 proof scripts with database-owner fixture insertion.

The production behavior calls remain authenticated/service-role as authored. Only the
protected match_players fixture row insertion is moved from PostgREST service_role to
local PostgreSQL owner authority in a disposable Git worktree.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path.cwd()
FILES = [
    ROOT / "scripts/movie-buff-three-client-phase-proof.mjs",
    ROOT / "scripts/movie-buff-reconnect-race-proof.mjs",
]

IMPORT_MARKER = 'import path from "node:path";\n'
IMPORT_INSERT = 'import path from "node:path";\nimport { execFileSync } from "node:child_process";\n'
HELPER_MARKER = "assert.equal(new Set(users.map((user) => user.email)).size, 3);\n"
HELPER_INSERT = """assert.equal(new Set(users.map((user) => user.email)).size, 3);

const localDbHost = process.env.MOVIE_BUFF_LOCAL_DB_HOST ?? "127.0.0.1";
const localDbPort = process.env.MOVIE_BUFF_LOCAL_DB_PORT ?? "55322";
const localDbName = process.env.MOVIE_BUFF_LOCAL_DB_NAME ?? "postgres";
const localDbUser = process.env.MOVIE_BUFF_LOCAL_DB_USER ?? "postgres";
const localDbPassword = process.env.MOVIE_BUFF_LOCAL_DB_PASSWORD ?? "postgres";
assert.ok(["127.0.0.1", "localhost", "::1"].includes(localDbHost));
assert.match(localDbPort, /^\\d{2,5}$/);
assert.equal(localDbName, "postgres");
assert.equal(localDbUser, "postgres");

function sqlUuid(value) {
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  return `'${value}'::uuid`;
}

function ownerFixtureSql(sql) {
  return execFileSync(
    "psql",
    [
      "-h", localDbHost,
      "-p", localDbPort,
      "-U", localDbUser,
      "-d", localDbName,
      "-v", "ON_ERROR_STOP=1",
      "-X",
      "-At",
    ],
    {
      input: sql,
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: localDbPassword },
      maxBuffer: 4 * 1024 * 1024,
    },
  ).trim();
}
"""

PHASE_PATTERN = re.compile(
    r'''  const \{ error: matchPlayerError \} = await admin\.from\("match_players"\)\.insert\(\n'''
    r'''    sessions\.map\(\(session\) => \(\{\n'''
    r'''      match_id: matchId,\n'''
    r'''      player_id: session\.user\.id,\n'''
    r'''    \}\)\),\n'''
    r'''  \);\n'''
    r'''  if \(matchPlayerError\) throw matchPlayerError;'''
)
PHASE_REPLACEMENT = """  const matchPlayerValues = sessions
    .map((session) => `(${sqlUuid(matchId)},${sqlUuid(session.user.id)})`)
    .join(",\\n");
  ownerFixtureSql(`
    insert into public.match_players (match_id, player_id)
    values ${matchPlayerValues};
  `);"""

RECONNECT_PATTERN = re.compile(
    r'''  const \{ error: playersError \} = await admin\.from\("match_players"\)\.insert\(\n'''
    r'''    sessions\.map\(\(session\) => \(\{\n'''
    r'''      match_id: matchId,\n'''
    r'''      player_id: session\.user\.id,\n'''
    r'''    \}\)\),\n'''
    r'''  \);\n'''
    r'''  if \(playersError\) throw playersError;'''
)
RECONNECT_REPLACEMENT = """  const matchPlayerValues = sessions
    .map((session) => `(${sqlUuid(matchId)},${sqlUuid(session.user.id)})`)
    .join(",\\n");
  ownerFixtureSql(`
    insert into public.match_players (match_id, player_id)
    values ${matchPlayerValues};
  `);"""

for file_path in FILES:
    text = file_path.read_text(encoding="utf-8")
    if 'import { execFileSync } from "node:child_process";' not in text:
        if IMPORT_MARKER not in text:
            raise SystemExit(f"import marker missing: {file_path}")
        text = text.replace(IMPORT_MARKER, IMPORT_INSERT, 1)
    if "function ownerFixtureSql(sql)" not in text:
        if HELPER_MARKER not in text:
            raise SystemExit(f"helper marker missing: {file_path}")
        text = text.replace(HELPER_MARKER, HELPER_INSERT, 1)

    if file_path.name == "movie-buff-three-client-phase-proof.mjs":
        text, count = PHASE_PATTERN.subn(PHASE_REPLACEMENT, text, count=1)
    else:
        text, count = RECONNECT_PATTERN.subn(RECONNECT_REPLACEMENT, text, count=1)
    if count != 1:
        raise SystemExit(f"match_players fixture block replacement count {count}: {file_path}")
    file_path.write_text(text, encoding="utf-8")

print("MOVIE_BUFF_MOV17_OWNER_FIXTURE_PATCH=PASS")
