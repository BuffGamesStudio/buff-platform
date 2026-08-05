param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedBranch = 'validation/movie-buff-mov15-mov16-mov17-pr12-exact-v1'
$integrationBaseSha = 'bf316a15a2120e32d8a32e479df2ae439081f9a1'
$rawCompositionSha = 'b4f8e2196a8a0423e7340ac97bd5592d58a966db'
$rawCompositionTree = '68715cde77454c8c1057f9480373208cec88ba32'
$componentMov15Sha = '0ecf8de86d2ea1a28c1496ed044a5092a7d3ffcb'
$componentMov15Tree = 'bd9e34f67d011c5a8adfe17f7c8c75dadfbb8182'
$componentMov16Sha = '95c292ead66fc83cf13d7154bd3cf691610f549d'
$componentMov16Tree = 'f8a8a9f316f5319566dad8c9aa01c2ce73f67e21'
$componentMov17Sha = '6d7e9aabe5b07796a3a17fdf6c11df091dd1f978'
$componentMov17Tree = '8264d2e30b0c75a8bebaa1ad938df6a635f7d991'
$componentEncodingSha = 'bf5e6d6f251f6840d17eed2fc68e0d580295437f'
$componentEncodingTree = 'd97528616454b9e93c6be9a44705d008a901ac66'

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

$actualSha = (git rev-parse HEAD).Trim()
$actualTree = (git rev-parse 'HEAD^{tree}').Trim()
$actualBranch = if ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { (git branch --show-current).Trim() }
$remote = (git remote get-url origin).Trim()

if ($actualSha -ne $ExpectedSha) { throw "SHA mismatch: expected $ExpectedSha, observed $actualSha" }
if ($actualBranch -ne $expectedBranch) { throw "Branch mismatch: expected $expectedBranch, observed $actualBranch" }
if ($remote -ne 'https://github.com/BuffGamesStudio/buff-platform') { throw "Repository remote mismatch: $remote" }
if (git status --porcelain) { throw 'Checkout is not clean before validation' }

$syntaxScripts = @(
  'scripts/movie-buff-public-matchmaking-race.mjs',
  'scripts/movie-buff-public-matchmaking-evidence-runner.mjs',
  'scripts/movie-buff-vip-authority-adversarial.mjs',
  'scripts/movie-buff-vip-authority-personas.mjs',
  'scripts/movie-buff-vip-finalize-adversarial.mjs',
  'scripts/movie-buff-three-client-phase-proof.mjs',
  'scripts/movie-buff-three-client-phase-evidence-runner.mjs',
  'scripts/movie-buff-reconnect-race-proof.mjs'
)
foreach ($script in $syntaxScripts) {
  node --check $script
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $script" }
}

node --test `
  tests/movie-buff-public-matchmaking-contract.test.mjs `
  tests/movie-buff-public-matchmaking-handoff.test.mjs `
  tests/movie-buff-vip-authority.test.mjs `
  tests/movie-buff-vip-finalize-contract.test.mjs `
  tests/movie-buff-vip-phase-policy.test.mjs `
  tests/movie-buff-server-phase-machine.test.mjs `
  tests/movie-buff-authoritative-phase-runtime.test.mjs `
  tests/movie-buff-buster-safe-boundary.test.mjs `
  tests/movie-buff-phase-tile-mutation-guard.test.mjs `
  tests/movie-buff-match-start-handoff.test.mjs `
  tests/movie-buff-migration-encoding.test.mjs `
  1> (Join-Path $EvidenceRoot 'contracts.tap') `
  2> (Join-Path $EvidenceRoot 'contracts.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "Contract tests failed: $LASTEXITCODE" }

npx --no-install tsc --noEmit `
  1> (Join-Path $EvidenceRoot 'typescript.stdout.txt') `
  2> (Join-Path $EvidenceRoot 'typescript.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "TypeScript failed: $LASTEXITCODE" }

$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-build-publishable-key'
$env:SUPABASE_SERVICE_ROLE_KEY = 'local-build-service-role-key'
npm run build `
  1> (Join-Path $EvidenceRoot 'build.stdout.txt') `
  2> (Join-Path $EvidenceRoot 'build.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "Build failed: $LASTEXITCODE" }

$env:MOVIE_BUFF_MIGRATION_ENCODING_OUTPUT = Join-Path $EvidenceRoot 'encoding-report.json'
node scripts/movie-buff-migration-encoding-check.mjs `
  supabase/migrations supabase/rollbacks supabase/tests `
  1> (Join-Path $EvidenceRoot 'encoding-scan.stdout.txt') `
  2> (Join-Path $EvidenceRoot 'encoding-scan.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "Encoding scan failed: $LASTEXITCODE" }

git fetch --no-tags --depth=1 origin $integrationBaseSha `
  1> (Join-Path $EvidenceRoot 'baseline-fetch.stdout.txt') `
  2> (Join-Path $EvidenceRoot 'baseline-fetch.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "Baseline fetch failed: $LASTEXITCODE" }

$env:MOVIE_BUFF_BOM_ONLY_OUTPUT = Join-Path $EvidenceRoot 'bom-only-report.json'
node scripts/movie-buff-migration-bom-only-check.mjs $integrationBaseSha `
  1> (Join-Path $EvidenceRoot 'bom-only.stdout.txt') `
  2> (Join-Path $EvidenceRoot 'bom-only.stderr.txt')
if ($LASTEXITCODE -ne 0) { throw "BOM-only proof failed: $LASTEXITCODE" }

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
if (git status --porcelain) { throw 'Checkout is not clean after validation' }

@(
  'lane=MOV-15-MOV-16-MOV-17-PR12-composition'
  'repository=BuffGamesStudio/buff-platform'
  "remote=$remote"
  "source_sha=$actualSha"
  "source_tree=$actualTree"
  "source_ref=$actualBranch"
  "raw_composition_sha=$rawCompositionSha"
  "raw_composition_tree=$rawCompositionTree"
  "component_mov15_sha=$componentMov15Sha"
  "component_mov15_tree=$componentMov15Tree"
  "component_mov16_sha=$componentMov16Sha"
  "component_mov16_tree=$componentMov16Tree"
  "component_mov17_sha=$componentMov17Sha"
  "component_mov17_tree=$componentMov17Tree"
  "component_encoding_sha=$componentEncodingSha"
  "component_encoding_tree=$componentEncodingTree"
  "integration_base_sha=$integrationBaseSha"
  "runner_os=$env:RUNNER_OS"
  "powershell_version=$($PSVersionTable.PSVersion)"
  "node_version=$((node --version).Trim())"
  "npm_version=$((npm --version).Trim())"
  'target_kind=hosted-windows-command-shell-static-build-and-byte-validation'
  'database_behavior=UNKNOWN'
  'browser_behavior=UNKNOWN'
  'hosted_state=UNKNOWN'
  'physical_windows_cursor_equivalence=UNKNOWN'
  "workflow_run_id=$env:GITHUB_RUN_ID"
  "workflow_run_attempt=$env:GITHUB_RUN_ATTEMPT"
  "generated_at=$([DateTime]::UtcNow.ToString('o'))"
) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8

$manifestPath = Join-Path $EvidenceRoot 'sha256.csv'
Get-ChildItem -LiteralPath $EvidenceRoot -File |
  Where-Object Name -ne 'sha256.csv' |
  Sort-Object Name |
  ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
    [pscustomobject]@{ Path = $_.Name; Hash = $hash.Hash }
  } |
  Export-Csv -LiteralPath $manifestPath -NoTypeInformation

foreach ($entry in Import-Csv -LiteralPath $manifestPath) {
  if ([System.IO.Path]::IsPathRooted($entry.Path)) { throw "Evidence path must be relative: $($entry.Path)" }
  $target = Join-Path $EvidenceRoot $entry.Path
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing evidence target: $($entry.Path)" }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.Hash) {
    throw "Evidence hash mismatch: $($entry.Path)"
  }
}
