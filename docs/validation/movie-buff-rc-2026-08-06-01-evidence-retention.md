# Movie Buff RC 2026-08-06-01 — Evidence Retention and Rerun Decision

Status: **DRAFT / NO-GO**  
Generated: `2026-08-06T23:11:16Z`  
Product SHA: `78c35aa15ec7f1bb3cb3de316f260fec438f00dc`  
Product tree: `f8d3b3901ad0c0b1db1cfa4a6374f2a979dd5613`  
Parent product: `c3a6aff9138f6e12b50e54f5b3c0f4bddcc101f6`  
Manifest SHA-256: `bf8564353fd4707c166c17cc99e9d1e7a09d345c8c9eb16550fb3f9232c7e4a6`

## Determination

The successor is an immutable six-path overlay on candidate v6. Git tree comparison identifies exactly six changed paths; every other tracked path is byte-identical to the parent product. Evidence is retained only at the smallest proof scope whose complete dependency closure is unchanged.

## Exact changed paths

| Path | Old blob | New blob | Old SHA-256 | New SHA-256 | Effect |
|---|---|---|---|---|---|
| `.github/workflows/movie-buff-agent6-security-package.yml` | `a8d987e4bd8b0d11d50609cbf745ab2e0e384e07` | `c8811c7f7945c493a300e3643cfe05dee3a4e3b6` | `ab883bde9ab7532b27b056bc4075fbdc5334114a1961925a43e4dc58c26c58b5` | `928b05d293d947e8bd85b80eb06edb0f5f3c618d96ac3f6924a7d4bf43a6e803` | controller, agent6-evidence-binding |
| `docs/security/movie-buff-agent6-expected-state.json` | `146b3e31fb8a2cca05edf81ec03afa2ac92ec8fe` | `606f00dc55bfff493264d827337e0638ceef9694` | `24708868525a2b468993f76ed7963a46073e980114edbff7d7fb96b57a9f3611` | `962a98ebff1f8ab113acee1a26723cfb34a6765fe6272a31619508a78edf2555` | agent6-evidence-expectation |
| `.github/workflows/movie-buff-mov19-validation.yml` | `2266a38262ec276059c961ad940f8a163b50d7e5` | `831043deb604064c111c5186b392af2d7815f08f` | `b37202a2a4ac631a620ffdee1cf365c721638677c6be9c7b18a729654f1528b5` | `425f56c9f0de73a537d7ee113d0b61f9ae34caa0a13ce24321a830de66abf8f0` | validator-controller, independent-review |
| `tests/movie-buff-independent-security-validation.test.mjs` | `b59beab616e1998a8bc79985d3a2dafbae92d2e0` | `aadef375490d9c9eeacb2ba3810efc3c0d72d823` | `59150a4737b9b309c301b5c6781c1010b077e9e636edad48b60efd5cbb51b6f7` | `3c8eda4dfd34340a279de31c2ac123c2a9f8ca1794661a9d91c5cff7f279406b` | validator-self-test |
| `src/app/games/movie-buff/lobby/LobbyAuthBootstrap.tsx` | `aeefc9835c07c95e6897a6f9ae37e6cb489c9333` | `0b8f21a92c6a739e3bd8f853b9e4426f5c5aa957` | `8bc6256b80092ef84b470c691622b02c29a4f00b3eb5de4c631a21ed345212cd` | `38bf77c627156d8caf3093ed1cc2a491f790487f538db80a64070847302eb78e` | runtime, auth, lobby, browser, build |
| `tests/movie-buff-lobby-auth-bootstrap.test.mjs` | `2bd6140f1aaab0609e2e5a56fc2a79a593c4f72d` | `6cd6ecd46bcf7b368c72d981db735a2d86f2fa5d` | `30dd17d8ef124ea7a98938698357b7ae94bd00e7e9cc59f056716db623d5a556` | `a24bcd847b7a2610acee85edebffc3ac594e7467511934b3a9b2370d27c4e961` | focused-test |

## Retainable evidence

| Evidence | Decision | Exact boundary |
|---|---|---|
| Candidate-v6 component SHA/tree identities and protected reconciliation | **RETAIN — identity only** | Historical identity remains valid; no historical UNKNOWN or NO-GO becomes PASS. |
| PR #3, PR #5, MOV-15, MOV-16, cutoff MOV-17, MOV-18 and PR #12 lane evidence | **RETAIN CONDITIONALLY** | Artifact/digest must verify and the complete proof dependency closure must exclude all six changed paths. No integrated behavior claim is inherited. |
| Agent 6 exact-head source hashes | **RETAIN** | Source `915877115479db3c14665ac3fcbe17a0d2ae8921`, tree `47175b18af9e3dd1dc6aa30e41bb3b5bd06aa272`; canonical file hashes are recorded in the JSON manifest. |
| Agent 6 disposable local database-security execution | **RETAIN WITH BYTE-IDENTITY BRIDGE** | Run `31114359501`, artifact `8973114068`, digest `sha256:0ca8ec0a964b4d93c034dbd7de43081d5f4a83f65c1f81c610279ed28c0e1531`. Retained only for Agent 6 reset/ledger, pgTAP, personas, policy helpers, containment rollback, reapply, catalog equality, cleanup and secret-scan scope. The successor changes no SQL, rollback, DB harness or DB runtime path. MOV-19 must independently accept the bridge. |

## Mandatory reruns

1. Successor exact identity, clean checkout and component-manifest verification.
2. Checked-in successor hash-audit workflow.
3. Current MOV-19 workflow and validator self-tests.
4. Lobby persisted-session focused tests.
5. TypeScript and production build on the exact successor.
6. Linux evidence and Windows digital twin.
7. Successor redaction, deterministic-exit, cleanup and portable hash validation.
8. Combined MOV-15/MOV-16/MOV-17 database apply, pgTAP, races, reconnect, idempotency and cross-lane behavior.
9. Combined rollback, containment and forward reapply beyond the retained Agent 6-only scope.
10. Exact Vercel staging provenance and immutable build marker.
11. Exact isolated Supabase staging project, migration ledger and catalog/ACL/RLS/function proof.
12. Full three-authenticated-client browser journey, including refresh/reconnect, navigation history, stale-client rejection and console checks.
13. Responsive, accessibility, fallback and reduced-motion evidence.
14. Independent artifact download, digest verification and MOV-19 GO/NO-GO for this exact product SHA/tree.

## Evidence that cannot be retained

- Any candidate-v6 candidate-wide PASS claim.
- Earlier MOV-19 execution as proof of the changed current validator workflow or test.
- Old lobby bootstrap build/browser evidence; the runtime source changed.
- Evidence tied only to post-cutoff MOV-17 `ffff733d856c8c6dca5a04fdbe84e3a0c5839111`.
- PR #114 post-cutoff staging-security evidence.
- Any hosted, staging, production or backup/PITR claim.
- Any cross-SHA evidence lacking the explicit byte-identity bridge in the manifest.

## Current release classification

```text
Successor product identity: PASS
Six-path composition/blob/hash manifest: PASS
All-other-path byte identity: PASS
Retained Agent 6 database-security scope: RETAINABLE_WITH_BYTE_IDENTITY_BRIDGE
Successor build/browser/integrated runtime: UNKNOWN
Staging/hosted/production: UNKNOWN
MOV-19 recommendation: NO GO ISSUED
Overall: NO-GO
```

No merge, deployment, hosted mutation or production mutation is authorized.
