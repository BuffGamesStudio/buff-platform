# Movie Buff auth and source audit

Date: Friday, July 31, 2026

## Launch-blocking auth findings

- Buff Games already has Supabase auth helpers in [src/lib/auth/auth.ts](/C:/Users/shapa/BuffGames/buff-platform/src/lib/auth/auth.ts).
- The Buff Games public shell now exposes clear Sign in, Sign up, and Enter Buff Games entry points through:
  - [src/components/Navbar.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/components/Navbar.tsx)
  - [src/components/Hero.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/components/Hero.tsx)
- Dedicated account routes now exist for:
  - [src/app/sign-in/page.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/sign-in/page.tsx)
  - [src/app/sign-up/page.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/sign-up/page.tsx)
  - [src/app/account/page.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/account/page.tsx)
- Movie Buff route guards now reject anonymous sessions and redirect to Buff Games sign-in before lobby or join flow continues:
  - [src/app/games/movie-buff/lobby/LobbyClient.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/games/movie-buff/lobby/LobbyClient.tsx)
  - [src/app/games/movie-buff/join/page.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/games/movie-buff/join/page.tsx)
  - [src/lib/game/gameState.ts](/C:/Users/shapa/BuffGames/buff-platform/src/lib/game/gameState.ts)
- The Movie Buff landing page was adjusted to send users into the Buff Games account hub first instead of implying a direct jump into the lobby:
  - [src/app/games/movie-buff/page.tsx](/C:/Users/shapa/BuffGames/buff-platform/src/app/games/movie-buff/page.tsx)
- Remaining launch question: auth structure exists, and local runtime verification is now present, but hosted verification of account creation, sign-in, logout, session persistence, and admin/profile protection still still needs an end-to-end runtime pass.
- Result: the codebase is now aligned with the desired account-first structure in repo behavior:
  - Buff Games home
  - Sign in
  - Sign up
  - Enter Buff Games account
  - Launch Movie Buff from inside Buff Games

## Repo changes aligned to this audit

- Keep visible Sign in and Sign up entry points in the Buff Games shell.
- Keep the account hub page as the internal launch surface for Movie Buff.
- Keep wording consistent around the shared account layer:
  - `Enter Buff Games` in the shell
  - `Launch Movie Buff` only after account entry
- Keep direct sign-in recovery available from protected admin denial states.
- Continue removing or quarantining any remaining anonymous/guest launch paths before soft launch.

## Additional verification completed on Friday, July 31, 2026

- `npm run build` passed after the auth/source UI pass.
- `npm run movie-buff:smoke-auth` now passes locally.
- That smoke now proves:
  - sign-in page loads
  - sign-up page loads
  - account creation works through the auth layer
  - signed-in account shell loads
  - session persists across account reload
  - sign-out returns the user to the public shell
  - signed-out account state renders correctly in a clean browser context
- `/admin/sources` now reflects source-policy structure more directly by exposing legal basis alongside policy, ingest suitability, trust, and auto-ingest state.
- Remaining auth blocker is not repo structure. It is hosted/runtime proof:
  - hosted account creation
  - hosted sign-in
  - hosted logout
  - hosted session persistence
  - hosted protected admin access

## Source-policy direction

Treat these as separate systems:

1. movie repository / watch access
2. gameplay-eligible clip ingestion

Do not assume watch availability equals clip-use permission.

Every gameplay candidate needs item-level rights validation before clip generation or live use.

## Approved source direction

Approved now:

- Library of Congress
- Internet Archive items with verified public-domain or Creative Commons rights
- Public Domain Movie as discovery only
- European Film Gateway only after item-level validation

Conditional next:

- Creative Commons film catalogs
- Wikimedia film collections
- international archive feeds with explicit rights metadata

Reject for auto-ingest:

- generic free-streaming services
- unclear user-upload archives
- titles with no explicit rights basis
- unsupported public-domain claims without source proof

## Recommended source-registry fields

- source name
- source type
- base URL / collection / feed
- country
- language
- trust level
- legal basis
- clip-ingest suitability
- watch suitability
- validation rule
- auto-ingest allowed yes/no
- active/inactive
