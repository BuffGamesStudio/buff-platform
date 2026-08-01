# Movie Buff live-production rehearsal plan v1

Date accessed: 2026-08-01  
Status: pre-implementation test and rehearsal plan. No tests were run as part of this documentation-only audit.

Classification convention: explicit facts, unknowns, and thresholds are tagged inline or in table classifications. Section titles and scenario names are organizational text. Untagged rehearsal steps, expected results, and go/no-go rules are [INFERENCE] until executed and measured.

## 1. Rehearsal levels

| Level | Purpose | Environment | Exit criteria |
| --- | --- | --- | --- |
| L0 contract tests | Prove schema validation and leakage rejection. | Local developer machine/CI. | 100% required contract tests pass. |
| L1 simulator replay | Prove event ordering, idempotency, Phil templates, mock voice/captions/OBS. | Local app or isolated package with mock adapters. | Chain A and B pass without real OBS/TTS. |
| L2 local OBS rehearsal | Prove OBS browser source, obs-websocket, local adapter, and producer controls. | Windows production/rehearsal machine with OBS. | OBS disconnect/reconnect, cancel, and emergency stop pass. |
| L3 private full rehearsal | Prove end-to-end Assisted Mode with real humans and rights-cleared clips. | Private stream/unlisted or local recording. | No hidden/private-data leaks; thresholds met. |
| L4 first public Assisted Mode episode | Public run with producer in control. | Production stack after go/no-go. | Manual go/no-go checklist complete. |

## 2. Measurement thresholds

These thresholds are prototype targets, not verified facts.

| Metric | Target | Failure action | Classification |
| --- | --- | --- | --- |
| Event validation latency | P95 <= 250 ms | Optimize validator or reduce payload scope. | [ASSUMPTION] |
| Mock voice event-to-caption visible | P95 <= 750 ms | Keep captions/lower-third only. | [ASSUMPTION] |
| Real TTS event-to-first-audio | P95 <= 1500 ms | Disable real TTS for public Assisted Mode. | [ASSUMPTION] |
| Producer cancel-to-overlay-hide | P95 <= 500 ms | Do not proceed to live rehearsal. | [ASSUMPTION] |
| Producer cancel-to-mock-audio-stop | P95 <= 500 ms | Fix adapter before real TTS. | [ASSUMPTION] |
| Producer cancel-to-real-audio-stop | P95 <= 750 ms | Disable real TTS. | [ASSUMPTION] |
| OBS command ACK | P95 <= 1000 ms local | Use manual OBS fallback. | [ASSUMPTION] |
| Overlay reconnect after browser refresh | <= 3 s to current snapshot | Fix snapshot/reconnect. | [ASSUMPTION] |
| OBS reconnect recovery | <= 10 s after OBS websocket restored | Keep OBS manual. | [ASSUMPTION] |
| Gameplay impact from production failure | 0 blocked gameplay actions | Stop implementation; architecture violation. | [VERIFIED:USER] |
| Leakage tolerance | 0 leaks | Stop rehearsal; incident review. | [INFERENCE] |

## 3. Required scenario matrix

| Scenario | Setup | Expected result | Automated proof | Manual proof | Pass/fail |
| --- | --- | --- | --- | --- | --- |
| Correct answer | Simulated `ANSWER_CORRECT`. | Phil factual line, captions, lower-third; no hidden fields. | Contract + template tests. | OBS lower-third check. | Pass only with no leaks. |
| Wrong answer | Simulated `ANSWER_WRONG`. | No answer reveal unless game state has revealed it; safe fallback line. | Contract test. | Producer review. | Pass if no hidden answer. |
| Fast response | `ANSWER_CORRECT` with response speed. | Phil may mention speed only if supplied as verified public fact. | Template test. | Lower-third copy review. | Pass if factual. |
| Lead change | Scoreboard event with new leader. | Lead-change lower-third and optional Phil line. | Sequence test. | OBS check. | Pass if not stale. |
| Streak | Correct answer with streak count. | Streak line uses numeric verified streak only. | Template test. | Producer review. | Pass if tone safe. |
| VIP | `ROUND_PREPARING` with eligible and ineligible simulated players. | Eligible gets private controls; broadcast sees aggregate/ambient only. | Private-field leakage test. | Side-by-side browser check. | Pass if inventory private. |
| Director's Pass | Simulated special eligibility. | Treated as player-private entitlement until public state is explicitly safe. | Contract test. | Producer console check. | Pass if no private inventory. |
| Golden Ticket | Simulated special eligibility. | Same as VIP; no inventory leak. | Contract test. | Producer console check. | Pass if no private inventory. |
| Final Cut | Simulated endgame/power-up. | Only public-safe status shown. | Contract test. | Overlay check. | Pass if no hidden answer. |
| Champion | Final results event. | Champion line after final results only. | State-version test. | OBS check. | Pass if not premature. |
| Duplicates | Replay same event/command ID. | Exactly one visual/audio/OBS effect. | Idempotency test. | OBS duplicate drill. | Pass if no duplicate effect. |
| Expired event | Event arrives after `expiresAt`. | Event rejected or producer-only stale warning. | Expiry test. | Producer console check. | Pass if no broadcast. |
| Out-of-order | Sequence 12 arrives after 13. | Consumer requests snapshot and does not play stale line. | Replay test. | Log inspection. | Pass if snapshot recovery. |
| Missing snapshot | Consumer starts without snapshot. | Standby/degraded state until snapshot available. | Startup test. | Overlay shows standby. | Pass if safe standby. |
| Phil timeout | Compiler/validator exceeds budget. | Skip Phil; lower-third or no-op. | Timeout test. | Producer alert. | Pass if gameplay continues. |
| Invalid line | Template output violates validator. | Rejected; no voice/OBS. | Validator test. | Producer alert. | Pass if no output. |
| Voice failure | Voice adapter error. | Captions/lower-third continue or line skipped; no gameplay impact. | Adapter failure test. | Audio check. | Pass if no overlap/block. |
| Caption mismatch | Captions do not equal validated line. | Reject caption package or mark degraded. | Caption diff test. | Visual check. | Pass if exact text. |
| OBS disconnect | Stop OBS websocket mid-run. | Health down; commands queue/drop safely; manual fallback; gameplay unaffected. | Mock disconnect test. | Real OBS drill. | Pass if recovery <= target. |
| Overlay reconnect | Refresh browser source. | Overlay reloads latest snapshot within target. | Browser reconnect test. | OBS browser source refresh. | Pass if current state. |
| Producer interruption | Cancel before and during Phil line. | Voice stops, overlay hides, audit record written. | Cancel tests. | Button drill. | Pass if thresholds met. |
| Emergency stop | Producer triggers stop all. | Voice muted/stopped, overlay hidden, OBS commands halted, health emergency. | Emergency test. | Full drill. | Pass if complete. |
| Prompt injection | Display name/chat contains hostile instructions. | Sanitizer neutralizes; Phil ignores. | Injection fixture. | Producer review. | Pass if safe text. |
| Hidden-answer leakage | Inject hidden answer in raw event. | Validator rejects broadcast. | Leak test. | Log inspection. | Pass only with zero leaks. |
| Production failure while game continues | Kill voice/OBS/overlay adapters while simulated game emits events. | Gameplay event simulation continues; production health degraded. | Failure harness. | Manual observation. | Pass if no gameplay wait. |

## 4. Rehearsal scripts

### Script A: correct-answer production chain

1. Start simulator with feature flag enabled only in rehearsal.
2. Start mock voice, mock OBS, overlay page, and producer console.
3. Emit one `ANSWER_CORRECT`.
4. Verify event envelope and field classifications.
5. Verify Phil line is deterministic and factual.
6. Verify captions exactly match line.
7. Verify OBS lower-third command ACK.
8. Cancel before line, before voice, mid-voice, and after lower-third in separate runs.
9. Inspect audit log and leakage report.

### Script B: VIP pre-show chain

1. Emit `ROUND_PREPARING`.
2. Generate one eligible and one ineligible simulated player state.
3. Verify eligible private controls are visible only to eligible player.
4. Verify ineligible player sees ambient cinematic only.
5. Lock selection.
6. Trigger Buffster velvet-rope cue.
7. Start clip from game authority event.
8. Inspect logs for private inventory leakage.

### Script C: recovery chain

1. Start Chain A event replay.
2. Stop OBS websocket mid-command.
3. Refresh OBS browser source.
4. Kill voice adapter.
5. Trigger emergency stop.
6. Restore OBS and overlay.
7. Confirm snapshot recovery and no stale Phil line.

## 5. Security rehearsal checklist

- [INFERENCE] Confirm no hidden answers in broadcast-safe payloads.
- [INFERENCE] Confirm no submitted answers in Phil/overlay unless intentionally player-private.
- [INFERENCE] Confirm no emails, auth tokens, refresh tokens, service keys, or private VIP inventory in overlay, OBS commands, captions, Phil facts, or audit sanitized details.
- [INFERENCE] Confirm display handles are sanitized.
- [INFERENCE] Confirm producer commands require producer role.
- [INFERENCE] Confirm non-producer cannot call cancellation or emergency APIs.
- [INFERENCE] Confirm all producer commands write audit records.
- [INFERENCE] Confirm local OBS password is not present in browser source URL or logs.
- [INFERENCE] Confirm AI voice disclosure is documented before real TTS is used.

## 6. Operational rehearsal checklist

- [UNKNOWN] Record Windows version and OBS version.
- [UNKNOWN] Record obs-websocket version and port/auth setting.
- [UNKNOWN] Record audio device map, virtual cable/Voicemeeter config if used.
- [UNKNOWN] Record browser-source URL, width, height, FPS, cache/refresh settings.
- [UNKNOWN] Record TTS vendor/model/voice/format if real TTS is used.
- [UNKNOWN] Record YouTube test stream privacy mode and delay, if used.
- [UNKNOWN] Record rights status of every clip used in rehearsal.
- [UNKNOWN] Record producer names/roles.

## 7. Cost and operations tracking

No prices are asserted here.

| Category | Prototype tracking | Private rehearsal tracking | Public Assisted Mode tracking |
| --- | --- | --- | --- |
| Development machine | CPU/RAM, OS, browser. | Same plus Windows OBS machine. | Dedicated production machine. |
| OBS | Version, scenes, sources. | Rehearsal scene collection backup. | Production scene collection backup. |
| Voice | Mock duration, optional TTS usage counts. | Real TTS request counts/latency if enabled. | Vendor usage and fallback plan. |
| Avatar | Static/simple renderer. | Asset runtime CPU/GPU. | Asset runtime and operator controls. |
| AI inference | Template only unless approved. | TTS only; no free-form LLM by default. | Usage logs and safety filters. |
| Storage | Logs/fixtures. | Recordings and rehearsal logs. | Episode recordings and audit retention. |
| Logging | Local JSON logs. | Centralized or archived logs. | Incident-ready retention. |
| Monitoring | Health endpoint/panel. | Producer dashboard. | Alerting owner and escalation. |
| Streaming bandwidth | None or local. | Private/unlisted test stream. | Public stream encoder and platform. |
| Recording | Optional local capture. | Required rehearsal recording. | Required episode recording. |

## 8. Red Team rehearsal findings

| Finding | Resolution |
| --- | --- |
| Original scenario list could pass with mock adapters only and still hide OBS/audio issues. | Rehearsal levels now separate mock, real OBS, and private full rehearsal. |
| Latency targets could be presented as verified. | All thresholds are marked [ASSUMPTION] until measured. |
| VIP scenarios could leak private eligibility details. | Matrix requires side-by-side eligible/ineligible checks and private inventory leak tests. |
| Copyright/live-stream failure was not a test scenario. | Operational checklist now records rights status and YouTube privacy/delay when used. |
| Emergency stop needed measurable acceptance criteria. | Added cancel/overlay/OBS recovery thresholds and emergency script. |

## 9. Go/no-go for first public Assisted Mode episode

Do not proceed unless:

- L0 through L3 are complete.
- Riskiest-assumption proof passes or real TTS is disabled.
- OBS disconnect/reconnect rehearsal passes.
- Emergency stop rehearsal passes.
- Zero leakage findings in logs and recordings.
- Rights status is cleared for all public clips.
- Producer roles and manual override hierarchy are documented.
- Gameplay remains unaffected by production adapter failures.
