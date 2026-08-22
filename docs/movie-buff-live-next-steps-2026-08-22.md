# Movie Buff Live next steps — 2026-08-22

## Current verified state

- Docker Desktop is running with Docker client/server `29.6.2`.
- Docker Desktop is configured to start when the user signs in; the setting is
  enabled in Docker Desktop General settings. This improves workstation
  recovery but is not a substitute for a durable host.
- The hardened runner image builds successfully and is configured for UID/GID
  `10001:10001`, a read-only filesystem, dropped capabilities, bounded
  resources, and a local process healthcheck.
- The existing workstation runner remains active with `restart: unless-stopped`.
  It is still using the prior image; the rebuilt image has not been cut over.
- The production read-only health check passed at
  `2026-08-22T18:30:19.090Z` for project
  `yfatwreicmiocdxzyznd`: heartbeat age `0` seconds, current lease, and no
  findings.
- TypeScript, targeted ESLint, the production build, Node syntax checks,
  Compose validation, and the health-workflow YAML parse all pass. The build
  retains the existing NFT-tracing warning from `next.config.ts`.
- The GitHub Actions health workflow is present at
  `.github/workflows/movie-buff-live-health.yml`, but it cannot run until the
  required repository secrets are configured.

## Next actions requiring an operator or production authorization

1. Provision a durable Linux/Docker host and copy the exact reviewed candidate
   there. Inject a protected env file containing the production Supabase URL
   and server secret; never commit or print the secret.
2. Run Compose `config --quiet`, build the image, start the replacement runner,
   and verify its local healthcheck plus the external Movie Buff health check.
3. After the replacement owns the production lease, gracefully stop the
   workstation runner. Do not clear leases or delete database rows manually.
4. Configure the GitHub secrets used by the scheduled health workflow:
   `MOVIE_BUFF_SUPABASE_URL`, `MOVIE_BUFF_SUPABASE_SECRET_KEY`, and optionally
   `MOVIE_BUFF_LIVE_ALERT_WEBHOOK_URL`. Dispatch it once and confirm an alert
   is delivered for a controlled test incident without exposing credentials.
5. Select and provision the broadcast transport, then connect its episode
   lifecycle to the cue-only Cinephile Cinematic/Buster projection. This still
   needs the streaming account, transport credentials, and AI voice/model
   decision.
6. Treat Supabase Advisor cleanup as a separate reviewed change. Capture the
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
