# Movie Buff Agent 9 live recovery checkpoint

Captured: `2026-08-06T15:03:00Z`  
Branch: `operations/movie-buff-release-recovery`  
Classification: **NO-GO**

## Exact current product

- Agent 5 PR: `#107`
- product SHA: `520a06c9c79e6a2b0ef9ce7816abd70514cba922`
- product tree: `6f9ec763ed2256266af63d0e023eeef7e277e452`
- controller SHA: `cdc1184ef57180dd30f7a959a59b00dfcffcca52`
- controller tree: `4e6a4abee263674d45933c3cc0f32da27de9723c`
- workflow run: `31112684458`

Source assembly, Linux and Windows builds, artifact integrity, encoding, and Agent 6 package presence pass. Two focused MOV-19 source assertions fail. Database, browser, staging, rollback/containment/reapply, backup/PITR, and production-target scopes remain `UNKNOWN`.

## Current lane freeze

- MOV-15: `48d44bb156b71060d1b9adcc7a2a3f014cf92060` / tree `e010c949920f84e5f7aaca9d50ebf39d6ea13309`
- MOV-16: `f169d652a9199a65afd5369c52c0584f635d7031` / tree `3a66c05277eb0907aba7f3f4f0506fb2eb162259`
- MOV-17: `9239fcdc731ec05594c75d3ef9961e6cd4d36bbf` / tree `57a00c385e210717bd705b14d2146908736482fe`
- MOV-18: `6cf6ae7ef951141c630cdd66f178cd73e1b88327` / tree `6541d040483d166d4350048778254ab8081d1ddb`
- encoding: `d1f7ca58b534cbccd3071743d542f5788c0e9173` / tree `ea817ad706f4107fc16482cbe6cc40ec6a012ee0`
- Agent 6 security: `920085543773bdaeb6b8af29ae4b7faa856fa396` / tree `8d83bc7e06911256e5463502cee8a2ef63290ff4`

## Manifest control

`release-recovery-overlay-v3.json` supersedes the earlier `2026-08-06T14:06:00Z` binding while preserving that manifest as historical evidence. The live wrapper verifies the historical manifest's Git blob before applying exact current-head and hash overrides.

Current Agent 6 migration overrides:

- `155000` migration: `01a4c92cf1c860965a820dbb7d65c6a04ad2a4eea088f8604c4899215806c5ae`
- `160000` migration: `54abc27751fb3b7ec775cad2d836d3084de48411d52889935a0e7400cd7e957b`
- `160000` rollback: `84f300614afbe8666d95561dcd63b6173eaa9b5a3e850375d5ee503fbaa960c1`

Agent 6 local evidence artifact `8972187959` has digest `sha256:8c8b51c025d8ce902d1b1371a2909a2f8c7718ab45c4c0703de1eb2fdeed2849`, but it is bound to product `2be790c8...`, not current product `520a06c9...`. Transfer to the current product is `NOT APPLICABLE`.

## Sole migration rollback gap

MOV-17 migration `20260804083100_movie_buff_server_phase_machine_hardening.sql`, SHA-256 `602d64cf2c7de8135ec4d21b29f587e5420945d6eb3339b91b3a9fc028b9ab8f`, still lacks a dedicated rollback or an explicit Agent 3 covering disposition. The current MOV-17 head changes client reconciliation only and does not resolve that recovery contract.

Local execution remains blocked.

## Environment identity

- Supabase staging ref: `eddwkxcillhzkvwmavsc`
- database host: `db.eddwkxcillhzkvwmavsc.supabase.co`
- status: `ACTIVE_HEALTHY`
- designated Vercel staging project: `app` / `prj_qTI4u8AW6ukAJXf6zgGdssM2t1ls`
- current Vercel staging deployment count: `0`

These are identity captures only. No hosted mutation occurred.

Production Supabase/Vercel targets, backup/PITR identity, operator, observer, rollback authority, containment authority, maintenance window, monitoring owner, and authorization expiry remain `UNKNOWN`.

## Live gate behavior

`scripts/movie-buff-agent9-live-recovery.ps1`:

- verifies repository root, branch, full operations SHA, tree, clean worktree, candidate SHA/tree, base-manifest Git blob, overlay, migration order, and rollback-gap identity;
- writes resolved manifest and evidence outside the checkout;
- supports allowlisted Supabase staging identity validation without connecting or mutating;
- refuses unapproved staging identity;
- refuses missing backup/PITR when backup proof is required;
- refuses local rehearsal while the candidate is `FAIL`;
- delegates package hashing and redaction to the existing staging-rehearsal wrapper;
- regenerates a portable relative-path SHA-256 manifest.

No production authorization is requested. The prepare-only authorization template continues to require the literal phrase `EXECUTE AUTHORIZED` after every mandatory gate passes.
