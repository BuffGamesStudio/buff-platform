# Movie Buff live status — 2026-08-21

This is the current release checkpoint for the Movie Buff live-board candidate. It supersedes older dated status notes for the facts captured below.

## Current release

- Repository: `codex/movie-buff-live-board-preview`, exact runtime head `0768b0f`, three commits ahead of `origin/main`; the release-gate tooling and this status note are committed locally.
- Vercel: public alias `https://movie-buff-sigma.vercel.app` resolves to READY production deployment `dpl_2tdSoNmcqAaxd5JeopbcjDyfynMV`, built from exact head `0768b0f`.
- The current compiled client chunk `2jpmv089c_ya6.js` references production Supabase project `yfatwreicmiocdxzyznd` and not rehearsal project `eiamucxbestinitydkvu`.
- The Movie Buff page, lobby, and board-preview routes return HTTP `200`. The hosted route-health suite passes all 12 routes across five attempts, with unauthenticated admin pages remaining access-gated.
- The categories endpoint returned HTTP `200` with 50 playable clips on the latest probe. A previous five-request probe on the same release also returned `200` after the first transient `JWT issued at future` response.

## Production database

- Supabase project `yfatwreicmiocdxzyznd` is `ACTIVE_HEALTHY`.
- The production migration ledger has 55 rows and now ends at `20260821214749` (`movie_buff_playable_genre_clip_mappings`), applied from `20260819013613_movie_buff_playable_genre_clip_mappings.sql`.
- Production `movie_categories` now contains 300 links: all six playable genres map to all 50 playable movies.
- The 14 content-engine tables are present and all have RLS enabled; `FORCE ROW LEVEL SECURITY` is still false on those tables.
- Current seeded content is 50 movies, 50 legacy clips, 50 content items, 50 content media rows, 50 content answers, 8 categories, and 8 content types. Challenge-set rows, source-item links, and clip/movie analytics aggregate rows are still zero.

## Verified release gate

The production live board-preview now renders all six playable genres: `Action`, `Comedy`, `Classics`, `Horror`, `Science Fiction`, and `Drama`.

The repository contains the required repair migration:

`supabase/migrations/20260819013613_movie_buff_playable_genre_clip_mappings.sql`

It links every active video-backed movie to the six playable genre categories. The local launch-migration gate now requires this file and passes with 40 required migrations. The production ledger contains the applied migration, and the production read-back confirms 300 links and 50 playable movies in each genre.

The same idempotent migration was applied to the non-production rehearsal project `eiamucxbestinitydkvu` for validation only. Its read-back shows 300 category links and 50 playable movies in each of the six genres. A local app using that rehearsal project passed `npm run movie-buff:live-board-gate`, including both the categories API and rendered board. This is rehearsal proof, not production proof.

## Exact-head verification

- `npx eslint src --max-warnings=0`: pass.
- `npm run build`: pass; only the existing NFT tracing warning from `next.config.ts` remains.
- `npm run movie-buff:check-launch-migrations`: pass.
- `npm run movie-buff:check-bootstrap-artifacts`: pass.
- `MOVIE_BUFF_BASE_URL=https://movie-buff-sigma.vercel.app npm run movie-buff:route-health`: pass.
- `npm run movie-buff:live-board-gate`: pass; all six expected genres have 50 playable clips and are rendered by the public board.
- Vercel runtime errors over the last 24 hours: none found.

## Release conclusion

The authorized production data repair is complete and the hosted six-genre board gate passes. The deployed runtime remains the READY deployment at exact head `0768b0f`; the local gate/status-document commit has not been redeployed by this checkpoint.

Supabase advisors still report 26 authenticated `SECURITY DEFINER` warnings and 70 informational performance notices. These are tracked hardening work, separate from the missing genre-link migration gate.
