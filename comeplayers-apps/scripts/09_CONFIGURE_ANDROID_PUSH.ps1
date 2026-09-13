$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appsRoot = Split-Path -Parent $scriptDir
$mobileDir = Join-Path $appsRoot "apps\mobile"
$appJsonPath = Join-Path $mobileDir "app.json"
$googleServicesPath = Join-Path $mobileDir "google-services.json"

if (-not (Test-Path $googleServicesPath)) {
  throw "File google-services.json belum ditemukan. Letakkan file dari Firebase di: $googleServicesPath"
}

$config = Get-Content $appJsonPath -Raw | ConvertFrom-Json
if (-not $config.expo.android) {
  $config.expo | Add-Member -NotePropertyName android -NotePropertyValue ([pscustomobject]@{})
}

$config.expo.android | Add-Member `
  -NotePropertyName googleServicesFile `
  -NotePropertyValue "./google-services.json" `
  -Force

$config | ConvertTo-Json -Depth 100 | Set-Content $appJsonPath -Encoding utf8

Push-Location $appsRoot
try {
  npm install
  Push-Location $mobileDir
  try {
    npx expo prebuild --platform android
  }
  finally {
    Pop-Location
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Konfigurasi Android push notification selesai." -ForegroundColor Green
Write-Host "Berikutnya upload FCM V1 service-account key dengan EAS Credentials, lalu buat development build."
