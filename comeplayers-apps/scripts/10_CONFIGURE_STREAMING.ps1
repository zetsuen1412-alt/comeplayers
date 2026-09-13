$ErrorActionPreference = "Stop"

$appsRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $appsRoot "apps\mobile"
$firebaseConfig = Join-Path $mobileRoot "google-services.json"

Write-Host "ComePlayers streaming setup" -ForegroundColor Cyan
Write-Host "Project: $appsRoot"

Set-Location $appsRoot

Write-Host "`n[1/3] Installing workspace dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install gagal." }

Write-Host "`n[2/3] Running TypeScript checks..." -ForegroundColor Yellow
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript check gagal." }

Write-Host "`n[3/3] Checking Android Firebase configuration..." -ForegroundColor Yellow
if (Test-Path $firebaseConfig) {
  Write-Host "google-services.json ditemukan." -ForegroundColor Green
} else {
  Write-Warning "google-services.json tidak ditemukan di $firebaseConfig"
  Write-Warning "Salin kembali file Firebase milik Anda sebelum membuat APK Android."
}

Write-Host "`nKonfigurasi kode selesai." -ForegroundColor Green
Write-Host "Desktop dev:"
Write-Host "  cd `"$appsRoot`""
Write-Host "  npm run desktop:dev"
Write-Host "`nAndroid development APK baru (wajib karena ada native WebRTC):"
Write-Host "  cd `"$mobileRoot`""
Write-Host "  npx eas-cli@latest build --platform android --profile development"
Write-Host "`nSesudah APK terpasang:"
Write-Host "  npx expo start --dev-client --clear"
