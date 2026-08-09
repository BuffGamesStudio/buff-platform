import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rollbackPath = new URL(
  "../supabase/rollbacks/20260804070000_movie_buff_production_baseline_reconciliation.rollback.sql",
  import.meta.url,
);

const dependentPolicies = [
  ["content_items", "Managers view all content"],
  ["content_items", "Managers create content"],
  ["content_items", "Managers update content"],
  ["content_categories", "Managers manage content categories"],
  ["tags", "Managers manage tags"],
  ["content_tags", "Managers manage content tags"],
  ["content_media", "Managers view all media"],
  ["content_media", "Managers create media"],
  ["content_media", "Managers update media"],
  ["content_answers", "Managers manage content answers"],
  ["challenge_sets", "Managers manage challenge sets"],
  ["challenge_set_items", "Managers manage challenge items"],
  ["game_rooms", "game_rooms_select"],
  ["room_players", "room_players_select"],
  ["matches", "Players view their matches"],
  ["match_players", "Players view match participants"],
  ["match_rounds", "Players view match rounds"],
  ["answers", "Players view answers from their matches"],
];

test("baseline reconciliation rollback removes every live helper dependency without CASCADE", async () => {
  const sql = await readFile(rollbackPath, "utf8");

  assert.doesNotMatch(sql, /\bdrop\b[\s\S]*?\bcascade\b/i);
  assert.match(sql, /do \$dependency_verify\$/i);
  assert.match(sql, /pg_catalog\.pg_depend/i);
  assert.match(sql, /Rollback verification failed: helper dependency remains/i);

  for (const [table, policy] of dependentPolicies) {
    const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedPolicy = policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      sql,
      new RegExp(
        `drop\\s+policy\\s+if\\s+exists\\s+"${escapedPolicy}"[\\s\\S]*?on\\s+public\\.${escapedTable}`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `create\\s+policy\\s+"${escapedPolicy}"[\\s\\S]*?on\\s+public\\.${escapedTable}`,
        "i",
      ),
    );
  }

  assert.match(sql, /platform_role in \('creator', 'moderator', 'admin'\)/i);
  assert.match(sql, /from public\.match_rounds as mr[\s\S]*join public\.match_players as mp/i);
  assert.match(sql, /from public\.game_rooms as gr[\s\S]*gr\.host_id = auth\.uid\(\)/i);
  assert.match(sql, /drop function public\.is_movie_buff_round_member\(uuid\)/i);
  assert.match(sql, /drop function public\.is_movie_buff_match_member\(uuid\)/i);
  assert.match(sql, /drop function public\.is_movie_buff_room_member\(uuid\)/i);
  assert.match(sql, /drop function public\.is_buff_content_manager\(\)/i);
});
