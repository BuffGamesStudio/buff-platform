# Movie Buff clip analytics, scoring, and rotation pre-build review

Date: July 30, 2026

## Goal

Build one connected Movie Buff system that:

- tracks movie, clip, and round-event analytics
- computes difficulty, quality, rotation, and admin-boost signals
- uses weighted clip rotation instead of pure random selection
- exposes admin-ready library, analytics, QA, and rotation controls
- fixes the current round-start timing issue where the pre-play window can expire before the clip is actually ready or visibly playing
- adds an approved-source ingest watcher pipeline so new eligible movies can be discovered, validated, queued, and fed into Movie Buff safely over time

## Confirmed dependency versions

Verified from the installed workspace:

- Next.js 16.2.11
- React 19.2.4
- React DOM 19.2.4
- @supabase/supabase-js 2.110.8

## Official docs and issue review completed

Reviewed before implementation:

- Next.js App Router loading UI guidance
- Supabase database functions
- Supabase triggers
- Supabase realtime guidance, including Broadcast vs Postgres Changes
- PostgreSQL trigger behavior and aggregation options
- MDN media playback readiness and playback events
- existing known issue reports around Next route loading timing and Supabase realtime behavior

## Current architecture facts

- Live gameplay state is DB-driven through Supabase RPC functions.
- Public/admin movie content already lives in `content_items` and `content_media`.
- Live round selection still resolves through legacy `movies` and `clips`.
- `content_media.legacy_clip_id` is the bridge between admin content and playable round clips.
- Generated round playback is served through `/api/movie-buff/round-media/[roundId]`.

## Confirmed current failure modes

### 1. Pre-play timer starts too early

The current round-enter flow inserts `match_round_player_playback.started_at = now()` as soon as the player enters the round. That starts the 30-second pre-play window before the media is ready.

### 2. Playback start is acknowledged too late

The client currently waits for `media.play()` to resolve before calling the RPC that marks round playback as started. If buffering or startup is slow, the round can expire before the server receives the playback-start update.

### 3. Round-media requests still do unnecessary startup work

Even when a generated round clip already exists on disk, the clip route still resolves the master source and runs `ffprobe` before replying. That adds avoidable latency to clip startup.

### 4. Low-sample clips can be mislabeled if scoring is too aggressive

Clip difficulty cannot rely on raw accuracy alone. A 1-play clip must stay near neutral until there is enough evidence.

### 5. Pure random clip rotation will not scale

Random selection cannot protect against repeats, weak clips, stale clips, or recently failed clips.

## Chosen architecture

Use a DB-centered analytics system with:

1. an append-only Movie Buff event log
2. per-clip aggregate analytics
3. per-movie aggregate analytics
4. computed difficulty, quality, and rotation fields stored for fast reads
5. weighted clip selection inside the existing SQL clip-picker path
6. client/runtime playback events only for facts the database cannot infer by itself, such as media-ready, clip-loaded, and clip-failed-to-load
7. an approved-source ingest pipeline that discovers candidate movies, validates them, and only then feeds them into content and pool eligibility

## Rejected alternatives

### Alternative A: client-only analytics

Rejected because it is not authoritative, can miss events, and cannot safely drive shared admin rotation or quality controls.

### Alternative B: materialized-view-only analytics

Rejected because live clip selection and QA state need fresher operational data than periodic materialized view refreshes provide.

### Alternative C: separate external analytics service

Rejected because it adds a second source of truth and unnecessary operational complexity while the game already relies on Supabase/Postgres as the core runtime.

### Alternative D: blind auto-publish from public feeds

Rejected because source metadata can be wrong, duplicate detection is required, and newly discovered movies should enter validation and approval policy before live gameplay.

## Data and state plan

### Authoritative content entities

- `content_items` remains the source of truth for movie metadata
- `content_media` remains the source of truth for clip metadata
- `content_media.legacy_clip_id` remains the bridge into live match rounds

### New analytics entities

- `movie_buff_round_events`
  - append-only log for room, player, round, clip, and answer events
- `movie_buff_clip_analytics`
  - one row per `content_media`
  - stores per-clip counters, scores, status, quality flags, and last-play data
- `movie_buff_movie_analytics`
  - one row per `content_items`
  - stores per-movie totals, playable counts, and last-play data

### Planned ingest-watcher entities

- approved source registry
  - stores source name, source type, base URL or feed identifier, country, language, license rules, polling frequency, trust level, last checked at, last successful ingest at, and active state
- source candidate intake queue
  - stores newly discovered movie candidates before ingest
- ingest validation state
  - stores license checks, media/playability checks, runtime checks, metadata quality checks, duplicate-risk checks, and source-reliability outcomes
- source linkage records
  - preserve which approved source produced or confirmed a given movie/content row

### Live round timing states

The round needs three distinct phases:

1. entered but not media-ready
2. media-ready but playback not started yet
3. playback actually started

The current schema only models phases 2 and 3. The fix will add a distinct media-ready/start-window phase so the 30-second decision window does not burn while the clip is still loading or being generated.

### Planned ingest-watcher flow

1. scheduled checker runs only against approved active sources
2. checker compares source results against already ingested Movie Buff titles
3. unseen items become intake candidates, not live playable content
4. intake validation verifies:
   - license or public-domain status
   - media availability
   - format and playability
   - runtime
   - metadata quality
   - duplicate risk
   - source reliability
5. accepted candidates enter an ingest queue
6. ingest queue creates or updates:
   - movie and content records
   - source linkage
   - clip-generation eligibility state
   - pool-generation candidacy
7. newly approved movies feed the secondary pool first, then reach the primary live-ready pool through normal promotion logic

Rules:

- do not ingest from unapproved sources
- do not trust source metadata blindly
- detect duplicates across title, year, source, runtime, and normalized identifiers where available
- do not let auto-discovery bypass admin review or trusted-source auto-approve rules

## Scoring model chosen for first implementation

### Difficulty score

Range: 0 to 100

- lower = easier
- higher = harder

Inputs:

- correct rate
- hint rate
- average answer time
- confidence damping based on play count

Label mapping:

- Rookie: score below 35
- Buff: 35 to below 60
- Buffster: 60 and above

### Quality score

Range: 0 to 100

Starts at 100 and loses points for:

- title cards
- credits
- giveaway text
- bad audio
- dead air
- obvious character shots
- broken playback

Clips below the minimum quality floor do not stay in live rotation.

### Rotation score and weight

Inputs:

- difficulty fit for the requested lane
- freshness
- quality
- sample confidence
- admin boost
- clip lifecycle status

`rotation_weight` is the operational value used by the picker.

### Admin boost

Manual override from -3 to +3.

It influences rotation but does not bypass low quality or cooldown protections.

## Riskiest assumption and proof

Riskiest assumption:

The scoring model can keep low-sample clips neutral while still clearly separating obvious easy clips from actually hard clips.

Small local proof completed:

- a 1-play lucky clip stayed in neutral `Buff`
- a high-confidence obvious clip mapped to `Rookie`
- a high-confidence hard clip mapped to `Buffster`
- broken-playback quality gating still blocked live rotation
- cooldown still blocked live rotation

## Playback-start fix direction

The round-start fix will follow this sequence:

1. player enters the round
2. media route warms or loads
3. client marks media-ready
4. 30-second start/hint window begins
5. player presses Play
6. actual playback start is confirmed
7. answer timer begins from confirmed playback start

This separates:

- page entry
- clip readiness
- visible playback start

That is the needed model for generated or slow-start clips.

## Build order

1. add analytics tables and helper functions
2. add event logging helpers
3. add per-clip and per-movie aggregate updates
4. add scoring and rotation computation
5. patch live round timing and playback-start phases
6. optimize generated round-clip route for cached assets
7. wire weighted selection into `pick_movie_buff_clip`
8. add admin views/pages for library, clip analytics, rotation, QA, and match analytics
9. verify real match flows and edge states
10. tune thresholds after live data
11. add approved-source registry and scheduled checker design
12. add intake validation and ingest queue design
13. connect newly approved movies to secondary-pool candidacy instead of direct live publication

## UX and edge states that must be handled

- clip still generating when player enters round
- clip ready but player never presses Play
- clip fails to load after player presses Play
- player uses hint before playback
- player leaves between rounds
- player leaves during round
- low-sample clip with lucky first results
- weak clip manually featured by admin
- no candidate clips meet preferred difficulty
- same movie repeated too often
- newly discovered movie has weak metadata, bad runtime, duplicate risk, or invalid licensing and must be rejected before ingest

## Test plan

### Backend

- migration applies cleanly
- event rows are written for room, ready, round, hint, playback, answer, leave, completion, and failure paths
- per-clip aggregates update correctly
- per-movie aggregates update correctly
- rotation weights respect cooldown and quality floors

### Gameplay

- entering a round does not consume the pre-play window before media is ready
- pressing hint does not start playback
- pressing Play starts the answer timer only after playback is confirmed
- cached generated clips start faster than uncached first builds
- answer submit, timeout, leave, and round advance all write analytics

### Admin

- library shows movie totals and lifecycle state
- clip analytics shows scores, flags, and recent results
- rotation controls can cool down, feature, retire, and boost clips
- QA surfaces broken or weak clips clearly

## Release risks

- duplicate event writes if client-only logging is not carefully scoped
- stale analytics if aggregate recomputation misses a path
- route latency if cached asset short-circuiting is incomplete
- selection regressions if weighted rotation becomes too restrictive
- noisy admin data until enough real matches accumulate
- automated source watching can introduce bad titles if duplicate detection, trust boundaries, or license validation are weak

## Release-readiness gate

Do not consider this system ready until:

- event coverage is complete for playable rounds
- cached clip startup is measurably faster
- the pre-play timer no longer burns before media readiness
- weighted rotation is active in real round selection
- admin overrides work without bypassing quality and cooldown protection
- approved-source discovery is gated by validation and does not auto-publish unsafe or duplicate content directly into live gameplay
