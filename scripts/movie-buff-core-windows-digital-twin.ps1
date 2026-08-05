param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedSha,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedTree,

  [string]$ExpectedBranch = 'validation/movie-buff-core-v2',

  [string]$EvidenceRoot = $(
    if ($env:RUNNER_TEMP) {
      Join-Path $env:RUNNER_TEMP 'movie-buff-core-windows-evidence'
    } else {
      Join-Path ([IO.Path]::GetTempPath()) 'movie-buff-core-windows-evidence'
    }
  )
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Classification {
  param([ValidateSet('PASS','FAIL','UNKNOWN','NOT APPLICABLE')][string]$Value)
  "MOVIE_BUFF_CORE_WINDOWS=$Value"
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
  $global:LASTEXITCODE = 0
  try {
    & $Action 1> $stdout 2> $stderr
    $code = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  } catch {
    $_ | Out-String | Set-Content -LiteralPath $stderr -Encoding utf8
    $code = 1
  }
  Set-Content -LiteralPath $exitFile -Value $code -Encoding ascii
  if ($code -ne 0) { throw "$Name failed with exit code $code" }
}

function Assert-NoSecretPatterns {
  param([Parameter(Mandatory = $true)][string]$Directory)
  $patterns = @(
    'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
    'postgres(?:ql)?://[^\s]+:[^\s]+@',
    'sb_secret_[A-Za-z0-9_-]+',
    'sb_publishable_[A-Za-z0-9_-]+',
    'AKIA[0-9A-Z]{16}',
    '(?i)bearer\s+[A-Za-z0-9._-]{20,}'
  )
  foreach ($file in Get-ChildItem -LiteralPath $Directory -File) {
    $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $text) { continue }
    foreach ($pattern in $patterns) {
      if ($text -match $pattern) { throw "Potential secret pattern in evidence file: $($file.Name)" }
    }
  }
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

try {
  foreach ($command in @('git','node','npm')) { Assert-Command $command }
  if ($PSVersionTable.PSVersion.Major -ne 7) { throw "Unsupported PowerShell major: $($PSVersionTable.PSVersion.Major)" }
  if ([IO.Path]::GetFileName((Get-Location).Path) -ne 'buff-platform') { throw "Wrong working folder: $(Get-Location)" }
  if ((git remote get-url origin).Trim() -ne 'https://github.com/BuffGamesStudio/buff-platform') { throw 'Wrong repository remote.' }
  $actualSha = (git rev-parse HEAD).Trim()
  $actualTree = (git rev-parse 'HEAD^{tree}').Trim()
  $actualBranch = if ($env:GITHUB_HEAD_REF) { $env:GITHUB_HEAD_REF } elseif ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { (git branch --show-current).Trim() }
  if ($actualBranch -ne $ExpectedBranch) { throw "Wrong branch. Expected $ExpectedBranch; observed $actualBranch" }
  if ($actualSha -ne $ExpectedSha) { throw "Wrong SHA. Expected $ExpectedSha; observed $actualSha" }
  if ($actualTree -ne $ExpectedTree) { throw "Wrong tree. Expected $ExpectedTree; observed $actualTree" }
  if (git status --porcelain) { throw 'Worktree is dirty before execution.' }
  if ((node --version) -notmatch '^v22\.') { throw "Unsupported Node version: $(node --version)" }

  $env:MOVIE_BUFF_EXPECTED_REPOSITORY = 'BuffGamesStudio/buff-platform'
  $env:MOVIE_BUFF_EXPECTED_REMOTE = 'https://github.com/BuffGamesStudio/buff-platform'
  $env:MOVIE_BUFF_EXPECTED_BRANCH = $ExpectedBranch
  $env:MOVIE_BUFF_EXPECTED_SHA = $ExpectedSha
  $env:MOVIE_BUFF_EXPECTED_TREE = $ExpectedTree
  $env:MOVIE_BUFF_EVIDENCE_ROOT = $EvidenceRoot
  $env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  $env:MOVIE_BUFF_APP_URL = 'http://127.0.0.1:3000'
  $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-placeholder'
  $env:SUPABASE_SERVICE_ROLE_KEY = 'local-placeholder'

  @(
    'lane=movie-buff-core-v2'
    'repository=BuffGamesStudio/buff-platform'
    "remote=$((git remote get-url origin).Trim())"
    "source_branch=$actualBranch"
    "source_sha=$actualSha"
    "source_tree=$actualTree"
    'raw_composition_sha=186a4cc1c5995fd07b374392528d8c5424db8f02'
    'raw_composition_tree=02a579e275d4efeaa7bf0f077cab2e686cc5e448'
    'component_mov15_sha=4906147038a5a2deda5c13fdafc6f07b66ae100b'
    'component_mov15_tree=aab4b0256683ec77a4d9e3373fd84f60ba682e88'
    'component_mov16_sha=8eab77a63042911417d6ef16d52ab9b308fc8f0d'
    'component_mov16_tree=a4aa7c9962389b9894c8a90afe69fdb276313953'
    'component_mov17_sha=6d7e9aabe5b07796a3a17fdf6c11df091dd1f978'
    'component_mov17_tree=8264d2e30b0c75a8bebaa1ad938df6a635f7d991'
    'component_encoding_sha=bf5e6d6f251f6840d17eed2fc68e0d580295437f'
    'component_encoding_tree=d97528616454b9e93c6be9a44705d008a901ac66'
    "powershell_version=$($PSVersionTable.PSVersion)"
    "node_version=$((node --version).Trim())"
    "npm_version=$((npm --version).Trim())"
    "working_directory=$((Get-Location).Path)"
    'target_kind=windows-command-laboratory'
    'application_target=http://127.0.0.1:3000'
    'supabase_target=http://127.0.0.1:54321'
    'docker_database_supabase_cli_psql=NOT APPLICABLE'
    'browser_runtime=NOT APPLICABLE'
    'physical_windows_cursor_equivalence=UNKNOWN'
    "started_at=$([DateTime]::UtcNow.ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8

  Invoke-Captured 'guard-actual' { node scripts/movie-buff-core-validation-guard.mjs }
  Invoke-Captured 'guard-negative-paths' { node scripts/movie-buff-core-validation-guard.mjs --self-test }

  $spaceRoot = Join-Path $env:RUNNER_TEMP 'Movie Buff Core Lab With Spaces'
  New-Item -ItemType Directory -Force -Path $spaceRoot | Out-Null
  Copy-Item -LiteralPath 'scripts/movie-buff-core-validation-guard.mjs' -Destination (Join-Path $spaceRoot 'guard.mjs') -Force
  $spaceHash = (Get-FileHash -LiteralPath (Join-Path $spaceRoot 'guard.mjs') -Algorithm SHA256).Hash
  "space_path=$spaceRoot`ncopy_sha256=$spaceHash" | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'spaces-path.txt') -Encoding utf8
  Remove-Item -LiteralPath $spaceRoot -Recurse -Force

  Invoke-Captured 'npm-ci' { npm ci --ignore-scripts --no-audit --no-fund }
  Invoke-Captured 'combined-contract-tests' {
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
  Invoke-Captured 'typescript' { npx --no-install tsc --noEmit }
  Invoke-Captured 'production-build' { npm run build }
  Invoke-Captured 'diff-check' { git diff --check }

  if (git status --porcelain) { throw 'Worktree is dirty after execution.' }
  'clean=true' | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'git-status.txt') -Encoding ascii
  "finished_at=$([DateTime]::UtcNow.ToString('o'))" | Add-Content -LiteralPath (Join-Path $EvidenceRoot 'metadata.txt') -Encoding utf8
  Assert-NoSecretPatterns $EvidenceRoot

  $manifest = Join-Path $EvidenceRoot 'sha256.csv'
  Get-ChildItem -LiteralPath $EvidenceRoot -File |
    Where-Object Name -ne 'sha256.csv' |
    Sort-Object Name |
    ForEach-Object {
      $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
      [pscustomobject]@{ Path = $_.Name; Hash = $hash.Hash }
    } | Export-Csv -LiteralPath $manifest -NoTypeInformation
  foreach ($entry in Import-Csv -LiteralPath $manifest) {
    if ([IO.Path]::IsPathRooted($entry.Path)) { throw "Absolute evidence path: $($entry.Path)" }
    $file = Join-Path $EvidenceRoot $entry.Path
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Hash) { throw "Hash mismatch: $($entry.Path)" }
  }
  Write-Classification PASS
  exit 0
} catch {
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'failure.txt') -Encoding utf8
  Write-Classification FAIL
  exit 1
}
