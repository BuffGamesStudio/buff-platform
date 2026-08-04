param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [string]$EvidenceRoot = (Join-Path $env:RUNNER_TEMP 'mov19-windows-evidence')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Classification {
  param([ValidateSet('PASS','FAIL','UNKNOWN','NOT APPLICABLE')][string]$Value)
  "MOV19_WINDOWS_DIGITAL_TWIN=$Value"
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
    & $Action 1> $stdout 2> $stderr
    $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
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

  $actualSha = (git rev-parse HEAD).Trim()
  if ($actualSha -ne $ExpectedSha) {
    throw "Exact SHA mismatch. Expected $ExpectedSha; observed $actualSha"
  }

  if (git status --porcelain) {
    throw 'Worktree is not clean before validation.'
  }

  $nodeVersion = (node --version).Trim()
  $npmVersion = (npm --version).Trim()
  $psVersion = $PSVersionTable.PSVersion.ToString()

  @(
    "source_sha=$actualSha"
    "powershell_version=$psVersion"
    "node_version=$nodeVersion"
    "npm_version=$npmVersion"
    "repository_root=$PWD"
    "evidence_root=$EvidenceRoot"
    "generated_at=$([DateTime]::UtcNow.ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8

  $env:MOVIE_BUFF_VALIDATION_ROOT = $PWD.Path
  $env:MOVIE_BUFF_VALIDATION_SHA = $ExpectedSha
  $env:MOVIE_BUFF_EVIDENCE_OUTPUT = Join-Path $EvidenceRoot 'repository-static-evidence.json'

  Invoke-Captured 'npm-ci' { npm ci --ignore-scripts --no-audit --no-fund }
  Invoke-Captured 'validator-self-tests' {
    node --test --test-name-pattern='target root|collector forbids|collector evaluates' tests/movie-buff-independent-security-validation.test.mjs
  }
  Invoke-Captured 'static-collector' { node scripts/movie-buff-security-evidence.mjs }

  if (-not (Test-Path -LiteralPath $env:MOVIE_BUFF_EVIDENCE_OUTPUT)) {
    throw 'Repository-static evidence bundle was not created.'
  }

  $env:MOVIE_BUFF_EVIDENCE_JSON = $env:MOVIE_BUFF_EVIDENCE_OUTPUT
  Invoke-Captured 'evidence-integrity' { node --test tests/movie-buff-release-evidence-integrity.test.mjs }
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

  Get-ChildItem -LiteralPath $EvidenceRoot -File |
    Where-Object Name -ne 'sha256.csv' |
    Get-FileHash -Algorithm SHA256 |
    Select-Object Path, Hash |
    Export-Csv -LiteralPath (Join-Path $EvidenceRoot 'sha256.csv') -NoTypeInformation

  Write-Classification PASS
  exit 0
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'failure.txt') -Encoding utf8
  Write-Classification FAIL
  exit 1
}
