# Movie Buff independent validation matrix v1

Date: 2026-08-04
Validator lane: MOV-19
Integration target: `integration/movie-buff`
Integration SHA reviewed: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
Release classification: **NO-GO**

This document records independent classifications only. `PASS` requires executable evidence tied to an exact SHA. Static inspection can establish a defect, but cannot establish runtime success.

## Relay matrix

| Lane | Branch | GitHub state | Validation | Relay state | Next safe action |
|---|---|---|---|---|---|
| MOV-15 | `copilot/MOV-15-public-matchmaking` | identical to integration | confirmed pre-fix defects; no implementation evidence | `AGENT_WORKING` | implement strict-three canonical atomic matchmaking on the lane branch and open a draft PR |
| MOV-16 | `copilot/MOV-16-vip-authority` | draft PR #6, reviewed head `3683c1ec2b70b8fabc85d70b77242e794b505c7e` | static blockers; executable evidence UNKNOWN | `CHANGES_REQUESTED` | correct selection/activation semantics and add real persona tests |
| MOV-17 | `copilot/MOV-17-shared-phase-machine` | identical to integration | current integration FAIL; no lane implementation | `AGENT_WORKING` | implement the server-owned phase machine while preserving PR #3 visuals and PR #5 authorization |
| MOV-18 | `copilot/MOV-18-visual-motion-runtime` | identical to integration | dependency and Figma capability preflight complete; runtime evidence UNKNOWN | `AGENT_WORKING` | add lane-owned visual runtime/fallback contracts; shared screens remain Integration Lead allocated |
| MOV-19 | `copilot/MOV-19-security-validation` | validator artifacts in progress | current verdict NO-GO | `AGENT_WORKING` | maintain exact-SHA review, executable evidence schema, and independent lane retests |

## MOV-16 PR #6 static review

Exact head reviewed: `3683c1ec2b70b8fabc85d70b77242e794b505c7e`.

### Blocking defects

1. The private view and lock RPC require `activation_window = 'round_intro'`. A VIP intended for `board_select`, `playback`, `answer`, or `results` therefore cannot be selected during Round Intro.
2. Round Intro redirects on `advanceReady`, which represents the deadline/all-lock condition rather than a canonical phase transition. This can move a client before MOV-17 advances shared state.
3. Activation does not revalidate definition active status/range, inventory expiry, inventory cooldown, or explicit round/match eligibility at activation time.
4. Round and match eligibility are not represented by enforced schema fields or validated rules. The generic `rules` JSON is not interpreted fail-closed.
5. The pgTAP test checks objects and privileges, while the Node test checks pure predicates. The required multi-room, multi-persona RPC and route cases are not executed.
6. The rollback drops every VIP table and is destructive after inventory, locks, or consumption writes.

### Preserved strengths

- no VIP definitions or inventory are seeded;
- bearer-token identity is verified and caller identity is not accepted in request bodies;
- SECURITY DEFINER functions use `search_path = pg_catalog` and schema-qualified objects;
- table reads are not broadly granted to browser roles;
- other players' selections are represented only by aggregate counts;
- consumption uses a unique lock ledger and an atomic quantity decrement.

## Required MOV-16 retest personas

At minimum, the corrected exact SHA must execute tests for two rooms, two members in one room, a nonmember, owned/unowned/exhausted inventory, wrong room, wrong round, cross-player attempts, private-view leakage, identical and contradictory duplicates, deadline immutability, reconnect, temporary disconnect, activation-time expiry/cooldown, exactly-once consumption, hint/timer independence, early all-lock completion, inactive-client deadline completion, and missing-model fail-closed behavior.

## Evidence rules

- Source inspection may classify `FAIL` when a defect is directly present.
- Source inspection alone leaves successful runtime behavior `UNKNOWN`.
- Local output must include command, exit code, exact SHA, target identity, and raw artifact location.
- Hosted proof must include project identity, immutable application/database version evidence, timestamps, personas, and rollback authority.
- No lane may mark itself `ACCEPTED`; MOV-19 and the Integration Lead own acceptance classification.
