# Movie Buff Release Train 2026-08-06-01

## Status

- train state: `INTAKE FROZEN`
- release state: `NO-GO`
- cutoff: `2026-08-06T21:54:00Z` (`2026-08-06 17:54 EDT`)
- integration branch: `integration/movie-buff`
- integration base SHA: `bf316a15a2120e32d8a32e479df2ae439081f9a1`
- integration base tree: `12f425f4c56fb3f3c66df6f3a6543d7fd8b6ef34`
- intake branch: `release/movie-buff-train-2026-08-06-01-intake`
- immutable RC branch: not yet cut
- immutable RC SHA/tree: `UNKNOWN`

This file freezes release-train inputs. It is not itself a composed release candidate and must not be represented as one.

## Accepted lane inputs at cutoff

| Role | PR | Accepted branch | Accepted full SHA | Known tree | Intake disposition |
|---|---:|---|---|---|---|
| Rich visual reference | #3 | `cursor/movie-buff-origin-main-integration-20260803-155410` | `f692e82a5d524c950011e0300908c9cbec2389cb` | `UNKNOWN` | accepted reference |
| Security-hardening reference | #5 | `automation/movie-buff-security-hardening-packet-20260804` | `91eac0d55abb1a9568017df687e8395771d24780` | `UNKNOWN` | accepted reference |
| MOV-15 matchmaking | #9 | `copilot/MOV-15-public-matchmaking` | `48d44bb156b71060d1b9adcc7a2a3f014cf92060` | `e010c949920f84e5f7aaca9d50ebf39d6ea13309` | accepted source |
| MOV-16 VIP authority | #6 | `copilot/MOV-16-vip-authority` | `1d3b947ca153214028b5ac97a7eea83c382b5c7d` | `94fd19ab499b02663b21880aa5efeec37c93ca9d` | accepted source |
| MOV-17 shared phase | #10 | `copilot/MOV-17-shared-phase-machine` | `9239fcdc731ec05594c75d3ef9961e6cd4d36bbf` | `57a00c385e210717bd705b14d2146908736482fe` | accepted source |
| MOV-18 presentation | #8 | `copilot/MOV-18-visual-motion-runtime` | `a416dd1bf6b372d11abcc0541abd9584443b0672` | `a866c5610d09c45eb1ff3c3422306a46050e9ec7` | accepted source |
| Migration encoding support | #12 | `copilot/MOV-14-migration-encoding` | `d1f7ca58b534cbccd3071743d542f5788c0e9173` | `ea817ad706f4107fc16482cbe6cc40ec6a012ee0` | accepted support source |
| MOV-19 validator ruleset | #7 | `copilot/MOV-19-security-validation` | `e2d14447d7036cf9dc645514c4713bd4d8e42db1` | `UNKNOWN` | accepted validator ruleset v1 |

## Post-cutoff movement

A lane head moving after cutoff does not invalidate this train. It invalidates only claims about that newer lane head.

Observed post-cutoff movement:

- MOV-17 PR #10 advanced to `ffff733d856c8c6dca5a04fdbe84e3a0c5839111` after cutoff. Default disposition: `next-release`. It may enter a successor candidate only through the formal candidate-fix admission gate.

Any later movement on PRs #3, #5, #6, #7, #8, #9, #10, or #12 is automatically `next-release` unless release control and independent MOV-19 explicitly approve it as a release-blocking fix.

## Historical candidate classification

PR #13 at `973b210e391c754bd2f5057ed3ae14dfdf5f5c10` is a historical immutable validation composition only.

Its evidence remains valid solely for its recorded composition:

- MOV-17 input `b1a21651e545df6649b178346198b1e7d836ca0b`;
- migration-support input `bf5e6d6f251f6840d17eed2fc68e0d580295437f`;
- resulting validation SHA `973b210e391c754bd2f5057ed3ae14dfdf5f5c10`.

PR #13 is not the active release candidate for this train and may not borrow evidence for newer lane heads.

## Candidate construction contract

The immutable RC must be cut as a new branch after exact composition of the accepted inputs. The intended name is:

`release/movie-buff-rc-2026-08-06-01`

Before validation begins, the RC record must contain:

- integration base SHA and tree;
- every component PR and accepted full SHA;
- composition order;
- exact conflict resolutions;
- resulting candidate SHA and tree;
- every migration name and SHA-256;
- validator SHA and ruleset version;
- composition-manifest SHA-256.

Once cut, the RC is immutable:

- no direct commits;
- no rebase;
- no force-push;
- no silent conflict resolution;
- no automatic latest-head update;
- no evidence borrowing from successor commits.

## Formal change-admission gate

### Default: defer to next release

- features;
- cleanup;
- refactors;
- documentation improvements;
- noncritical UI changes;
- tests that do not expose a current-candidate defect.

### Candidate amendment may be proposed only for

- a launch-blocking defect proven on the frozen candidate;
- broken validation infrastructure required to assess the frozen candidate;
- security, rollback, data-loss, authorization, or evidence-integrity failure;
- a change explicitly approved by release control and independent MOV-19.

An admitted fix never mutates the existing RC. The current RC is closed as `FAIL` or `NO-GO`, its evidence is preserved, and a separately identified immutable successor is cut.

## Successor rule

`RC-1 -> immutable`

`RC-2 -> immutable successor with approved delta`

`RC-3 -> immutable successor with approved delta`

Each successor must record predecessor SHA/tree, admitted fix SHA, changed files, changed migrations, affected gates, and any byte-identical unaffected gates eligible for evidence reuse.

## Gate-impact matrix

| Change area | Mandatory reruns |
|---|---|
| Migration / RPC / RLS / ACL | database, pgTAP, persona, race, rollback, migration ledger, hosted alignment |
| Shared phase machine | database races, reconnect/expiry, exactly-once behavior, three-client browser synchronization |
| Matchmaking | concurrency, capacity, handoff, queue convergence, browser matchmaking |
| Visual/runtime adapter | build, browser, accessibility, hydration, fallback, visual parity |
| Evidence wrapper only | wrapper self-tests, negative paths, exact-SHA binding, redaction, artifact integrity |
| Documentation only | source review unless acceptance criteria changed |

Anything not proven byte-identical and unaffected remains `UNKNOWN`.

## MOV-19 independence

MOV-19 validates a named RC, not moving lane heads. Its required inputs are:

- candidate SHA;
- candidate tree SHA;
- composition-manifest digest;
- validator SHA and ruleset version;
- required evidence bundle IDs and digests.

A materially changed validator must be versioned and must not silently redefine an active candidate or its acceptance criteria.

## Queue states

New lane commits must be recorded as exactly one of:

- `next-release`;
- `candidate-fix-proposed`;
- `candidate-fix-approved`;
- `candidate-fix-rejected`.

Only one RC may be active at a time.

## Controlling rule

> A lane head moving after candidate cutoff does not invalidate the active release candidate. It invalidates only claims about the newer lane head. The frozen candidate remains the object under review until it passes, fails, or is formally superseded by a separately identified immutable successor.

## Current blockers unchanged

- hosted Supabase security posture remains `FAIL` under the latest validated read-only evidence;
- one exact all-lane composed candidate does not yet exist;
- integrated three-client browser proof remains `UNKNOWN`;
- staging identity remains `UNKNOWN`;
- production target, backup/PITR, rollback authority, operator, observer, maintenance window, and authorization expiry remain incomplete;
- MOV-19 GO has not been issued.

No merge, deployment, hosted mutation, production action, force-push, secret exposure, paid resource, authorization weakening, or ARM request is authorized.
