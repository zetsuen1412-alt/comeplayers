param(
  [switch]$Latest
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root "apps\mobile"

Push-Location $Mobile
try {
  Write-Host "[ComePlayers] Upload target: Apple App Store Connect." -ForegroundColor Yellow
  Write-Host "Bundle identifier: com.comeplayers.app" -ForegroundColor DarkGray

  $arguments = @(
    "eas-cli@latest",
    "submit",
    "--platform",
    "ios",
    "--profile",
    "production"
  )
  if ($Latest) {
    $arguments += "--latest"
  }

  & npx.cmd @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Apple App Store submission failed."
  }
}
finally {
  Pop-Location
}

Write-Host "iOS build uploaded to Apple App Store Connect." -ForegroundColor Green
