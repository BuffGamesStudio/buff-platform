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

$rawComposition = '61a7ab96904323e1cb6dfae0e54e900d12a83db0'
$rawTree = '167191fe2a143bae2f197218949fbe5b2195726a'
$mov15Sha = '295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d'
$mov15Tree = 'fb92eb3331cd1aac2e918603f449aadbd177935c'
$mov16Sha = '8eab77a63042911417d6ef16d52ab9b308fc8f0d'
$mov16Tree = 'a4aa7c9962389b9894c8a90afe69fdb276313953'
$sourcePath = Resolve-Path './scripts/movie-buff-core-v6-windows.ps1'
$tempPath = Join-Path $env:RUNNER_TEMP 'movie-buff-core-v6-windows-current2.ps1'

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null

function Write-NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Write-BootstrapFailure([System.Exception]$Exception) {
  $safe = $Exception.ToString()
  $safe = $safe -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]'
  $safe = $safe -replace '(?i)postgres(?:ql)?://\S+', 'postgresql://[REDACTED_LOCAL_DB_URL]'
  $safe = $safe -replace 'sb_(?:secret|publishable)_[A-Za-z0-9_-]+', '[REDACTED_SUPABASE_KEY]'
  Write-NoBom (Join-Path $EvidenceRoot 'bootstrap-failure.txt') ($safe + "`n")
  $metadata = [ordered]@{
    lane = 'movie-buff-core-v6-windows-current2-bootstrap'
    classification = 'FAIL'
    source_sha = $ExpectedSha
    source_tree = $ExpectedTree
    raw_composition_sha = $rawComposition
    raw_composition_tree = $rawTree
    mov15_sha = $mov15Sha
    mov15_tree = $mov15Tree
    mov16_sha = $mov16Sha
    mov16_tree = $mov16Tree
    failure_step = $Exception.Message
    finished_at = [DateTime]::UtcNow.ToString('o')
  }
  Write-NoBom (Join-Path $EvidenceRoot 'bootstrap-metadata.json') (($metadata | ConvertTo-Json -Depth 4) + "`n")
  $hashLines = Get-ChildItem -Path $EvidenceRoot -File | Where-Object { $_.Name -ne 'sha256.txt' } | Sort-Object Name | ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -Path $_.FullName).Hash.ToLowerInvariant()
    "$hash *$($_.Name)"
  }
  Write-NoBom (Join-Path $EvidenceRoot 'sha256.txt') (($hashLines -join "`n") + "`n")
}

try {
  $source = Get-Content -LiteralPath $sourcePath -Raw
  $replacements = [ordered]@{
    '91b8b65f85d53a950eae15544af39e2efd108c5c' = $rawComposition
    '40d72195ced550771ad257054a6325c51f183a28' = $rawTree
    '4906147038a5a2deda5c13fdafc6f07b66ae100b' = $mov15Sha
    'aab4b0256683ec77a4d9e3373fd84f60ba682e88' = $mov15Tree
    'd50a2417b95b6a37548bba914584cef309d707a9' = $mov16Sha
    '0a30efee906e28cbeeb76c6efd9232f07ede163d' = $mov16Tree
  }
  foreach ($entry in $replacements.GetEnumerator()) {
    if (-not $source.Contains($entry.Key)) { throw "Expected wrapper identity token missing: $($entry.Key)" }
    $source = $source.Replace($entry.Key, $entry.Value)
  }

  $oldRootLine = '$root = Get-GitValue @(''rev-parse'', ''--show-toplevel'')'
  $newRootLine = '$root = (Resolve-Path (Get-GitValue @(''rev-parse'', ''--show-toplevel''))).Path'
  $oldCompareLine = 'if ((Get-Location).Path -ne $root) { throw ''Wrapper must run from repository root'' }'
  $newCompareBlock = @'
$cwd = (Resolve-Path '.').Path
$rootNormalized = [System.IO.Path]::GetFullPath($root).TrimEnd([char[]]'\/')
$cwdNormalized = [System.IO.Path]::GetFullPath($cwd).TrimEnd([char[]]'\/')
if (-not [string]::Equals($cwdNormalized, $rootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Wrapper must run from repository root' }
'@
  if (-not $source.Contains($oldRootLine)) { throw 'Expected Windows root-resolution line missing' }
  if (-not $source.Contains($oldCompareLine)) { throw 'Expected Windows path-comparison line missing' }
  $source = $source.Replace($oldRootLine, $newRootLine)
  $source = $source.Replace($oldCompareLine, $newCompareBlock.Trim())
  $source = $source.Replace('exit 0', '$global:LASTEXITCODE = 0; return')
  $source = $source.Replace('exit 1', '$global:LASTEXITCODE = 1; return')
  Write-NoBom $tempPath $source

  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($tempPath, [ref]$null, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -ne 0) { throw ($parseErrors | Format-List | Out-String) }

  $env:MOVIE_BUFF_EXPECTED_REPOSITORY = 'BuffGamesStudio/buff-platform'
  $env:MOVIE_BUFF_EXPECTED_SHA = $ExpectedSha
  $env:MOVIE_BUFF_EXPECTED_TREE = $ExpectedTree
  $env:MOVIE_BUFF_RAW_COMPOSITION_SHA = $rawComposition
  $env:MOVIE_BUFF_EVIDENCE_ROOT = $EvidenceRoot
  $global:LASTEXITCODE = 0
  & $tempPath -ExpectedSha $ExpectedSha -ExpectedTree $ExpectedTree -EvidenceRoot $EvidenceRoot
  $code = [int]$global:LASTEXITCODE
  if ($code -ne 0) { exit $code }
  exit 0
} catch {
  Write-BootstrapFailure $_.Exception
  Write-Output 'MOVIE_BUFF_CORE_WINDOWS=FAIL'
  exit 1
} finally {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
}
