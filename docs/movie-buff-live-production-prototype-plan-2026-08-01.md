# Movie Buff live-production prototype plan

Date accessed: 2026-08-01  
Scope: smallest safe documentation-defined prototype. Implementation not started in this audit.

Classification convention: explicit facts are tagged inline. Section titles, labels, and checklist names are organizational text. Untagged prototype recommendations, file-boundary guidance, acceptance criteria, and implementation sequencing are [INFERENCE] until proven by implementation and rehearsal.

## 1. Objective

Build only enough live-production machinery to prove that Movie Buff can react to verified structured gameplay events without risking gameplay, hidden answers, private data, or broadcast operations.

Primary chains:

- [VERIFIED:USER] Chain A: `SIMULATED ANSWER_CORRECT` with game-authoritative public reveal state -> versioned event contract -> validation and sanitization -> broadcast-safe event -> Phil cue compiler -> prepared factual Phil line -> validation -> mock or streaming voice adapter -> captions -> OBS scene and lower-third command -> producer cancellation.
- [VERIFIED:USER] Chain B: `ROUND_PREPARING` -> VIP eligibility simulation -> synchronized VIP pre-show -> private controls for eligible players -> aggregate-only broadcast state for ineligible/public viewers -> ambient cinematic for ineligible players -> selection lock -> Buffster velvet-rope cue -> clip start.

## 2. Non-goals

- [VERIFIED:USER] Do not change launch-critical gameplay while proving live production.
- [INFERENCE] Do not add generative ad-lib Phil commentary in the first prototype.
- [INFERENCE] Do not let OBS, voice, avatar, captions, or YouTube state feed back into scoring, timers, room progression, or answer validation.
- [INFERENCE] Do not use live copyrighted clips in a public broadcast proof without separate rights clearance.

## 3. Module and runtime boundaries

Recommended implementation boundary after this audit: [INFERENCE]

| Boundary | Responsibility | Must not do |
| --- | --- | --- |
| Game authority | Existing Next.js/Supabase gameplay and RPCs. | Wait for live-production consumers. |
| Live-production contracts | Versioned event, snapshot, cue, command, health, and audit schemas. | Include hidden answers, emails, service keys, fraud signals, or private inventory. |
| Simulator | Emits deterministic `ANSWER_CORRECT` and `ROUND_PREPARING` test events with explicit public/private reveal state. | Depend on real rooms until contracts pass. |
| Projection/validator | Converts raw/simulated events to broadcast-safe contracts and strips fields by publication target. | Pass raw analytics payloads, player-private answer results, or producer debug data to Phil/OBS. |
| Phil cue compiler | Template-only factual lines using minimum facts. | Call an LLM with free-form player/chat text. |
| Voice/caption adapter | Mock audio first; optional streaming TTS after proof. | Block gameplay or overlap uncancelled audio. |
| OBS adapter | Local Windows process controlling OBS via obs-websocket. | Run as a Vercel Function or expose OBS secrets to browser. |
| Overlay | OBS browser-source page showing broadcast-safe lower-third/captions/health after target-specific field stripping. | Store secrets in URL/localStorage or receive producer-only/system-only/private fields. |
| Producer console | Approve/cancel/mute/hide/emergency-stop production output. | Override gameplay truth. |

## 4. Stage plan

### Stage 1: contracts and simulator

- Objective: [INFERENCE] Define v1 contracts and emit deterministic simulated events for Chain A and Chain B.
- Dependencies: event contracts doc; no production DB changes.
- Module/file boundary: isolated live-production contract package or namespace; simulator tests only.
- Acceptance criteria:
  - `ANSWER_CORRECT` simulation produces one production event envelope with explicit `publicRevealState`.
  - A `private_submit` answer event cannot include `movieTitle` in any broadcast/OBS/Phil payload.
  - `ROUND_PREPARING` simulation produces one episode-state snapshot and one VIP eligibility simulation.
  - All payload fields are classified.
  - Invalid payloads are rejected.
- Automated tests:
  - Schema validation pass/fail tests.
  - Hidden-answer field injection test.
  - Duplicate idempotency-key test.
- Manual tests:
  - Inspect serialized event JSON.
  - Confirm no emails, auth tokens, service keys, hidden answers, per-player `correctTitle`, raw answer text, private VIP inventory/tier, producer debug fields, or unnecessary internal IDs.
- Security checks:
  - Broadcast-safe identity only.
  - Display-name sanitization fixture.
- Disable/rollback:
  - Feature flag off; simulator not reachable from production UI.
- Complexity: S.
- Parallelizable work: contracts, simulator fixtures, validator fixtures.

### Stage 2: template Phil

- Objective: [INFERENCE] Compile verified events into prepared factual Phil lines.
- Dependencies: Stage 1 broadcast-safe event.
- Module/file boundary: Phil template compiler and validation only.
- Acceptance criteria:
  - Signature opening can be produced only as locked canonical text.
  - Correct-answer line uses player display handle, public score delta, streak, and movie title only when game authority has marked the title publicly revealed; per-player submit feedback is not public reveal.
  - No host line can include unverified facts.
- Automated tests:
  - Prompt-injection display name fixture.
  - Too-long line rejection.
  - Banned token/secret pattern rejection.
- Manual tests:
  - Producer reviews sample Phil lines for tone and factual safety.
- Security checks:
  - Phil receives minimum facts; no raw chat.
- Disable/rollback:
  - Phil output can be replaced by lower-third only.
- Complexity: M.
- Parallelizable work: template copy, validator tests.

### Stage 3: captions and voice

- Objective: [INFERENCE] Convert validated Phil output to captions and mock or streaming voice.
- Dependencies: Stage 2 validated Phil output.
- Module/file boundary: voice adapter interface, mock adapter, caption cue generator.
- Acceptance criteria:
  - Mock adapter returns deterministic duration and cancel ACK.
  - Streaming adapter is disabled until latency proof passes.
  - Captions show exact validated line text.
- Automated tests:
  - Cancel-before-start, cancel-mid-line, voice-timeout, caption-duration tests.
- Manual tests:
  - Listen to mock or fixture audio and verify no overlap after cancel.
- Security checks:
  - AI-generated voice disclosure is included in producer/rehearsal materials before real TTS.
- Disable/rollback:
  - Voice off; captions/lower-third only.
- Complexity: M.
- Parallelizable work: mock audio, caption timing, cancellation harness.

### Stage 4: OBS

- Objective: [INFERENCE] Send OBS scene/lower-third commands through a mock adapter, then local obs-websocket.
- Dependencies: Stage 1 command contract; Stage 3 caption/voice states.
- Module/file boundary: OBS adapter interface, mock adapter, local adapter config, no production cloud dependency.
- Acceptance criteria:
  - `SetSceneItemEnabled`/scene-switch/lower-third command ACK or safe failure is recorded.
  - Duplicate command ID is no-op.
  - Adapter reconnect uses snapshot.
- Automated tests:
  - Mock ACK, duplicate, timeout, disconnect.
- Manual tests:
  - Local OBS scene inventory validation.
  - Browser-source refresh/cache test.
- Security checks:
  - OBS websocket password stored only in local secret store/env, never browser source.
- Disable/rollback:
  - Adapter disabled; OBS manual scene fallback.
- Complexity: M/L depending on Windows environment availability.
- Parallelizable work: mock adapter, local adapter, OBS scene naming checklist.

### Stage 5: producer console

- Objective: [INFERENCE] Give producer cancellation and emergency controls before adding more entertainment features.
- Dependencies: Stages 1-4.
- Module/file boundary: private producer UI/API with producer roles and audit log.
- Acceptance criteria:
  - Cancel Phil line before voice starts.
  - Cancel mid-speech.
  - Hide lower-third.
  - Emergency stop disables voice/avatar/overlay/OBS commands.
- Automated tests:
  - Authorization denial for non-producer.
  - Audit-log record for each command.
- Manual tests:
  - Producer drill: cancel within 500 ms target after button press in local rehearsal.
- Security checks:
  - Producer command requires role, CSRF/session protection, and reason code for emergency stop.
- Disable/rollback:
  - Kill switch and feature flag.
- Complexity: M.
- Parallelizable work: UI, authz tests, audit log fixtures.

### Stage 6: Phil avatar

- Objective: [INFERENCE] Add a minimal stylized Phil state renderer after voice/cancel proof.
- Dependencies: Stage 3 voice/caption proof, Stage 5 producer cancel.
- Module/file boundary: avatar renderer consumes validated avatar state only.
- Acceptance criteria:
  - Idle, speaking, listening/standby, cancelled states.
  - Avatar hides safely on adapter failure.
- Automated tests:
  - State transition tests.
- Manual tests:
  - Visual rehearsal in OBS browser source.
- Security checks:
  - Avatar cannot receive raw player/chat text.
- Disable/rollback:
  - Static Phil card or no avatar.
- Complexity: M.
- Parallelizable work: asset prep and state machine.

### Stage 7: Buffster

- Objective: [INFERENCE] Add Buffster mascot cue for velvet-rope/VIP transition without making Buffster host.
- Dependencies: Stage 1 Chain B contracts, Stage 4 overlay/OBS, Stage 5 producer controls.
- Module/file boundary: Buffster cue renderer/overlay; no host logic.
- Acceptance criteria:
  - `BUFFSTER_VELVET_ROPE` cue triggers after selection lock.
  - Ineligible players see ambient cinematic only.
  - Eligible controls and per-player eligibility/tier remain private.
- Automated tests:
  - VIP private-field leakage test.
  - Ineligible state cannot access controls.
- Manual tests:
  - Side-by-side eligible/ineligible player rehearsal.
- Security checks:
  - Private VIP inventory never enters broadcast payload.
- Disable/rollback:
  - Skip Buffster cue; proceed to clip start.
- Complexity: M.
- Parallelizable work: Buffster asset/cue, VIP simulator, private controls mock.

### Stage 8: full rehearsal

- Objective: [INFERENCE] Prove Chain A and Chain B end-to-end with failure drills.
- Dependencies: Stages 1-7.
- Module/file boundary: local rehearsal harness and runbook.
- Acceptance criteria:
  - Chain A passes with producer cancellation at each point.
  - Chain B passes with eligible and ineligible simulated players.
  - Gameplay simulation continues after voice/OBS/overlay failures.
- Automated tests:
  - End-to-end simulated event replay.
  - Duplicate/out-of-order event replay.
  - Snapshot recovery test.
- Manual tests:
  - OBS disconnect/reconnect.
  - Browser-source refresh.
  - Windows audio routing.
  - Emergency stop.
- Security checks:
  - Inspect captured rehearsal logs for hidden answers, emails, tokens, private VIP inventory, fraud signals.
- Disable/rollback:
  - All production systems off; existing Movie Buff gameplay unchanged.
- Complexity: L.
- Parallelizable work: failure scripts, OBS rehearsal, security log review.

## 5. Chain A exact prototype flow

1. [INFERENCE] Simulator emits `movie_buff.answer_correct.v1` with safe facts only and `publicRevealState` set explicitly.
2. Validator wraps it in `production.event.envelope.v1`.
3. Sanitizer produces `broadcast.safe.answer_correct.v1` only after stripping fields disallowed for the OBS/Phil/public target.
4. Phil compiler selects deterministic template, for example: `That's a clean hit from {displayHandle}. {scoreDelta} on the board.`
5. Phil output validator checks length, banned fields, factual references, and line expiry.
6. Voice adapter receives validated line and cancellation token.
7. Caption generator emits cue(s) from the same validated line.
8. OBS adapter receives lower-third and scene command with command ID.
9. Producer may cancel before compile, before voice, mid-voice, before OBS, or after lower-third display.

## 6. Chain B exact prototype flow

1. [INFERENCE] Simulator emits `movie_buff.round_preparing.v1`.
2. Snapshot includes round status, public countdown, clip preflight status, and aggregate-only safe eligibility counts.
3. VIP eligibility simulator produces private per-player capability messages; per-player tier/eligibility never enters broadcast state.
4. Eligible players receive private controls; ineligible players receive ambient cinematic state.
5. Selection lock emits a broadcast-safe `selection_locked` event.
6. Buffster receives `BUFFSTER_VELVET_ROPE` cue only after selection lock.
7. Clip start is triggered from game authority, not Buffster/OBS.

## 7. Cost and operations categories

No vendor pricing is invented in this plan.

| Phase | Required categories | Classification |
| --- | --- | --- |
| Technical prototype | Developer machine, local OBS install, mock voice, local logs, local fixture storage. | [INFERENCE] |
| Private rehearsal | Windows production machine, OBS scenes, browser source overlays, virtual audio cable/Voicemeeter if needed, optional TTS API usage, recordings, rehearsal logs. | [INFERENCE]+[EXTERNAL] |
| First public Assisted Mode episode | Production host env, Supabase project, local OBS/encoder, YouTube Live setup, rights-cleared clips, AI voice disclosure, monitoring, incident owner, recording/archive storage. | [INFERENCE]+[EXTERNAL] |
| Deferred scaling | Dedicated live-production service, durable queue, observability backend, multi-operator auth, asset CDN/storage, avatar runtime, redundancy. | [INFERENCE] |

## 8. User input required before implementation

- [UNKNOWN] Which Windows machine will run OBS, voice, avatar, and audio routing.
- [UNKNOWN] Whether a specific TTS vendor/voice is already approved for Assinophilly Phil.
- [UNKNOWN] Whether Phil custom voice rights/consent exist; if not, use built-in TTS or mock only.
- [UNKNOWN] Which clips are legally cleared for public live broadcast.
- [UNKNOWN] Producer roster and role hierarchy.
- [UNKNOWN] Whether the implementation should convert this repo to a workspace for an isolated package or use a namespaced folder first.
