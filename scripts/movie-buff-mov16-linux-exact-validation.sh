#!/usr/bin/env bash
set -u -o pipefail

readonly EXPECTED_BRANCH="${EXPECTED_BRANCH:-copilot/MOV-16-vip-authority}"
readonly ENCODING_SHA="${ENCODING_SHA:-bf5e6d6f251f6840d17eed2fc68e0d580295437f}"
readonly MOV17_SHA="${MOV17_SHA:-b6aa1b5bd8cf18770db0cac7bf3630a09a7d86b1}"
readonly HARNESS_SHA="${HARNESS_SHA:-fdbbbf31efae88c0815d349297d27474c7f701e7}"
readonly HARNESS_BLOB="${HARNESS_BLOB:-fde92b7d6b2b4e8f0a0dcf09235b13c4f93a5574}"
readonly ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly RUN_ROOT="${RUNNER_TEMP:-/tmp}/movie-buff-mov16-exact-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
readonly EVIDENCE="${RUN_ROOT}/evidence"
readonly RAW="${RUN_ROOT}/raw"
readonly WORK="${RUN_ROOT}/stack"
readonly HARNESS="${RUN_ROOT}/movie-buff-vip-authority-adversarial-v2.mjs"
readonly SENTINEL="${RUN_ROOT}/sentinel.json"

overall=0
failure_step=""
app_pid=""
cleanup_exit=0
stack_started=0
sentinel_created=0

mkdir -p "${EVIDENCE}" "${RAW}" "${WORK}"

record_exit() {
  local name="$1"
  local code="$2"
  printf '%s\n' "${code}" >"${RAW}/${name}.exit"
  if [[ "${code}" -ne 0 && "${overall}" -eq 0 ]]; then
    overall=1
    failure_step="${name}"
  fi
}

run_logged() {
  local name="$1"
  shift
  "$@" >"${RAW}/${name}.log" 2>&1
  local code=$?
  record_exit "${name}" "${code}"
  return "${code}"
}

require_ready() {
  [[ "${overall}" -eq 0 ]]
}

cleanup() {
  set +e
  if [[ -n "${app_pid}" ]]; then
    kill "${app_pid}" >/dev/null 2>&1
    wait "${app_pid}" >/dev/null 2>&1
  fi

  if [[ "${sentinel_created}" -eq 1 && -f "${SENTINEL}" && -n "${api_url:-}" && -n "${service_key:-}" ]]; then
    NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
    SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
    MOVIE_BUFF_SENTINEL_FILE="${SENTINEL}" \
      node --input-type=module <<'NODE' >"${RAW}/sentinel-auth-cleanup.log" 2>&1
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const data = JSON.parse(fs.readFileSync(process.env.MOVIE_BUFF_SENTINEL_FILE, "utf8"));
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const { error } = await admin.auth.admin.deleteUser(data.userId);
if (error) throw error;
NODE
    local auth_cleanup=$?
    record_exit "sentinel-auth-cleanup" "${auth_cleanup}"
  fi

  if [[ "${stack_started}" -eq 1 ]]; then
    (cd "${WORK}" && supabase stop --no-backup) >"${RAW}/supabase-stop.log" 2>&1
    cleanup_exit=$?
  fi
  printf '%s\n' "${cleanup_exit}" >"${RAW}/cleanup.exit"
  if [[ "${cleanup_exit}" -ne 0 ]]; then
    overall=1
    [[ -n "${failure_step}" ]] || failure_step="cleanup"
  fi
}
trap cleanup EXIT

cd "${ROOT}" || exit 1

MOVIE_BUFF_EXPECTED_GIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}" \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" \
MOVIE_BUFF_LOCAL_DATABASE_URL="postgresql://127.0.0.1:54322/postgres" \
MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
MOVIE_BUFF_SERVICE_ROLE_MOCK="local-mock-evidence-controller" \
  node scripts/movie-buff-mov16-evidence-guard.mjs --preflight \
  >"${RAW}/preflight.json" 2>"${RAW}/preflight.error"
record_exit "preflight" $?

node scripts/movie-buff-mov16-evidence-guard.mjs --self-test \
  >"${RAW}/negative-paths.json" 2>"${RAW}/negative-paths.error"
record_exit "negative-paths" $?

node --check scripts/movie-buff-mov16-deadline-release-race.mjs \
  >"${RAW}/deadline-race-syntax.log" 2>&1
record_exit "deadline-race-syntax" $?

if require_ready; then
  git fetch --no-tags origin "${ENCODING_SHA}" "${MOV17_SHA}" "${HARNESS_SHA}" \
    >"${RAW}/git-fetch.log" 2>&1
  record_exit "git-fetch" $?
fi

if require_ready; then
  cp -a supabase "${WORK}/supabase"
  python3 - "${ROOT}" "${WORK}" "${ENCODING_SHA}" <<'PY' \
    >"${RAW}/encoding-composition.log" 2>&1
import pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
work = pathlib.Path(sys.argv[2])
encoding_sha = sys.argv[3]
paths = [
  "supabase/migrations/202607250001_start_movie_buff_match.sql",
  "supabase/migrations/202607250002_fix_start_match_ambiguity.sql",
  "supabase/migrations/202607250003_movie_buff_answers.sql",
  "supabase/migrations/202607250004_advance_movie_buff_round.sql",
  "supabase/migrations/202607250005_movie_buff_round_results.sql",
  "supabase/migrations/202607250006_exact_movie_buff_round_results.sql",
  "supabase/migrations/202607260001_movie_buff_final_results.sql",
  "supabase/migrations/202607262300_add_movie_buff_trivia_clips.sql",
  "supabase/migrations/202607270002_buff_games_content_engine.sql",
]
for rel in paths:
    current = subprocess.check_output(["git", "show", f"HEAD:{rel}"])
    repaired = subprocess.check_output(["git", "show", f"{encoding_sha}:{rel}"])
    if not current.startswith(b"\xef\xbb\xbf") or current[3:] != repaired:
        raise SystemExit(f"encoding repair mismatch for {rel}")
    target = work / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(repaired)
print(f"verified and composed {len(paths)} BOM-only repairs")
PY
  record_exit "encoding-composition" $?
fi

if require_ready; then
  mapfile -t mov17_migrations < <(
    git ls-tree -r --name-only "${MOV17_SHA}" -- supabase/migrations |
      grep '^supabase/migrations/20260804083[0-9][0-9][0-9]_movie_buff_.*\.sql$' |
      sort
  )
  if [[ "${#mov17_migrations[@]}" -lt 8 ]]; then
    printf 'Expected current MOV-17 migration set, found %s\n' "${#mov17_migrations[@]}" \
      >"${RAW}/mov17-composition.log"
    record_exit "mov17-composition" 1
  else
    {
      printf 'mov17_sha=%s\n' "${MOV17_SHA}"
      printf 'mov17_tree=%s\n' "$(git rev-parse "${MOV17_SHA}^{tree}")"
      printf '%s\n' "${mov17_migrations[@]}"
    } >"${RAW}/mov17-composition.log"
    for rel in "${mov17_migrations[@]}"; do
      mkdir -p "${WORK}/$(dirname "${rel}")"
      git show "${MOV17_SHA}:${rel}" >"${WORK}/${rel}" || {
        record_exit "mov17-composition" 1
        break
      }
    done
    [[ -f "${RAW}/mov17-composition.exit" ]] || record_exit "mov17-composition" 0
  fi
fi

if require_ready; then
  actual_harness_blob="$(git rev-parse "${HARNESS_SHA}:scripts/movie-buff-vip-authority-adversarial-v2.mjs")"
  if [[ "${actual_harness_blob}" != "${HARNESS_BLOB}" ]]; then
    printf 'Unexpected harness blob %s\n' "${actual_harness_blob}" >"${RAW}/harness-bind.log"
    record_exit "harness-bind" 1
  else
    git show "${HARNESS_SHA}:scripts/movie-buff-vip-authority-adversarial-v2.mjs" >"${HARNESS}"
    node --check "${HARNESS}" >"${RAW}/harness-bind.log" 2>&1
    record_exit "harness-bind" $?
  fi
fi

if require_ready; then
  python3 - "${WORK}/supabase/config.toml" "mov16-exact-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}" <<'PY' \
    >"${RAW}/ephemeral-config.log" 2>&1
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
project = sys.argv[2]
text, n = re.subn(r'(?m)^project_id\s*=\s*"[^"]+"\s*$', f'project_id = "{project}"', text, count=1)
text, m = re.subn(r'(?ms)(^\[db\.seed\]\s*.*?^enabled\s*=\s*)true(\s*$)', r'\1false\2', text, count=1)
if n != 1 or m != 1:
    raise SystemExit("ephemeral Supabase config rewrite failed")
path.write_text(text, encoding="utf-8")
PY
  record_exit "ephemeral-config" $?
fi

if require_ready; then
  (cd "${WORK}" && supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor) \
    >"${RAW}/supabase-start.log" 2>&1
  code=$?
  [[ "${code}" -eq 0 ]] && stack_started=1
  record_exit "supabase-start" "${code}"
fi

if require_ready; then
  (cd "${WORK}" && supabase db reset --local) >"${RAW}/db-reset.log" 2>&1
  record_exit "db-reset" $?
fi

if require_ready; then
  status_env="$(cd "${WORK}" && supabase status -o env 2>"${RAW}/supabase-status.error")"
  code=$?
  record_exit "supabase-status" "${code}"
  if [[ "${code}" -eq 0 ]]; then
    eval "${status_env}"
    api_url="${API_URL:-http://127.0.0.1:54321}"
    publishable_key="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
    service_key="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
    database_url="${DB_URL:-}"
    if [[ -z "${publishable_key}" || -z "${service_key}" || -z "${database_url}" ]]; then
      record_exit "credential-shape" 1
    else
      record_exit "credential-shape" 0
    fi
  fi
fi

run_pgtap() {
  local label="$1"
  local log="${RAW}/${label}.log"
  : >"${log}"
  local code=0
  for test_file in \
    supabase/tests/movie_buff_vip_authority_test.sql \
    supabase/tests/movie_buff_vip_deadline_finalize_test.sql \
    supabase/tests/movie_buff_vip_snapshot_release_test.sql \
    supabase/tests/movie_buff_vip_catalog_contract_test.sql
  do
    printf '\n### %s\n' "${test_file}" >>"${log}"
    psql "${database_url}" -X -v ON_ERROR_STOP=1 -f "${test_file}" >>"${log}" 2>&1 || code=1
  done
  if grep -Eq '(^|[[:space:]])not ok([[:space:]]|$)' "${log}"; then
    code=1
  fi
  record_exit "${label}" "${code}"
}

if require_ready; then
  run_pgtap "pgtap-before-containment"
fi

if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 -Atq \
    -f scripts/movie-buff-mov16-catalog-manifest.sql \
    >"${RAW}/catalog-manifest.json" 2>"${RAW}/catalog-manifest.error"
  record_exit "catalog-manifest" $?
fi

if require_ready; then
  python3 - "${ROOT}" "${MOV17_SHA}" "${RAW}/mov17-compatibility.json" <<'PY'
import hashlib, json, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
mov17_sha = sys.argv[2]
output = pathlib.Path(sys.argv[3])
paths = subprocess.check_output(
    ["git", "ls-tree", "-r", "--name-only", mov17_sha, "--", "supabase/migrations"],
    text=True,
).splitlines()
paths = sorted(p for p in paths if pathlib.PurePosixPath(p).name.startswith("20260804083"))
source = "\n".join(subprocess.check_output(["git", "show", f"{mov17_sha}:{p}"], text=True) for p in paths)
required = {
    "open": "open_movie_buff_vip_round_window",
    "finalize": "finalize_movie_buff_vip_round_window",
    "release": "release_movie_buff_vip_required_player",
    "phase": "set_movie_buff_vip_activation_phase",
}
missing = [name for name, token in required.items() if token not in source]
if missing:
    raise SystemExit(f"MOV-17 source is missing calls: {missing}")
if "p_required_player_ids" not in source:
    raise SystemExit("MOV-17 does not supply the exact required-human identity snapshot")
current = "\n".join(
    (root / p).read_text(encoding="utf-8")
    for p in [
      "supabase/migrations/20260804073000_movie_buff_vip_authority.sql",
      "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql",
      "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql",
    ]
)
signatures = [
  "open_movie_buff_vip_round_window(",
  "release_movie_buff_vip_required_player(",
  "set_movie_buff_vip_activation_phase(",
  "finalize_movie_buff_vip_round_window(",
]
for signature in signatures:
    if signature not in current:
        raise SystemExit(f"MOV-16 source is missing {signature}")
record = {
    "classification": "PASS",
    "mov17Sha": mov17_sha,
    "mov17Tree": subprocess.check_output(["git", "rev-parse", f"{mov17_sha}^{{tree}}"], text=True).strip(),
    "migrationCount": len(paths),
    "migrationHashes": {
        p: hashlib.sha256(subprocess.check_output(["git", "show", f"{mov17_sha}:{p}"])).hexdigest()
        for p in paths
    },
    "requiredCalls": required,
    "exactSnapshotArgumentObserved": True,
}
output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
PY
  record_exit "mov17-compatibility" $?
fi

if require_ready; then
  NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${publishable_key}" \
  SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
  MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
    npm run build >"${RAW}/build.log" 2>&1
  record_exit "build" $?
fi

if require_ready; then
  NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${publishable_key}" \
  SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
  MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
    npm run start -- --hostname 127.0.0.1 --port 3001 >"${RAW}/application.log" 2>&1 &
  app_pid=$!
  health=1
  for _ in $(seq 1 120); do
    if curl --fail --silent --show-error http://127.0.0.1:3001/sign-in >/dev/null 2>>"${RAW}/application-health.log"; then
      health=0
      break
    fi
    sleep 1
  done
  record_exit "application-health" "${health}"
fi

run_behavior() {
  local suffix="$1"
  NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${publishable_key}" \
  SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
  MOVIE_BUFF_LOCAL_DATABASE_URL="${database_url}" \
  MOVIE_BUFF_APP_URL="http://127.0.0.1:3001" \
  MOVIE_BUFF_EXPECTED_GIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}" \
  MOVIE_BUFF_LOCAL_RUN_ID="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-${suffix}" \
  MOVIE_BUFF_EVIDENCE_OUTPUT="${RAW}/adversarial-${suffix}.json" \
    node "${HARNESS}" >"${RAW}/adversarial-${suffix}.log" 2>&1
  record_exit "adversarial-${suffix}" $?

  NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
  SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
  MOVIE_BUFF_LOCAL_DATABASE_URL="${database_url}" \
  MOVIE_BUFF_EXPECTED_GIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}" \
  MOVIE_BUFF_ALLOW_LOCAL_MOV16_RACE="YES" \
  MOVIE_BUFF_EVIDENCE_OUTPUT="${RAW}/deadline-release-race-${suffix}.json" \
    node scripts/movie-buff-mov16-deadline-release-race.mjs \
    >"${RAW}/deadline-release-race-${suffix}.log" 2>&1
  record_exit "deadline-release-race-${suffix}" $?
}

if require_ready; then
  run_behavior "before-containment"
fi

snapshot_vip_data() {
  local target="$1"
  : >"${target}"
  for table in \
    movie_buff_vip_definitions \
    movie_buff_vip_inventory \
    movie_buff_vip_round_windows \
    movie_buff_vip_round_required_players \
    movie_buff_vip_round_locks \
    movie_buff_vip_consumptions
  do
    psql "${database_url}" -X -Atq -v ON_ERROR_STOP=1 -c \
      "select '${table}|' || count(*)::text || '|' || pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(t)::text, E'\n' order by pg_catalog.to_jsonb(t)::text), '')) from public.${table} as t;" \
      >>"${target}"
  done
}

if require_ready; then
  NEXT_PUBLIC_SUPABASE_URL="${api_url}" \
  SUPABASE_SERVICE_ROLE_KEY="${service_key}" \
  MOVIE_BUFF_SENTINEL_FILE="${SENTINEL}" \
    node --input-type=module <<'NODE' >"${RAW}/sentinel-auth-create.log" 2>&1
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const email = `mov16-sentinel-${Date.now()}@example.test`;
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: "Local-MOV16-Sentinel-A9!",
  email_confirm: true,
  user_metadata: { display_name: "MOV-16 Rollback Sentinel" },
});
if (error || !data.user) throw error ?? new Error("sentinel user missing");
const { error: profileError } = await admin.from("profiles").upsert({
  id: data.user.id,
  display_name: "MOV-16 Rollback Sentinel",
});
if (profileError) throw profileError;
fs.writeFileSync(
  process.env.MOVIE_BUFF_SENTINEL_FILE,
  JSON.stringify({ userId: data.user.id }, null, 2) + "\n",
);
NODE
  code=$?
  [[ "${code}" -eq 0 ]] && sentinel_created=1
  record_exit "sentinel-auth-create" "${code}"
fi

if require_ready; then
  python3 - "${SENTINEL}" "${RUN_ROOT}/sentinel-vars.env" <<'PY'
import json, pathlib, sys, uuid
data=json.loads(pathlib.Path(sys.argv[1]).read_text())
values={"user_id":data["userId"]}
for key in ["room_id","match_id","round_id","definition_id","inventory_id","lock_id","consumption_id"]:
    values[key]=str(uuid.uuid4())
pathlib.Path(sys.argv[2]).write_text("\n".join(f"{k}={v}" for k,v in values.items())+"\n")
PY
  source "${RUN_ROOT}/sentinel-vars.env"
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -v user_id="${user_id}" -v room_id="${room_id}" -v match_id="${match_id}" \
    -v round_id="${round_id}" -v definition_id="${definition_id}" \
    -v inventory_id="${inventory_id}" -v lock_id="${lock_id}" \
    -v consumption_id="${consumption_id}" <<'SQL' \
    >"${RAW}/sentinel-data-create.log" 2>&1
begin;
insert into public.game_rooms
  (id,room_code,host_id,room_type,status,category_id,difficulty,total_rounds,max_players,current_round,is_ranked,started_at)
values
  (:'room_id'::uuid, upper(substr(replace(:'room_id','-',''),1,8)), :'user_id'::uuid, 'private','active',null,'medium',10,4,1,false,pg_catalog.clock_timestamp());
insert into public.room_players
  (room_id,player_id,is_ready,is_host,left_at,joined_at,last_seen_at)
values
  (:'room_id'::uuid,:'user_id'::uuid,true,true,null,pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp());
insert into public.matches
  (id,room_id,category_id,difficulty,total_rounds,status,started_at)
values
  (:'match_id'::uuid,:'room_id'::uuid,null,'medium',10,'active',pg_catalog.clock_timestamp());
insert into public.match_players (match_id,player_id)
values (:'match_id'::uuid,:'user_id'::uuid);
insert into public.match_rounds
  (id,match_id,round_number,time_limit_seconds,started_at)
values
  (:'round_id'::uuid,:'match_id'::uuid,1,30,pg_catalog.clock_timestamp());
insert into public.movie_buff_vip_definitions
  (id,code,name,description,effect_scope,activation_window,is_stackable,max_per_round,cooldown_seconds,is_active,eligibility_configured,allowed_room_types,allowed_difficulties,allow_any_category,allowed_category_ids,minimum_round_number,maximum_round_number,allow_ranked,allow_unranked)
values
  (:'definition_id'::uuid,'mov16_rollback_sentinel','Rollback Sentinel','Preserved local rollback evidence.','personal','answer',false,1,0,true,true,array['private']::text[],array['medium']::text[],true,array[]::uuid[],1,10,false,true);
insert into public.movie_buff_vip_inventory
  (id,player_id,vip_id,quantity_remaining)
values
  (:'inventory_id'::uuid,:'user_id'::uuid,:'definition_id'::uuid,1);
insert into public.movie_buff_vip_round_windows
  (round_id,match_id,room_id,round_number,opens_at,deadline_at,status,original_required_player_count,activation_phase)
values
  (:'round_id'::uuid,:'match_id'::uuid,:'room_id'::uuid,1,pg_catalog.clock_timestamp()-interval '1 minute',pg_catalog.clock_timestamp()+interval '1 minute','closed',1,'answer');
insert into public.movie_buff_vip_round_required_players
  (round_id,match_id,room_id,player_id)
values
  (:'round_id'::uuid,:'match_id'::uuid,:'room_id'::uuid,:'user_id'::uuid);
insert into public.movie_buff_vip_round_locks
  (id,room_id,match_id,round_id,player_id,vip_id,inventory_id,idempotency_key,locked_at,activated_at,consumed_at)
values
  (:'lock_id'::uuid,:'room_id'::uuid,:'match_id'::uuid,:'round_id'::uuid,:'user_id'::uuid,:'definition_id'::uuid,:'inventory_id'::uuid,'rollback-sentinel-lock',pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp());
insert into public.movie_buff_vip_consumptions
  (id,lock_id,inventory_id,player_id,vip_id,activation_key,consumed_at)
values
  (:'consumption_id'::uuid,:'lock_id'::uuid,:'inventory_id'::uuid,:'user_id'::uuid,:'definition_id'::uuid,'rollback-sentinel-activation',pg_catalog.clock_timestamp());
commit;
SQL
  record_exit "sentinel-data-create" $?
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-before.txt"
  record_exit "snapshot-before" $?
fi

if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -f supabase/rollbacks/20260804073310_movie_buff_vip_callable_containment.rollback.sql \
    >"${RAW}/callable-containment.log" 2>&1
  record_exit "callable-containment" $?
fi

if require_ready; then
  psql "${database_url}" -X -Atq -v ON_ERROR_STOP=1 -c "
    select count(*)
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'movie_buff_vip_ineligibility_reason',
        'open_movie_buff_vip_round_window',
        'release_movie_buff_vip_required_player',
        'set_movie_buff_vip_activation_phase',
        'get_movie_buff_vip_round_view',
        'lock_movie_buff_round_vip',
        'activate_movie_buff_round_vip',
        'finalize_movie_buff_vip_round_window'
      );
  " >"${RAW}/contained-function-count.txt" 2>"${RAW}/contained-function-count.error"
  code=$?
  if [[ "${code}" -eq 0 && "$(cat "${RAW}/contained-function-count.txt")" == "0" ]]; then
    record_exit "contained-function-count" 0
  else
    record_exit "contained-function-count" 1
  fi
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-contained.txt"
  diff -u "${RAW}/vip-data-before.txt" "${RAW}/vip-data-contained.txt" \
    >"${RAW}/containment-data-diff.log" 2>&1
  record_exit "containment-data-equality" $?
fi

if require_ready; then
  for migration in \
    supabase/migrations/20260804073000_movie_buff_vip_authority.sql \
    supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql \
    supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql \
    supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql
  do
    psql "${database_url}" -X -v ON_ERROR_STOP=1 -f "${migration}" \
      >>"${RAW}/forward-reapply.log" 2>&1 || {
        record_exit "forward-reapply" 1
        break
      }
  done
  [[ -f "${RAW}/forward-reapply.exit" ]] || record_exit "forward-reapply" 0
fi

if require_ready; then
  snapshot_vip_data "${RAW}/vip-data-reapplied.txt"
  diff -u "${RAW}/vip-data-before.txt" "${RAW}/vip-data-reapplied.txt" \
    >"${RAW}/reapply-data-diff.log" 2>&1
  record_exit "reapply-data-equality" $?
fi

if require_ready; then
  run_pgtap "pgtap-after-reapply"
fi

if require_ready; then
  run_behavior "after-reapply"
fi

if require_ready; then
  psql "${database_url}" -X -v ON_ERROR_STOP=1 \
    -v room_id="${room_id}" -v definition_id="${definition_id}" <<'SQL' \
    >"${RAW}/sentinel-data-cleanup.log" 2>&1
begin;
delete from public.game_rooms where id=:'room_id'::uuid;
delete from public.movie_buff_vip_inventory where vip_id=:'definition_id'::uuid;
delete from public.movie_buff_vip_definitions where id=:'definition_id'::uuid;
commit;
SQL
  record_exit "sentinel-data-cleanup" $?
fi

cleanup
trap - EXIT

python3 - "${RAW}" "${EVIDENCE}" <<'PY'
import pathlib, re, sys
raw = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
patterns = [
  (re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'), '[REDACTED_JWT]'),
  (re.compile(r'postgres(?:ql)?://[^\s"\']+@[^\s"\']+', re.I), 'postgresql://[REDACTED_LOCAL_CREDENTIALS]@127.0.0.1'),
  (re.compile(r'sb_(?:secret|publishable)_[A-Za-z0-9_-]+'), '[REDACTED_SUPABASE_KEY]'),
]
for source in raw.iterdir():
    if not source.is_file() or source.suffix == '.exit':
        continue
    text = source.read_text(encoding='utf-8', errors='replace')
    for pattern, replacement in patterns:
        text = pattern.sub(replacement, text)
    (out / source.name).write_text(text, encoding='utf-8')
PY

python3 - "${RAW}" "${EVIDENCE}/child-exits.json" <<'PY'
import json, pathlib, sys
raw=pathlib.Path(sys.argv[1])
entries=[]
for file in sorted(raw.glob('*.exit')):
    if file.name == 'cleanup.exit':
        continue
    entries.append({'name':file.stem,'exitCode':int(file.read_text().strip())})
pathlib.Path(sys.argv[2]).write_text(json.dumps(entries,indent=2)+'\n')
PY

printf '%s\n' "${cleanup_exit}" >"${EVIDENCE}/cleanup.exit"
printf '%s\n' "${GITHUB_SHA:-$(git rev-parse HEAD)}" >"${EVIDENCE}/source-sha.txt"
{
  echo "classification=$([[ "${overall}" -eq 0 ]] && echo PASS || echo FAIL)"
  echo "failure_step=${failure_step:-none}"
  echo "repository=BuffGamesStudio/buff-platform"
  echo "branch=$(git branch --show-current)"
  echo "source_sha=$(git rev-parse HEAD)"
  echo "source_tree=$(git rev-parse HEAD^{tree})"
  echo "mov17_sha=${MOV17_SHA}"
  echo "mov17_tree=$(git rev-parse "${MOV17_SHA}^{tree}")"
  echo "encoding_sha=${ENCODING_SHA}"
  echo "harness_sha=${HARNESS_SHA}"
  echo "harness_blob=${HARNESS_BLOB}"
  echo "pgtap_planned_before=83"
  echo "pgtap_planned_after_reapply=83"
  echo "target=disposable-localhost"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"${EVIDENCE}/metadata.txt"

(
  cd "${EVIDENCE}" &&
  find . -type f ! -name sha256.txt -print0 |
    sort -z |
    xargs -0 sha256sum >sha256.txt
)

node scripts/movie-buff-mov16-evidence-guard.mjs --verify-evidence "${EVIDENCE}" \
  >"${RAW}/evidence-verification.json" 2>"${RAW}/evidence-verification.error"
verify_code=$?
if [[ "${verify_code}" -ne 0 ]]; then
  overall=1
  [[ -n "${failure_step}" ]] || failure_step="evidence-verification"
else
  cp "${RAW}/evidence-verification.json" "${EVIDENCE}/evidence-verification.json"
fi

(
  cd "${EVIDENCE}" &&
  find . -type f ! -name sha256.txt -print0 |
    sort -z |
    xargs -0 sha256sum >sha256.txt &&
  sha256sum -c sha256.txt
) >"${RAW}/final-manifest-check.log" 2>&1 || overall=1

git status --porcelain >"${RAW}/git-status-before-repair.txt"
python3 - "${RAW}/git-status-before-repair.txt" <<'PY'
import pathlib, sys
entries=pathlib.Path(sys.argv[1]).read_text().splitlines()
allowed={"next-env.d.ts"}
unexpected=[]
for entry in entries:
    value=entry[3:].strip()
    if " -> " in value:
        value=value.split(" -> ",1)[1]
    if value not in allowed:
        unexpected.append(entry)
if unexpected:
    raise SystemExit("unexpected worktree changes: " + repr(unexpected))
PY
postflight_shape=$?
if [[ "${postflight_shape}" -eq 0 && -n "$(git status --porcelain -- next-env.d.ts)" ]]; then
  git checkout -- next-env.d.ts
fi
git diff --check >/dev/null 2>&1 || overall=1
[[ -z "$(git status --porcelain)" ]] || overall=1

exit "${overall}"
