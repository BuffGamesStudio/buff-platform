[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedTree,

  [Parameter(Mandatory = $true)]
  [string]$EvidenceRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$branch = 'validation/movie-buff-core-v6'
$rawComposition = '91b8b65f85d53a950eae15544af39e2efd108c5c'
$repository = 'BuffGamesStudio/buff-platform'
$remote = 'https://github.com/BuffGamesStudio/buff-platform'
$classification = 'UNKNOWN'
$failureStep = ''
$steps = [ordered]@{}

function Get-GitValue([string[]]$Arguments) {
  $value = & git @Arguments
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed" }
  return ($value | Out-String).Trim()
}

function Write-RedactedText([string]$Path, [string]$Text) {
  $safe = $Text
  $safe = $safe -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]'
  $safe = $safe -replace '(?i)postgres(?:ql)?://\S+', 'postgresql://[REDACTED_LOCAL_DB_URL]'
  $safe = $safe -replace '(?i)(authorization:\s*bearer\s+)\S+', '$1[REDACTED]'
  $safe = $safe -replace 'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[REDACTED_SUPABASE_KEY]'
  [System.IO.File]::WriteAllText($Path, $safe, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-EvidenceStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  $outputPath = Join-Path $EvidenceRoot "$Name.txt"
  $exitPath = Join-Path $EvidenceRoot "$Name.exit.txt"
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $captured = @()
  $exit = 0
  try {
    $global:LASTEXITCODE = 0
    $captured = & $Action 2>&1 | ForEach-Object { $_.ToString() }
    if ($LASTEXITCODE -ne $null) { $exit = [int]$LASTEXITCODE }
  } catch {
    $captured += $_.Exception.ToString()
    $exit = 1
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  Write-RedactedText -Path $outputPath -Text (($captured -join [Environment]::NewLine) + [Environment]::NewLine)
  [System.IO.File]::WriteAllText($exitPath, "$exit`n", [System.Text.UTF8Encoding]::new($false))
  $steps[$Name] = $exit
  if ($exit -ne 0) { throw "Step failed: $Name ($exit)" }
}

function Assert-LocalUrl([string]$Value) {
  $uri = [Uri]$Value
  if ($uri.Host -notin @('localhost', '127.0.0.1', '::1')) { throw "Non-local target refused: $Value" }
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$root = Get-GitValue @('rev-parse', '--show-toplevel')
if ((Split-Path -Leaf $root) -ne 'buff-platform') { throw 'Wrong repository folder' }
if ((Get-Location).Path -ne $root) { throw 'Wrapper must run from repository root' }
if ((Get-GitValue @('remote', 'get-url', 'origin')) -ne $remote) { throw 'Wrong remote' }
if ((Get-GitValue @('rev-parse', 'HEAD')) -ne $ExpectedSha) { throw 'Wrong SHA' }
if ((Get-GitValue @('rev-parse', 'HEAD^{tree}')) -ne $ExpectedTree) { throw 'Wrong tree' }
$actualBranch = if ($env:GITHUB_HEAD_REF) { $env:GITHUB_HEAD_REF } elseif ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { Get-GitValue @('branch', '--show-current') }
if ($actualBranch -ne $branch) { throw "Wrong branch: $actualBranch" }
& git merge-base --is-ancestor $rawComposition HEAD
if ($LASTEXITCODE -ne 0) { throw 'Raw composition is not an ancestor' }
if ((Get-GitValue @('status', '--porcelain')).Length -ne 0) { throw 'Dirty worktree' }
if ($EvidenceRoot.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence root must be outside repository' }

$required = @(
  'package.json',
  'package-lock.json',
  'scripts/movie-buff-core-v6-guard.mjs',
  'scripts/movie-buff-core-v6-windows.ps1',
  'scripts/movie-buff-core-v6-db.sh'
)
foreach ($file in $required) { if (-not (Test-Path $file -PathType Leaf)) { throw "Missing file: $file" } }
foreach ($tool in @('git', 'node', 'npm')) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing tool: $tool" } }
if ([int](node -p "process.versions.node.split('.')[0]") -ne 22) { throw 'Node major must be 22' }
Assert-LocalUrl $env:NEXT_PUBLIC_SUPABASE_URL
Assert-LocalUrl $env:MOVIE_BUFF_APP_URL

try {
  Invoke-EvidenceStep 'guard-actual' { node scripts/movie-buff-core-v6-guard.mjs }
  Invoke-EvidenceStep 'guard-negative-paths' { node scripts/movie-buff-core-v6-guard.mjs --self-test }
  Invoke-EvidenceStep 'npm-ci' { npm ci --ignore-scripts --no-audit --no-fund }
  Invoke-EvidenceStep 'contracts' {
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
      tests/movie-buff-migration-encoding.test.mjs
  }
  Invoke-EvidenceStep 'typescript' { npx --no-install tsc --noEmit }
  Invoke-EvidenceStep 'build' { npm run build }
  Invoke-EvidenceStep 'diff-check' { git diff --check }
  if ((Get-GitValue @('status', '--porcelain')).Length -ne 0) { throw 'Dirty worktree after validation' }
  $classification = 'PASS'
} catch {
  $classification = 'FAIL'
  $failureStep = $_.Exception.Message
}

$metadata = [ordered]@{
  lane = 'movie-buff-core-v6-windows'
  classification = $classification
  repository = $repository
  remote = Get-GitValue @('remote', 'get-url', 'origin')
  source_branch = $actualBranch
  source_sha = Get-GitValue @('rev-parse', 'HEAD')
  source_tree = Get-GitValue @('rev-parse', 'HEAD^{tree}')
  raw_composition_sha = $rawComposition
  raw_composition_tree = '40d72195ced550771ad257054a6325c51f183a28'
  mov15_sha = '4906147038a5a2deda5c13fdafc6f07b66ae100b'
  mov15_tree = 'aab4b0256683ec77a4d9e3373fd84f60ba682e88'
  mov16_sha = 'd50a2417b95b6a37548bba914584cef309d707a9'
  mov16_tree = '0a30efee906e28cbeeb76c6efd9232f07ede163d'
  mov17_sha = '6d7e9aabe5b07796a3a17fdf6c11df091dd1f978'
  mov17_tree = '8264d2e30b0c75a8bebaa1ad938df6a635f7d991'
  encoding_sha = 'bf5e6d6f251f6840d17eed2fc68e0d580295437f'
  encoding_tree = 'd97528616454b9e93c6be9a44705d008a901ac66'
  os = [System.Environment]::OSVersion.VersionString
  powershell = $PSVersionTable.PSVersion.ToString()
  node = (node --version)
  npm = (npm --version)
  database_behavior = 'UNKNOWN'
  browser_behavior = 'UNKNOWN'
  hosted_state = 'UNKNOWN'
  physical_windows_cursor_equivalence = 'UNKNOWN'
  failure_step = $failureStep
  finished_at = [DateTime]::UtcNow.ToString('o')
  steps = $steps
}
Write-RedactedText -Path (Join-Path $EvidenceRoot 'metadata.json') -Text (($metadata | ConvertTo-Json -Depth 5) + "`n")

$hashLines = Get-ChildItem -Path $EvidenceRoot -File | Where-Object { $_.Name -ne 'sha256.txt' } | Sort-Object Name | ForEach-Object {
  $hash = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash.ToLowerInvariant()
  "$hash *$($_.Name)"
}
[System.IO.File]::WriteAllText((Join-Path $EvidenceRoot 'sha256.txt'), (($hashLines -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))

if ($classification -eq 'PASS') {
  Write-Output 'MOVIE_BUFF_CORE_WINDOWS=PASS'
  exit 0
}
Write-Output 'MOVIE_BUFF_CORE_WINDOWS=FAIL'
exit 1
