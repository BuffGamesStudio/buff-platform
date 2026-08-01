# Movie Buff live-production event contracts v1

Date accessed: 2026-08-01  
Status: draft contracts for future implementation. No schema, migration, or application code has been changed.

Classification convention: field-level rows are classified by the `Classification` column. Section titles and table labels are organizational text. Untagged contract rules are [INFERENCE] unless they restate locked user requirements.

## 1. Classification legend

| Classification | Meaning |
| --- | --- |
| public | Safe to show to all players and viewers. |
| broadcast | Safe for OBS, Phil, public overlays, stream output, and recordings. |
| contestant-only | Safe for authenticated players in the current room/episode. |
| player-private | Safe only for one authenticated player. |
| producer-only | Safe only for authorized production staff. |
| system-only | Internal service/adapter field; not shown to players or broadcast. |

Never allowed in broadcast-safe contracts: [VERIFIED:USER]+[INFERENCE] hidden answers before game-authoritative public reveal, player-private answer results, auth data, emails, private VIP inventory or per-player entitlement tier, fraud signals, service keys, refresh tokens, raw access tokens, full unnecessary internal IDs, unsanitized chat, unsanitized display names, raw analytics payloads, producer-only debug data, or system-only adapter state.

Publication target rule: [INFERENCE] every outbound payload must be stripped to the maximum classification allowed for that target before it leaves the server/adapter boundary. OBS browser-source overlays receive only `broadcast` fields plus non-sensitive presentation routing required to render the overlay; producer consoles may receive `producer-only` fields after producer authorization; player clients may receive only their own `player-private` messages.

## 2. Shared primitives

### `broadcastSafePlayerIdentity.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `displayHandle` | string | broadcast | Sanitized, length-limited, profanity/content-filtered. |
| `shortPlayerRef` | string | broadcast | Non-stable episode-local reference, not auth UUID. |
| `avatarColor` | string enum | broadcast | Derived safe visual token. |
| `isAnonymous` | boolean | producer-only | Producer may need context; not broadcast by default. |
| `playerId` | string | system-only | Real auth/player UUID; forbidden in broadcast payloads. |

### `sequenceRef.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `episodeId` | string | system-only | Internal episode UUID or slug. |
| `publicEpisodeCode` | string | public | Safe human-readable episode code. |
| `stateVersion` | integer | system-only | Monotonic snapshot/event version. |
| `sequence` | integer | system-only | Monotonic event sequence. |
| `idempotencyKey` | string | system-only | Required for dedupe. |
| `occurredAt` | ISO timestamp | producer-only | May be shown in producer console. |
| `expiresAt` | ISO timestamp | system-only | Prevent stale commentary. |

## 3. Production event envelope

### `production.event.envelope.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `production.event.envelope.v1`. |
| `eventId` | string | system-only | Globally unique. |
| `eventType` | string | system-only | Versioned event type. |
| `source` | enum | system-only | `simulator`, `game-server`, `producer-console`, `adapter`. |
| `sequenceRef` | `sequenceRef.v1` | mixed | See primitive. |
| `roomRef` | object | contestant-only | Contains safe room labels only for player views. |
| `payload` | object | mixed | Must be a known contract. |
| `classification` | object | system-only | Machine-readable field classification map. |
| `signature` | string | system-only | Optional future event auth signature. |
| `validation` | object | producer-only | Validation result and sanitizer version. |

Validation rules: [INFERENCE]

- Unknown `eventType` rejects.
- Unknown payload fields reject by default.
- `expiresAt` must be present for Phil/OBS-facing events.
- `idempotencyKey` required for all commands and cue-triggering events.
- Payload must pass field classification scan before publication.
- `classification` must be enforced per target; schema-valid mixed payloads are not publishable until non-target fields are stripped.
- Answer title fields require `publicRevealState=public_revealed` or `results_revealed` from game authority, not merely a per-player submit result.

## 4. Episode-state snapshot

### `episode.state.snapshot.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `episode.state.snapshot.v1`. |
| `sequenceRef` | `sequenceRef.v1` | mixed | Latest version and sequence. |
| `phase` | enum | broadcast | `standby`, `round_preparing`, `vip_preshow`, `clip_ready`, `clip_live`, `results`, `intermission`, `emergency_stop`. |
| `publicRoomLabel` | string | broadcast | No raw room UUID required. |
| `roundNumber` | integer | broadcast | Safe. |
| `totalRounds` | integer | broadcast | Safe. |
| `publicCountdownMs` | integer | broadcast | Safe if not revealing hidden answer timing. |
| `clipState` | enum | broadcast | `preparing`, `ready`, `playing`, `failed`, `hidden`. |
| `categoryLabel` | string | broadcast | Safe category display. |
| `difficultyLabel` | string | broadcast | Safe public label. |
| `leaderboard` | array | broadcast | Broadcast-safe identities and scores only. |
| `eligibleVipCount` | integer | broadcast | Aggregate only. |
| `producerAlerts` | array | producer-only | Health and override notes. |
| `adapterHealth` | object | producer-only | Summary only; no secrets. |
| `privatePlayerStates` | map | player-private | Never sent to broadcast/OBS. |
| `hiddenAnswerState` | object | system-only | Forbidden from broadcast. |

## 5. Broadcast-safe game events

### `movie_buff.answer_correct.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `movie_buff.answer_correct.v1`. |
| `player` | `broadcastSafePlayerIdentity.v1` | broadcast | Sanitized identity only. |
| `scoreDelta` | integer | broadcast | Safe after scoring. |
| `newScore` | integer | broadcast | Safe if scoreboard public. |
| `streakCount` | integer | broadcast | Safe. |
| `roundNumber` | integer | broadcast | Safe. |
| `movieTitle` | string | broadcast | Optional. Must be omitted until game authority marks the round/title as publicly revealed for all affected viewers/players. A per-player `correctTitle` returned after submit is not enough. |
| `publicRevealState` | enum | system-only | `private_submit`, `public_revealed`, `results_revealed`. Must be `public_revealed` or `results_revealed` before `movieTitle` enters broadcast. |
| `submittedAnswer` | string | player-private | Never in broadcast. |
| `correctTitlePrivate` | string | player-private | Existing per-player submit feedback may expose this to the submitting player only; forbidden from broadcast. |
| `correctAnswerHidden` | string | system-only | Forbidden before public reveal; generally unnecessary after reveal. |
| `rawAnswerId` | string | system-only | Internal only. |

### `movie_buff.round_preparing.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `movie_buff.round_preparing.v1`. |
| `roundNumber` | integer | broadcast | Safe. |
| `totalRounds` | integer | broadcast | Safe. |
| `categoryLabel` | string | broadcast | Safe. |
| `difficultyLabel` | string | broadcast | Safe. |
| `vipWindowOpensAt` | ISO timestamp | contestant-only | Not needed on public broadcast. |
| `publicPreshowStartsAt` | ISO timestamp | broadcast | Safe. |
| `clipPreflightStatus` | enum | producer-only | `unknown`, `warming`, `ready`, `failed`. |
| `hiddenClipId` | string | system-only | Forbidden from broadcast. |
| `hiddenAnswer` | string | system-only | Forbidden. |

### `vip.eligibility.simulation.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | Simulation-only until real entitlements exist. |
| `playerRef` | string | player-private | Private target. |
| `eligible` | boolean | player-private | Private. |
| `privateEligibilityTier` | enum | player-private | Optional per-player tier; never broadcast or keyed to public identity. |
| `privateControls` | array | player-private | Control names only for eligible player. |
| `privateInventory` | object | player-private | Never broadcast. |
| `reasonCode` | string | producer-only | Producer diagnostics. |

## 6. Phil host cue

### `phil.host_cue.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `phil.host_cue.v1`. |
| `cueId` | string | system-only | Unique cue ID. |
| `triggerEventId` | string | system-only | Source event ID. |
| `cueType` | enum | producer-only | `opening`, `answer_correct`, `round_preparing`, `streak`, `lead_change`, `fallback`. |
| `facts` | object | producer-only | Minimum verified facts only. |
| `allowedTone` | enum | producer-only | Canon-locked Phil tone range. |
| `lineTemplateId` | string | system-only | Template reference. |
| `maxDurationMs` | integer | producer-only | Timing budget. |
| `cancelToken` | string | system-only | Adapter cancellation. |
| `producerApprovalRequired` | boolean | producer-only | Assisted Mode default true for risky lines. |

Phil cue facts must not include raw chat, submitted answer text, per-player `correctTitle`, emails, auth IDs, hidden future answers, private VIP inventory/tier/eligibility, or fraud signals.

## 7. Validated Phil output

### `phil.validated_output.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `phil.validated_output.v1`. |
| `cueId` | string | system-only | Links to cue. |
| `lineText` | string | broadcast | Final sanitized line. |
| `captionText` | string | broadcast | Usually equal to line text. |
| `estimatedDurationMs` | integer | producer-only | Timing estimate. |
| `validationStatus` | enum | producer-only | `approved`, `rejected`, `requires_producer_review`. |
| `validationReasons` | array | producer-only | Validator notes. |
| `voiceDisclosureRequired` | boolean | producer-only | Required for real AI TTS. |
| `expiresAt` | ISO timestamp | system-only | Stale line guard. |

## 8. Buffster cue

### `buffster.cue.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `buffster.cue.v1`. |
| `cueId` | string | system-only | Unique cue. |
| `cueType` | enum | broadcast | `velvet_rope`, `celebrate`, `standby`, `skip`. |
| `triggerEventId` | string | system-only | Source event. |
| `assetKey` | string | broadcast | Safe asset reference, not file-system path if sensitive. |
| `durationMs` | integer | broadcast | Safe. |
| `eligibleAudienceMode` | enum | producer-only | `broadcast_all`, `contestant_private`, `producer_only`. |
| `privatePlayerRefs` | array | player-private | Never broadcast. |

## 9. OBS command

### `obs.command.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `obs.command.v1`. |
| `commandId` | string | system-only | Idempotency key. |
| `adapterId` | string | system-only | Local adapter identity. |
| `requestType` | string | producer-only | obs-websocket request type. |
| `sceneName` | string | producer-only | May reveal production layout; not public. |
| `sourceName` | string | producer-only | May reveal production layout; not public. |
| `overlayPayload` | object | broadcast | Only broadcast-safe text/visual fields. |
| `timeoutMs` | integer | system-only | Command timeout. |
| `requiresAck` | boolean | system-only | True for scene/source changes. |
| `dedupeWindowMs` | integer | system-only | Duplicate suppression window. |

### `obs.command_ack.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `obs.command_ack.v1`. |
| `commandId` | string | system-only | Links to command. |
| `status` | enum | producer-only | `ack`, `duplicate_noop`, `timeout`, `failed`, `cancelled`. |
| `obsRequestId` | string | system-only | obs-websocket request ID. |
| `errorCode` | string | producer-only | No secrets. |
| `observedAt` | ISO timestamp | producer-only | For audit. |

## 10. Overlay update

### `overlay.update.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `overlay.update.v1`. |
| `overlayId` | string | system-only | Overlay instance. |
| `stateVersion` | integer | system-only | Snapshot version. |
| `mode` | enum | broadcast | `standby`, `lower_third`, `caption`, `vip_preshow`, `buffster`, `emergency_hidden`. |
| `headline` | string | broadcast | Sanitized. |
| `body` | string | broadcast | Sanitized. |
| `captionCues` | array | broadcast | Timed text. |
| `visualAssetKey` | string | broadcast | Safe asset key. |
| `ttlMs` | integer | system-only | Stale update guard. |
| `debugHealth` | object | producer-only | Producer console only. Never sent to OBS browser-source overlays or public recordings. |

## 11. Producer command

### `producer.command.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `producer.command.v1`. |
| `commandId` | string | system-only | Idempotency. |
| `producerUserId` | string | system-only | Auth user ID; not broadcast. |
| `producerDisplayName` | string | producer-only | For audit UI. |
| `role` | enum | producer-only | `producer`, `technical_director`, `emergency_operator`, `observer`. |
| `action` | enum | producer-only | `approve`, `cancel`, `mute_voice`, `hide_overlay`, `skip_buffster`, `emergency_stop`, `resume`. |
| `targetType` | enum | producer-only | `phil_cue`, `voice`, `obs_command`, `overlay`, `all`. |
| `targetId` | string | system-only | Internal. |
| `reasonCode` | string | producer-only | Required for emergency stop. |
| `createdAt` | ISO timestamp | producer-only | Audit. |

## 12. Health status

### `production.health_status.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `production.health_status.v1`. |
| `component` | enum | producer-only | `event_bus`, `validator`, `phil`, `voice`, `caption`, `obs`, `overlay`, `avatar`, `buffster`, `producer_console`. |
| `status` | enum | producer-only | `ok`, `degraded`, `down`, `disabled`, `unknown`. |
| `lastHeartbeatAt` | ISO timestamp | producer-only | Safe for producer. |
| `latencyMs` | integer | producer-only | Safe. |
| `errorSummary` | string | producer-only | Sanitized, no secrets. |
| `publicFallbackMode` | enum | broadcast | `none`, `standby`, `caption_only`, `overlay_hidden`. |
| `rawError` | object | system-only | Stored only with secret scrubbing. |

## 13. Audit-log record

### `production.audit_log_record.v1`

| Field | Type | Classification | Notes |
| --- | --- | --- | --- |
| `schema` | literal | system-only | `production.audit_log_record.v1`. |
| `auditId` | string | system-only | Unique. |
| `actorType` | enum | producer-only | `system`, `producer`, `adapter`, `simulator`. |
| `actorId` | string | system-only | Internal identity. |
| `action` | string | producer-only | Sanitized action name. |
| `targetId` | string | system-only | Internal target. |
| `eventId` | string | system-only | Linked event. |
| `commandId` | string | system-only | Linked command. |
| `status` | enum | producer-only | `accepted`, `rejected`, `ack`, `failed`, `cancelled`. |
| `classificationSummary` | object | producer-only | Counts by field classification. |
| `sanitizedDetails` | object | producer-only | No secrets/private answers. |
| `createdAt` | ISO timestamp | producer-only | Audit time. |
| `retentionClass` | enum | system-only | `short`, `episode`, `incident`. |

## 14. Example safe Chain A payload

```json
{
  "schema": "production.event.envelope.v1",
  "eventId": "evt_demo_001",
  "eventType": "movie_buff.answer_correct.v1",
  "source": "simulator",
  "sequenceRef": {
    "publicEpisodeCode": "MB-REHEARSAL-01",
    "stateVersion": 12,
    "sequence": 44,
    "idempotencyKey": "answer-correct-demo-001",
    "occurredAt": "2026-08-01T00:00:00.000Z",
    "expiresAt": "2026-08-01T00:00:07.000Z"
  },
  "payload": {
    "schema": "movie_buff.answer_correct.v1",
    "player": {
      "displayHandle": "Contestant 7",
      "shortPlayerRef": "P7",
      "avatarColor": "red"
    },
    "scoreDelta": 500,
    "newScore": 2400,
    "streakCount": 3,
    "roundNumber": 4,
    "movieTitle": "The General",
    "publicRevealState": "results_revealed"
  }
}
```

This example is safe only because it represents a post-results/public-reveal event. A live per-player submit event must omit `movieTitle` and use `publicRevealState: "private_submit"`.

## 15. Red Team contract checks

- [RESOLVED] Raw analytics payloads are not accepted as broadcast contracts.
- [RESOLVED] Real auth UUIDs exist only as `system-only`.
- [RESOLVED] VIP inventory is only `player-private`.
- [RESOLVED] Hidden answer fields are explicitly forbidden from broadcast-safe contracts.
- [RESOLVED] Producer commands and OBS commands require idempotency keys.
- [RESOLVED] Health/audit records separate sanitized summaries from raw internal errors.
- [RESOLVED] Per-player `correctTitle` submit feedback is not treated as public reveal.
- [RESOLVED] Per-player VIP eligibility/tier fields are player-private; broadcast receives aggregate counts only through snapshots.
- [RESOLVED] OBS browser-source overlays do not receive producer-only debug fields or system-only adapter payloads.
