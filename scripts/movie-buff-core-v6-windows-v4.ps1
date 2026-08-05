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
  $m=[ordered]@{lane='movie-buff-core-v6-current3-windows-bootstrap';classification='FAIL';source_sha=$ExpectedSha;source_tree=$ExpectedTree;raw_composition_sha='88ea15071e5d8393adf54a947fef4afe6ac86630';raw_composition_tree='538590b96a4ce45f7ebe5f1220dd4db682bc8003';mov15_sha='597c5edf37c53a35a37168ad7e7899e7fe4c8225';mov15_tree='e094cb006a564ae48ef5cba1e99cc4716509ede6';failure_step=$Message;finished_at=[DateTime]::UtcNow.ToString('o')}
  Write-NoBom (Join-Path $EvidenceRoot 'bootstrap-metadata.json') (($m|ConvertTo-Json -Depth 4)+"`n")
  $lines=Get-ChildItem $EvidenceRoot -File|Where-Object Name -ne 'sha256.txt'|Sort-Object Name|ForEach-Object{"$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()) *$($_.Name)"}
  Write-NoBom (Join-Path $EvidenceRoot 'sha256.txt') (($lines-join "`n")+"`n")
  Write-Output 'MOVIE_BUFF_CORE_WINDOWS=FAIL'; exit 1
}
try {
  $source=Get-Content -LiteralPath $sourcePath -Raw
  $replacements=[ordered]@{
    '61a7ab96904323e1cb6dfae0e54e900d12a83db0'='88ea15071e5d8393adf54a947fef4afe6ac86630'
    '167191fe2a143bae2f197218949fbe5b2195726a'='538590b96a4ce45f7ebe5f1220dd4db682bc8003'
    '295a85fcf3935755fc6fa2e9cfc2e31e83e4fa1d'='597c5edf37c53a35a37168ad7e7899e7fe4c8225'
    'fb92eb3331cd1aac2e918603f449aadbd177935c'='e094cb006a564ae48ef5cba1e99cc4716509ede6'
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
