# Movie Buff Rive and Blender runtime contract v1

Linear owner: MOV-18

## Authority boundary

Visual and motion code renders authoritative server state. It must never create rooms, choose selectors, lock tiles, start playback, advance phases, apply penalties, consume VIP inventory, or replace failed real-room state with demo state.

MOV-17 owns phase names, timestamps, transition eligibility, selector authority, reconnect recovery, and gameplay mutation. MOV-18 consumes those values as read-only inputs.

## Source-of-truth order

1. Server-owned Movie Buff state and timestamps.
2. Shared Figma file `Movie Buff — Board, Buster & Cinematic Flow`.
3. PR #3 rich board design for the board/play visual baseline.
4. PR #5 authorization and fail-closed constraints.
5. Static fallback when an animation asset or runtime cannot load.

## Runtime allocation

MOV-18 exclusively owns any selected Rive runtime dependency changes on its lane branch:

- `package.json`
- `package-lock.json`

No unrelated dependency updates are allowed. At contract creation, `@rive-app/react-webgl2` is not declared in `package.json`, is not present in the root lock dependency list, and repository code search returns no matching package reference.

## Shared-file allocation

MOV-18 may make visual-only changes in these shared files after recording the exact change in Linear:

- `src/app/games/movie-buff/page.tsx` — landing presentation only.
- `src/app/games/movie-buff/board-preview/page.tsx` — preserve PR #3 structure; presentation only after MOV-17 state/action wiring.
- `src/app/games/movie-buff/play/page.tsx` — presentation and motion only after MOV-17 shared playback authority.
- `src/components/movie-buff/MovieBuffBoardRoomClient.tsx` — visual states only; no gameplay mutations.
- `src/app/games/movie-buff/round-intro/page.tsx` — visual integration only after MOV-16 and MOV-17 authority contracts are reconciled.

MOV-17 owns state and action wiring in these files. MOV-18 must not silently overwrite MOV-17 logic or PR #3 design.

## Required visual runtime states

- idle/loading
- ready
- round intro
- VIP selection visual state
- board available
- selector emphasis
- tile selected
- curtain transition
- film-slate transition
- synchronized playback
- answer window
- results
- return to board
- used tile / `SCENE COMPLETE`
- reconnect catch-up
- Buster replacement visual
- asset failure
- reduced motion

## Rive rules

- Use a single bounded wrapper surface rather than direct Rive calls throughout gameplay pages.
- Inputs are derived from server state and are read-only.
- An animation completion callback may update local presentation state but may not advance gameplay.
- Missing or malformed `.riv` files render a static accessible fallback.
- Reduced-motion mode skips decorative movement without skipping authoritative deadlines or phases.
- Reconnect enters the current visual state and does not replay expired transitions as a prerequisite to participation.

## Blender rules

Blender output is pre-rendered media only. Runtime Blender or 3D scene execution is not required. Rendered cinematics must have size, duration, poster-frame, codec, loading, and static-fallback metadata.

## Accessibility and performance

- All controls retain keyboard and visible-focus behavior.
- Motion never conveys the only copy of phase, timer, ready, selector, or result information.
- Honor `prefers-reduced-motion`.
- Avoid blocking gameplay on decorative asset download.
- Record asset byte sizes and loading failures.

## Validation classification

A successful preview build is not visual acceptance. Final evidence requires exact-SHA responsive screenshots, reduced-motion proof, missing-asset proof, reconnect behavior, accessibility checks, and confirmation that animations cannot mutate gameplay. Until executable evidence exists, those results remain UNKNOWN.
