# Movie Buff global pool pre-build review

Date: July 30, 2026

Scope

- Add a library-wide ready pool above the existing per-round generator.
- Keep clips split across Rookie, Buff, and Buffster.
- Respect quality, rotation, and status gating.
- Preserve on-demand generation as fallback so gameplay does not fail when the pool is empty.
- Re-check round timer authority so the play screen does not drift from server state.
- Define how newly discovered approved-source movies should enter the pool system safely over time.

Goal

- Reduce first-play clip latency.
- Avoid repeating the same movie or clip too often.
- Keep low-quality or cooled-down clips from filling the warm pool.
- Make warm-pool behavior observable and manually triggerable from admin.
- Feed newly approved movies into the reserve side of the pool architecture instead of directly into live gameplay.

Dependencies and exact versions

- Next.js 16.2.11
- React 19.2.4
- Supabase JS 2.110.8
- TypeScript 5.x
- ffmpeg / ffprobe available on the host path

Official docs and known issue review

- Next.js app-router/server action behavior matters because the admin trigger is a server action.
- Supabase RPC and service-role table access matter because analytics and clip metadata are sourced from content and analytics tables.
- ffmpeg / ffprobe process availability matters because pooled assets are generated locally.
- Known operational issue already seen in this repo: dynamic filesystem work in `movieClipper.ts` causes a Turbopack NFT tracing warning during production build. This is a warning, not a build failure, but it remains a release consideration.

Likely failure modes reviewed

1. Pool warm pass starves one difficulty bucket and over-fills another.
2. Warm pass repeatedly fills the same movie or clip, reducing variety.
3. Low-quality clips enter the ready pool and get served quickly.
4. Pool-warm work blocks round delivery or makes gameplay depend on background success.
5. Multiple warm passes race and generate duplicate or excessive assets.
6. Client timer drifts from the server timer and players see a misleading countdown.
7. Admin override bypasses safety gating and keeps broken clips live.
8. Newly discovered source content enters the live pool without proper validation or duplicate checks.

Architecture choice

- Chosen:
  - keep weighted round selection and analytics in Supabase
  - keep clip rendering local in `movieClipper.ts`
  - add a second warm-pool layer in the same server module
  - expose warm/inspect behavior through admin server actions
  - route newly approved discovered movies into the secondary reserve pool first

Why this architecture

- It reuses the current clip generation path instead of introducing a separate pipeline.
- It keeps fallback behavior simple: if the pool misses, round delivery still generates on demand.
- It keeps analytics as the source of truth for quality and rotation gating.
- It minimizes new moving parts while giving admin a direct operational control.

Rejected alternatives

1. Generate every clip only on demand
   - Rejected because first-play latency remains too high and repeated requests do unnecessary work.

2. Pre-generate every possible clip variant permanently
   - Rejected because it increases storage and maintenance cost and weakens freshness/diversity.

3. Add a separate worker service before proving the global pool in-process
   - Rejected because it adds deployment and coordination complexity before the selection and refill logic is validated.

4. Let admin boost override quality/cooldown gating completely
   - Rejected because it defeats the safety model in the stated requirements.

5. Push newly discovered movies directly into the primary pool
   - Rejected because new content should pass intake validation and reserve-pool entry before it can become live-ready.

Riskiest assumption and proof

Assumption:

- The repo can support a library-wide warm pool in the existing `movieClipper.ts` path without breaking round delivery.

Proof completed:

- Implemented the warm-pool pass in the existing server clipper module.
- Kept per-round fallback generation unchanged.
- Added an admin-triggerable warm action and status view.
- Verified lint passes.
- Verified `npm run build` passes on July 30, 2026.

State and data handling

- Source of truth for eligibility:
  - `content_media`
  - `content_items`
  - `movie_buff_clip_analytics`
  - future approved-source registry and ingest-validation state for discovery

- Pool eligibility gates:
  - active, non-hidden media
  - legacy clip linked
  - video media
  - status not `retired`, `test_only`, or `cooling_down`
  - quality score >= 45
  - rotation weight > 0

- Diversity limits:
  - max ready assets per clip
  - max ready assets per movie

- Refill controls:
  - minimum/target ready assets per label
  - capped assets generated per run
  - cooldown file to prevent constant reruns
  - named lock to prevent parallel warm-pass races

- Fallback:
  - if no pooled asset exists, generate on demand and seed the pool afterward

- Future discovery integration:
  - approved-source watcher discovers candidates
  - validation and ingest queue approve or reject them
  - newly approved titles feed the secondary pool first
  - promotion into the primary pool follows the normal two-tier rules

Build order used

1. Verify current round timer behavior in the play UI.
2. Inspect existing pooled-asset layer.
3. Add global pool candidate discovery and gating.
4. Add inventory counting and diversity protection.
5. Add warm-pass locking and cooldown state.
6. Wire warm-pass queueing into round delivery.
7. Add admin warm/status surface.
8. Re-run lint and production build.
9. Extend the architecture plan so approved-source discovery feeds secondary reserve first, not direct live play.

UX paths and edge states checked

- Round path:
  - pooled clip available -> serve immediately -> queue refill
  - no pooled clip available -> generate on demand -> queue refill

- Admin path:
  - admin opens Rotation Control
  - admin sees current ready-pool snapshot
  - admin manually triggers a warm pass

- Discovery path:
  - approved source checker finds new movie
  - intake validation accepts or rejects it
  - accepted title becomes secondary-pool eligible before primary promotion

- Timer path:
  - play page uses server-backed `timeLeftSeconds`
  - no separate client countdown should lead the server timer

Test plan

- Static verification
  - eslint on updated server/admin/play files
  - production build

- Functional verification
  - open admin rotation page and confirm pool counts render
  - trigger warm pool manually
  - confirm ready asset counts increase when eligible clips exist
  - start repeated rounds and confirm pooled variants are consumed first
  - confirm on-demand generation still works when a bucket is empty
  - confirm pre-play countdown matches the authoritative server timer

- Failure testing
  - mark a clip `cooling_down` or `retired` and confirm it no longer contributes to the warm pool
  - lower quality or rotation gating and confirm the clip stops warming
  - verify admin boost alone does not bypass gating
  - verify new approved-source content enters secondary reserve only after validation and does not jump straight into primary

Release risk and readiness

- Current state is technically stronger than before because the pool is no longer per-clip-only.
- Remaining release risk is operational, not compile-time:
  - real library coverage and eligible clip volume still need live verification
  - the Turbopack tracing warning from dynamic filesystem behavior remains a known packaging warning
  - server-side round timing should still be exercised in live browser flow to confirm no early timeout remains
  - approved-source ingestion still needs its own implementation and validation path before discovery can be treated as production-ready

Current conclusion

- The global ready-pool layer is implemented and build-verified.
- The broader unified analytics/scoring/rotation objective is not fully complete yet because live flow verification and remaining product-level readiness checks still need to be finished.
