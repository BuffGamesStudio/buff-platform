#Requires -Version 7.4
[CmdletBinding()]
param(
    [ValidateSet("Preflight", "StagingDryRun", "LocalRehearsal")]
    [string]$Mode = "Preflight",

    [Parameter(Mandatory = $true)]
    [string]$ExpectedBranch,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedTree,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedCandidateSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedCandidateTree,

    [Parameter(Mandatory = $true)]
    [string]$EvidenceDirectory,

    [string]$OverlayPath = "operations/movie-buff/release-recovery-overlay-v3.json",

    [string]$ApprovedStagingProjectRef = "",

    [string]$ApprovedStagingDatabaseHost = "",

    [string]$DatabaseUrl = $env:MOVIE_BUFF_LOCAL_DATABASE_URL,

    [switch]$RequireBackupIdentity,

    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([string[]]$Arguments)
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
    return ($output | Out-String).Trim()
}

function Write-Json {
    param([string]$Path, $Object)
    $Object | ConvertTo-Json -Depth 50 -Compress | Set-Content -LiteralPath $Path -Encoding utf8NoBOM
}

function Test-Property {
    param($Object, [string]$Name)
    return $null -ne $Object.PSObject.Properties[$Name]
}

function Redact-Text {
    param([string]$Text)
    $result = $Text
    $result = $result -replace '(?i)(postgres(?:ql)?://)[^\s"''<>]+', '$1[REDACTED]'
    $result = $result -replace '(?i)(authorization:\s*bearer\s+)[^\s"''<>]+', '$1[REDACTED]'
    $result = $result -replace '(?i)(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})', '[REDACTED_JWT]'
    $result = $result -replace '(?i)((?:password|token|secret|key)\s*[=:]\s*)[^\s"''<>]+', '$1[REDACTED]'
    return $result
}

$repoRoot = [System.IO.Path]::GetFullPath((Invoke-Git @("rev-parse", "--show-toplevel")))
$invocationRoot = [System.IO.Path]::GetFullPath((Get-Location).Path)
if ($invocationRoot -ne $repoRoot) {
    throw "Wrong working directory: invoke from repository root."
}
Set-Location $repoRoot

$evidenceFull = [System.IO.Path]::GetFullPath($EvidenceDirectory)
$repoPrefix = $repoRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
if ($evidenceFull -eq $repoRoot -or $evidenceFull.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "EvidenceDirectory must be outside the source checkout."
}
New-Item -ItemType Directory -Path $evidenceFull -Force | Out-Null

$branch = Invoke-Git @("rev-parse", "--abbrev-ref", "HEAD")
if ($branch -eq "HEAD" -and $env:GITHUB_HEAD_REF) { $branch = $env:GITHUB_HEAD_REF }
if ($branch -ne $ExpectedBranch) { throw "Wrong branch: expected $ExpectedBranch, got $branch." }

$sha = Invoke-Git @("rev-parse", "HEAD")
$tree = Invoke-Git @("rev-parse", "HEAD^{tree}")
if ($sha -ne $ExpectedSha) { throw "Wrong SHA: expected $ExpectedSha, got $sha." }
if ($tree -ne $ExpectedTree) { throw "Wrong tree: expected $ExpectedTree, got $tree." }
if ((Invoke-Git @("status", "--porcelain")).Length -ne 0) { throw "Worktree is dirty." }

$overlayFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OverlayPath))
if (-not (Test-Path -LiteralPath $overlayFull -PathType Leaf)) { throw "Missing live overlay." }
$overlay = Get-Content -LiteralPath $overlayFull -Raw | ConvertFrom-Json -Depth 50

$baseFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $overlay.baseManifestPath))
if (-not (Test-Path -LiteralPath $baseFull -PathType Leaf)) { throw "Missing base manifest." }
$baseBlob = Invoke-Git @("hash-object", $baseFull)
if ($baseBlob -ne $overlay.baseManifestGitBlobSha) {
    throw "Base manifest blob mismatch: expected $($overlay.baseManifestGitBlobSha), got $baseBlob."
}

if ($overlay.candidate.productSha -ne $ExpectedCandidateSha) {
    throw "Candidate SHA mismatch."
}
if ($overlay.candidate.productTree -ne $ExpectedCandidateTree) {
    throw "Candidate tree mismatch."
}

if ($RequireBackupIdentity -and $overlay.targets.backupOrPitr.classification -ne "PASS") {
    throw "Required backup/PITR identity is missing or unverified."
}

$resolved = Get-Content -LiteralPath $baseFull -Raw | ConvertFrom-Json -Depth 50
foreach ($override in $overlay.migrationOverrides) {
    if (Test-Property -Object $override -Name "orders") {
        foreach ($order in $override.orders) {
            $resolved.migrations[[int]$order - 1][2] = $override.sourceHead
        }
    } else {
        $row = $resolved.migrations[[int]$override.order - 1]
        if (Test-Property -Object $override -Name "sourceHead") { $row[2] = $override.sourceHead }
        if (Test-Property -Object $override -Name "migrationSha256") { $row[4] = $override.migrationSha256 }
        if (Test-Property -Object $override -Name "rollbackSha256") { $row[8] = $override.rollbackSha256 }
    }
}
$resolved.candidate = $overlay.candidate
$resolved.targets = $overlay.targets
$resolved.authorities = $overlay.authorityFields
$resolved.blockers = $overlay.hardStops
$resolved.generatedAtUtc = $overlay.generatedAtUtc
$resolved.release = $overlay.classification

$orders = @($resolved.migrations | ForEach-Object { [int]$_[0] })
if (($orders -join ",") -ne ((1..$orders.Count) -join ",")) {
    throw "Wrong migration order."
}

$hashRows = New-Object System.Collections.Generic.List[object]
foreach ($row in $resolved.migrations) {
    if ([string]$row[4] -notmatch '^[0-9a-f]{64}$') {
        throw "Invalid migration SHA-256 in resolved manifest."
    }
    $hashRows.Add([pscustomobject]@{kind="migration";order=[int]$row[0];path=[string]$row[3];sha256=[string]$row[4]})
    if ($null -ne $row[7]) {
        if ([string]$row[8] -notmatch '^[0-9a-f]{64}$') {
            throw "Invalid rollback SHA-256 in resolved manifest."
        }
        $hashRows.Add([pscustomobject]@{kind="rollback";order=[int]$row[0];path=[string]$row[7];sha256=[string]$row[8]})
    }
}

$gaps = @($resolved.migrations | Where-Object { $null -eq $_[7] })
if ($gaps.Count -ne $overlay.remainingRollbackGaps.Count) {
    throw "Rollback-gap count mismatch."
}
foreach ($gap in $overlay.remainingRollbackGaps) {
    $row = $resolved.migrations[[int]$gap.order - 1]
    if ($row[3] -ne $gap.migration -or $row[4] -ne $gap.sha256 -or $null -ne $row[7]) {
        throw "Rollback-gap identity mismatch."
    }
}

$resolvedPath = Join-Path $evidenceFull "resolved-release-recovery-manifest.json"
Write-Json -Path $resolvedPath -Object $resolved
Copy-Item -LiteralPath $overlayFull -Destination (Join-Path $evidenceFull "live-overlay.json") -Force
$hashRows | Export-Csv -LiteralPath (Join-Path $evidenceFull "resolved-file-hashes.csv") -NoTypeInformation -Encoding utf8NoBOM

$toolVersions = @{
    git = (& git --version 2>&1 | Out-String).Trim()
    pwsh = $PSVersionTable.PSVersion.ToString()
}
Write-Json -Path (Join-Path $evidenceFull "tool-versions.json") -Object $toolVersions
Get-ChildItem Env: |
    Where-Object { $_.Name -match '(?i)(SUPABASE|VERCEL|DATABASE|POSTGRES|MOVIE_BUFF)' } |
    Select-Object -ExpandProperty Name |
    Sort-Object -Unique |
    Set-Content -LiteralPath (Join-Path $evidenceFull "environment-variable-names.txt") -Encoding utf8NoBOM

$fixture = 'postgresql://user:password@example.invalid/db Authorization: Bearer fake-token password=demo eyJaaaaaaaaaaa.bbbbbbbbbbb.ccccccccccc'
$redacted = Redact-Text $fixture
if ($redacted -match 'user:password|fake-token|password=demo|eyJaaaaaaaa') {
    throw "Redaction self-test failed."
}
Write-Json -Path (Join-Path $evidenceFull "redaction-self-test.json") -Object @{classification="PASS";output=$redacted}

if ($Mode -eq "StagingDryRun") {
    if (-not $ApprovedStagingProjectRef -or -not $ApprovedStagingDatabaseHost) {
        throw "StagingDryRun requires an explicit staging allowlist."
    }
    if ($ApprovedStagingProjectRef -ne $overlay.targets.supabaseStaging.projectRef) {
        throw "Unapproved staging project ref."
    }
    if ($ApprovedStagingDatabaseHost -ne $overlay.targets.supabaseStaging.databaseHost) {
        throw "Unapproved staging database host."
    }
    Write-Json -Path (Join-Path $evidenceFull "staging-allowlist.json") -Object @{
        projectRef = $ApprovedStagingProjectRef
        databaseHost = $ApprovedStagingDatabaseHost
        classification = "PASS — identity only; no connection or mutation"
    }
}

if ($Mode -eq "LocalRehearsal") {
    if ($overlay.candidate.classification -eq "FAIL") {
        throw "LocalRehearsal is blocked while the current candidate classification is FAIL."
    }
    if (-not $Execute) { throw "LocalRehearsal requires explicit -Execute." }
    if ($gaps.Count -gt 0) { throw "LocalRehearsal is blocked by unresolved rollback gaps." }
    throw "LocalRehearsal is not applicable from the operations-only checkout; run the resolved manifest from the exact candidate checkout."
}

$identity = @{
    repository = "BuffGamesStudio/buff-platform"
    branch = $branch
    sha = $sha
    tree = $tree
    candidateSha = $overlay.candidate.productSha
    candidateTree = $overlay.candidate.productTree
    candidateClassification = $overlay.candidate.classification
    overlayBlob = (Invoke-Git @("hash-object", $overlayFull))
    baseManifestBlob = $baseBlob
    migrationCount = $resolved.migrations.Count
    rollbackCount = $resolved.migrations.Count - $gaps.Count
    rollbackGapCount = $gaps.Count
    mode = $Mode
    capturedAtUtc = [DateTimeOffset]::UtcNow.ToString("o")
}
Write-Json -Path (Join-Path $evidenceFull "live-identity.json") -Object $identity

if ((Invoke-Git @("status", "--porcelain")).Length -ne 0) { throw "Final worktree is dirty." }

$files = Get-ChildItem -LiteralPath $evidenceFull -File -Recurse | Where-Object { $_.Name -ne "sha256.txt" } | Sort-Object FullName
$lines = foreach ($file in $files) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $relative = [System.IO.Path]::GetRelativePath($evidenceFull, $file.FullName).Replace("\", "/")
    "$hash  $relative"
}
$lines | Set-Content -LiteralPath (Join-Path $evidenceFull "sha256.txt") -Encoding ascii

Write-Host "Agent 9 live $Mode PASS for operations SHA $sha and candidate $ExpectedCandidateSha."
