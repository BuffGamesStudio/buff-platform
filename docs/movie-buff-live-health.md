# Movie Buff Live health check

`scripts/movie-buff-live-health-check.mjs` is a read-only, fail-closed health
check for the durable Movie Buff show runner. It reads only:

- `public.movie_buff_live_shows`
- `public.movie_buff_live_show_episodes`

The table and column names come from
`supabase/migrations/20260822072017_movie_buff_live_show_runner.sql`. The check
does not call the public view, inspect queue rows, advance the show, or mutate
any data.

## What it detects

The check expects a worker to be active while the show is in one of the
schema-defined runner statuses `waiting_for_contestants`, `casting`, `live`, or
`cooldown`. An active episode (`casting` or `live`) also makes the worker
expected to be active.

It reports JSON findings and exits nonzero for an unhealthy or blocked result:

- `heartbeat_stale_or_missing`: `last_heartbeat_at` is absent, invalid, or
  older than the configured threshold while the worker is expected to run.
- `lease_expired_or_missing`: `worker_id` or `lease_expires_at` is absent, or
  the lease has expired while the worker or an active episode is expected.
- `stuck_casting_episode`: the current `casting` episode is older than the
  casting threshold, measured from its schema-defined `created_at`.
- `stuck_live_episode`: the current `live` episode is older than the live
  threshold, measured from its schema-defined `started_at`.

It also fails closed for a missing show, a missing current episode, a terminal
episode still referenced as current, invalid timestamps, configuration errors,
or a failed read-only query. A failed optional alert webhook is included in the
JSON result and never masks the health result.

Each finding has a deterministic `alertKey` based on the show key, finding code,
and episode id when applicable. The key contains no timestamp or credential, so
an external alert system can deduplicate a continuing incident.

## Required environment

```powershell
$env:MOVIE_BUFF_LIVE_HEALTH_ENABLED = "true"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "<service-role-secret>"
# SUPABASE_SERVICE_ROLE_KEY is accepted instead of SUPABASE_SECRET_KEY.
$env:MOVIE_BUFF_EXPECTED_SUPABASE_REF = "<project-ref>"
```

The opt-in flag is mandatory. The service key is used only by this process and
is never printed. For hosted Supabase URLs, the expected project reference is
also mandatory and must match the URL host. Local URLs such as
`http://127.0.0.1:55321` do not require the reference, which makes local
verification possible without weakening the hosted-target guard.

Optional environment:

```powershell
$env:MOVIE_BUFF_LIVE_SHOW_KEY = "main"
$env:MOVIE_BUFF_LIVE_HEARTBEAT_MAX_AGE_SECONDS = "30"
$env:MOVIE_BUFF_LIVE_LEASE_GRACE_SECONDS = "0"
$env:MOVIE_BUFF_LIVE_STUCK_CASTING_MINUTES = "5"
$env:MOVIE_BUFF_LIVE_STUCK_LIVE_MINUTES = "30"
$env:MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL = "https://<alert-endpoint>"
```

The defaults reflect the current runner contract: the worker refreshes a
15-second database lease on a roughly one-second poll, so 30 seconds allows a
short scheduling or network interruption without hiding a stopped worker. The
casting and live thresholds are operational guardrails, not gameplay limits;
change them only with evidence from the deployed phase timeline.

## Safe usage

The check is intentionally not a package script and does not load `.env.local`.
Set environment variables explicitly for the target process, then run:

```powershell
node scripts/movie-buff-live-health-check.mjs
```

For a safe fail-closed configuration test, run it without any of the required
variables:

```powershell
Remove-Item Env:MOVIE_BUFF_LIVE_HEALTH_ENABLED -ErrorAction SilentlyContinue
Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
node scripts/movie-buff-live-health-check.mjs
if ($LASTEXITCODE -eq 0) { throw "Health check did not fail closed." }
```

For a hosted job, inject the URL, service key, expected project reference, and
optional webhook through the host's secret manager. Do not put them in source
control, command history, screenshots, or alert text. The output reports only
the Supabase hostname and expected project reference; it does not print the
full URL or credentials.

## Limitations

- Age calculations use the health-check process clock because the read-only
  table contract does not expose a server-clock RPC. Keep the host clock
  synchronized and treat large clock skew as an operational UNKNOWN.
- The check verifies the runner lease and episode lifecycle metadata; it does
  not prove that a browser, stream encoder, media clip, or AI host is healthy.
- A webhook is best-effort. HTTP errors, invalid webhook configuration, and
  timeouts appear in `alert` while the process still exits according to the
  underlying health result.
- `paused` and `error` show statuses are not treated as worker-expected-active
  states. They remain visible in the JSON `show` object and require separate
  operational handling if they are not intentional.
