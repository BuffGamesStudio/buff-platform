# Movie Buff Agent 6 — Isolated Staging Security Runbook

Status: **PREPARED ONLY — DO NOT APPLY**  
Owner: Agent 6 — database security, RLS, ACL, RPC and staging package  
Repository: `BuffGamesStudio/buff-platform`  
Source branch: `security/movie-buff-rls-acl-staging`  
Integration target: `integration/movie-buff`

## Authorization boundary

This document is a staging rehearsal plan. It is not authorization to execute migrations, rollback, containment, reapply, deployment, production traffic, or production mutation.

The only permitted hosted target for a future approved rehearsal is the isolated project below:

- Supabase organization: `tleuzztdjpajaltwcclj`
- project name: `movie-buff-staging`
- project reference: `eddwkxcillhzkvwmavsc`
- API hostname: `eddwkxcillhzkvwmavsc.supabase.co`
- database hostname: `db.eddwkxcillhzkvwmavsc.supabase.co`
- region: `us-east-1`
- observed Postgres major version: `17`
- environment classification: isolated staging

The historical hosted project `yfatwreicmiocdxzyznd` is not an approved target. Current access is denied, so its present state is `UNKNOWN / ACCESS_DENIED` and older findings are stale last-known evidence only.

## Immutable inputs required before any staging action

A staging rehearsal must stop unless all of the following are recorded and mutually consistent:

1. Agent 6 draft PR head SHA and tree SHA.
2. Agent 5 immutable product SHA `2be790c88bc7f34969fe607bb78fd7535b621190` and tree `cbd8061c9c4da410e39363beee02bf53194ed53f` or an explicitly superseding accepted product identity.
3. Successful disposable-local Agent 6 artifact for that exact source/product pair.
4. Independently verified artifact digest and relative-path `sha256.txt`.
5. Exact SHA-256 for every forward migration, rollback, persona test, pgTAP test, wrapper and expected-state manifest.
6. Clean source checkout and exact repository remote.
7. Supabase CLI, Postgres, `psql`, Docker, operating system and wrapper versions.
8. Exact staging organization, project reference, API/database hostnames, region and connected role.
9. A named operator and independent observer.
10. A maintenance window, stop conditions, rollback authority and containment authority.
11. A backup or PITR identity appropriate to the staging project when the rehearsal is expected to mutate durable staging data.
12. An explicit staging-only authorization that names project reference `eddwkxcillhzkvwmavsc` and expires at a stated UTC time.

A branch name, preview URL, Vercel deployment, historical PASS, or successful local database run is not sufficient authorization.

## Required source package

Forward order:

1. `20260805155000_movie_buff_function_security_finalizer.sql`
2. `20260805160000_movie_buff_six_table_rls_reconciliation.sql`
3. `20260805160500_public_rls_auto_enable_event_trigger_contract.sql`
4. `20260805161000_public_rls_auto_enable_acl_lockdown.sql`

Containment and rollback order:

1. `20260805161000_public_rls_auto_enable_acl_lockdown.rollback.sql`
2. `20260805160500_public_rls_auto_enable_event_trigger_contract.rollback.sql`
3. `20260805160000_movie_buff_six_table_rls_reconciliation.rollback.sql`
4. `20260805155000_movie_buff_function_security_finalizer.rollback.sql`

Forward reapply uses the original forward order. Every path and SHA-256 must match the successful exact-SHA local artifact before staging execution.

Expected data-loss classification: **NONE EXPECTED**. The package must not drop or truncate target tables and must not broadly delete gameplay or identity data. A hash mismatch or unexpected destructive statement is an immediate stop.

## Preflight — read-only only

Before any future authorized write, capture read-only evidence for:

- current migration ledger and duplicate/missing versions;
- current server version, connected role and database identity;
- owners, RLS and FORCE RLS state for all six target tables;
- complete policy names, commands, roles, `USING` and `WITH CHECK` expressions;
- direct and effective table grants for `PUBLIC`, `anon`, `authenticated` and `service_role`;
- every Movie Buff function and overload as exact `regprocedure`;
- function owner, `prosecdef`, `proconfig`, search path and direct/effective EXECUTE matrix;
- the exact service-only VIP finalizer;
- `public.rls_auto_enable()` and the enabled `ensure_rls` event trigger;
- dependencies and unexpected overloads;
- current row counts for the six target tables, without exposing private row contents;
- current Supabase security-advisor output.

The preflight must fail closed on wrong project, wrong organization, wrong host, production classification, missing objects, contradictory objects, unexpected overloads, migration hash mismatch, or missing independent observer.

## Future authorized staging sequence

No step below is executed by preparing this runbook.

1. Reconfirm immutable source/product identities and staging allowlist.
2. Capture the complete read-only baseline.
3. Apply the four forward migrations in order.
4. Verify the exact migration ledger.
5. Run forward pgTAP.
6. Run the complete persona matrix:
   - anonymous;
   - unauthenticated browser;
   - authenticated nonmember;
   - active member;
   - member from another room;
   - selector;
   - nonselector;
   - host;
   - abandoned player;
   - stale membership;
   - reconnecting active member;
   - service role;
   - Buster/system identity where applicable.
7. Prove both allowed and denied behavior, including cross-room and self-only private rows.
8. Capture expected catalog and ACL state.
9. Execute the ordered fail-closed containment rollback.
10. Verify browser table/RPC access is contained, RLS remains enabled and forced, service diagnostics remain available only as intended, and no target data was deleted.
11. Run rollback pgTAP.
12. Reapply the original four forward migrations in order.
13. Rerun forward pgTAP and all persona probes.
14. Compare final schema, table ACL, RLS, policies, function owners, search paths, overload identities, function ACL and event-trigger state with the pre-containment expected catalog.
15. Capture ledger, process exits, UTC timestamps and redacted evidence.
16. Clean temporary users, rooms, test rows and any other rehearsal fixtures using an approved deterministic cleanup plan.
17. Independently verify the portable evidence archive outside the runner/operator environment.

## Mandatory stop conditions

Stop immediately and classify the rehearsal `FAIL` or `UNKNOWN` as appropriate when any of these occurs:

- project reference, organization, region, hostname or connected role mismatch;
- target resembles production or cannot be proven isolated staging;
- source SHA/tree, product SHA/tree or file hash mismatch;
- missing migration, rollback, policy, table, function, overload or event trigger;
- unexpected migration already applied or ledger contradiction;
- backup/PITR requirement unresolved;
- any forward, persona, containment, rollback, reapply or cleanup command exits nonzero;
- anonymous, nonmember, cross-room, abandoned, stale or system identity receives forbidden access;
- authenticated users gain direct write access to the six tables;
- raw `movie_buff_board_events` becomes browser-readable;
- `service_role` loses required continuity;
- PUBLIC or anon obtains Movie Buff EXECUTE;
- the VIP finalizer becomes browser-callable;
- owner or search-path state differs from the expected-state manifest;
- evidence contains a credential, token, signed URL, connection string or secret-like value;
- rollback/reapply final catalog differs from the approved expected catalog;
- cleanup is incomplete;
- operator or observer withdraws authorization.

## Evidence bundle

The staging bundle must be written outside the repository and contain:

- repository, branch, full SHA and tree;
- product SHA and tree;
- staging organization/project/host/region identity;
- connected role without credentials;
- every package path, byte length and SHA-256;
- tool and operating-system versions;
- migration ledger before, after forward apply, after containment/rollback and after reapply;
- pgTAP and persona outputs with child exit codes;
- catalog/ACL/policy/function snapshots;
- containment, rollback and reapply results;
- data-loss classification;
- cleanup result;
- secret-scan result;
- UTC start/finish;
- relative-path SHA-256 manifest;
- artifact ID and external digest;
- final scope classifications.

## Handoff

Agent 9 receives migration order, SHA-256 manifest, dependencies, rollback order, containment conditions, data-loss classification and stop conditions.

Agent 10 receives the expected-state manifest, exact source/product identities, artifact ID/digest, portable evidence hashes and separate classifications for local database, personas, staging, rollback, containment and reapply.

Until a separately authorized staging rehearsal completes and is independently validated, staging remains `UNKNOWN` and the overall Movie Buff release remains `NO-GO`.
