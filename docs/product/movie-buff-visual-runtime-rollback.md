# MOV-18 visual runtime rollback and containment packet

Status: review-only. No rollback, merge, deployment, hosted mutation, or production action is authorized by this document.

## Scope and authority

MOV-18 owns presentation-only runtime code, static fallbacks, visual components, the isolated preview route, its test/evidence workflow, and the exact Rive dependency pair.

MOV-18 does **not** own:

- room or match admission;
- authoritative phase or navigation state;
- selector rotation or tile mutation;
- playback timestamps;
- VIP rules;
- scoring, leave penalties, Buster behavior, or reconnect decisions;
- Supabase schema, grants, policies, rows, or hosted configuration.

No database rollback exists or is required for this lane because MOV-18 changes no database object or hosted state.

## Automatic runtime containment

The first containment layer is already in the code path:

1. `MovieBuffRiveSurface` performs a read-only `HEAD` check for the configured public `.riv` file.
2. Missing or inaccessible assets render `MovieBuffStaticFallback`.
3. `prefers-reduced-motion: reduce` renders the static fallback.
4. A Rive renderer load error renders the static fallback.
5. Reconnect state and expired transitions are derived from MOV-17-owned server inputs and do not replay as participation gates.
6. No visual completion or state-machine callback can advance gameplay.

Therefore a missing asset, unsupported WebGL2 context, or Rive initialization failure must degrade presentation without pausing, advancing, or mutating the shared match.

## Stop and containment triggers

Classify MOV-18 as `CHANGES_REQUESTED` and keep PR #8 draft if any of these occur:

- package and lock files are not synchronized;
- the lock diff contains any non-Rive dependency or unrelated metadata change;
- TypeScript, focused tests, or the localhost-only production build fails;
- a visual component imports Supabase, calls a Movie Buff gameplay API, or owns navigation;
- a Rive state-machine input or animation callback can mutate authoritative state;
- missing assets prevent static content from rendering;
- reduced-motion mode changes a server deadline or phase;
- production `.riv` artboard or state-machine names are guessed rather than supplied and verified;
- MOV-17 integration requires MOV-18 to own phase progression.

Containment action before merge: leave PR #8 open as draft and do not integrate it.

Containment action after a future authorized integration: disable or remove only the MOV-18 visual mounting points while preserving the underlying MOV-17 gameplay view and static content. Do not alter server state to compensate for a visual defect.

## Repository rollback units

### Unit A — live Rive adapter

Files:

- `src/components/movie-buff/visual/MovieBuffRiveCanvas.tsx`
- `src/components/movie-buff/visual/MovieBuffRiveSurface.tsx`
- Rive mounting changes in `MovieBuffTransitionSurface.tsx`
- Rive mounting changes in `MovieBuffBusterReplacement.tsx`
- related exports and focused tests

Safe rollback result: retain static transition, Buster, used-tile, reconnect, and menu presentation while removing the live canvas mount. MOV-17 authority remains unchanged.

### Unit B — dependency pair

Files:

- `package.json`
- `package-lock.json`

These files are one atomic rollback unit. Remove `@rive-app/react-webgl2` from the manifest and remove exactly these lock entries together:

- root dependency `@rive-app/react-webgl2`;
- `node_modules/@rive-app/react-webgl2`;
- `node_modules/@rive-app/webgl2`.

Do not edit, upgrade, downgrade, or normalize any unrelated lock entry during rollback.

### Unit C — isolated proof and evidence

Files:

- `/games/movie-buff/visual-runtime-preview` route;
- MOV-18 workflow;
- MOV-18 evidence and runtime-contract documents.

This unit is not part of gameplay routing. Removing it must not alter a match.

## Reversion procedure after future authorization

Use a normal revert commit against the exact integration commit or squash SHA that introduced MOV-18. Do not force-push or rewrite shared history.

Before applying a revert, capture:

- repository and target branch;
- current immutable HEAD;
- exact MOV-18 integration commit or PR merge SHA;
- operator identity and timestamp;
- reason and stop trigger;
- current package/lock hashes;
- current workflow and Vercel status.

After the revert, require:

- `git diff --check`;
- package/lock synchronization check;
- focused Movie Buff static-fallback tests;
- TypeScript;
- production build with approved non-hosted build configuration;
- proof that MOV-17 phase/navigation behavior is unchanged;
- proof that no Supabase migration or hosted action occurred.

## Roll-forward alternative

Prefer a roll-forward when the defect is limited to a production `.riv` file, artboard name, state-machine name, layout, or decorative behavior and the static fallback remains safe. A roll-forward must remain presentation-only and must pass MOV-19 independent review.

## Evidence classification

Current rollback readiness is **DESIGNED / NOT REHEARSED**.

The automatic static fallback path is covered by static contract tests and TypeScript/build evidence. An actual browser-level WebGL failure, reduced-motion walkthrough, production asset failure, and repository revert rehearsal remain UNKNOWN.
