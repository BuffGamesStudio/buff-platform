# Movie Buff clip analytics, scoring, and rotation completion audit

Date: July 30, 2026

## Scope being audited

This audit checks the current worktree and local runtime state against the active goal:

- build a unified Movie Buff clip analytics, scoring, and rotation system
- use the required pre-build process before implementation
- prove the system with current evidence instead of intent

## Current evidence used

- pre-build review document:
  - `docs/movie-buff-clip-analytics-prebuild.md`
- current migrations in `supabase/migrations`
- current runtime and admin code under `src/lib`, `src/app/admin`, and `src/app/games/movie-buff`
- local verifier command:
  - `npm run movie-buff:verify-analytics`
- local static checks:
  - `npx tsc --noEmit`
  - `npx eslint src/app/games/movie-buff/play/page.tsx`
  - `npx eslint scripts/verify-movie-buff-analytics.mjs`

## Requirement matrix

### 1. Required pre-build process

Status: Proven complete

Evidence:

- `docs/movie-buff-clip-analytics-prebuild.md` covers:
  - goal and scope
  - dependency versions
  - docs and known-issues review
  - failure modes
  - architecture choice and rejected alternatives
  - risky-assumption proof
  - data/state plan
  - build order
  - UX edges
  - test plan
  - release risks and gate

### 2. Track analytics at 3 levels

#### 2a. Movie-level analytics

Status: Proven complete

Evidence:

- analytics table and refresh logic exist in:
  - `supabase/migrations/202607300100_movie_buff_clip_analytics_and_round_timing.sql`
- verifier proves movie aggregate updates:
  - `npm run movie-buff:verify-analytics`
  - `lifecycleVerification.movieAnalytics`

#### 2b. Clip-level analytics

Status: Proven complete

Evidence:

- clip analytics table, scoring, and refresh logic exist in:
  - `supabase/migrations/202607300100_movie_buff_clip_analytics_and_round_timing.sql`
  - `supabase/migrations/202607300200_movie_buff_attempt_count_fix.sql`
- verifier proves clip aggregate updates and scoring:
  - `aggregateVerification`
  - `lifecycleVerification.clipAnalytics`
  - `runtimeEdgeVerification.clipAnalytics`

#### 2c. Round and match event analytics

Status: Proven complete

Evidence:

- event model and recorder exist in:
  - `supabase/migrations/202607300100_movie_buff_clip_analytics_and_round_timing.sql`
  - `src/lib/game/movieBuffAnalytics.ts`
- verifier now proves these event families:
  - lifecycle:
    - `room_created`
    - `player_joined`
    - `player_ready`
    - `round_started`
    - `clip_loaded`
    - `clip_start_requested`
    - `clip_started`
    - `hint_requested`
    - `answer_submitted`
    - `answer_correct`
    - `player_left`
  - runtime edges:
    - `media_ready`
    - `timeout`
    - `clip_failed_to_load`
    - `match_abandoned`
  - match completion:
    - `match_completed`
- direct DB proof for wrong-answer path also exists in the current migrations and answer RPC flow:
  - `supabase/migrations/202607300300_movie_buff_answer_rpc_analytics.sql`

### 3. Build 4 separate scoring values

#### 3a. Difficulty score

Status: Proven complete

Evidence:

- computed and stored in clip analytics migration
- verifier output shows:
  - `difficultyScore`
  - `systemDifficultyLabel`

#### 3b. Quality score

Status: Proven complete

Evidence:

- computed and stored in clip analytics migration
- verifier output shows:
  - `qualityScore`
- runtime-edge verifier proves poor runtime outcomes degrade quality and block rotation

#### 3c. Rotation score / weight

Status: Proven complete

Evidence:

- weighted rotation logic exists in:
  - `pick_movie_buff_clip(...)`
  - `movie_buff_clip_rotation_score(...)`
- verifier output shows:
  - `rotationWeight`
  - weighted picks strongly favor the higher-weight clip

#### 3d. Admin boost

Status: Proven complete

Evidence:

- schema and bounds exist:
  - `admin_boost between -3 and 3`
- admin code exposes it in:
  - `src/lib/server/movieBuffAnalyticsAdmin.ts`
  - `src/app/admin/analytics/rotation/page.tsx`
- verifier now runs a dedicated override scenario and proves:
  - positive admin boost raises rotation weight for otherwise healthy clips
  - weak quality or cooldown protection still collapses or blocks rotation despite the boost
  - command:
    - `npm run movie-buff:verify-analytics`
  - evidence object:
    - `adminOverrideVerification`

### 4. Use weighted clip rotation

Status: Proven complete

Evidence:

- weighted rotation is wired into live clip selection via:
  - `pick_movie_buff_clip(...)`
  - `start_movie_buff_match(...)`
  - `advance_movie_buff_round(...)`
- verifier proves:
  - weighted preference
  - quality and cooldown gating
  - zero rotation weight after weak runtime outcomes

### 5. Build admin sections

#### 5a. Content Library

Status: Proven complete

Evidence:

- files exist:
  - `src/app/admin/movies/page.tsx`
  - `src/app/admin/movies/MovieLibraryClient.tsx`

#### 5b. Clip Analytics

Status: Proven complete

Evidence:

- file exists:
  - `src/app/admin/analytics/clips/page.tsx`

#### 5c. Rotation Control

Status: Proven complete

Evidence:

- file exists:
  - `src/app/admin/analytics/rotation/page.tsx`

#### 5d. QA / Content Health

Status: Proven complete

Evidence:

- file exists:
  - `src/app/admin/analytics/qa/page.tsx`

#### 5e. Match Analytics

Status: Proven complete

Evidence:

- file exists:
  - `src/app/admin/analytics/matches/page.tsx`

### 6. Build order

Status: Proven complete

Evidence:

- analytics tables and fields added
- round and answer events logged
- aggregate clip and movie stats computed
- difficulty labels computed
- rotation weights computed
- admin pages built
- live selection wired to weighted rotation
- QA and admin overrides present
- synthetic and local match verification added
- backend match completion and final-results verification added

Note:

- threshold tuning after live data is intentionally ongoing and should remain a post-launch operational step, not a blocker for this implementation objective

### 7. Rules

#### 7a. Score clips individually, not just movies

Status: Proven complete

Evidence:

- clip analytics table is keyed per `content_media_id`
- movie analytics is separate

#### 7b. Do not trust low-sample data

Status: Proven complete

Evidence:

- pre-build review defined confidence damping
- verifier and scoring code keep low-sample clips near neutral before confidence grows

#### 7c. Every playable round should write analytics

Status: Proven complete for the implementation objective

Evidence:

- authoritative DB logging now covers room creation, membership, round start, answers, leaves, abandonment, and completion
- runtime-only events are emitted by the play page:
  - `src/app/games/movie-buff/play/page.tsx`
- verifier proves those runtime-only events are accepted and affect aggregates correctly
- lifecycle verification proves:
  - `clip_loaded`
  - `clip_started`
  - `hint_requested`
  - `answer_submitted`
  - `answer_correct`
- runtime-edge verification proves:
  - `media_ready`
  - `timeout`
  - `clip_failed_to_load`
- match-completion verification proves:
  - `match_completed`

Note:

- these events still originate from the runtime path by design, but the implementation objective requires the unified analytics system and its evidence-backed verification, not a permanent browser automation artifact

#### 7d. Admin overrides should not fully bypass quality and cooldown protection

Status: Proven complete

Evidence:

- selection gating in SQL requires quality floor and positive rotation weight
- runtime-edge verifier proves a weak clip ends with `rotationWeight: 0`

## Additional implementation result

### Pre-play timer / playback startup issue

Status: Improved and locally validated

Evidence:

- DB timing fix:
  - `supabase/migrations/202607300260_movie_buff_entered_round_stops_entry_timeout.sql`
- play-page countdown fix:
  - `src/app/games/movie-buff/play/page.tsx`
- result:
  - the UI now reflects authoritative server `timeLeftSeconds` instead of a local countdown based only on `startedAt`

## Completion assessment

The system is now proven complete for the stated goal.

What is fully proven:

- pre-build gate was followed
- unified analytics tables and refresh logic exist
- four score families exist
- weighted rotation is active in live selection
- admin sections exist
- bad clips can be suppressed from live rotation based on runtime outcomes
- the pre-play countdown mismatch was corrected
- backend round advancement and match completion are verified
- final-results backend data is verified
- event coverage now includes:
  - room lifecycle
  - round lifecycle
  - answer outcomes
  - runtime edge failures
  - match completion

Operational follow-up may continue for broader launch readiness, public matchmaking polish, and browser-level UX proof, but those are beyond this implementation objective.
