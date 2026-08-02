<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, webpack dev) + Supabase app called Movie Buff ("buff-platform"). The single app is the web frontend + API routes; its only backend dependency is a local Supabase stack (Postgres + Auth + PostgREST + Realtime + Storage) run via the Supabase CLI, which needs Docker.

### Services and how to run them

The VM snapshot already has Docker, the Supabase CLI, and node modules installed. On a fresh session the dependency refresh (`npm install`) runs automatically, but the Docker daemon and Supabase stack are NOT auto-started. Start them once per session:

- Start Docker daemon (background): `sudo dockerd > /tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`. Docker here uses `fuse-overlayfs` + iptables-legacy (already configured in `/etc/docker/daemon.json`).
- Start Supabase: `supabase start` (from repo root). It applies all `supabase/migrations/*` automatically. First run pulls images; later runs are fast. Get URLs/keys anytime with `supabase status`.
- Local Supabase fixed ports: API `http://127.0.0.1:55321`, DB `postgresql://postgres:postgres@127.0.0.1:55322/postgres`, Studio `http://127.0.0.1:55323`. The DB container is `supabase_db_buff-platform` (query with `docker exec -i supabase_db_buff-platform psql -U postgres -d postgres`).
- Run the dev server on port 3001 (NOT 3000): `npm run dev -- --port 3001`. The app hardcodes `http://127.0.0.1:3001` as the local app URL and Supabase `site_url`, and smoke scripts default to it.

### Required env (`.env.local`, gitignored, recreate per environment)

The app throws on startup without these. Values come from `supabase start`/`supabase status` (local keys are the shared defaults and safe to hardcode locally):
`NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`, `SUPABASE_SERVICE_ROLE_KEY=<secret/service_role key>`, `ALLOW_LOCAL_ADMIN_BYPASS=true` (lets `localhost`/`127.0.0.1` reach `/admin` without an admin account), and optionally `MOVIE_BUFF_BASE_URL=http://127.0.0.1:3001`.

### Seeding playable game content (important, non-obvious)

`supabase start` migrations only create the schema plus placeholder text-trivia rows (`clips` are all `clip_type = 'trivia'` with `media_url = NULL`) — there are ZERO playable video clips, so the lobby reports `playableClipCount = 0`, shows "0 rounds", and matches hang. The real public-domain montage library ships as committed `.mp4` files under `public/media/movie-buff/public-domain/` plus a committed data seed at `scripts/generated/movie-buff-launch-bootstrap.sql` (the normal `movie-buff:import` bundle is NOT committed). That file's `categories`/`content_types` inserts collide with migration-seeded natural keys, but gameplay only needs the `movies` + `clips` blocks (the round builder `pick_movie_buff_clip` selects from legacy `public.clips` and treats `content_media` as optional). To seed playable clips into the local DB (inserts the `movies` block on lines 19-73 and the `clips` block on lines 187-241; `on conflict (id) do nothing`, idempotent):
```
{ echo "begin;"; sed -n '19,73p' scripts/generated/movie-buff-launch-bootstrap.sql; sed -n '187,241p' scripts/generated/movie-buff-launch-bootstrap.sql; echo "commit;"; } \
  | docker exec -i supabase_db_buff-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1
```
This inserts 49 public-domain movies + 49 video clips pointing at the committed montages (giving ~48-49 playable clips). The line ranges are tied to the current generated file — if it is regenerated, re-check that 19-73 is the `insert into public.movies` block and 187-241 is `insert into public.clips`. Afterwards `GET /api/movie-buff/categories` should report a non-zero `playableClipCount` for "All Movies".

### Gameplay/auth caveats

- **Sign-up does NOT auto-login.** The flow is: `/sign-up` → then `/sign-in` with the same credentials (this establishes the session and redirects). Email confirmation is disabled locally, so accounts are auto-verified.
- **Public matchmaking ("Find Match") auto-starts only with ≥2 ready players.** For a solo end-to-end test, create a **Private Room** (the verified-email gate is satisfied locally) → Ready → Start Match → Start Round → play screen shows a 30s montage + guess box → submit → round results.

### Lint / build / test

- Lint: `npm run lint` (== `eslint`). Most of the reported problems (roughly 186 of ~195) come from `supabase/.temp/` — a minified edge-runtime artifact that only exists after `supabase start` — not from tracked source. Excluding it (`npx eslint . --ignore-pattern "supabase/.temp/**"`, or scoping to `npx eslint src scripts`) leaves only ~9 pre-existing problems (a couple errors + a few unused-var warnings) in `src`/`scripts`, which are the repo's existing state, not an environment problem.
- Build: `npm run build` passes.
- The many `npm run movie-buff:*` smoke scripts are Playwright-based with hardcoded Windows paths (`PLAYWRIGHT_ENTRY`, `MOVIE_BUFF_CHROME_EXECUTABLE`) from the original author's machine; they need those env vars overridden to a Linux Chromium to run here. `npm run movie-buff:verify-analytics` runs SQL through `docker exec` against the running Supabase DB.
