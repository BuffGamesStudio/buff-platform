[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedSha,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ProductSha,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedBranch,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE: $FilePath $($Arguments -join ' ')"
  }
}

function Assert-LocalTarget {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowEmptyString()][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return
  }

  try {
    $uri = [System.Uri]$Value
  }
  catch {
    throw "$Name is malformed."
  }

  $allowedHosts = @('localhost', '127.0.0.1', '::1')
  if ($allowedHosts -notcontains $uri.Host.ToLowerInvariant()) {
    throw "$Name must target localhost; hosted and production targets are refused."
  }
}

$repoRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
  throw 'Not inside a Git repository.'
}
Set-Location $repoRoot

$remote = (git remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0 -or $remote -notmatch 'BuffGamesStudio/buff-platform(?:\.git)?$') {
  throw 'Wrong repository remote.'
}

$actualSha = (git rev-parse HEAD).Trim()
if ($actualSha -ne $ExpectedSha) {
  throw "Wrong controller SHA. Expected $ExpectedSha, got $actualSha."
}

if ($env:GITHUB_REF_NAME -and $env:GITHUB_REF_NAME -ne $ExpectedBranch) {
  throw "Wrong branch. Expected $ExpectedBranch, got $($env:GITHUB_REF_NAME)."
}

$productTree = (git show -s --format=%T $ProductSha).Trim()
if ($LASTEXITCODE -ne 0 -or $productTree -ne 'cbd8061c9c4da410e39363beee02bf53194ed53f') {
  throw 'Product SHA or tree mismatch.'
}

if (git status --porcelain --untracked-files=all) {
  throw 'Worktree is dirty before execution.'
}

$repoFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$evidenceFull = [System.IO.Path]::GetFullPath($EvidenceRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if ($evidenceFull.StartsWith($repoFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or $evidenceFull -eq $repoFull) {
  throw 'Evidence directory must be outside the source checkout.'
}

$targetVariables = @(
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'STORAGE_URL'
)
foreach ($name in $targetVariables) {
  Assert-LocalTarget -Name $name -Value ([Environment]::GetEnvironmentVariable($name))
}

New-Item -ItemType Directory -Force -Path $evidenceFull | Out-Null
$identityPath = Join-Path $evidenceFull 'identity.txt'
$testLogPath = Join-Path $evidenceFull 'windows-focused-tests.log'
$statusPath = Join-Path $evidenceFull 'status.txt'
$hashPath = Join-Path $evidenceFull 'sha256.txt'

@(
  "repository=BuffGamesStudio/buff-platform",
  "branch=$ExpectedBranch",
  "controller_sha=$ExpectedSha",
  "controller_tree=$((git show -s --format=%T $ExpectedSha).Trim())",
  "product_sha=$ProductSha",
  "product_tree=$productTree",
  "captured_utc=$([DateTime]::UtcNow.ToString('o'))",
  "powershell=$($PSVersionTable.PSVersion)",
  "node=$(& node --version)",
  "npm=$(& npm --version)"
) | Set-Content -Path $identityPath -Encoding utf8

Invoke-Checked npm ci --ignore-scripts --no-audit --no-fund

$tests = @(
  'tests/movie-buff-public-matchmaking-contract.test.mjs',
  'tests/movie-buff-public-matchmaking-handoff.test.mjs',
  'tests/movie-buff-vip-authority.test.mjs',
  'tests/movie-buff-vip-finalize-contract.test.mjs',
  'tests/movie-buff-authoritative-phase-runtime.test.mjs',
  'tests/movie-buff-server-phase-machine.test.mjs',
  'tests/movie-buff-visual-runtime.test.mjs',
  'tests/movie-buff-migration-encoding.test.mjs',
  'tests/movie-buff-current-hardening-reconciliation.test.mjs',
  'tests/movie-buff-independent-security-validation.test.mjs',
  'tests/movie-buff-release-evidence-integrity.test.mjs'
)
foreach ($test in $tests) {
  if (-not (Test-Path -LiteralPath $test -PathType Leaf)) {
    throw "Required focused test is missing: $test"
  }
}

& node --test @tests 2>&1 | Tee-Object -FilePath $testLogPath
if ($LASTEXITCODE -ne 0) {
  throw "Focused tests failed with exit code $LASTEXITCODE."
}

if (git status --porcelain --untracked-files=all) {
  throw 'Worktree is dirty after execution.'
}

@(
  'windows_command_shell=PASS',
  'focused_static_tests=PASS',
  'database=UNKNOWN',
  'browser=UNKNOWN',
  'hosted_security=FAIL',
  'release=NO-GO'
) | Set-Content -Path $statusPath -Encoding utf8

Get-ChildItem -Path $evidenceFull -File | Sort-Object Name | ForEach-Object {
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
  "$($hash.Hash.ToLowerInvariant())  $($_.Name)"
} | Set-Content -Path $hashPath -Encoding ascii

Write-Host "Agent 5 Windows evidence written outside the checkout: $evidenceFull"
