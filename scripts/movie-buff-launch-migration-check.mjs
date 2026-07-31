import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const migrationsDir = path.join(
  repoRoot,
  "supabase",
  "migrations"
);

const requiredMigrations = [
  "202607311945_movie_buff_public_matchmaking_presence_gate.sql",
  "202607311930_movie_buff_public_presence_hotfix.sql",
  "202607300100_movie_buff_clip_analytics_and_round_timing.sql",
  "202607300240_movie_buff_public_room_created_event_in_rpc.sql",
  "202607300220_movie_buff_playback_launch_timeout_buffer.sql",
  "202607300310_movie_buff_public_match_autostart.sql",
  "202607300330_movie_buff_public_ready_autostart_rpc.sql",
  "202607300340_movie_buff_analytics_rls_lockdown.sql",
  "202607301430_movie_buff_public_matchmaking_creation_lock.sql",
  "202607301700_movie_buff_launch_gate_fast_media_only.sql",
  "202607311950_movie_buff_source_registry.sql",
  "202607311958_movie_buff_source_registry_grants.sql",
];

const result = {
  ok: true,
  migrationsDir,
  requiredCount: requiredMigrations.length,
  present: [],
  missing: [],
};

for (const fileName of requiredMigrations) {
  const fullPath = path.join(
    migrationsDir,
    fileName
  );

  if (fs.existsSync(fullPath)) {
    result.present.push(fileName);
    continue;
  }

  result.ok = false;
  result.missing.push(fileName);
}

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
