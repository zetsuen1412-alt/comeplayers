param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
$PatchRoot = Join-Path $PSScriptRoot "patch\website"

if (-not $ProjectRoot) {
  $ProjectRoot = Read-Host "Masukkan lokasi folder proyek Comeplayers-new"
}

$ProjectRoot = $ProjectRoot.Trim('"').Trim()
$Candidates = @(
  (Join-Path $ProjectRoot "website"),
  (Join-Path $ProjectRoot "Comeplayers-new\website"),
  $ProjectRoot
)

$WebsiteRoot = $null
foreach ($Candidate in $Candidates) {
  if (Test-Path (Join-Path $Candidate "app\messages\page.tsx")) {
    $WebsiteRoot = $Candidate
    break
  }
}

if (-not $WebsiteRoot) {
  throw "Folder website ComePlayers tidak ditemukan. Pilih folder Comeplayers-new atau folder website."
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Targets = @(
  "app\messages\page.tsx",
  "app\messages\messages.module.css"
)

foreach ($RelativePath in $Targets) {
  $Source = Join-Path $PatchRoot $RelativePath
  $Target = Join-Path $WebsiteRoot $RelativePath
  $Backup = "$Target.before-v59-$Timestamp.bak"

  if (-not (Test-Path $Source)) {
    throw "File patch tidak ditemukan: $Source"
  }

  if (Test-Path $Target) {
    Copy-Item $Target $Backup -Force
  }

  Copy-Item $Source $Target -Force
  Write-Host "Updated: $RelativePath" -ForegroundColor Green
}

Write-Host ""
Write-Host "V59 berhasil dipasang pada: $WebsiteRoot" -ForegroundColor Cyan
Write-Host "Jalankan npm run dev dari folder website, lalu buka /messages." -ForegroundColor Yellow
