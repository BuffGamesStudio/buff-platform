# Movie Buff live runner host runbook

This runbook prepares the persistent Movie Buff show runner for a durable
Linux/Docker host. It does not provision a host, create credentials, deploy a
container, or authorize a production cutover. The currently verified worker is
still the authorized workstation until a separate host identity and fresh
database heartbeat are observed.

## Operating contract

The runner is a long-lived Node process that calls
`tick_movie_buff_live_show(show_key, worker_id)`. The database lease remains the
authority for the `main` show:

- Run one intended worker for the show. A second process with the same show key
  must wait for the database lease rather than becoming an independent writer.
- Do not reset `worker_id`, `lease_expires_at`, or heartbeat columns manually to
  force a cutover. Stop the old process and let the database lease expire.
- The container is read-only, runs as UID/GID `10001:10001`, drops all Linux
  capabilities, and has no published ports. It needs outbound HTTPS access to
  Supabase only.
- The image defaults `MOVIE_BUFF_LIVE_RUNNER_ENABLED=false`. The Compose
  deployment explicitly opts in, while missing Supabase configuration still
  causes the runner to fail closed.

The Compose healthcheck only proves that the local runner process is present.
It cannot prove database connectivity, a fresh heartbeat, a valid lease, or
episode progress. Those require the separate external database health check.

## Host prerequisites

Use a maintained Linux host or managed Docker runtime with:

- Docker Engine and Docker Compose v2 installed and enabled at boot;
- a 64-bit `node:22-alpine` compatible architecture;
- reliable outbound TCP 443/DNS access to the intended Supabase project;
- NTP or another time-synchronization service enabled;
- enough capacity for one small service (the Compose limits are 1 CPU, 256 MiB
  RAM, 128 processes, and a 64 MiB `/tmp` tmpfs);
- SSH or other administration access restricted to the operator's network.

No inbound application port is required. Do not add a `ports:` mapping to the
Compose file. Keep the host firewall default-deny for unsolicited inbound
traffic and allow only the host-management path required by the operator.

Create a deployment directory owned by the operator, for example:

```text
/opt/movie-buff-live/
  docker-compose.movie-buff-live.yml
  docker/movie-buff-live-runner.Dockerfile
  scripts/...
  package.json
  package-lock.json
/etc/movie-buff/movie-buff-live.env
```

The Compose build context must include the files copied by the Dockerfile and
the repository `.dockerignore` must remain in place so the public media library
is not sent to the Docker daemon during the build.

## Secret injection

Prefer a host secret manager that renders a short-lived, root-readable env file
or injects the same variables into the Compose process. Do not put a secret in
Git, the image, a command-line argument, a shell history entry, or an unredacted
Compose/config/log artifact.

If using a protected env file, create `/etc/movie-buff/movie-buff-live.env` with
mode `0600`, owned by root or the dedicated deployment account. Its contents
should include values in this shape, with real values supplied only on the
host:

```dotenv
MOVIE_BUFF_LIVE_RUNNER_ENABLED=true
MOVIE_BUFF_LIVE_SHOW_KEY=main
MOVIE_BUFF_LIVE_RUNNER_POLL_MS=1000
MOVIE_BUFF_EXPECTED_SUPABASE_REF=<intended-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<intended-project>.supabase.co
SUPABASE_SECRET_KEY=<preferred-server-secret>
MOVIE_BUFF_BROADCAST_PROVIDER=mux
MOVIE_BUFF_PUBLIC_PLAYBACK_URL=https://stream.mux.com/<playback-id>
MOVIE_BUFF_AI_HOST_PROVIDER=livekit
MOVIE_BUFF_AI_HOST_ENABLED=false
MOVIE_BUFF_AI_MODEL_PROVIDER=livekit_inference
MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_ENABLED=false
MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED=false
MOVIE_BUFF_LIVEKIT_CONTROL_ROOM=movie-buff-main
LIVEKIT_URL=wss://<livekit-project>.livekit.cloud
LIVEKIT_API_KEY=<livekit-api-key>
LIVEKIT_API_SECRET=<livekit-api-secret>
LIVEKIT_AGENT_NAME=assistant-231b
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted by the runner as a legacy fallback if
the preferred `SUPABASE_SECRET_KEY` is not available. Provide one elevated
server key, never a publishable browser key. Confirm the URL points to the
intended project before starting the service.

Keep `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_ENABLED=false` until the reviewed bridge
code is deployed to the host. When enabling it, set
`MOVIE_BUFF_AI_HOST_ENABLED=true` and provide the LiveKit URL, API key, API
secret, and exact registered agent name. Leave
`MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED=false` during the first staged
rollout so a provider outage cannot stop the authoritative show runner; only
make it required after provider synchronization has been observed healthy.

Pass the protected env file to each Compose command with `--env-file`. The
Compose file uses those values for required interpolation; it does not mount
or copy the secret file into the image or container:

```bash
chmod 600 /etc/movie-buff/movie-buff-live.env
docker compose \
  --env-file /etc/movie-buff/movie-buff-live.env \
  -f /opt/movie-buff-live/docker-compose.movie-buff-live.yml \
  config --quiet
```

`config` is a structural check only. Do not use a normal `docker compose
config` output as a shareable artifact because resolved environment values can
be displayed.

## First launch on a replacement host

1. Copy the exact reviewed repository candidate to the host. Record the Git
   commit SHA and verify that the Compose file, Dockerfile, scripts, and lockfile
   came from that candidate.
2. Install the protected env file and verify its project URL without printing
   the secret value.
3. Confirm Docker is enabled at boot:

   ```bash
   sudo systemctl enable --now docker
   docker version
   docker compose version
   ```

4. Validate and build the image without starting it:

   ```bash
   cd /opt/movie-buff-live
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     config --quiet
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     build --pull movie-buff-live-runner
   ```

5. Start the replacement worker:

   ```bash
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     up -d movie-buff-live-runner
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     ps
   ```

6. Confirm the local container is running and healthy. The healthcheck may be
   `starting` for its first 15 seconds:

   ```bash
   docker inspect \
     --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \
     movie-buff-live-runner
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     logs --tail=50 movie-buff-live-runner
   ```

7. Run the separate external live health check and verify that the fresh
   `worker_id`, `last_heartbeat_at`, and unexpired `lease_expires_at` belong to
   the replacement host. Do not stop the existing worker until this replacement
   container is at least running and the cutover operator has a rollback path.

## Safe cutover from the current worker

The database lease prevents two workers from actively controlling the same
show, but it is still preferable to make the cutover deliberate:

1. Start the replacement container and confirm its local healthcheck.
2. Observe the current `main` show through the external health check. If the
   old worker still owns the lease, the replacement must not be reported as the
   active lease holder yet.
3. Stop the old worker gracefully. Do not run `docker compose down -v`, delete
   database rows, or manually clear the lease:

   ```bash
   docker compose \
     --env-file /etc/movie-buff/movie-buff-live.env \
     -f docker-compose.movie-buff-live.yml \
     stop -t 30 movie-buff-live-runner
   ```

4. Wait for the database lease to expire, then confirm the replacement host has
   acquired it and is producing fresh heartbeats. The exact wait is the lease
   duration in the deployed database function plus the runner poll interval;
   use observed `lease_expires_at`, not a guessed timeout.
5. Keep the old host stopped until the replacement has passed the external
   health check for at least one full monitoring interval.

## Restart, shutdown, and logs

`restart: unless-stopped` restarts the container after a process failure and
starts it again with the Docker daemon after host boot, unless an operator
intentionally stopped it. `init: true` provides a minimal PID 1 for signal
forwarding and child reaping. `SIGTERM` plus the 30-second grace period lets the
runner log its stop request and exit its polling loop cleanly.

The service uses Docker's `json-file` driver with a 10 MiB maximum file size and
five retained files. This is a bounded local buffer, not an audit archive. If
central logs are required, forward them from the host without changing the
container's secret environment or exposing keys.

Useful checks:

```bash
docker inspect --format '{{json .State.Health}}' movie-buff-live-runner
docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' movie-buff-live-runner
docker compose -f docker-compose.movie-buff-live.yml logs --since=10m movie-buff-live-runner
docker stats --no-stream movie-buff-live-runner
```

The container healthcheck is intentionally local. A `healthy` result does not
mean that Supabase is reachable or that the show lease is advancing.

## Workstation validation note (2026-08-22)

The hardened image build reached image export but failed while Docker Desktop
unpacked a layer:

```text
failed to extract layer sha256:ca55756c9bbc30f862c3a21958e823c8165138b638c257bccae2911a1df670bd:
error reading from server: EOF
```

The same workstation then reported `ENOSPC: no space left on device` from the
Next cache, with 0 GB free on `C:`. Docker CLI health commands also stopped
returning until interrupted. This is classified as a local Docker
daemon/storage blocker; do not cut over a host from this workstation until
disk space and Docker daemon health are restored. No cache, image, database
row, or running worker was deleted or restarted automatically.

## External database health and alerts

Run a separate read-only monitor with the intended hosted Supabase URL and a
server-side key stored by the monitor's secret manager. It must alert when any
of the following is true for `show_key = 'main'`:

- `last_heartbeat_at` is stale beyond the monitor's documented threshold;
- `lease_expires_at` is in the past while the show is not intentionally stopped;
- the show is `casting` or `live` but the current episode/phase deadline is
  stuck beyond its allowed grace period;
- the runner container is unhealthy, restarting repeatedly, or absent;
- the database check cannot reach the intended Supabase project.

The deployed health-check lane is the preferred implementation. A SQL-capable
read-only monitor can inspect the following fields without mutating them:

```sql
select
  show_key,
  status,
  worker_id,
  last_heartbeat_at,
  lease_expires_at,
  current_episode_id,
  current_phase,
  current_phase_ends_at,
  now() - last_heartbeat_at as heartbeat_age,
  lease_expires_at - now() as lease_remaining
from public.movie_buff_live_shows
where show_key = 'main';
```

The monitor must identify the project explicitly, keep its output redacted, and
exit nonzero on an unhealthy result. It must not acquire the lease, advance the
show, join the queue, or change any row. A local process healthcheck and a
database heartbeat/lease healthcheck are separate signals and both are needed.

## Upgrade procedure

Use an immutable Git SHA or image digest for each rollout. Do not update the
running service from an unreviewed working tree.

```bash
cd /opt/movie-buff-live
git fetch --prune origin
git checkout <reviewed-commit-sha>

docker compose \
  --env-file /etc/movie-buff/movie-buff-live.env \
  -f docker-compose.movie-buff-live.yml \
  config --quiet
docker compose \
  --env-file /etc/movie-buff/movie-buff-live.env \
  -f docker-compose.movie-buff-live.yml \
  build --pull movie-buff-live-runner
docker compose \
  --env-file /etc/movie-buff/movie-buff-live.env \
  -f docker-compose.movie-buff-live.yml \
  up -d --no-deps movie-buff-live-runner
docker compose \
  --env-file /etc/movie-buff/movie-buff-live.env \
  -f docker-compose.movie-buff-live.yml \
  ps
```

After the restart, verify the local healthcheck, structured `runner_started`
and `show_tick` logs, a fresh database heartbeat, and the absence of repeated
`show_tick_failed` events. A container-only upgrade does not apply Supabase
migrations. Any schema or function change requires its own reviewed migration,
backup/restore plan, independent validation, and production authorization.

## Backup and rollback

The runner container has no persistent writable volume. The authoritative show,
queue, episode, match, and lease data live in Supabase. Before any database
schema change, use the project's approved Supabase backup/PITR process and
record the backup or recovery point. Do not treat Docker image retention as a
database backup.

For a bad container release:

1. Keep the database untouched and capture redacted container/health output.
2. Check out the last known-good Git SHA or restore its immutable image.
3. Re-run `docker compose config --quiet`, then `build`/`up -d` with the same
   protected env file.
4. Verify the replacement worker's fresh heartbeat and lease through the
   external monitor.
5. If the process must be stopped, use `stop -t 30`; allow the lease to expire.

Do not use `docker compose down -v`, `docker system prune`, direct SQL updates,
or ad hoc deletion of live-show rows as a rollback mechanism.

## Verification checklist

Record the following evidence for each host or release:

- host identity, OS/architecture, Docker Engine and Compose versions;
- reviewed Git SHA or image digest;
- protected env-file path and permissions, never its contents;
- `docker compose config --quiet` success;
- image build success;
- container status, health status, restart policy, and resource limits;
- no published ports and host firewall posture;
- clean `SIGTERM` shutdown and restart-on-boot/failure observation;
- fresh external database heartbeat and unexpired lease on the intended host;
- alert test for stale heartbeat, failed/expired lease, and stuck episode;
- rollback result or a recorded rollback rehearsal.

The durable-host objective is UNKNOWN until a real replacement host produces a
fresh lease/heartbeat and survives the monitoring and restart checks. This lane
only prepares and validates the artifacts needed for that cutover.
