# MOV-18 visual runtime evidence

Branch implementation remains validation-pending. This document distinguishes committed code from executable proof.

## Present in repository

- Figma write capability was verified through a reversible create/remove operation in the Movie Buff file with no net design change.
- Read-only visual runtime state derivation exists and exposes no gameplay-advance capability.
- Static fallback, used-tile stamp, reconnect state, Game Menu shell, Buster replacement visual, curtain/slate transition surface, motion wrapper, asset map, and contract tests exist.
- `MovieBuffRiveSurface` checks public asset availability with a read-only `HEAD` request and falls back when a `.riv` asset is unavailable.
- `MovieBuffRiveSurface` observes `prefers-reduced-motion` and renders the accessible static surface without changing authoritative deadlines or phases.
- `/games/movie-buff/visual-runtime-preview` is an isolated presentation-only proof route. It does not import Supabase, call Movie Buff APIs, leave a room, or mutate gameplay.
- The visual authority boundary explicitly prevents room, selector, tile, phase, playback, VIP, scoring, penalty, and hosted-state mutation.

## Rive dependency status

- The selected package is `@rive-app/react-webgl2`.
- The dependency is not yet written to `package.json` or `package-lock.json` because those two files must remain synchronized.
- The connected GitHub writer cannot safely regenerate the existing large npm lockfile incrementally.
- Production `.riv` assets and their actual artboard/state-machine names remain absent; no placeholder production animation is claimed.

## Unknown

- Local lint and TypeScript.
- Executable Node test result.
- Production build.
- Synchronized package/lock installation result.
- Live Rive canvas initialization.
- Production `.riv` asset loading.
- Missing-asset behavior in a real browser.
- Reduced-motion browser screenshots.
- Responsive and accessibility screenshots.
- Reconnect journey.
- Integration with the final MOV-17 authoritative phase view.

A Vercel or build success alone must not be classified as final visual acceptance. All unexecuted evidence remains UNKNOWN.
