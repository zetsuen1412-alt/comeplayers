param(
  [string]$Message = "ComePlayers automatic update",
  [ValidateSet("development", "preview", "production")]
  [string]$Channel = "production",
  [string]$Environment = "production",
  [ValidateRange(0, 100)]
  [int]$RolloutPercentage = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"

Push-Location $Mobile
try {
  & npx.cmd eas-cli@latest whoami
  if ($LASTEXITCODE -ne 0) {
    throw "Login Expo belum aktif. Jalankan npx eas-cli@latest login."
  }

  $EffectiveRollout = $RolloutPercentage
  if ($EffectiveRollout -eq 0) {
    $EffectiveRollout = if ($Channel -eq "production") { 25 } else { 100 }
  }

  foreach ($TargetPlatform in @("android", "ios")) {
    Write-Host "Menerbitkan OTA untuk $TargetPlatform..." -ForegroundColor Cyan
    $UpdateArguments = @(
      "eas-cli@latest",
      "update",
      "--platform", $TargetPlatform,
      "--channel", $Channel,
      "--message", $Message,
      "--environment", $Environment
    )
    if ($EffectiveRollout -lt 100) {
      $UpdateArguments += @("--rollout-percentage", $EffectiveRollout)
    }

    & npx.cmd @UpdateArguments
    if ($LASTEXITCODE -ne 0) {
      throw "Publikasi $TargetPlatform OTA update gagal."
    }
  }
}
finally {
  Pop-Location
}

Write-Host "Android dan iOS OTA update dipublikasikan ke channel '$Channel'." -ForegroundColor Green
Write-Host "Rollout awal: $EffectiveRollout%." -ForegroundColor Green
Write-Host "Aplikasi akan memeriksa, mengunduh, dan menerapkan update secara otomatis." -ForegroundColor Cyan
