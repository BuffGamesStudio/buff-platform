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
  "20260804070000_movie_buff_production_baseline_reconciliation.sql",
  "20260804073000_movie_buff_vip_authority.sql",
  "20260804073100_movie_buff_vip_null_category_fail_closed.sql",
  "20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
  "20260804073300_movie_buff_vip_deadline_finalize.sql",
  "20260804081500_movie_buff_atomic_three_player_matchmaking.sql",
  "20260804081600_movie_buff_admission_phase_handoff.sql",
  "20260804083000_movie_buff_server_phase_machine.sql",
  "20260804083100_movie_buff_server_phase_machine_hardening.sql",
  "20260804083200_movie_buff_buster_safe_boundary.sql",
  "20260804083300_movie_buff_phase_tile_mutation_guard.sql",
  "20260804083400_movie_buff_phase_contract_alignment.sql",
  "20260804083500_movie_buff_reconnect_buster_boundary_repair.sql",
  "20260804083600_movie_buff_match_start_handoff.sql",
  "20260804083610_movie_buff_phase_digest_schema_repair.sql",
  "20260804083700_movie_buff_active_leave_and_buster_boundary.sql",
  "20260805155000_movie_buff_function_security_finalizer.sql",
  "20260805160000_movie_buff_six_table_rls_reconciliation.sql",
  "20260805160500_public_rls_auto_enable_event_trigger_contract.sql",
  "20260805161000_public_rls_auto_enable_acl_lockdown.sql",
  "20260807010000_movie_buff_production_security_manifest_reconciliation.sql",
  "20260807014500_movie_buff_rls_helper_execute_repair.sql",
  "20260812130000_movie_buff_match_visibility_policy_repair.sql",
];

const result = {
  ok: true,
  migrationsDir,
  requiredCount: requiredMigrations.length,
  present: [],
  missing: [],
  utf8BomFiles: [],
  policyRepair: {
    file: "20260812130000_movie_buff_match_visibility_policy_repair.sql",
    present: false,
    membershipHelperUses: 0,
    forbiddenTautologies: [],
  },
};

for (const fileName of fs
  .readdirSync(migrationsDir)
  .filter((entry) => entry.toLowerCase().endsWith(".sql"))) {
  const fullPath = path.join(migrationsDir, fileName);
  const contents = fs.readFileSync(fullPath);

  if (
    contents.length >= 3 &&
    contents[0] === 0xef &&
    contents[1] === 0xbb &&
    contents[2] === 0xbf
  ) {
    result.utf8BomFiles.push(fileName);
  }
}

if (result.utf8BomFiles.length > 0) {
  result.ok = false;
}

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

const policyRepairPath = path.join(
  migrationsDir,
  result.policyRepair.file,
);

if (fs.existsSync(policyRepairPath)) {
  result.policyRepair.present = true;
  const policyRepairSql = fs
    .readFileSync(policyRepairPath, "utf8")
    .replace(/--.*$/gm, "");
  const helperMatch = policyRepairSql.match(
    /public\.is_movie_buff_match_member\(match_id\)/g,
  );
  result.policyRepair.membershipHelperUses =
    helperMatch?.length ?? 0;

  for (const tautology of [
    "mine.match_id = mine.match_id",
    "mp.match_id = mp.match_id",
  ]) {
    if (policyRepairSql.includes(tautology)) {
      result.policyRepair.forbiddenTautologies.push(tautology);
    }
  }

  if (result.policyRepair.membershipHelperUses < 2) {
    result.ok = false;
  }
  if (result.policyRepair.forbiddenTautologies.length > 0) {
    result.ok = false;
  }
} else {
  result.ok = false;
}

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
