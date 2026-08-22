# Movie Buff production live smoke

`scripts/movie-buff-live-production-smoke.mjs` is the guarded acceptance
journey for the live contestant queue. It mutates production only when all
explicit target and opt-in checks pass, creates exactly three ephemeral users,
and removes the users and live-show rows it created in `finally`.

## Guardrails

- `MOVIE_BUFF_LIVE_SMOKE_ENABLED=true` is required.
- `MOVIE_BUFF_LIVE_EXPECTED_SUPABASE_REF` is required and must equal
  `yfatwreicmiocdxzyznd`.
- `NEXT_PUBLIC_SUPABASE_URL` must be exactly the expected hosted Supabase
  project. The script refuses the stale `eiamucxbestinitydkvu` env files in the
  repository.
- A publishable key and server-side secret key are required; neither is
  printed.
- The script stops before creating accounts if the main show is not waiting for
  contestants, has a current episode, or has unrelated queued/on-stage/
  cooldown contestants.
- It never manually acquires the worker lease or advances the show with a
  service-role tick. The current durable worker must cast the three accounts.

## Execution

Provide the correct target values through the host environment or a protected,
non-committed env file. Do not use the repository `.env.production` without
verifying its project reference; the checked-in workstation file currently
points at a different Supabase project.

```powershell
$env:MOVIE_BUFF_LIVE_SMOKE_ENABLED = "true"
$env:MOVIE_BUFF_LIVE_EXPECTED_SUPABASE_REF = "yfatwreicmiocdxzyznd"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://yfatwreicmiocdxzyznd.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "<publishable-key>"
$env:SUPABASE_SECRET_KEY = "<server-secret>"
node scripts/movie-buff-live-production-smoke.mjs
```

The successful JSON result includes queue positions, the episode/room/match
creation flags, and the phase before/after an authoritative advance. It does
not include account emails, passwords, access tokens, or full URLs.

## Cleanup acceptance

The `finally` path deletes only the smoke users, their queue rows, the exact
episode, match, and room created by the run. It resets the singleton show to
its pre-smoke episode number and waiting state while preserving the worker's
observed lease/heartbeat values, then verifies no smoke queue, episode, match,
or user residue remains. Any cleanup error is a failure and requires read-only
investigation before another run.

## Repaired failure fingerprint

The first production attempt exposed a harness defect rather than a runner
defect: the public `get_movie_buff_live_show_view` result returned `matchId`
but not the private `episodeId`, so the harness incorrectly treated the new
episode as uncreated and could not clean it by ID. The exact smoke episode and
match were subsequently identified and removed with a read-only check before
the next attempt.

The repair resolves the authoritative episode through the returned match ID,
requires the private row to match the public episode number and `live` status,
and, during cleanup, re-resolves the episode if an assertion fails after the
runner has created it. Cleanup now also deletes and verifies the exact match.
This is a local schema/contract mismatch; no public Supabase defect matched
the fingerprint. The official RPC contract confirms that the client receives
the Postgres function result in `data`:
<https://supabase.com/docs/reference/javascript/rpc>.
