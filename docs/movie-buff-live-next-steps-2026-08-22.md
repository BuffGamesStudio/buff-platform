# Movie Buff Live next steps — 2026-08-22

## Current verified state

- Railway `patient-prosperity` / `production` / `buff-platform` is now the
  active managed runner host. A production read-only query at
  `2026-08-22 21:58:40 UTC` observed `main` in
  `waiting_for_contestants`, with worker
  `movie-buff-live-39cdc3a3be39-1`, a fresh heartbeat, an unexpired lease, and
  no recorded error. This proves the current Railway runner is operating; it
  does not by itself prove host-level restart recovery or alert delivery.
- Docker Desktop is running with Docker client/server `29.6.2`.
- Docker Desktop is configured to start when the user signs in; the setting is
  enabled in Docker Desktop General settings. This improves workstation
  recovery but is not a substitute for a durable host.
- The hardened runner is configured for UID/GID `10001:10001`, a read-only
  filesystem, dropped capabilities, bounded resources, and a local process
  healthcheck. A current workstation image build is not verified: Docker
  previously failed during layer unpack after reaching image export, and the
  workstation also reported `ENOSPC`.
- The existing workstation runner remains active with `restart: unless-stopped`.
  It is still using the prior image; the rebuilt image has not been cut over.
- The production read-only health check passed at
  `2026-08-22T18:30:19.090Z` for project
  `yfatwreicmiocdxzyznd`: heartbeat age `0` seconds, current lease, and no
  findings.
- TypeScript, targeted ESLint, Node syntax checks, Compose validation, and the
  provider preflight pass. The post-bridge production build is UNKNOWN: the
  default build hit a local Node out-of-memory failure during its TypeScript
  phase, and a memory-expanded Webpack run was interrupted before returning a
  result. The existing NFT-tracing warning from `next.config.ts` remains.
- The local reviewed branch contains unpushed commits beyond its tracked origin
  branch, including the LiveKit provider bridge and Docker Compose wiring. No
  commit has been pushed or deployed from this branch.
- LiveKit Cloud has the `assistant-231b` agent deployed and running in
  `us-east`, but it had zero concurrent sessions at inspection time. The Mux
  Production live-stream resource exists but is `Idle` with zero live
  minutes, and no LiveKit egress is active. The AI-host control plane is
  therefore configured but the broadcast ingest/egress path is not proven.
- The GitHub Actions health workflow is present at
  `.github/workflows/movie-buff-live-health.yml`, but it cannot run until the
  required repository secrets are configured.

## Next actions requiring an operator or production authorization

1. Authorize pushing the reviewed branch and redeploying Railway with the
   provider bridge. Add the non-secret `LIVEKIT_AGENT_NAME=assistant-231b` and
   bridge flags only after confirming the existing protected values remain in
   Railway.
2. Provision a durable Linux/Docker host and copy the exact reviewed candidate
   there. Inject a protected env file containing the production Supabase URL,
   server secret, and (when enabling the bridge) the LiveKit values; never
   commit or print secrets.
3. Run Compose `config --quiet`, build the image, start the replacement runner,
   and verify its local healthcheck plus the external Movie Buff health check.
4. After the replacement owns the production lease, gracefully stop the
   workstation runner. Do not clear leases or delete database rows manually.
5. Configure the GitHub secrets used by the scheduled health workflow:
   `MOVIE_BUFF_SUPABASE_URL`, `MOVIE_BUFF_SUPABASE_SECRET_KEY`, and optionally
   `MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL`. Dispatch it once and confirm an alert
   is delivered for a controlled test incident without exposing credentials.
6. Connect a real broadcast path: the Mux stream still needs an authorized
   ingest/egress or encoder connection, and the LiveKit agent must consume the
   synchronized room metadata before a 24/7 show is proven.
7. Run the guarded authenticated gameplay smoke with dedicated test accounts;
   it mutates production data and has not been run.
8. Treat Supabase Advisor cleanup as a separate reviewed change. Capture the
   production catalog and usage baselines before authoring any RLS, function,
   grant, or index migration.

## Local-only notes

- `.env.local` points at a different hosted Supabase project, so it must not be
  used to start or cut over the Movie Buff runner. Local health checks should
  use values from `supabase status -o env` instead.
- The local Supabase Vector container repeatedly restarts because its generated
  configuration points at `http://host.docker.internal:2375`. Do not enable
  unauthenticated Docker TCP exposure merely to quiet this optional local
  analytics service; investigate a socket/configuration fix separately.
- No production SQL, migration, deployment, secret change, or runner cutover
  was performed by this validation pass.
