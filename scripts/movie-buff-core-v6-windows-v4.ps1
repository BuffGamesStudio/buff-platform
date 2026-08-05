[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSha,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedTree,
  [Parameter(Mandatory = $true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourcePath = Resolve-Path './scripts/movie-buff-core-v6-windows-v3.ps1'
$tempPath = Join-Path $env:RUNNER_TEMP 'movie-buff-core-v6-windows-v4.ps1'
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
function Write-NoBom([string]$Path,[string]$Content){ [System.IO.File]::WriteAllText($Path,$Content,[System.Text.UTF8Encoding]::new($false)) }
function Bootstrap-Fail([string]$Message){
  Write-NoBom (Join-Path $EvidenceRoot 'bootstrap-failure.txt') ($Message+"`n")
  $m=[ordered]@{lane='movie-buff-core-v6-current4-windows-bootstrap';classification='FAIL';source_sha=$ExpectedSha;source_tree=$ExpectedTree;raw_composition_sha='5010be9ad7440d65ca9e21fe35541433c2e16917';raw_composition_tree='b15f7f490a6face44c69ab6b8565dfe594eb1894';mov15_sha='dc9804cdae03d8627a89980dbcdf2292d2055372';mov15_tree='86db75f79444b02c972ba4771244950cbec41b38';failure_step=$Message;finished_at=[DateTime]::UtcNow.ToString('o')}
  Write-NoBom (Join-Path $EvidenceRoot 'bootstrap-metadata.json') (($m|ConvertTo-Json -Depth 4)+"`n")
  $lines=Get-ChildItem $EvidenceRoot -File|Where-Object Name -ne 'sha256.txt'|Sort-Object Name|ForEach-Object{"$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()) *$($_.Name)"}
  Write-NoBom (Join-Path $EvidenceRoot 'sha256.txt') (($lines-join "`n")+"`n")
  Write-Output 'MOVIE_BUFF_CORE_WINDOWS=FAIL'; exit 1
}
try {
  $source=Get-Content -LiteralPath $sourcePath -Raw
  $replacements=[ordered]@{
    '61a7ab96904323e1cb6dfae0e54e900d12a83db0'='5010be9ad7440d65ca9e21fe35541433c2e16917'
    '167191fe2a143bae2f197218949fbe5b2195726a'='b15f7f490a6face44c69ab6b8565dfe594eb1894'
    '295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d'='dc9804cdae03d8627a89980dbcdf2292d2055372'
    'fb92eb3331cd1aac2e918603f449aadbd177935c'='86db75f79444b02c972ba4771244950cbec41b38'
  }
  foreach($entry in $replacements.GetEnumerator()){ if(-not $source.Contains($entry.Key)){ throw "missing identity token $($entry.Key)" }; $source=$source.Replace($entry.Key,$entry.Value) }
  Write-NoBom $tempPath $source
  $errors=$null
  [System.Management.Automation.Language.Parser]::ParseFile($tempPath,[ref]$null,[ref]$errors)|Out-Null
  if($errors.Count -ne 0){ throw ($errors|Format-List|Out-String) }
  & pwsh -NoProfile -File $tempPath -ExpectedSha $ExpectedSha -ExpectedTree $ExpectedTree -EvidenceRoot $EvidenceRoot
  $code=$LASTEXITCODE
  Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
  exit $code
} catch { Remove-Item $tempPath -Force -ErrorAction SilentlyContinue; Bootstrap-Fail $_.Exception.Message }
