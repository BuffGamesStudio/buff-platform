param(
  [Parameter(Mandatory = $true)][string]$ExpectedSha,
  [Parameter(Mandatory = $true)][string]$ExpectedBranch,
  [Parameter(Mandatory = $true)][string]$ProductSha,
  [Parameter(Mandatory = $true)][string]$ProductTree,
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null

function Write-Exit([string]$Name, [int]$Code) {
  [IO.File]::WriteAllText(
    (Join-Path $EvidenceDirectory "$Name.exit"),
    "$Code`n",
    [Text.Encoding]::ASCII
  )
}

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  $log = Join-Path $EvidenceDirectory "$Name.log"
  & $Command *>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  Write-Exit $Name $code
  return [int]$code
}

$branch = if ($env:GITHUB_REF_NAME) { $env:GITHUB_REF_NAME } else { (git branch --show-current).Trim() }
$sha = (git rev-parse HEAD).Trim()
$tree = (git rev-parse "HEAD^{tree}").Trim()
$productObservedTree = (git rev-parse "$ProductSha^{tree}").Trim()
$remote = (git remote get-url origin).Trim()
$identityCode = 0

if ($branch -ne $ExpectedBranch) { $identityCode = 1 }
if ($sha -ne $ExpectedSha -or $sha -notmatch "^[0-9a-f]{40}$") { $identityCode = 1 }
if ($productObservedTree -ne $ProductTree) { $identityCode = 1 }
if ($remote -ne "https://github.com/BuffGamesStudio/buff-platform") { $identityCode = 1 }
git merge-base --is-ancestor $ProductSha HEAD
if ($LASTEXITCODE -ne 0) { $identityCode = 1 }

$prHead = ""
for ($attempt = 1; $attempt -le 12; $attempt++) {
  try {
    $pr = Invoke-RestMethod -Uri "https://api.github.com/repos/BuffGamesStudio/buff-platform/pulls/107" -Headers @{ "User-Agent" = "movie-buff-agent5" }
    $prHead = [string]$pr.head.sha
  } catch {
    $prHead = ""
  }
  if ($prHead -eq $sha) { break }
  Start-Sleep -Seconds 5
}
if ($prHead -ne $sha) { $identityCode = 1 }

$protected = [ordered]@{
  "src/app/games/movie-buff/board-preview/page.tsx" = "ee4ef8bae382aebc1e2242a8342d3858ecbc922c"
  "src/app/games/movie-buff/play/page.tsx" = "2115b1f81a1dd64fa0998ebffcd2ca4ef605f0d5"
  "src/components/movie-buff/MovieBuffBoardRoomClient.tsx" = "7cbe07c6aad2094fc2831b59b4847bc6c12193b4"
}
foreach ($entry in $protected.GetEnumerator()) {
  $actual = (git rev-parse "HEAD:$($entry.Key)").Trim()
  if ($actual -ne $entry.Value) { $identityCode = 1 }
}

[ordered]@{
  repository = "BuffGamesStudio/buff-platform"
  branch = $branch
  expectedSha = $ExpectedSha
  prHeadSha = $prHead
  githubSha = $env:GITHUB_SHA
  observedSha = $sha
  expectedTree = $tree
  observedTree = $tree
  productSha = $ProductSha
  productTree = $ProductTree
  runner = "windows"
  powershell = [string]$PSVersionTable.PSVersion
  node = (node --version).Trim()
  startedAt = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "identity.json") -Encoding utf8
Write-Exit "source_assembly" $identityCode

$testPaths = @(Get-ChildItem -LiteralPath "tests" -Filter "movie-buff-*.test.mjs" -File | Sort-Object Name | ForEach-Object FullName)
$focusedCode = Invoke-Captured "focused_static_tests" { node --test @testPaths }
$typescriptCode = Invoke-Captured "typescript" { npx tsc --noEmit }
$buildCode = Invoke-Captured "production_build" { npm run build }
$sqlCode = Invoke-Captured "sql_encoding" {
  node scripts/movie-buff-migration-encoding-check.mjs supabase/migrations supabase/rollbacks supabase/tests
}

$secretCode = 0
$scanFiles = @(
  "docs/validation/movie-buff-integrated-candidate-v1.manifest.json",
  "docs/validation/movie-buff-integrated-candidate-v1.md",
  "public/movie-buff-build-marker.json"
)
foreach ($scanFile in $scanFiles) {
  $text = Get-Content -LiteralPath $scanFile -Raw
  if ($text -match "sb_secret_[A-Za-z0-9_-]+" -or $text -match "eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.") {
    $secretCode = 1
  }
}
Write-Exit "secret_scan" $secretCode

$cleanCode = 0
git diff --check
if ($LASTEXITCODE -ne 0) { $cleanCode = 1 }
if (git status --porcelain -- next-env.d.ts) { git checkout -- next-env.d.ts }
if (git status --porcelain) { $cleanCode = 1 }
Write-Exit "clean_worktree" $cleanCode

$status = [ordered]@{}
foreach ($name in @("source_assembly","focused_static_tests","typescript","production_build","sql_encoding","secret_scan","clean_worktree")) {
  $code = [int](Get-Content -LiteralPath (Join-Path $EvidenceDirectory "$name.exit") -Raw).Trim()
  $status[$name] = if ($code -eq 0) { "PASS" } else { "FAIL" }
}
foreach ($name in @("local_database","pgTAP","personas","races","browser","accessibility","vercel_provenance","hosted_supabase","staging","rollback","containment","forward_reapply","backup_pitr","production_target")) {
  $status[$name] = "UNKNOWN"
}
$status["release"] = "NO-GO"
$status | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory "status.json") -Encoding utf8

$manifestPath = Join-Path $EvidenceDirectory "sha256.txt"
$lines = Get-ChildItem -LiteralPath $EvidenceDirectory -File |
  Where-Object Name -ne "sha256.txt" |
  Sort-Object Name |
  ForEach-Object {
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  ./$($_.Name)"
  }
[IO.File]::WriteAllLines($manifestPath, $lines, [Text.Encoding]::ASCII)
foreach ($line in Get-Content -LiteralPath $manifestPath) {
  if ($line -notmatch "^([0-9a-f]{64})  \./(.+)$") { throw "Invalid portable hash line: $line" }
  $expected = $Matches[1]
  $name = $Matches[2]
  if ([IO.Path]::IsPathRooted($name) -or $name -ne [IO.Path]::GetFileName($name)) { throw "Nonportable evidence path: $name" }
  $actual = (Get-FileHash -LiteralPath (Join-Path $EvidenceDirectory $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Evidence hash mismatch: $name" }
}

$critical = @($identityCode,$focusedCode,$typescriptCode,$buildCode,$sqlCode,$secretCode,$cleanCode)
if ($critical | Where-Object { $_ -ne 0 }) {
  exit 1
}
