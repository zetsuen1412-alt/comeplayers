param(
  [switch]$Latest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"

Push-Location $Mobile
try {
  Write-Host "[ComePlayers] Upload target: Google Play internal testing." -ForegroundColor Yellow
  Write-Host "Package: com.comeplayers.app" -ForegroundColor DarkGray
  Write-Host "The Google Play service-account credential must already be stored in EAS." -ForegroundColor DarkGray

  $arguments = @(
    "eas-cli@latest",
    "submit",
    "--platform",
    "android",
    "--profile",
    "production"
  )
  if ($Latest) {
    $arguments += "--latest"
  }

  & npx.cmd @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Google Play submission failed."
  }
}
finally {
  Pop-Location
}

Write-Host "AAB uploaded to the Google Play internal testing track." -ForegroundColor Green
