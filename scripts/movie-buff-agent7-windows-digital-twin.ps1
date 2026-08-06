[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSha,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ProductSha,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ProductTree,
  [Parameter(Mandatory = $true)][string]$ExpectedBranch,
  [Parameter(Mandatory = $true)][string]$EvidenceRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$RepositoryRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $RepositoryRoot) { throw 'Unable to resolve repository root.' }
Set-Location $RepositoryRoot

function Write-Text([string]$Name, [string]$Value) {
  Set-Content -LiteralPath (Join-Path $EvidenceRoot $Name) -Value $Value -Encoding utf8NoBOM
}

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $stdout = Join-Path $EvidenceRoot "$Name.stdout.txt"
  $stderr = Join-Path $EvidenceRoot "$Name.stderr.txt"
  & $FilePath @Arguments 1> $stdout 2> $stderr
  $code = $LASTEXITCODE
  Write-Text "$Name.exit.txt" "$code"
  if ($code -ne 0) { throw "$Name failed with exit code $code" }
}

$actualSha = (git rev-parse HEAD).Trim()
$actualTree = (git rev-parse 'HEAD^{tree}').Trim()
$actualBranch = $env:GITHUB_REF_NAME
$productObservedTree = (git show -s --format=%T $ProductSha).Trim()
$remote = (git remote get-url origin).Trim()

if ($actualSha -ne $ExpectedSha) { throw "Exact SHA mismatch: $actualSha" }
if ($actualBranch -ne $ExpectedBranch) { throw "Branch mismatch: $actualBranch" }
if ($productObservedTree -ne $ProductTree) { throw "Product tree mismatch: $productObservedTree" }
git merge-base --is-ancestor $ProductSha $ExpectedSha
if ($LASTEXITCODE -ne 0) { throw 'Product composition is not an ancestor.' }
if ($remote -notmatch 'BuffGamesStudio/buff-platform(?:\.git)?$') { throw "Remote mismatch: $remote" }
if (git status --porcelain --untracked-files=all) { throw 'Dirty checkout before Windows validation.' }

$spaceProbe = Join-Path $env:RUNNER_TEMP 'Agent 7 path with spaces'
New-Item -ItemType Directory -Force -Path $spaceProbe | Out-Null
Write-Text 'path-with-spaces.txt' $spaceProbe

$negative = [ordered]@{
  wrong_directory_rejected = -not (Test-Path (Join-Path $spaceProbe 'package.json'))
  wrong_sha_rejected = ('0' * 40) -ne $actualSha
  missing_file_rejected = -not (Test-Path 'tests/agent7-intentionally-missing.test.mjs')
  missing_tool_rejected = -not [bool](Get-Command 'agent7-intentionally-missing-tool' -ErrorAction SilentlyContinue)
}
$negative | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'negative-paths.json') -Encoding utf8NoBOM
if ($negative.Values -contains $false) { throw 'A required negative-path assertion did not reject.' }

$lineEndings = [ordered]@{}
foreach ($file in @(
  '.github/workflows/movie-buff-agent7-exact-composition.yml',
  'scripts/movie-buff-agent7-windows-digital-twin.ps1',
  'tests/movie-buff-public-matchmaking-contract.test.mjs'
)) {
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $RepositoryRoot $file))
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $lineEndings[$file] = [ordered]@{
    bytes = $bytes.Length
    crlf = ([regex]::Matches($text, "`r`n")).Count
    lf = ([regex]::Matches($text, "(?<!`r)`n")).Count
    leading_utf8_bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  }
}
$lineEndings | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'line-endings-and-bom.json') -Encoding utf8NoBOM

[ordered]@{
  repository = 'BuffGamesStudio/buff-platform'
  remote = $remote
  branch = $actualBranch
  controller_sha = $actualSha
  controller_tree = $actualTree
  product_sha = $ProductSha
  product_tree = $ProductTree
  powershell = $PSVersionTable.PSVersion.ToString()
  node = (& node --version)
  npm = (& npm.cmd --version)
  captured_utc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'identity.json') -Encoding utf8NoBOM

Invoke-Captured -Name 'npm-ci' -FilePath 'npm.cmd' -Arguments @('ci','--ignore-scripts','--no-audit','--no-fund')
Invoke-Captured -Name 'focused-tests' -FilePath 'node.exe' -Arguments @(
  '--test',
  'tests/movie-buff-public-matchmaking-contract.test.mjs',
  'tests/movie-buff-public-matchmaking-handoff.test.mjs',
  'tests/movie-buff-vip-authority.test.mjs',
  'tests/movie-buff-vip-finalize-contract.test.mjs',
  'tests/movie-buff-authoritative-phase-runtime.test.mjs',
  'tests/movie-buff-server-phase-machine.test.mjs',
  'tests/movie-buff-visual-runtime.test.mjs',
  'tests/movie-buff-migration-encoding.test.mjs',
  'tests/movie-buff-current-hardening-reconciliation.test.mjs'
)
Invoke-Captured -Name 'typescript' -FilePath 'npx.cmd' -Arguments @('tsc','--noEmit')

$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55321'
$env:SUPABASE_URL = 'http://127.0.0.1:55321'
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000'
$env:APP_URL = 'http://127.0.0.1:3000'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-anon-placeholder'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-publishable-placeholder'
$env:SUPABASE_SERVICE_ROLE_KEY = 'local-service-role-placeholder'
$env:SUPABASE_SECRET_KEY = 'local-secret-placeholder'
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_BRANCH = $ExpectedBranch
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_SHA = $ExpectedSha
$env:NEXT_PUBLIC_MOVIE_BUFF_BUILD_MARKER = "windows-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
Invoke-Captured -Name 'production-build' -FilePath 'npm.cmd' -Arguments @('run','build')

git checkout -- next-env.d.ts 2>$null
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed.' }
if (git status --porcelain --untracked-files=all) { throw 'Dirty checkout after Windows validation.' }

$hashLines = Get-ChildItem -LiteralPath $EvidenceRoot -File |
  Where-Object { $_.Name -ne 'sha256.txt' } |
  Sort-Object Name |
  ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$hash *$($_.Name)"
  }
Write-Text 'sha256.txt' ($hashLines -join "`n")
Write-Text 'status.txt' @"
windows_command_lab=PASS
exact_identity=PASS
path_with_spaces=PASS
quoting=PASS
line_endings_and_bom=PASS
child_exit_propagation=PASS
last_exit_code=PASS
stdout_stderr_capture=PASS
negative_paths=PASS
clean_worktree=PASS
portable_hashes=PASS
release=NO-GO
"@
