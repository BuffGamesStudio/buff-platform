# Movie Buff Live next steps — 2026-08-22

## Current verified state

- Railway `patient-prosperity` / `production` / `buff-platform` is now the
  active managed runner host. A production read-only query at
  `2026-08-22 21:58:40 UTC` observed `main` in
  `waiting_for_contestants`, with worker
  `movie-buff-live-39cdc3a3be39-1`, a fresh heartbeat, an unexpired lease, and
  no recorded error. This proves the current Railway runner is operating; it
  does not by itself prove host-level restart recovery or alert delivery.
- A read-only Railway UI inspection at approximately `2026-08-22 22:34 EDT`
  showed `buff-platform` Online, its latest deployment successful, and fresh
  `show_tick` logs in `waiting_for_contestants`. Railway reports 19 service
  variables. The four new bridge controls are not present yet:
  `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_ENABLED`,
  `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED`,
  `MOVIE_BUFF_LIVEKIT_CONTROL_ROOM`, and `LIVEKIT_AGENT_NAME`. Secret values
  remained masked and were not opened, so their correctness is unverified.
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
- TypeScript, targeted ESLint, Node syntax checks, Compose validation, provider
  preflight, and the production build pass. The production build was verified
  with `NODE_OPTIONS=--max-old-space-size=4096 npm run build -- --webpack`
  after enabling Next's `experimental.cpus: 1` and
  `experimental.webpackMemoryOptimizations: true` settings. The default build
  remains unsuitable for this workstation's available heap; the successful
  bounded build generated all 14 static pages and finalized build traces.
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

1. Authorize pushing the reviewed broadcast commits and redeploying Railway.
   The provider bridge itself is already deployed and synchronized; the new
   composition/media and host-context code is still local on the reviewed
   branch. Add any new non-secret broadcast flags only after confirming the
   existing protected values remain in Railway.
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
   ingest/egress or encoder connection. After deployment, configure the
   LiveKit HTTP tool for `/api/movie-buff/live/host-context?showKey=main` and
   deploy the agent so Cinephile Cinematic can consume the synchronized state.
7. The guarded authenticated gameplay smoke with dedicated temporary accounts
   was completed on 2026-08-23 and cleaned up with zero residual test rows or
   users. Repeat it only when a future production change requires it.
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

## Continuation evidence — 2026-08-22 23:15 EDT

- The reviewed Movie Buff Live branch was pushed to `main` through commit
  `4f0a285` (`fix(movie-buff): grant live show view to provider runner`).
- Railway `patient-prosperity` / `production` / `buff-platform` automatically
  deployed that commit successfully and reports the service `Online`.
- The provider bridge is enabled with `MOVIE_BUFF_LIVE_PROVIDER_BRIDGE_REQUIRED=false`.
  The runner owns a current lease and continues to emit `show_tick`, but every
  bridge attempt currently fails with `permission denied for function
  get_movie_buff_live_show_view`; `providerSync` remains null.
- The repository contains the narrowly scoped migration
  `20260823031439_movie_buff_live_show_view_service_role_grant.sql`. The
  production migration list currently ends at `20260822075207`; this grant has
  not been applied. Applying it is a separate production database authorization
  gate and does not require changing or exposing any secret.
- A fresh advisor read reports 34 security notices (31 WARN, 3 INFO) and 42
  performance notices (all INFO). These remain a separate cleanup track.
- The provider bridge remains control-plane only. A board renderer/encoder or
  LiveKit egress to the Mux RTMPS ingest is still required before a 24/7 video
  broadcast can be claimed as proven.

## Continuation evidence — 2026-08-22 23:47 EDT

- The authorized grant was applied to production project
  `yfatwreicmiocdxzyznd` and recorded remotely as migration
  `20260823034512_movie_buff_live_show_view_service_role_grant`.
- A privilege verification query returned
  `service_role_can_execute=true` for
  `public.get_movie_buff_live_show_view(text)`. The local migration filename
  is aligned with that remote migration ID.
- Railway logs now show `providerSync.status: synced` for room
  `movie-buff-main` and agent `assistant-231b`; the dispatch already existed.
- A fresh read-only show query observed `main` in
  `waiting_for_contestants`, with a current heartbeat, an unexpired lease, and
  `last_error = null`.
- Post-migration advisor counts remain 34 security notices (31 WARN, 3 INFO)
  and 42 performance notices (all INFO). No new advisor class appeared from
  this grant.
- Remaining release gates are unchanged: configure and test the scheduled
  health-alert secrets, run the separately authorized authenticated production
  smoke, and connect a real board renderer/encoder or LiveKit egress to Mux.

## Continuation evidence — 2026-08-23

- The guarded authenticated production smoke was authorized and completed with
  three temporary contestants. The show advanced from `round_intro` to
  `vip_lock`, and cleanup verified zero queue rows, episode rows, match rows,
  or temporary users remaining. The public show returned to
  `waiting_for_contestants`.
- The local branch contains commit `b61794f` (`feat(movie-buff): add broadcast
  composition and guarded egress`). It adds the public composition, a
  server-resolved current-clip projection, the secret-free LiveKit host-context
  endpoint, and a fail-closed Web Egress controller. The commit is not pushed
  to `main` or deployed.
- Read-only provider verification still observes Railway `Online`, Mux stream
  `8S5401...` `idle` with no ingest, and LiveKit Agent Builder `Actions` with
  no HTTP, client, or MCP tools configured. Therefore the 24/7 video feed and
  speaking AI host remain unproven until the reviewed commit is deployed and
  the provider-side wiring is explicitly authorized and configured.
- The local branch now also contains a fail-closed egress supervisor. It is
  wired into the durable runner but remains disabled unless the supervisor,
  egress-inspection, and egress-apply flags are all explicitly enabled. This
  removes the one-shot-controller gap without starting a Mux feed during build
  or deployment.

## Continuation evidence — 2026-08-23

- The authorized guarded production smoke ran against Supabase project
  `yfatwreicmiocdxzyznd` with three temporary accounts. It queued positions
  `1,2,3`, cast episode `1`, advanced `round_intro` to `vip_lock`, and verified
  zero queue rows, episode rows, match rows, and temporary users after cleanup.
- A post-smoke health check returned `healthy` with `main` back in
  `waiting_for_contestants`, episode `0`, a fresh heartbeat, an unexpired lease,
  and no findings. Alert delivery remains unconfigured.
- The repository env files target a different Supabase project, so the smoke
  was run only after the target was explicitly resolved through the authenticated
  Supabase CLI; the initial mismatch was blocked before any mutation.
