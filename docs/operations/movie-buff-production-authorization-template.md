# Movie Buff production authorization template

> TEMPLATE ONLY — NOT AUTHORIZATION.  
> The phrase at the end is inert unless every required field is completed, independently verified, signed by the named authority, and still within its UTC expiry.

## Immutable candidate

- Repository: `BuffGamesStudio/buff-platform`
- Canonical branch: ______________________________
- Full 40-character candidate SHA: ______________________________
- Commit tree SHA: ______________________________
- Clean-worktree capture: ______________________________
- Composition-manifest path: ______________________________
- Composition-manifest SHA-256: ______________________________

## Exact production targets

- Supabase organization: ______________________________
- Supabase project name: ______________________________
- Supabase project ref: ______________________________
- Supabase API hostname: ______________________________
- Supabase database hostname: ______________________________
- Supabase region: ______________________________
- Vercel team ID: ______________________________
- Vercel project ID: ______________________________
- Vercel deployment ID: ______________________________
- Vercel production alias: ______________________________
- Vercel source SHA/build marker equality evidence: ______________________________

## Migration and recovery package

- Ordered migration manifest path: ______________________________
- Ordered migration manifest SHA-256: ______________________________
- Every migration SHA-256 verified: `YES / NO`
- Every rollback SHA-256 verified: `YES / NO`
- Missing-rollback dispositions resolved: `YES / NO`
- Containment package identity: ______________________________
- Rollback package identity: ______________________________
- Disposable-local rehearsal evidence: ______________________________
- Isolated-staging rehearsal evidence: ______________________________
- Forward-reapply evidence: ______________________________
- Final expected-state/catalog digest: ______________________________

## Backup/PITR

- Backup or PITR mechanism: ______________________________
- Exact backup/PITR identity: ______________________________
- Target binding: ______________________________
- Restore-point timestamp UTC: ______________________________
- Restore verification evidence: ______________________________

## People, authority, and timing

- Operator: ______________________________
- Independent observer: ______________________________
- Rollback authority: ______________________________
- Containment authority: ______________________________
- Production authorization authority: ______________________________
- Maintenance window start UTC: ______________________________
- Maintenance window end UTC: ______________________________
- Authorization expiry UTC: ______________________________
- Monitoring owner: ______________________________
- Incident channel: ______________________________

## Stop-condition acknowledgment

The operator, observer, rollback authority, and containment authority have reviewed the stop conditions in `docs/operations/movie-buff-release-recovery-runbook.md` and agree that any identity mismatch, hash mismatch, missing rollback, backup/PITR gap, nonzero exit, authorization drift, catalog/persona drift, build-marker mismatch, secret exposure, runtime failure, or cleanup failure immediately stops execution.

- Operator acknowledgment: ______________________________
- Observer acknowledgment: ______________________________
- Rollback authority acknowledgment: ______________________________
- Containment authority acknowledgment: ______________________________

## Evidence bundle

- Bundle path: ______________________________
- Bundle SHA-256: ______________________________
- Independent verification record: ______________________________
- MOV-19 recommendation and exact evidence reference: ______________________________

## Authorization statement

Authorization is valid only for the exact identities above, during the stated maintenance window, before the stated expiry, and with the named operator and independent observer present.

EXECUTE AUTHORIZED
