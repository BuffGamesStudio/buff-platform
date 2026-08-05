param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [string]$EvidenceRoot = $(
    if ($env:RUNNER_TEMP) {
      Join-Path $env:RUNNER_TEMP 'mov17-windows-evidence'
    } else {
      Join-Path (Get-Location) 'artifacts\mov17-windows-evidence'
    }
  )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Classification {
  param([ValidateSet('PASS','FAIL','UNKNOWN','NOT APPLICABLE')][string]$Value)
  "MOV17_WINDOWS_DIGITAL_TWIN=$Value"
}

function Assert-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command is missing: $Name"
  }
}

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  $stdout = Join-Path $EvidenceRoot "$Name.stdout.txt"
  $stderr = Join-Path $EvidenceRoot "$Name.stderr.txt"
  $exitFile = Join-Path $EvidenceRoot "$Name.exit.txt"
  try {
    $global:LASTEXITCODE = 0
    & $Action 1> $stdout 2> $stderr
    $code = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  } catch {
    $_ | Out-String | Set-Content -LiteralPath $stderr -Encoding utf8
    $code = 1
  }
  Set-Content -LiteralPath $exitFile -Value $code -Encoding ascii
  if ($code -ne 0) {
    throw "$Name failed with exit code $code"
  }
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

try {
  Assert-Command git
  Assert-Command node
  Assert-Command npm

  foreach ($requiredPath in @(
    'package.json',
    'package-lock.json',
    'supabase/migrations/20260804083500_movie_buff_reconnect_buster_boundary_repair.sql',
    'supabase/rollbacks/20260804083500_movie_buff_reconnect_buster_boundary_repair.rollback.sql',
    'supabase/migrations/20260804083600_movie_buff_match_start_handoff.sql',
    'supabase/rollbacks/20260804083600_movie_buff_match_start_handoff.rollback.sql',
    'supabase/tests/movie_buff_match_start_handoff_test.sql',
    'supabase/tests/movie_buff_match_start_handoff_rollback_test.sql',
    'tests/movie-buff-match-start-handoff.test.mjs',
    'scripts/movie-buff-reconnect-race-proof.mjs'
  )) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
      throw "Required MOV-17 file is missing from the expected working directory: $requiredPath"
    }
  }

  $actualSha = (git rev-parse HEAD).Trim()
  if ($actualSha -ne $ExpectedSha) {
    throw "Exact SHA mismatch. Expected $ExpectedSha; observed $actualSha"
  }
  if (git status --porcelain) {
    throw 'Worktree is not clean before validation.'
  }

  @(
    "lane=MOV-17"
    "source_sha=$actualSha"
    "powershell_version=$($PSVersionTable.PSVersion)"
    "node_version=$((node --version).Trim())"
    "npm_version=$((npm --version).Trim())"
    "repository_root=$PWD"
    "target_kind=repository-static-and-localhost-placeholder-build"
    "database_behavior=UNKNOWN"
    "browser_behavior=UNKNOWN"
    "physical_windows_equivalence=UNKNOWN"
    "generated_at=$([DateTime]::UtcNow.ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8

  Invoke-Captured 'npm-ci' { npm ci --ignore-scripts --no-audit --no-fund }
  Invoke-Captured 'node-syntax-reconnect-proof' {
    node --check scripts/movie-buff-reconnect-race-proof.mjs
  }
  Invoke-Captured 'node-syntax-evidence-runner' {
    node --check scripts/movie-buff-three-client-phase-evidence-runner.mjs
  }
  Invoke-Captured 'mov17-contract-tests' {
    node --test `
      tests/movie-buff-server-phase-machine.test.mjs `
      tests/movie-buff-authoritative-phase-runtime.test.mjs `
      tests/movie-buff-buster-safe-boundary.test.mjs `
      tests/movie-buff-phase-tile-mutation-guard.test.mjs `
      tests/movie-buff-match-start-handoff.test.mjs
  }
  Invoke-Captured 'typescript' { npx --no-install tsc --noEmit }

  $env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'digital-twin-placeholder'
  $env:SUPABASE_SERVICE_ROLE_KEY = 'digital-twin-placeholder'
  Invoke-Captured 'production-build' { npm run build }
  Invoke-Captured 'diff-check' { git diff --check }

  $finalStatus = git status --porcelain
  $finalStatus | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'git-status.txt') -Encoding utf8
  if ($finalStatus) {
    throw 'Worktree is not clean after validation.'
  }

  $manifestPath = Join-Path $EvidenceRoot 'sha256.csv'
  Get-ChildItem -LiteralPath $EvidenceRoot -File |
    Where-Object Name -ne 'sha256.csv' |
    Sort-Object Name |
    ForEach-Object {
      $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
      [pscustomobject]@{
        Path = $_.Name
        Hash = $hash.Hash
      }
    } |
    Export-Csv -LiteralPath $manifestPath -NoTypeInformation

  foreach ($entry in Import-Csv -LiteralPath $manifestPath) {
    if ([System.IO.Path]::IsPathRooted($entry.Path)) {
      throw "Evidence hash path must be relative: $($entry.Path)"
    }
    $artifactPath = Join-Path $EvidenceRoot $entry.Path
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
      throw "Evidence hash target is missing: $($entry.Path)"
    }
    $observedHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash
    if ($observedHash -ne $entry.Hash) {
      throw "Evidence hash mismatch: $($entry.Path)"
    }
  }

  Write-Classification PASS
  exit 0
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'failure.txt') -Encoding utf8
  Write-Classification FAIL
  exit 1
}
