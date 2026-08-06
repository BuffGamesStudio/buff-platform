[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedBranch,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ProductSha,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ProductTree,
  [Parameter(Mandatory = $true)][string]$EvidenceRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

$actualSha = (git rev-parse HEAD).Trim()
$actualTree = (git rev-parse 'HEAD^{tree}').Trim()
if ($actualSha -ne $env:GITHUB_SHA) { throw "SHA mismatch: $actualSha" }
if ($env:GITHUB_REF_NAME -ne $ExpectedBranch) { throw "Branch mismatch: $env:GITHUB_REF_NAME" }
if ((git show -s --format=%T $ProductSha).Trim() -ne $ProductTree) { throw 'Product tree mismatch.' }
git merge-base --is-ancestor $ProductSha $env:GITHUB_SHA
if ($LASTEXITCODE -ne 0) { throw 'Product candidate is not an ancestor.' }
if (git status --porcelain --untracked-files=all) { throw 'Dirty checkout before Windows lab.' }

$spacePath = Join-Path $env:RUNNER_TEMP 'Agent 7 path with spaces'
New-Item -ItemType Directory -Force -Path $spacePath | Out-Null
node -e "if (!process.argv[1].includes(' ')) process.exit(1)" $spacePath
if ($LASTEXITCODE -ne 0) { throw 'Path-with-spaces probe failed.' }

function Invoke-Captured {
  param([string]$Name, [string]$Command, [string[]]$Arguments)
  & $Command @Arguments `
    1> (Join-Path $EvidenceRoot "$Name.stdout.txt") `
    2> (Join-Path $EvidenceRoot "$Name.stderr.txt")
  $code = $LASTEXITCODE
  Set-Content -LiteralPath (Join-Path $EvidenceRoot "$Name.exit.txt") -Value $code -Encoding ascii
  if ($code -ne 0) { throw "$Name failed with exit code $code" }
}

Invoke-Captured 'npm-ci' 'npm.cmd' @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
Invoke-Captured 'tests' 'node.exe' @(
  '--test',
  'tests/movie-buff-public-matchmaking-contract.test.mjs',
  'tests/movie-buff-vip-null-category-rollback-contract.test.mjs',
  'tests/movie-buff-authoritative-phase-runtime.test.mjs',
  'tests/movie-buff-authoritative-visual-adapter.test.mjs',
  'tests/movie-buff-migration-encoding.test.mjs'
)
Invoke-Captured 'typescript' 'npx.cmd' @('tsc', '--noEmit')

$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-publishable-placeholder'
$env:SUPABASE_SERVICE_ROLE_KEY = 'local-service-placeholder'
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3001'
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_BRANCH = $ExpectedBranch
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_SHA = $env:GITHUB_SHA
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_MARKER = "agent7-v3w-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
Invoke-Captured 'production-build' 'npm.cmd' @('run', 'build')

git checkout -- next-env.d.ts 2>$null
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed.' }
if (git status --porcelain --untracked-files=all) { throw 'Dirty checkout after Windows lab.' }

[ordered]@{
  repository = 'BuffGamesStudio/buff-platform'
  branch = $env:GITHUB_REF_NAME
  controllerSha = $env:GITHUB_SHA
  controllerTree = $actualTree
  productSha = $ProductSha
  productTree = $ProductTree
  PowerShell = $PSVersionTable.PSVersion.ToString()
  node = (& node --version)
  npm = (& npm.cmd --version)
  capturedUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'identity.json') -Encoding utf8NoBOM

@(
  'windows=PASS'
  'path_spaces=PASS'
  'quoting=PASS'
  'child_exit=PASS'
  'last_exit_code=PASS'
  'stdout_stderr=PASS'
  'clean=PASS'
  'release=NO-GO'
) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'status.txt') -Encoding ascii

$hashes = Get-ChildItem -LiteralPath $EvidenceRoot -File |
  Where-Object { $_.Name -ne 'sha256.txt' } |
  Sort-Object Name |
  ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$hash *$($_.Name)"
  }
$hashes | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'sha256.txt') -Encoding ascii
