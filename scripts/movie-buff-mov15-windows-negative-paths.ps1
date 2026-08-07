param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [string]$EvidenceRoot = $(
    if ($env:RUNNER_TEMP) {
      Join-Path $env:RUNNER_TEMP 'mov15-windows-evidence\negative-paths'
    } else {
      Join-Path (Get-Location) 'artifacts\mov15-windows-evidence\negative-paths'
    }
  )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = (Get-Location).Path
$wrapperPath = Join-Path $repositoryRoot 'scripts\movie-buff-mov15-windows-digital-twin.ps1'
$pwshPath = (Get-Command pwsh -ErrorAction Stop).Source
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$workspaceRoot = Join-Path $tempRoot 'm15neg'
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-WrapperExpectedFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$Sha,
    [Parameter(Mandatory = $true)][string]$ExpectedFailurePattern,
    [string]$PathOverride
  )

  $caseRoot = Join-Path $EvidenceRoot $Name
  $caseEvidence = Join-Path $caseRoot 'wrapper-evidence'
  $stdoutPath = Join-Path $caseRoot 'stdout.txt'
  $stderrPath = Join-Path $caseRoot 'stderr.txt'
  $exitPath = Join-Path $caseRoot 'exit.txt'
  New-Item -ItemType Directory -Force -Path $caseRoot | Out-Null

  $previousPath = $env:PATH
  Push-Location $WorkingDirectory
  try {
    if ($PSBoundParameters.ContainsKey('PathOverride')) {
      $env:PATH = $PathOverride
    }

    $global:LASTEXITCODE = 0
    & $pwshPath `
      -NoLogo `
      -NoProfile `
      -NonInteractive `
      -File $wrapperPath `
      -ExpectedSha $Sha `
      -EvidenceRoot $caseEvidence `
      1> $stdoutPath `
      2> $stderrPath
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  } finally {
    $env:PATH = $previousPath
    Pop-Location
  }

  Set-Content -LiteralPath $exitPath -Value $exitCode -Encoding ascii
  if ($exitCode -eq 0) {
    throw "$Name unexpectedly succeeded."
  }

  $failurePath = Join-Path $caseEvidence 'failure.txt'
  if (-not (Test-Path -LiteralPath $failurePath -PathType Leaf)) {
    throw "$Name did not produce failure.txt."
  }

  $failureText = Get-Content -LiteralPath $failurePath -Raw
  if ($failureText -notmatch $ExpectedFailurePattern) {
    throw "$Name failed for an unexpected reason: $failureText"
  }

  $stdoutText = Get-Content -LiteralPath $stdoutPath -Raw
  if ($stdoutText -notmatch 'MOV15_WINDOWS_DIGITAL_TWIN=FAIL') {
    throw "$Name did not emit the required FAIL classification."
  }

  $results.Add([pscustomobject]@{
    Case = $Name
    Result = 'PASS'
    ExpectedFailure = $ExpectedFailurePattern
    ExitCode = $exitCode
  })
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
Remove-Item -LiteralPath $workspaceRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $workspaceRoot | Out-Null

try {
  if (-not (Test-Path -LiteralPath $wrapperPath -PathType Leaf)) {
    throw "MOV-15 wrapper is missing: $wrapperPath"
  }

  $actualSha = (git rev-parse HEAD).Trim()
  if ($actualSha -ne $ExpectedSha) {
    throw "Harness SHA mismatch. Expected $ExpectedSha; observed $actualSha"
  }
  if (git status --porcelain) {
    throw 'Harness requires a clean worktree.'
  }

  $wrongFolder = Join-Path $workspaceRoot 'wrong-folder'
  New-Item -ItemType Directory -Force -Path $wrongFolder | Out-Null
  Invoke-WrapperExpectedFailure `
    -Name 'wrong-folder' `
    -WorkingDirectory $wrongFolder `
    -Sha $ExpectedSha `
    -ExpectedFailurePattern 'Required MOV-15 file is missing from the expected working directory'

  Invoke-WrapperExpectedFailure `
    -Name 'wrong-sha' `
    -WorkingDirectory $repositoryRoot `
    -Sha ('0' * 40) `
    -ExpectedFailurePattern 'Exact SHA mismatch'

  $requiredFile = Join-Path $repositoryRoot 'tests\movie-buff-public-matchmaking-handoff.test.mjs'
  $requiredFileBackup = Join-Path $workspaceRoot 'movie-buff-public-matchmaking-handoff.test.mjs.backup'
  try {
    Move-Item -LiteralPath $requiredFile -Destination $requiredFileBackup
    Invoke-WrapperExpectedFailure `
      -Name 'missing-file' `
      -WorkingDirectory $repositoryRoot `
      -Sha $ExpectedSha `
      -ExpectedFailurePattern 'Required MOV-15 file is missing from the expected working directory'
  } finally {
    if (Test-Path -LiteralPath $requiredFileBackup -PathType Leaf) {
      Move-Item -LiteralPath $requiredFileBackup -Destination $requiredFile -Force
    }
  }

  $emptyPath = Join-Path $workspaceRoot 'empty-path'
  New-Item -ItemType Directory -Force -Path $emptyPath | Out-Null
  Invoke-WrapperExpectedFailure `
    -Name 'missing-tool' `
    -WorkingDirectory $repositoryRoot `
    -Sha $ExpectedSha `
    -ExpectedFailurePattern 'Required command is missing: git' `
    -PathOverride $emptyPath

  $dirtyFile = Join-Path $repositoryRoot 'README.md'
  $dirtyFileOriginalBytes = [System.IO.File]::ReadAllBytes($dirtyFile)
  try {
    Add-Content -LiteralPath $dirtyFile -Value '' -Encoding utf8
    Invoke-WrapperExpectedFailure `
      -Name 'dirty-worktree' `
      -WorkingDirectory $repositoryRoot `
      -Sha $ExpectedSha `
      -ExpectedFailurePattern 'Worktree is not clean before validation'
  } finally {
    [System.IO.File]::WriteAllBytes($dirtyFile, $dirtyFileOriginalBytes)
  }

  if (git status --porcelain) {
    throw 'Negative-path cleanup did not restore a clean worktree.'
  }

  $results | Export-Csv -LiteralPath (Join-Path $EvidenceRoot 'negative-path-results.csv') -NoTypeInformation
  @(
    'lane=MOV-15'
    "source_sha=$ExpectedSha"
    "powershell_version=$($PSVersionTable.PSVersion)"
    'classification=PASS'
    'wrong_folder=PASS'
    'wrong_sha=PASS'
    'missing_file=PASS'
    'missing_tool=PASS'
    'dirty_worktree=PASS'
    'cleanup=PASS'
    "generated_at=$([DateTime]::UtcNow.ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8

  $manifestPath = Join-Path $EvidenceRoot 'sha256.csv'
  Get-ChildItem -LiteralPath $EvidenceRoot -File -Recurse |
    Where-Object FullName -ne $manifestPath |
    Sort-Object FullName |
    ForEach-Object {
      $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
      [pscustomobject]@{
        Path = [System.IO.Path]::GetRelativePath($EvidenceRoot, $_.FullName)
        Hash = $hash.Hash
      }
    } |
    Export-Csv -LiteralPath $manifestPath -NoTypeInformation

  foreach ($entry in Import-Csv -LiteralPath $manifestPath) {
    if ([System.IO.Path]::IsPathRooted($entry.Path)) {
      throw "Negative-path evidence hash path must be relative: $($entry.Path)"
    }
    $artifactPath = Join-Path $EvidenceRoot $entry.Path
    $observedHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash
    if ($observedHash -ne $entry.Hash) {
      throw "Negative-path evidence hash mismatch: $($entry.Path)"
    }
  }

  'MOV15_WINDOWS_NEGATIVE_PATHS=PASS'
  exit 0
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'failure.txt') -Encoding utf8
  'MOV15_WINDOWS_NEGATIVE_PATHS=FAIL'
  exit 1
} finally {
  Remove-Item -LiteralPath $workspaceRoot -Recurse -Force -ErrorAction SilentlyContinue
}
