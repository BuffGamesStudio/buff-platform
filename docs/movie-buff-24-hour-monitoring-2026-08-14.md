# Movie Buff 24-hour production monitoring report

## Monitoring window

- Start: `2026-08-14T02:41:15.462Z` (UTC)
- End: `2026-08-15T02:41:15.462Z` (UTC)
- Finalized: `2026-08-16T03:21:03Z` (UTC)
- Mode: read-only

## Targets

- Hosted app: <https://movie-buff-sigma.vercel.app>
- Vercel project: `prj_u2IlNNHUvEhnAytuuymv9GdN7hJY`
- Vercel team: `team_B5DU86UM8Cb77BUCK3rbijw6`
- Supabase project: `yfatwreicmiocdxzyznd`

## Vercel result

- The 24-hour runtime-error aggregation returned **no runtime errors**.
- The grouped production runtime-log query for `error` and `fatal` levels
  returned no rows.
- The ungrouped log query timed out while paging; it was not treated as an
  error because the grouped error/fatal query completed with zero rows.

## Supabase result

- Project status: **`ACTIVE_HEALTHY`**.
- Security advisor snapshot: **26 WARN** notices, all
  `authenticated_security_definer_function_executable`.
- Performance advisor snapshot: **105 notices** — 29 WARN and 76 INFO:
  50 unindexed foreign keys, 9 auth RLS init-plan notices, 25 unused-index
  notices, 20 multiple-permissive-policy notices, and 1 absolute Auth
  connection-allocation notice.
- No advisor setting or database mutation was performed during monitoring.
- Relative to the dated 2026-08-13 baseline of 57 security and 108 performance
  notices, the final counts did not increase. The advisor API does not expose
  notice timestamps, so this is a count-based comparison rather than a
  per-cache-key event timeline.

## Human-test room verification

Room `a11a5368-0d82-40a2-85c2-f8e64e36db14` was read directly from production:

- Room code: `782JRU`
- Room status: `cancelled`
- Total member records: `2`
- Active players (`left_at is null`): **`0`**
- Both member records have non-null `left_at` timestamps.

Smoke accounts remain retained. No deletion policy was supplied or applied.

## Signed deployment pin

The final read-only Vercel deployment check confirms that production remains
pinned to the signed candidate:

- Deployment: `dpl_2HGWmvGoZ53DdfL1kSa2X91QcuvU`
- State/target: `READY` / `production`
- Git SHA: `9077a7f1cb40f5a4d47ab8a742e205c56248aaa3`
- Production aliases include `movie-buff-sigma.vercel.app`.
- Alias error: none.

The local human-signoff documentation commit and this monitoring report were
not pushed. Therefore no new Vercel deployment was created and the signed
production candidate remains unchanged. Any future push would create a new
candidate and require rebinding and rerunning the HAT before acceptance.
