# Movie Buff independent GO/NO-GO — v1

Captured: 2026-08-04

Reviewer lane: MOV-19

Repository: `BuffGamesStudio/buff-platform`

Integration target: `integration/movie-buff`

Integration SHA reviewed: `bf316a15a2120e32d8a32e479df2ae439081f9a1`

## Verdict

**NO-GO**

This verdict is fail-closed. UNKNOWN evidence is not treated as PASS.

## Confirmed failures

### Public matchmaking

- Public readiness and match start currently permit two active ready players rather than the required strict three.
- Public capacity remains caller-controlled over a broad range.
- Compatibility values are not fully normalized into one durable canonical server key.
- Compatible candidate selection uses `FOR UPDATE SKIP LOCKED`.
- No durable uniqueness boundary prevents duplicate compatible waiting rooms.
- No repeated executable three-client race evidence exists for an exact lane SHA.

Owner: MOV-15.

### VIP authority PR #6

PR #6 HEAD reviewed: `3683c1ec2b70b8fabc85d70b77242e794b505c7e`.

Changes are requested because:

- concurrent first-time identical window-open calls can race into a unique violation rather than return one authoritative window;
- concurrent identical lock calls can race into a unique violation rather than return the same lock;
- the required-player snapshot stores only a count, not authoritative human player identities;
- departure, replacement, reconnect, and system/Buster classification are not fully represented by that count;
- Round Intro routes to the board from VIP `advanceReady` instead of waiting for MOV-17's canonical phase;
- committed pgTAP tests prove object/grant shape but not the required ownership, cross-room, wrong-round, deadline, duplicate, reconnect, privacy, or exactly-once behavior;
- GitHub reports no Actions workflow runs for the reviewed SHA.

Owner: MOV-16. Relay state: CHANGES_REQUESTED.

### Shared phase machine

- Integration still contains manual shared-phase progression controls.
- Board ensure/select/resolve are not integrated behind one transactional server phase boundary.
- Real-room failures can fall back to demo or unavailable UI state rather than fail as divergence.
- Concurrent selection and duplicate resolution are not protected by an authoritative version/phase token with checked affected-row counts.
- Playback timestamps are per-player rather than one shared persisted timestamp.
- Reconnect grace, Buster substitution, selector abandonment, and no-human closure are not proven.

Owner: MOV-17.

### Visual runtime

- No integrated Rive runtime, production `.riv` asset, reduced-motion proof, missing-asset proof, hydration proof, accessibility proof, or authoritative leave-penalty binding exists.
- `@rive-app/react-webgl2` is absent from the integration package manifest and lockfile at this review point.
- Figma write capability was independently probed successfully through a reversible create/remove operation; the displayed seat label alone is not being used as the capability verdict.

Owner: MOV-18.

### Database security

Read-only hosted inspection of project `yfatwreicmiocdxzyznd` confirmed:

- six target public tables with RLS disabled and no policies;
- broad anon and authenticated effective CRUD on those tables;
- broad anon execution on critical Movie Buff RPCs;
- critical definer functions generally using `search_path=public` rather than a safe fixed path;
- `mark_movie_buff_round_media_ready(uuid)` lacking the required active-room-membership check.

Service-role continuity and `postgres` ownership are narrow passes only and do not cure public exposure.

Owner: MOV-19 security validation; remediation must be reconciled with PR #5 and functional call sites.

## Evidence classification

### PASS — narrow only

- `integration/movie-buff` exists.
- All five lane branches exist.
- PR #6 is a draft targeting the integration branch.
- Hosted hardened `join_movie_buff_room(text)` currently has `postgres` ownership, `SECURITY DEFINER`, fixed `search_path=pg_catalog`, anon denied, and authenticated/service-role execution.
- Service-role CRUD continuity exists on the six inspected target tables.
- Figma connected write capability succeeded using a reversible probe.

### FAIL

- Six-table hosted RLS/grant posture.
- Broad anon RPC execution and unsafe definer search paths.
- Strict-three matchmaking rule.
- Integrated server-owned shared phase machine.
- Shared playback timestamp.
- Board mutation race and idempotency proof.
- PR #6 independent acceptance.
- Rollback metadata and tested post-write rollback safety.

### UNKNOWN

- Local lint, TypeScript, production build, pgTAP, route, race, and browser results unless supplied by GitHub Actions or the operator.
- Three-client synchronization for an exact integrated SHA.
- Hosted post-fix behavior for MOV-15 through MOV-18.
- Production application deployed SHA.
- Final Rive asset quality and visual accessibility.
- Rollback safety after new phase or VIP state has been written.

## Required release exit

The verdict cannot become GO until all lane draft PRs are independently reviewed, executable evidence is attached to exact SHAs, security posture is re-probed on the intended target, three clients converge through matchmaking, VIP, board, playback, results, and reconnect, and rollback is proven under explicit operator-authorized staging conditions.

## Safety statement

No merge, deployment, production alias change, destructive reset, paid resource, secret disclosure, or hosted/production Supabase mutation was performed by this review.
