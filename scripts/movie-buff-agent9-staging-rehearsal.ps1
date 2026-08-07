#Requires -Version 7.4
[CmdletBinding()]
param(
    [ValidateSet("Preflight", "DryRun", "LocalRehearsal")]
    [string]$Mode = "Preflight",

    [Parameter(Mandatory = $true)]
    [string]$ExpectedBranch,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedSha,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[0-9a-f]{40}$")]
    [string]$ExpectedTree,

    [string]$ManifestPath = "operations/movie-buff/release-recovery-manifest.json",

    [Parameter(Mandatory = $true)]
    [string]$EvidenceDirectory,

    [string]$DatabaseUrl = $env:MOVIE_BUFF_LOCAL_DATABASE_URL,

    [switch]$PackageOnly,

    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ExpectedRepository = "BuffGamesStudio/buff-platform"
$StartedLocalStack = $false
$EvidenceDirectory = [System.IO.Path]::GetFullPath($EvidenceDirectory)

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
    return ($output | Out-String).Trim()
}

function Get-NormalizedRemote {
    param([Parameter(Mandatory = $true)][string]$Remote)
    $value = $Remote.Trim() -replace "\\", "/"
    $value = $value -replace "^git@github\.com:", ""
    $value = $value -replace "^https://github\.com/", ""
    $value = $value -replace "^http://github\.com/", ""
    $value = $value -replace "\.git$", ""
    return $value
}

function Test-LocalHost {
    param([Parameter(Mandatory = $true)][string]$Url)
    try {
        $uri = [System.Uri]$Url
    } catch {
        return $false
    }

    return $uri.Host -in @("localhost", "127.0.0.1", "::1", "[::1]")
}

function Redact-Text {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) { return "" }

    $result = $Text
    $result = $result -replace '(?i)(postgres(?:ql)?://)[^\s"''<>]+', '$1[REDACTED]'
    $result = $result -replace '(?i)(authorization:\s*bearer\s+)[^\s"''<>]+', '$1[REDACTED]'
    $result = $result -replace '(?i)(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})', '[REDACTED_JWT]'
    $result = $result -replace '(?i)((?:password|token|secret|key)\s*[=:]\s*)[^\s"''<>]+', '$1[REDACTED]'
    return $result
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Object
    )
    $Object | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $Path -Encoding utf8NoBOM
}

function Invoke-Recorded {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    $started = [DateTimeOffset]::UtcNow
    $exitCode = 0
    $output = ""
    try {
        $output = (& $Action 2>&1 | Out-String)
        if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
            $exitCode = $LASTEXITCODE
            throw "$Name exited with $exitCode."
        }
    } catch {
        if ($exitCode -eq 0) { $exitCode = 1 }
        $output = "$output`n$($_.Exception.Message)"
        throw
    } finally {
        $safe = Redact-Text $output
        $safe | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "$Name.log") -Encoding utf8NoBOM
        Write-JsonFile -Path (Join-Path $EvidenceDirectory "$Name.exit.json") -Object @{
            name = $Name
            startedAtUtc = $started.ToString("o")
            finishedAtUtc = [DateTimeOffset]::UtcNow.ToString("o")
            exitCode = $exitCode
        }
    }
}

$repoRoot = Invoke-Git @("rev-parse", "--show-toplevel")
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot)
Set-Location $repoRoot

if ($EvidenceDirectory.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "EvidenceDirectory must be outside the source checkout."
}
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null

$remote = Get-NormalizedRemote (Invoke-Git @("remote", "get-url", "origin"))
if ($remote -ne $ExpectedRepository) {
    throw "Wrong repository: expected $ExpectedRepository, got $remote."
}

$currentSha = Invoke-Git @("rev-parse", "HEAD")
$currentTree = Invoke-Git @("rev-parse", "HEAD^{tree}")
$currentBranch = Invoke-Git @("rev-parse", "--abbrev-ref", "HEAD")
if ($currentBranch -eq "HEAD" -and $env:GITHUB_HEAD_REF) {
    $currentBranch = $env:GITHUB_HEAD_REF
}

if ($currentBranch -ne $ExpectedBranch) {
    throw "Wrong branch: expected $ExpectedBranch, got $currentBranch."
}
if ($currentSha -ne $ExpectedSha) {
    throw "Wrong SHA: expected $ExpectedSha, got $currentSha."
}
if ($currentTree -ne $ExpectedTree) {
    throw "Wrong tree: expected $ExpectedTree, got $currentTree."
}
if ((Invoke-Git @("status", "--porcelain")).Length -ne 0) {
    throw "Worktree is dirty."
}

$requiredTools = @("git", "pwsh")
if ($Mode -eq "LocalRehearsal") {
    $requiredTools += @("supabase", "docker", "psql")
}
$toolVersions = [ordered]@{}
foreach ($tool in $requiredTools | Select-Object -Unique) {
    $command = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Missing required tool: $tool"
    }

    $versionText = switch ($tool) {
        "git" { & git --version 2>&1 | Out-String }
        "pwsh" { $PSVersionTable.PSVersion.ToString() }
        "supabase" { & supabase --version 2>&1 | Out-String }
        "docker" { & docker --version 2>&1 | Out-String }
        "psql" { & psql --version 2>&1 | Out-String }
    }
    $toolVersions[$tool] = (Redact-Text $versionText).Trim()
}

$manifestFullPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $ManifestPath))
if (-not (Test-Path -LiteralPath $manifestFullPath -PathType Leaf)) {
    throw "Missing manifest: $ManifestPath"
}
$manifest = Get-Content -LiteralPath $manifestFullPath -Raw | ConvertFrom-Json -Depth 30

$migrationEntries = foreach ($row in $manifest.migrations) {
    [pscustomobject]@{
        order = [int]$row[0]
        laneCode = [string]$row[1]
        sourceHead = [string]$row[2]
        migrationPath = [string]$row[3]
        migrationSha256 = [string]$row[4]
        expectedLedgerName = [string]$row[5]
        dependencyOrders = @($row[6])
        rollbackPath = if ($null -eq $row[7]) { $null } else { [string]$row[7] }
        rollbackSha256 = if ($null -eq $row[8]) { $null } else { [string]$row[8] }
        containmentCode = [string]$row[9]
        executionClassification = [string]$row[10]
        rollbackGap = if ($null -eq $row[11]) { $null } else { [string]$row[11] }
    }
}

$hashRows = New-Object System.Collections.Generic.List[object]
$missingRollback = New-Object System.Collections.Generic.List[string]
foreach ($entry in $migrationEntries) {
    if ($entry.migrationSha256 -notmatch "^[0-9a-f]{64}$") {
        throw "Invalid migration SHA-256 in manifest: $($entry.migrationPath)"
    }

    if ($PackageOnly) {
        $hashRows.Add([pscustomobject]@{kind="migration-manifest";order=$entry.order;path=$entry.migrationPath;sha256=$entry.migrationSha256})
    } else {
        $migrationPath = Join-Path $repoRoot $entry.migrationPath
        if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) { throw "Missing migration: $($entry.migrationPath)" }
        $actualMigrationHash = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualMigrationHash -ne $entry.migrationSha256) { throw "Migration SHA-256 mismatch: $($entry.migrationPath)" }
        $hashRows.Add([pscustomobject]@{kind="migration";order=$entry.order;path=$entry.migrationPath;sha256=$actualMigrationHash})
    }

    if ($null -eq $entry.rollbackPath) {
        $missingRollback.Add($entry.migrationPath)
        continue
    }
    if ($entry.rollbackSha256 -notmatch "^[0-9a-f]{64}$") { throw "Invalid rollback SHA-256 in manifest: $($entry.rollbackPath)" }

    if ($PackageOnly) {
        $hashRows.Add([pscustomobject]@{kind="rollback-manifest";order=$entry.order;path=$entry.rollbackPath;sha256=$entry.rollbackSha256})
    } else {
        $rollbackPath = Join-Path $repoRoot $entry.rollbackPath
        if (-not (Test-Path -LiteralPath $rollbackPath -PathType Leaf)) { throw "Missing rollback: $($entry.rollbackPath)" }
        $actualRollbackHash = (Get-FileHash -LiteralPath $rollbackPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualRollbackHash -ne $entry.rollbackSha256) { throw "Rollback SHA-256 mismatch: $($entry.rollbackPath)" }
        $hashRows.Add([pscustomobject]@{kind="rollback";order=$entry.order;path=$entry.rollbackPath;sha256=$actualRollbackHash})
    }
}

$environmentNames = Get-ChildItem Env: | Where-Object { $_.Name -match "(?i)(SUPABASE|VERCEL|DATABASE|POSTGRES|MOVIE_BUFF)" } | Select-Object -ExpandProperty Name | Sort-Object -Unique
$environmentNames | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "environment-variable-names.txt") -Encoding utf8NoBOM

Write-JsonFile -Path (Join-Path $EvidenceDirectory "identity.json") -Object @{repository=$ExpectedRepository;branch=$currentBranch;sha=$currentSha;tree=$currentTree;capturedAtUtc=[DateTimeOffset]::UtcNow.ToString("o");mode=$Mode}
Write-JsonFile -Path (Join-Path $EvidenceDirectory "tool-versions.json") -Object $toolVersions
$hashRows | Export-Csv -LiteralPath (Join-Path $EvidenceDirectory "file-hashes.csv") -NoTypeInformation -Encoding utf8NoBOM
Copy-Item -LiteralPath $manifestFullPath -Destination (Join-Path $EvidenceDirectory "manifest-copy.json") -Force

$plan = [ordered]@{
    classification = if ($missingRollback.Count -eq 0) { "PASS" } else { "UNKNOWN" }
    mode = $Mode
    missingRollbackDispositions = @($missingRollback)
    rollbackOrder = @($migrationEntries | Sort-Object order -Descending | Where-Object { $null -ne $_.rollbackPath } | ForEach-Object { $_.rollbackPath })
    forwardOrder = @($migrationEntries | Sort-Object order | ForEach-Object { $_.migrationPath })
}
Write-JsonFile -Path (Join-Path $EvidenceDirectory "execution-plan.json") -Object $plan

if ($Mode -eq "Preflight") {
    if ($missingRollback.Count -gt 0) { Write-Warning "Recovery plan is incomplete: $($missingRollback.Count) rollback disposition(s) remain UNKNOWN." }
}
elseif ($Mode -eq "DryRun") {
    if (-not $DatabaseUrl) { throw "DatabaseUrl is required for DryRun target validation." }
    if (-not (Test-LocalHost $DatabaseUrl)) { throw "Refusing non-localhost database target." }
    if ($missingRollback.Count -gt 0) { Write-Warning "DryRun target validation passed, but execution remains blocked by missing rollback dispositions." }
}
elseif ($Mode -eq "LocalRehearsal") {
    if (-not $Execute) { throw "LocalRehearsal requires explicit -Execute." }
    if (-not $DatabaseUrl -or -not (Test-LocalHost $DatabaseUrl)) { throw "Refusing missing or non-localhost database target." }
    if ($missingRollback.Count -gt 0) { throw "LocalRehearsal is blocked until every missing rollback has an owning-lane disposition." }

    try {
        $statusStarted = [DateTimeOffset]::UtcNow
        $statusOutput = (& supabase status 2>&1 | Out-String)
        $statusExit = $LASTEXITCODE
        (Redact-Text $statusOutput) | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "supabase-status-before.log") -Encoding utf8NoBOM
        Write-JsonFile -Path (Join-Path $EvidenceDirectory "supabase-status-before.exit.json") -Object @{name="supabase-status-before";startedAtUtc=$statusStarted.ToString("o");finishedAtUtc=[DateTimeOffset]::UtcNow.ToString("o");exitCode=$statusExit}
        if ($statusExit -ne 0) { Invoke-Recorded -Name "supabase-start" -Action { & supabase start }; $StartedLocalStack = $true }

        Invoke-Recorded -Name "supabase-db-reset" -Action { & supabase db reset --local }
        $uri = [System.Uri]$DatabaseUrl
        $oldPg = @{PGHOST=$env:PGHOST;PGPORT=$env:PGPORT;PGDATABASE=$env:PGDATABASE;PGUSER=$env:PGUSER;PGPASSWORD=$env:PGPASSWORD;PGSSLMODE=$env:PGSSLMODE}
        try {
            $env:PGHOST = $uri.Host.Trim("[", "]")
            $env:PGPORT = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }
            $env:PGDATABASE = $uri.AbsolutePath.TrimStart("/")
            $userInfo = $uri.UserInfo.Split(":", 2)
            $env:PGUSER = [System.Uri]::UnescapeDataString($userInfo[0])
            $env:PGPASSWORD = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
            $env:PGSSLMODE = "disable"
            foreach ($entry in ($migrationEntries | Sort-Object order -Descending)) {
                $path = Join-Path $repoRoot $entry.rollbackPath
                Invoke-Recorded -Name ("rollback-{0:D2}" -f [int]$entry.order) -Action { & psql -X -v ON_ERROR_STOP=1 -f $path }
            }
            foreach ($entry in ($migrationEntries | Sort-Object order)) {
                $path = Join-Path $repoRoot $entry.migrationPath
                Invoke-Recorded -Name ("reapply-{0:D2}" -f [int]$entry.order) -Action { & psql -X -v ON_ERROR_STOP=1 -f $path }
            }
        } finally {
            foreach ($name in $oldPg.Keys) {
                if ($null -eq $oldPg[$name]) { Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue } else { Set-Item -Path "Env:$name" -Value $oldPg[$name] }
            }
        }
    } finally {
        if ($StartedLocalStack) { Invoke-Recorded -Name "supabase-stop" -Action { & supabase stop --no-backup } }
    }
}

$finalStatus = Invoke-Git @("status", "--porcelain")
if ($finalStatus.Length -ne 0) { throw "Final worktree is dirty." }

$evidenceFiles = Get-ChildItem -LiteralPath $EvidenceDirectory -File -Recurse | Sort-Object FullName
$shaLines = foreach ($file in $evidenceFiles) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $relative = [System.IO.Path]::GetRelativePath($EvidenceDirectory, $file.FullName).Replace("\", "/")
    "$hash  $relative"
}
$shaLines | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "sha256.txt") -Encoding ascii

Write-Host "Agent 9 $Mode completed for $currentSha."
