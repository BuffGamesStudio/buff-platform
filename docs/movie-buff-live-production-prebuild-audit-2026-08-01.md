# Movie Buff live-production formal pre-build audit

Date accessed: 2026-08-01  
Task owner: Technical Architecture Lead  
Mode: Documentation-only formal audit. No application code, migrations, SQL, deployment, or production configuration changed.

Classification convention: every factual or architectural claim is tagged inline or in the table row classification. Section titles and table labels are organizational text. Any untagged recommendation in prose is [INFERENCE] and must be re-verified during implementation.

## 1. Locked canon

- [VERIFIED:USER] AI host is Assinophilly Phil: male, middle-aged, stylized animated human presenter, original North Jersey/Jersey Shore wise-guy delivery.
- [VERIFIED:USER] Signature opening is: "So, you think you're a Movie Buff, huh?"
- [VERIFIED:USER] Buffster is the mascot, not the host.
- [VERIFIED:USER] The website and game engine are authoritative.
- [VERIFIED:USER] Phil, Buffster, graphics, audio, and OBS react only to verified structured events.
- [VERIFIED:USER] Live production begins in Assisted Mode.
- [VERIFIED:USER] Gameplay must continue if entertainment or broadcast systems fail.
- [VERIFIED:USER] Live-production development remains isolated from launch-critical gameplay.
- [VERIFIED:USER] Host identity, studio design, show format, and shell architecture are not reopened by this audit.

## 2. Environment verification

| Item | Finding | Classification |
| --- | --- | --- |
| Repository path | `/workspace` | [VERIFIED:LOCAL] |
| Git top level | `/workspace` | [VERIFIED:LOCAL] |
| Initial branch | `main`, clean, tracking `origin/main` | [VERIFIED:LOCAL] |
| Expected audit branch | No local or remote `audit/live-production-prebuild-*` branch existed. | [VERIFIED:LOCAL] |
| Isolation action | Created isolated branch `cursor/movie-buff-live-production-prebuild-audit-41db` from `main`/`origin/main` because `main` cannot be used for this audit work. | [VERIFIED:LOCAL] |
| Base commit | `b9fa737ed71fce4c960d1dfbdbcae340be83eed5` | [VERIFIED:LOCAL] |
| `origin/main` relationship | `origin/main...HEAD` was `0 0` before branch creation; branch was created at the same commit. | [VERIFIED:LOCAL] |
| Worktree list | One worktree only: `/workspace`, now on the isolated branch. | [VERIFIED:LOCAL] |
| Dirty state before docs | Clean before creating these five docs. | [VERIFIED:LOCAL] |
| Async setup | No `/tmp/cursor/async-install/install-user.status` or log marker existed. | [VERIFIED:LOCAL] |
| Node.js | `node --version` returned `v22.14.0`; `command -v node` returned `/exec-daemon/node`. | [VERIFIED:LOCAL] |
| npm | `10.9.7` | [VERIFIED:LOCAL] |
| pnpm | `10.33.3` | [VERIFIED:LOCAL] |
| yarn | `1.22.22` | [VERIFIED:LOCAL] |
| bun | Not present in PATH output. | [VERIFIED:LOCAL] |
| Package manager lock | `package-lock.json`; no `pnpm-lock.yaml` or `yarn.lock`. | [VERIFIED:LOCAL] |
| Next.js | `16.2.11` in `package.json` and package-lock-only `npm ls`. | [VERIFIED:LOCAL] |
| React / React DOM | `19.2.4` / `19.2.4` in `package.json` and package-lock-only `npm ls`. | [VERIFIED:LOCAL] |
| Supabase JS | `@supabase/supabase-js@2.110.8` in `package.json` and package-lock-only `npm ls`. | [VERIFIED:LOCAL] |
| Supabase CLI | `command -v supabase` returned no path; `supabase --version` returned no output. CLI not installed in this VM. | [VERIFIED:LOCAL] |
| `node_modules/next/dist/docs/` | `node_modules` is absent, so required local Next docs are unavailable in this VM. | [VERIFIED:LOCAL] |
| Windows development environment | Not present in this Linux cloud VM. Windows audio routing can only be assessed from official docs, not verified locally. | [VERIFIED:LOCAL] |

Isolation verdict: [VERIFIED:LOCAL] worktree isolation is proven because only one worktree exists, it is now on a new isolated audit branch at the verified base commit, and no pre-existing dirty changes were used.

## 3. Existing repository architecture

### Runtime shape

- [VERIFIED:LOCAL] This repository is a Next.js App Router application. `package.json` scripts are `next dev --webpack`, `next build`, and `next start`.
- [VERIFIED:LOCAL] `next.config.ts` contains `allowedDevOrigins: ["127.0.0.1"]` and excludes `public/media/movie-buff/public-domain/**/*` from output file tracing.
- [VERIFIED:LOCAL] Existing production docs state the intended hosted architecture is Vercel for the Next.js app and Supabase for auth, database, realtime, and server-side admin/runtime access.
- [VERIFIED:LOCAL] Existing docs state hosted parity is unresolved until real Vercel env values, hosted Supabase migration parity, and hosted full-suite proof are complete.

### Game state and synchronization

- [VERIFIED:LOCAL] `src/lib/db/movieBuff.ts` defines `GameRoom`, `RoomPlayer`, room lifecycle statuses, public/private room flows, and Supabase RPC calls.
- [VERIFIED:LOCAL] `src/lib/game/gameState.ts` loads authoritative room/player state through `getLobby()` and subscribes to Supabase Realtime `postgres_changes` for `game_rooms` and `room_players`.
- [VERIFIED:LOCAL] `src/lib/game/roundService.ts` resolves current round, media readiness, playback start, hints, answer submission, round results, and final results through Supabase RPCs.
- [VERIFIED:LOCAL] `src/app/games/movie-buff/play/page.tsx` queues analytics events for `clip_loaded`, `media_ready`, `clip_failed_to_load`, `clip_started`, `clip_start_requested`, `hint_requested`, and `timeout`.
- [VERIFIED:LOCAL] Existing code uses polling plus Realtime refresh in waiting/play screens; Realtime events are refresh triggers, not the sole source of truth.

### Analytics and event systems

- [VERIFIED:LOCAL] `src/lib/game/movieBuffAnalytics.ts` allows these current event types: `room_created`, `player_joined`, `player_ready`, `round_started`, `media_ready`, `clip_loaded`, `clip_start_requested`, `clip_started`, `hint_requested`, `answer_submitted`, `answer_correct`, `answer_wrong`, `timeout`, `player_left`, `match_completed`, `match_abandoned`, and `clip_failed_to_load`.
- [VERIFIED:LOCAL] `/api/movie-buff/events` verifies a bearer Supabase session with `supabaseAdmin.auth.getUser`, validates the event type allowlist, verifies active room membership when `roomId` is supplied, and inserts into `movie_buff_round_events`.
- [VERIFIED:LOCAL] `queueMovieBuffEvent()` catches analytics write failures so gameplay is not broken by analytics logging.
- [VERIFIED:LOCAL] Admin match analytics read `movie_buff_round_events` and display recent event stream payload JSON.
- [VERIFIED:LOCAL] Existing event payload handling is not a broadcast-safe contract. It is analytics-oriented and can contain raw payloads.

### Admin and authorization

- [VERIFIED:LOCAL] Admin API requests use bearer tokens through `adminFetch`, then `requireAdminRequest()` validates Supabase user and `profiles.platform_role === "admin"`, with a local-only bypass when `ALLOW_LOCAL_ADMIN_BYPASS=true` and host is localhost/127.0.0.1.
- [VERIFIED:LOCAL] The Supabase skill warns that `user_metadata` is user-editable and must not be used for authorization decisions. Existing `adminAuth.ts` prefers `profiles.platform_role` and falls back to metadata only for schema-cache compatibility; live production should not use the metadata fallback for new producer authorization.
- [VERIFIED:LOCAL] `supabaseAdmin` uses `SUPABASE_SERVICE_ROLE_KEY` only in server-only code.

### Deployment architecture

- [VERIFIED:LOCAL] Existing production setup docs require `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- [VERIFIED:LOCAL] Existing docs describe hosted deployment parity as not proven in-repo.
- [VERIFIED:LOCAL] `.openai/hosting.json` is documented as absent in earlier runbooks; this audit did not find a Vercel config file.
- [INFERENCE] The current Next.js app is appropriate for contracts, a simulator, producer console UI, and OBS overlay pages, but not for a durable OBS/voice daemon.

## 4. Official documentation and source ledger

All sources below were accessed on 2026-08-01.

| ID | Source | Relevant behavior | Known limitation | Effect on architecture | Classification |
| --- | --- | --- | --- | --- | --- |
| S1 | `package.json`, `package-lock.json`, `next.config.ts` | Current dependency and Next config evidence. | `node_modules` absent, so runtime docs package unavailable. | Use package-lock evidence for versions and web docs for behavior. | [VERIFIED:LOCAL] |
| S2 | `docs/movie-buff-vercel-supabase-production-setup.md` | Vercel + Supabase intended deployment and env vars. | Hosted values and migration parity not recorded as complete. | Do not treat hosted live production as ready. | [VERIFIED:LOCAL] |
| S3 | `docs/movie-buff-production-handoff-pack.md` | Local smoke suite passed as of 2026-07-31; hosted parity remains blocker. | It is historical repo documentation, not fresh hosted proof. | Live-production prototype must not depend on public launch readiness. | [VERIFIED:LOCAL] |
| S4 | `docs/movie-buff-soft-launch-runbook.md` | Existing operational checks and local/hosted parity notes. | Some notes predate later docs and may be superseded. | Use as local evidence only. | [VERIFIED:LOCAL] |
| S5 | Next.js Deploying, `https://nextjs.org/docs/app/building-your-application/deploying` | Node.js server and Docker support all Next.js features; static export is limited. | Feature support varies by adapter/platform. | Prototype UI/API may live in Next; persistent local control should not be assumed on serverless. | [EXTERNAL] |
| S6 | Next.js `after`, `https://nextjs.org/docs/app/api-reference/functions/after` | `after` can schedule post-response work and uses platform `waitUntil` in serverless. | Duration is still bounded by route max duration. | Do not use `after` as a durable production event worker. | [EXTERNAL] |
| S7 | Vercel Functions Limits, `https://vercel.com/docs/functions/limitations` | Functions have bounded duration, memory, payload, and file descriptor limits; workloads requiring unlimited execution should use Workflows. | Limits vary by plan and Fluid Compute config. | OBS/voice/avatar control must be outside Vercel functions for live sessions. | [EXTERNAL] |
| S8 | Vercel Environment Variables, `https://vercel.com/docs/environment-variables` | Env vars are encrypted at rest and apply to new deployments; browser-visible values need explicit public exposure. | Project users with access can view env vars. | Secrets must live server-side/local daemon; no secrets in browser source URLs. | [EXTERNAL] |
| S9 | Supabase Realtime Broadcast, `https://supabase.com/docs/guides/realtime/broadcast.md` | Broadcast sends messages through Realtime channels; database functions can broadcast after commit. | Broadcast is delivery, not authoritative persistence. | Broadcast-safe events need durable event log plus snapshot/replay. | [EXTERNAL] |
| S10 | Supabase Realtime Postgres Changes, `https://supabase.com/docs/guides/realtime/postgres-changes.md` | Clients can receive database row changes. | Throughput, RLS, and payload exposure constraints apply. | Existing UI refresh pattern is valid; production bus should not leak raw row data. | [EXTERNAL] |
| S11 | Supabase Realtime Authorization, `https://supabase.com/docs/guides/realtime/authorization.md` | Private channels use RLS policies on `realtime.messages`; policy cache is calculated at connect/JWT update. | More complex RLS can increase connection latency and reduce join rates. | Private producer/adapter channels need simple RLS and short JWT lifetimes. | [EXTERNAL] |
| S12 | Supabase RLS, `https://supabase.com/docs/guides/database/postgres/row-level-security.md` | RLS must be enabled on exposed schemas. | Policy mistakes can expose or block data. | Broadcast-safe projection tables/contracts must be RLS-first. | [EXTERNAL] |
| S13 | Supabase API keys, `https://supabase.com/docs/guides/getting-started/api-keys.md` | Publishable keys are browser-safe; secret/service_role keys bypass RLS and must not be exposed. | Legacy `anon`/`service_role` remain valid until disabled. | Local daemon and Next server need secret storage; overlays get only publishable/session-scoped access or signed ephemeral URLs. | [EXTERNAL] |
| S14 | Supabase JS `subscribe`, `https://supabase.com/docs/reference/javascript/subscribe` | `subscribe` status can return `CHANNEL_ERROR` or `TIMED_OUT`; full error should be logged. | It does not guarantee business-level delivery. | Health status must record channel errors and recover via snapshot. | [EXTERNAL] |
| S15 | OBS websocket protocol, `https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md` | 5.x protocol uses Hello, Identify, Request, RequestResponse, RequestBatch, and request IDs. | OBS must be reachable from controlling process; local network/auth required. | Use local OBS adapter with idempotent command IDs and ACK tracking. | [EXTERNAL] |
| S16 | OBS Browser Source, `https://obsproject.com/kb/browser-source` | Browser source is CEF-backed and can load URL/local file with cache/refresh options. | Browser source cache/visibility reload behavior can hide stale overlay bugs. | Overlay must expose version/health and tolerate reload/reconnect. | [EXTERNAL] |
| S17 | OBS Sources Guide, `https://obsproject.com/kb/sources-guide` | OBS scenes/sources ordering and visibility control output. | Manual scene/source names can drift. | Adapter should validate expected scene/source inventory before rehearsal. | [EXTERNAL] |
| S18 | MDN WebSocket API, `https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API` | WebSockets are bidirectional; stable WebSocket lacks backpressure. | Backpressure issues can cause memory/CPU pressure under event bursts. | Use bounded queues and snapshots, not unbounded overlay message buffers. | [EXTERNAL] |
| S19 | MDN WebSocket close event, `https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/close_event` | `close` event reports connection closure. | Application must define reconnection semantics. | Overlay/adapter health must include close detection and reconnect state. | [EXTERNAL] |
| S20 | OpenAI Text to Speech guide, `https://developers.openai.com/api/docs/guides/text-to-speech` | TTS supports realtime audio streaming via chunk transfer; OpenAI requires clear disclosure that TTS is AI-generated. | Vendor latency and voice availability require empirical proof; custom voices require consent. | MVP voice adapter must be mock-first, with disclosure and cancellation tests before live use. | [EXTERNAL] |
| S21 | OpenAI Create Speech API, `https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create` | Speech endpoint returns audio file or stream; formats include mp3, opus, aac, flac, wav, pcm; input limit 4096 chars. | SSE streaming not supported for all models. | Phil line compiler must cap text length and select low-latency format. | [EXTERNAL] |
| S22 | MDN WebVTT search result/pages, `https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API` and `https://developer.mozilla.org/docs/Web/API/WebVTT_API/Web_Video_Text_Tracks_Format` | WebVTT provides time-aligned caption cues. | Live caption timing still depends on audio generation timing. | Captions should be generated from validated Phil text with cue timing adjusted to voice output. | [EXTERNAL] |
| S23 | Windows audio routing OBS wiki, `https://obsproject.com/wiki/windows-10-app-volume-device-preferences` | Windows 10 1803+ supports per-app input/output device preferences; virtual cables/Voicemeeter still commonly needed. | This Linux VM cannot verify actual Windows setup. | Rehearsal must include a Windows machine audio-routing proof. | [EXTERNAL] |
| S24 | YouTube Live Streaming API overview/reference, `https://developers.google.com/youtube/v3/live/getting-started`, `https://developers.google.com/youtube/v3/live/docs` | Live broadcasts bind to live streams; API supports state transitions and live chat moderation. | Stuck transitions can require deleting/recreating broadcasts. | Broadcast operation must be manual/assisted at MVP; game state cannot depend on YouTube state. | [EXTERNAL] |
| S25 | YouTube live copyright issues, `https://support.google.com/youtube/answer/3367684` | Live streams are scanned for third-party content and can be interrupted/terminated. | Licensed content can still be interrupted without allowlisting. | Movie-clip broadcast rights are a go/no-go outside technical scope. | [EXTERNAL] |
| S26 | YouTube copyright guidance, `https://support.google.com/youtube/answer/2797466` | Audiovisual works are copyrightable; public domain verification is uploader responsibility. | YouTube cannot guarantee public-domain status. | Only validated public-domain/licensed clip assets should enter live rehearsal. | [EXTERNAL] |
| S27 | Rive web runtime docs, `https://rive.app/docs/runtimes/web/web-js` | Web runtime can render interactive animations. | Not chosen for MVP until latency and authoring pipeline are proven. | Candidate for Buffster/Phil animation later. | [EXTERNAL] |
| S28 | Live2D Cubism SDK manual, `https://docs.live2d.com/en/cubism-sdk-manual/top/` | Live2D supports 2D model runtime categories. | Requires model asset pipeline and integration proof. | Too heavy for first proof unless assets already exist. | [EXTERNAL] |

## 5. Known issues and integration risks reviewed

| Risk | Audit result | Required mitigation | Classification |
| --- | --- | --- | --- |
| OBS disconnect | OBS websocket is local and stateful; cloud functions cannot keep durable control sessions. | Local adapter with reconnect, health, no-op replay, and manual OBS fallback. | [EXTERNAL]+[INFERENCE] |
| Scene ACK/duplicates | obs-websocket request IDs and responses exist; duplicate commands can still be sent by app logic. | Idempotency key per command and adapter-level dedupe. | [EXTERNAL]+[INFERENCE] |
| Browser-source caching | OBS browser source has cache refresh and active-scene refresh options. | Overlay version banner, cache-busting URL version, reload health test. | [EXTERNAL] |
| Voice latency | TTS supports streaming but vendor latency unproven locally. | Riskiest proof measures cue-to-first-audio and cue-to-caption. | [EXTERNAL]+[ASSUMPTION] |
| Mid-speech cancel | No repo code for voice cancellation exists. | Adapter must support cancel token before real TTS live use. | [UNKNOWN]+[INFERENCE] |
| Audio overlap | Windows routing not locally verified. | Single mixer owner, ducking/cancel rules, rehearsal on Windows. | [EXTERNAL]+[UNKNOWN] |
| Lip-sync | No Phil avatar runtime exists in repo. | MVP uses static/low-motion avatar until voice timing proof passes. | [VERIFIED:LOCAL]+[INFERENCE] |
| Event duplication/ordering | Existing analytics is append-only client/server writes; Realtime is used as refresh trigger. | Versioned envelope sequence, idempotency key, snapshot recovery. | [VERIFIED:LOCAL]+[INFERENCE] |
| Snapshot recovery | Existing game state can be loaded from DB; production event snapshot does not exist. | Add episode-state snapshot contract before consuming event stream. | [VERIFIED:LOCAL]+[INFERENCE] |
| Supabase Realtime limits | Realtime auth/policy/cache and WebSocket behavior require bounded queues. | Broadcast only safe projections; use Postgres/snapshot as durable truth. | [EXTERNAL] |
| Serverless lifetimes | Vercel functions are bounded duration. | No persistent OBS/voice daemon in Vercel. | [EXTERNAL] |
| Local OBS vs cloud | OBS runs on production machine, not Vercel. | Local Windows companion service controls OBS/audio. | [INFERENCE] |
| Hidden-answer leakage | `roundService` returns `correctTitle` after per-player submit and `movieTitle` in results; raw DB data contains answers. | Never publish raw round/answer rows to broadcast contracts; require explicit game-authoritative public reveal before `movieTitle` reaches Phil/OBS. | [VERIFIED:LOCAL]+[INFERENCE] |
| VIP inventory leakage | Existing code mentions VIP/reward unlock text but no live VIP contract exists. | Contract marks per-player eligibility/tier/inventory player-private only; broadcast receives aggregate counts only. | [VERIFIED:LOCAL]+[INFERENCE] |
| Prompt injection | Display names and chat can be hostile; Phil must receive minimum facts. | Sanitized broadcast identity and template-only Phil lines for MVP. | [INFERENCE] |
| Host hallucinations | LLM commentary can invent facts. | Prepared factual line templates; no generative host facts until validation gate. | [INFERENCE] |
| Stale commentary | Event stream can lag/reconnect. | Include `stateVersion`, expiry, and producer cancel. | [INFERENCE] |
| Producer auth | Existing admin auth is app/admin role, not producer-specific. | Separate producer roles and command audit log. | [VERIFIED:LOCAL]+[INFERENCE] |
| Secrets in browser sources | Browser source URL is visible in OBS/browser context. | No static secrets in overlay URL; use short-lived overlay session token. | [EXTERNAL]+[INFERENCE] |
| Overlay debug/private leakage | Mixed contracts can include producer-only/system-only fields while OBS overlay runs in a browser context. | Strip payloads by publication target; OBS browser-source receives broadcast fields only. | [INFERENCE] |
| Broadcast delay vs game state | YouTube may add delay and recommends weighing delay against interaction. | Assisted Mode treats broadcast as downstream; gameplay UI remains real-time authority. | [EXTERNAL] |
| Clip rights | YouTube can interrupt live streams for third-party content. | Rights/legal gate before public episode; prototype can use licensed/public-domain proof clips only. | [EXTERNAL] |
| Production service failure | Requirement says gameplay continues. | Feature flag and event tee; all live-production consumers fail open. | [VERIFIED:USER]+[INFERENCE] |
| Local runtime SPOF | OBS/voice/audio companion is intentionally local for Assisted Mode; Windows runtime is not verified in this VM. | Accept only for prototype/private rehearsal with manual fallback, startup checklist, and recovery drill before public use. | [UNKNOWN]+[INFERENCE] |

## 6. Architecture decisions

| # | Decision | Chosen approach | Evidence | Rejected alternatives | Migration path | Failure containment |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Repo vs service | [INFERENCE] Prototype contracts, simulator, overlay, and producer console should live in an isolated package/workspace within this repo; persistent OBS/voice companion is a local Windows process and can later split to a service repo. | Existing game contracts/admin live here; Vercel cannot host durable OBS session. | All inside app routes; separate repo immediately. | Start disabled and namespaced; split companion after contract stabilizes. | No imports from gameplay into entertainment path except safe projection. |
| 2 | Local Windows vs cloud | [INFERENCE] OBS/audio/avatar runner is local Windows for Assisted Mode. | OBS, Windows audio routing, and voice playback are local machine concerns; Vercel functions bounded. | Cloud-only OBS control; browser-only OBS control. | Local mock adapter first, then Windows service. | Gameplay remains Supabase/Next authoritative. |
| 3 | Event transport | [INFERENCE] Durable event log + Supabase Broadcast/Postgres Changes as notification, with target-specific payload stripping before any public/OBS publication. | Existing DB event log and Realtime refresh pattern. | Raw Realtime-only; client-to-OBS direct; mixed payloads sent wholesale. | Add projection table/contracts later. | Snapshot rebuild on missed events. |
| 4 | Snapshot/replay | [INFERENCE] Episode snapshot is required and versioned. | Realtime/WebSocket disconnects are expected. | Assume in-order event stream forever. | Create `episode-state-snapshot` contract before adapter. | Consumers can restart from snapshot. |
| 5 | Idempotency | [INFERENCE] `eventId`, `sequence`, and `idempotencyKey` required. | Existing analytics can duplicate client logs; OBS requests can duplicate. | Timestamp-only dedupe. | Add dedupe to adapters and producer commands. | Duplicate commands become no-ops. |
| 6 | OBS adapter | [INFERENCE] Local adapter speaks obs-websocket 5.x and owns scene/source mapping. | obs-websocket protocol supports request/response and request IDs. | Browser source calls OBS directly; Next route calls OBS directly. | Mock adapter -> local adapter -> persisted config. | Adapter down means overlays/OBS freeze, not gameplay. |
| 7 | Overlay transport | [INFERENCE] OBS browser source loads overlay page that subscribes to broadcast-safe updates only; producer/system/private fields are not delivered to the browser source. | OBS Browser Source is CEF-backed URL/local browser. | Static image-only; secrets in querystring; producer debug payloads in overlay. | Cache-busted overlay URL with session token. | Overlay reconnects and shows safe standby. |
| 8 | Voice adapter | [INFERENCE] Mock voice first; streaming TTS only after latency/cancel proof. | TTS streaming exists but local path unverified. | Direct live TTS first; browser speech synthesis. | Mock WAV/PCM adapter -> vendor adapter. | Voice failure falls back to captions/lower-third. |
| 9 | Caption timing | [INFERENCE] Captions derive from validated Phil output, not ASR. | WebVTT supports timed cues; Phil line text is known before speech. | ASR captions from generated audio. | Static duration estimate -> measured alignment. | Caption mismatch cancels host line. |
| 10 | Phil avatar MVP | [INFERENCE] MVP is static or simple 2D state avatar, not lip-sync. | No avatar runtime exists; voice latency is riskiest. | Full Live2D/Rive lip-sync immediately. | State images -> mouth flaps -> rigged avatar. | Avatar failure hides avatar, line/captions continue. |
| 11 | Buffster format | [INFERENCE] Buffster MVP is cueable mascot animation/stinger, not host. | Locked canon and existing `Buffster` component. | Buffster as host; real-time mascot logic. | Image/Lottie/Rive cue after event contract. | Buffster failure skipped. |
| 12 | Producer authz | [INFERENCE] Separate producer roles required. | Existing admin role is broad CMS/admin. | Reuse `admin` only. | Add `producer`, `technical_director`, `emergency_operator` roles later. | Producer command audit and emergency stop. |
| 13 | Logging | [INFERENCE] Append-only audit log for every production event/command/adapter ACK. | Existing analytics/admin event stream pattern. | Console logs only. | Contract first, storage later. | Postmortem possible after failure. |
| 14 | Feature flags | [INFERENCE] Default disabled; room/episode scoped. | Requirement to isolate from launch-critical gameplay. | Global enable. | `LIVE_PRODUCTION_ENABLED` plus episode flag. | Kill switch stops publication. |
| 15 | Gameplay separation | [VERIFIED:USER]+[INFERENCE] Entertainment consumers are downstream-only; gameplay never waits for them. | Locked canon and current `queueMovieBuffEvent` fail-open pattern. | OBS/Phil callbacks affecting scoring/rounds. | Event tee from authoritative game events. | Live-production outage cannot block play. |

## 7. Recommended architecture

Recommended smallest safe prototype: [INFERENCE]

1. Authoritative game emits or simulates only versioned production events.
2. Production event compiler sanitizes and projects them into broadcast-safe contracts.
3. Phil cue compiler uses deterministic templates for MVP.
4. Validated Phil output goes to mock/streaming voice and captions.
5. Local Windows adapter controls OBS and audio.
6. OBS browser source displays overlay state from broadcast-safe overlay updates.
7. Producer console can cancel, mute, hide overlay, stop Phil, or emergency-stop all live-production output.

This belongs in the current repository only as isolated prototype contracts/UI/simulator because the game contracts and admin surfaces are here. The persistent local runtime should be a separate process boundary from the Next/Vercel deployment, with a later option to split to a separate service repository after the contract proves stable.

## 8. Red Team findings and resolutions

| Finding | Severity | Resolution |
| --- | --- | --- |
| Initial temptation to rely on Supabase Broadcast as durable delivery was unsupported. | High | Architecture now requires durable log + snapshot + idempotency; Broadcast is notification only. |
| Existing analytics payloads are not broadcast-safe. | High | Contracts doc defines explicit broadcast-safe projections and forbids hidden answers/private IDs. |
| Per-player answer feedback could be mistaken for broadcast reveal. | High | Contracts now require explicit `publicRevealState`; `submitMovieBuffAnswer()` `correctTitle` is player-private and cannot feed Phil/OBS. |
| VIP eligibility/tier could leak if per-player simulation fields are broadcast. | High | Contracts now keep per-player eligibility/tier/inventory player-private; broadcast receives aggregate counts only. |
| OBS overlay could leak producer/debug fields if mixed payloads are published wholesale. | High | Contracts and plan now require target-specific stripping; OBS browser-source receives broadcast fields only. |
| Local Windows/OBS cannot be verified in Linux VM. | Medium | Marked as [UNKNOWN]/[EXTERNAL] and moved to rehearsal proof gate. |
| Local Windows companion remains a single point of failure for Assisted Mode. | Medium | Risk register now accepts it only for prototype/private rehearsal with manual fallback and recovery drill before public use. |
| Voice latency could sink the prototype. | High | Identified as the single riskiest assumption with a smallest proof before broad implementation. |
| Reusing `admin` for producer commands creates an authority-boundary risk. | Medium | Decision requires separate producer roles and audit log. |
| Full avatar/lip-sync scope was too broad. | Medium | MVP reduced to static/simple state avatar; lip-sync deferred. |

## 9. Final audit verdict

[VERIFIED READY FOR PROTOTYPE] for a documentation-defined, disabled, isolated prototype chain only.

This is not approval to deploy, apply SQL, modify migrations, or run a public live episode. The readiness is limited to implementing the smallest safe prototype after the riskiest voice/OBS/cancel proof is executed in an isolated branch with feature flags and no gameplay dependency.
