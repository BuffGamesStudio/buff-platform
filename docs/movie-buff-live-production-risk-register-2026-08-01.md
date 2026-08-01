# Movie Buff live-production risk register

Date accessed: 2026-08-01  
Status: pre-implementation risk register. No production actions taken.

Classification convention: explicit facts and assumptions are tagged inline or in the evidence column. Section titles and table labels are organizational text. Untagged mitigations, owners, statuses, and failure-containment guidance are [INFERENCE] until implementation assigns real owners and evidence.

## 1. Single riskiest technical assumption

### Assumption

[ASSUMPTION] A local Assisted Mode runtime can turn a verified `ANSWER_CORRECT` event into a cancellable Phil voice/caption/lower-third/OBS sequence fast enough and reliably enough for a live show while gameplay continues independently.

### Why this is riskiest

- [EXTERNAL] TTS streaming exists, but real latency and cancel behavior depend on vendor, network, audio output, and local adapter implementation.
- [EXTERNAL] OBS control is a stateful local WebSocket workflow; Vercel/Next functions are bounded and not suitable as the durable controller.
- [UNKNOWN] The Windows audio-routing environment is not present in this Linux VM.
- [INFERENCE] If cancellation, audio overlap, or OBS ACK behavior is weak, the prototype can embarrass the broadcast even if gameplay is healthy.

### Systems affected

- Phil line compiler
- Voice adapter
- Caption timing
- OBS adapter
- Browser-source overlay
- Producer console
- Local Windows audio routing
- Audit logging

### Potential failure

[INFERENCE] A correct-answer event triggers a stale or overlapping Phil line after the game has moved on; producer cancel does not stop speech or lower-third; OBS does not acknowledge or duplicates commands; broadcast sees incorrect/stale commentary while gameplay continues.

### Smallest realistic proof

Run a local Windows rehearsal harness with mock and one real streaming voice adapter:

1. Emit 50 simulated `ANSWER_CORRECT` events at realistic and burst intervals.
2. For each event, compile a deterministic Phil line and caption.
3. Send lower-third command through mock OBS, then real obs-websocket to a rehearsal scene.
4. Cancel at five cut points: before Phil compile, after compile, before voice first byte, mid-speech, after lower-third display.
5. Disconnect OBS mid-run and reconnect from snapshot.
6. Record timestamps for event received, validation complete, Phil line ready, first audio byte, caption visible, OBS ACK, cancel requested, cancel effective.

### Required pass/fail evidence

Pass only if all are true:

- P95 event-to-validated-Phil-line <= 250 ms in simulator.
- P95 event-to-caption-visible <= 750 ms with mock voice.
- P95 event-to-first-audio <= 1500 ms with real streaming TTS, or real TTS remains disabled.
- Producer cancel-to-audio-stop <= 500 ms for mock and <= 750 ms for real adapter.
- Producer cancel-to-overlay-hide <= 500 ms.
- Duplicate `obs.command.v1.commandId` produces exactly one OBS effect.
- OBS disconnect causes health `degraded/down`, no gameplay interruption, and snapshot recovery after reconnect.
- Rehearsal logs contain zero hidden answers, emails, auth tokens, private VIP inventory, fraud signals, or raw service secrets.

Do not recommend broad live-production implementation until this proof is defined and executed.

## 2. Risk register

| ID | Risk | Likelihood | Impact | Evidence | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Hidden answer leaks into Phil/overlay before reveal. | Medium | Critical | Existing game has correct-title/results fields; raw analytics payloads are not broadcast contracts. [VERIFIED:LOCAL] | Broadcast-safe projection, schema reject list, tests injecting hidden answer. | Architecture | Open |
| R2 | Raw player auth IDs or emails leak. | Medium | High | Supabase auth/admin code has real user IDs; contracts can avoid them. [VERIFIED:LOCAL] | Episode-local `shortPlayerRef`; field-classification tests. | Security | Open |
| R3 | VIP private inventory leaks to ineligible players or broadcast. | Medium | High | VIP is not implemented as a live contract; user request requires private controls. [VERIFIED:USER]+[UNKNOWN] | Player-private entitlement messages only; aggregate counts for broadcast. | Security | Open |
| R4 | Prompt injection through display names/chat. | High | High | Display names are user-controlled profile data. [INFERENCE] | Sanitized identity; template-only Phil MVP; no raw chat in Phil. | Phil | Open |
| R5 | Host hallucination or unsupported commentary. | Medium | High | Generative host not required for MVP. [INFERENCE] | Prepared factual templates; validation; producer approval in Assisted Mode. | Phil | Open |
| R6 | Stale Phil line after state advances. | Medium | Medium | WebSocket/Realtime can reconnect and lag. [EXTERNAL]+[INFERENCE] | `expiresAt`, `stateVersion`, cancel token, snapshot check before play. | Runtime | Open |
| R7 | Duplicate events cause duplicate OBS/voice output. | Medium | Medium | Existing analytics can be client-queued; WebSocket reconnects can replay. [VERIFIED:LOCAL]+[INFERENCE] | Idempotency key and adapter dedupe. | Runtime | Open |
| R8 | Out-of-order events produce wrong lower-third. | Medium | Medium | Realtime/WebSocket delivery is not a business-order guarantee. [INFERENCE] | Monotonic sequence and snapshot reconciliation. | Runtime | Open |
| R9 | Missing snapshot prevents recovery. | Medium | High | Existing gameplay state can be loaded, but production snapshot absent. [VERIFIED:LOCAL] | Snapshot contract before consumers. | Architecture | Open |
| R10 | Supabase Realtime channel auth is too complex/slow. | Medium | Medium | Supabase docs warn RLS complexity can affect connection latency/join rates. [EXTERNAL] | Simple policies; short JWT; load tests. | Backend | Open |
| R11 | Vercel function used as persistent daemon times out. | High | High | Vercel function max duration limits. [EXTERNAL] | Local companion process for OBS/voice; Next only UI/API. | Runtime | Open |
| R12 | OBS websocket disconnect mid-show. | Medium | High | OBS local WebSocket has connection lifecycle. [EXTERNAL] | Health heartbeat, reconnect, manual OBS fallback. | Broadcast | Open |
| R13 | OBS scene/source names drift from adapter config. | Medium | Medium | OBS scenes are manually configured. [EXTERNAL]+[INFERENCE] | Preflight scene inventory validation. | Broadcast | Open |
| R14 | Browser-source cache shows stale overlay. | Medium | Medium | OBS browser source has cache/refresh controls. [EXTERNAL] | Versioned overlay assets, health/version display, refresh drill. | Overlay | Open |
| R15 | Browser source exposes secrets in URL. | Medium | High | Browser URLs can be inspected/logged. [INFERENCE] | No static secrets; short-lived overlay token; no service keys. | Security | Open |
| R16 | Voice latency too high for live reactions. | High | High | TTS streaming is documented but unmeasured locally. [EXTERNAL]+[UNKNOWN] | Mock-first; latency proof; disable real TTS if thresholds fail. | Voice | Open |
| R17 | Mid-speech cancellation fails. | Medium | High | No existing voice adapter. [VERIFIED:LOCAL] | Adapter cancel contract and proof gate. | Voice | Open |
| R18 | Audio overlap between Phil, clip, and OBS. | Medium | High | Windows routing not locally verified. [UNKNOWN] | Single mixer owner; ducking rules; Windows rehearsal. | Broadcast | Open |
| R19 | Captions mismatch voice. | Medium | Medium | Captions can be generated from line but timing depends on voice. [INFERENCE] | Use validated line text; adjust cue timing from audio duration. | Captions | Open |
| R20 | Lip-sync scope delays prototype. | High | Medium | No avatar runtime exists. [VERIFIED:LOCAL] | Static/simple avatar MVP; lip-sync deferred. | Avatar | Open |
| R21 | Buffster accidentally becomes host. | Low | Medium | Locked canon says Buffster mascot only. [VERIFIED:USER] | Buffster cue contract only; no host lines. | Creative/Architecture | Open |
| R22 | Producer auth too broad if reusing admin role. | Medium | High | Existing `admin` role is broad CMS/admin. [VERIFIED:LOCAL] | Separate producer roles and audit log. | Security | Open |
| R23 | Producer command not audited. | Medium | High | No production audit log exists. [VERIFIED:LOCAL] | Append-only audit contract and required reason codes. | Security | Open |
| R24 | Emergency stop incomplete. | Medium | Critical | Multiple adapters can be active. [INFERENCE] | Hierarchical emergency stop: voice -> overlay -> OBS -> event publication. | Producer | Open |
| R25 | Live-production failure blocks gameplay. | Low if designed correctly | Critical | Requirement says gameplay must continue; existing analytics queue fails open. [VERIFIED:USER]+[VERIFIED:LOCAL] | Downstream-only event tee; no awaits in gameplay path. | Architecture | Open |
| R26 | YouTube live stream interrupted for clips. | Medium | Critical | YouTube scans live streams for third-party content and can interrupt/terminate. [EXTERNAL] | Rights-cleared/public-domain proof; legal go/no-go. | Legal/Producer | Open |
| R27 | Licensed clip still interrupted without allowlist. | Medium | High | YouTube docs warn licensed content can still be interrupted without allowlist. [EXTERNAL] | Channel allowlisting where applicable; private rehearsal. | Legal/Producer | Open |
| R28 | Broadcast delay conflicts with game state. | Medium | Medium | YouTube docs discuss broadcast delay tradeoffs. [EXTERNAL] | Treat broadcast as downstream; do not let chat/broadcast delay drive gameplay. | Producer | Open |
| R29 | Rehearsal does not cover real public load. | Medium | Medium | Prototype is limited. [INFERENCE] | Separate technical prototype, private rehearsal, public Assisted Mode gates. | QA | Open |
| R30 | Cost surprises from voice/avatar/streaming/logging. | Medium | Medium | Pricing not audited; user forbids invented vendor pricing. [UNKNOWN] | Track categories only until vendor/pricing selected. | Ops | Open |
| R31 | Service keys leak through logs. | Low/Medium | Critical | Supabase secret/service_role bypasses RLS. [EXTERNAL] | Secret scrubbing; never log keys; hash identifiers only. | Security | Open |
| R32 | Local Windows machine not reproducible. | Medium | Medium | Linux VM cannot verify Windows setup. [UNKNOWN] | Record machine spec, OBS version, audio device map, startup checklist. | Ops | Open |
| R33 | Supabase policy cache leaves revoked producer active until JWT update/expiry. | Medium | High | Realtime authorization docs say policy cache updates on connect/JWT update. [EXTERNAL] | Short JWT, explicit disconnect/revoke workflow, server-side command auth. | Security | Open |
| R34 | Browser/WebSocket unbounded buffer during event bursts. | Medium | Medium | MDN notes stable WebSocket lacks backpressure. [EXTERNAL] | Bounded queues, drop stale visual events, snapshot catch-up. | Runtime | Open |
| R35 | Clip-rights metadata in repo is insufficient for public episode. | Medium | Critical | YouTube says public-domain verification is uploader responsibility. [EXTERNAL] | Separate rights audit before public stream. | Legal/Content | Open |

## 3. Failure-containment model

- [INFERENCE] Gameplay path emits or tees events and never awaits live-production success.
- [INFERENCE] Live-production feature flag defaults off.
- [INFERENCE] Every consumer has a local disable state: Phil off, voice off, captions off, overlay hidden, OBS manual, Buffster skipped.
- [INFERENCE] Emergency stop is producer-only and records an audit log.
- [INFERENCE] Adapter failures emit health status and stop new commands until recovery.

## 4. Red Team risk review

| Finding | Material? | Resolution |
| --- | --- | --- |
| Voice latency was initially one risk among many but is actually the riskiest cross-system assumption. | Yes | Elevated to the single proof gate. |
| Rights and YouTube live interruption are non-technical but can block public episode. | Yes | Added as critical risks R26, R27, R35. |
| Producer authorization cannot safely reuse current admin role without refinement. | Yes | Added R22 and separate role requirement. |
| Snapshot/replay was missing as a first-class recovery risk. | Yes | Added R9 and required snapshot in contracts. |
| Cost section could imply vendor pricing. | Yes | Limited to categories; no prices. |
