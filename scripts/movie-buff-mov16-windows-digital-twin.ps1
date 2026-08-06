param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedSha,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedBranch,
  [Parameter(Mandatory = $true)]
  [string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name exited with code $LASTEXITCODE"
  }
}

if (-not (Test-Path "AGENTS.md") -or
    -not (Test-Path "package.json") -or
    -not (Test-Path ".git")) {
  throw "Run the MOV-16 Windows digital twin from the repository root."
}

$branch = if ($env:GITHUB_REF_NAME) {
  $env:GITHUB_REF_NAME
} else {
  (git branch --show-current).Trim()
}
$sha = (git rev-parse HEAD).Trim()
$tree = (git rev-parse "HEAD^{tree}").Trim()
$remote = (git remote get-url origin).Trim()
$dirty = git status --porcelain

if ($branch -ne $ExpectedBranch) {
  throw "Unexpected branch identity."
}
if ($sha -ne $ExpectedSha -or $sha -notmatch "^[0-9a-f]{40}$") {
  throw "Unexpected full commit SHA."
}
if ($remote -ne "https://github.com/BuffGamesStudio/buff-platform") {
  throw "Unexpected repository remote."
}
if ($dirty) {
  throw "Checkout is dirty before validation."
}
if (Test-Path "supabase/.temp/project-ref") {
  throw "Linked Supabase target marker is forbidden."
}

New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null

Invoke-Checked "guard syntax" {
  node --check scripts/movie-buff-mov16-evidence-guard.mjs
}
Invoke-Checked "behavior wrapper syntax" {
  node --check scripts/movie-buff-mov16-deadline-release-race.mjs
  node --check scripts/movie-buff-mov16-deadline-release-race-v2.mjs
  node --check scripts/movie-buff-mov16-adversarial-v3-wrapper.mjs
}
Invoke-Checked "negative-path self-test" {
  node scripts/movie-buff-mov16-evidence-guard.mjs --self-test |
    Out-File -FilePath (Join-Path $EvidenceDirectory "negative-paths.json") -Encoding utf8
}
Invoke-Checked "MOV-16 source contracts" {
  node --test `
    tests/movie-buff-vip-authority.test.mjs `
    tests/movie-buff-vip-finalize-contract.test.mjs `
    tests/movie-buff-vip-phase-policy.test.mjs |
    Tee-Object -FilePath (Join-Path $EvidenceDirectory "node-tests.log")
}
Invoke-Checked "TypeScript" {
  npx tsc --noEmit 2>&1 |
    Tee-Object -FilePath (Join-Path $EvidenceDirectory "typescript.log")
}
"0" | Out-File -FilePath (Join-Path $EvidenceDirectory "typescript.exit") -Encoding ascii
if (-not (Test-Path (Join-Path $EvidenceDirectory "typescript.log"))) {
  "TypeScript completed successfully with no diagnostics." |
    Out-File -FilePath (Join-Path $EvidenceDirectory "typescript.log") -Encoding utf8
}
Invoke-Checked "production build" {
  npm run build 2>&1 |
    Tee-Object -FilePath (Join-Path $EvidenceDirectory "build.log")
}
"0" | Out-File -FilePath (Join-Path $EvidenceDirectory "build.exit") -Encoding ascii

@"
classification=PASS
repository=BuffGamesStudio/buff-platform
branch=$branch
source_sha=$sha
source_tree=$tree
platform=windows
node=$(node --version)
typescript_exit=0
build_exit=0
finished_at=$([DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"))
"@ | Out-File -FilePath (Join-Path $EvidenceDirectory "metadata.txt") -Encoding utf8

$finalDirty = git status --porcelain
if ($finalDirty) {
  throw "Checkout is dirty after validation."
}
