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

function Get-GitBlobSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "git"
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.ArgumentList.Add("cat-file")
  $startInfo.ArgumentList.Add("blob")
  $startInfo.ArgumentList.Add("HEAD:$Path")

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $memory = [System.IO.MemoryStream]::new()
  try {
    if (-not $process.Start()) {
      throw "Unable to start git cat-file for $Path"
    }

    $copyTask = $process.StandardOutput.BaseStream.CopyToAsync($memory)
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $copyTask.GetAwaiter().GetResult()
    $stderr = $errorTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
      throw "git cat-file failed for $Path with code $($process.ExitCode): $stderr"
    }

    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      $digest = $algorithm.ComputeHash($memory.ToArray())
      return [Convert]::ToHexString($digest).ToLowerInvariant()
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $memory.Dispose()
    $process.Dispose()
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
  node --check scripts/movie-buff-vip-authority-personas.mjs
  node --check scripts/movie-buff-vip-authority-personas-impl.mjs
}
Invoke-Checked "negative-path self-test" {
  node scripts/movie-buff-mov16-evidence-guard.mjs --self-test |
    Out-File -FilePath (Join-Path $EvidenceDirectory "negative-paths.json") -Encoding utf8
}
Invoke-Checked "MOV-16 source contracts" {
  node --test `
    tests/movie-buff-vip-authority.test.mjs `
    tests/movie-buff-vip-finalize-contract.test.mjs `
    tests/movie-buff-vip-null-category-rollback-contract.test.mjs `
    tests/movie-buff-vip-phase-policy.test.mjs |
    Tee-Object -FilePath (Join-Path $EvidenceDirectory "node-tests.log")
}

$sourcePaths = @(
  "supabase/migrations/20260804073000_movie_buff_vip_authority.sql"
  "supabase/migrations/20260804073100_movie_buff_vip_null_category_fail_closed.sql"
  "supabase/migrations/20260804073200_movie_buff_vip_snapshot_release_hardening.sql"
  "supabase/migrations/20260804073300_movie_buff_vip_deadline_finalize.sql"
  "supabase/rollbacks/20260804073000_movie_buff_vip_authority.rollback.sql"
  "supabase/rollbacks/20260804073100_movie_buff_vip_null_category_fail_closed.rollback.sql"
  "supabase/rollbacks/20260804073200_movie_buff_vip_snapshot_release_hardening.rollback.sql"
  "supabase/rollbacks/20260804073300_movie_buff_vip_deadline_finalize.rollback.sql"
  "supabase/rollbacks/20260804073310_movie_buff_vip_callable_containment.rollback.sql"
)
foreach ($sourcePath in $sourcePaths) {
  if (-not (Test-Path $sourcePath -PathType Leaf)) {
    throw "Required MOV-16 source artifact is missing: $sourcePath"
  }
}
$sourcePaths |
  ForEach-Object {
    $hash = Get-GitBlobSha256 -Path $_
    "$hash  ./$($_ -replace '\\','/')"
  } |
  Out-File -FilePath (Join-Path $EvidenceDirectory "mov16-source-sha256.txt") -Encoding ascii

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
source_hash_basis=git_blob_bytes
typescript_exit=0
build_exit=0
finished_at=$([DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"))
"@ | Out-File -FilePath (Join-Path $EvidenceDirectory "metadata.txt") -Encoding utf8

$finalDirty = git status --porcelain
if ($finalDirty) {
  throw "Checkout is dirty after validation."
}
