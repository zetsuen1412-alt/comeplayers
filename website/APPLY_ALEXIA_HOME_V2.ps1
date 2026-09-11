$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Host "ERROR: ZIP harus diekstrak langsung ke folder website yang memiliki package.json." -ForegroundColor Red
    Write-Host "Folder saat ini: $root" -ForegroundColor Yellow
    exit 1
}

$required = @(
    "app\HomeClient.tsx",
    "app\home.module.css",
    "public\alexia\idle.webp",
    "public\alexia\chat-hover.webp",
    "public\alexia\marketplace-hover.webp"
)

$missing = @()
foreach ($file in $required) {
    if (-not (Test-Path (Join-Path $root $file))) { $missing += $file }
}

if ($missing.Count -gt 0) {
    Write-Host "ERROR: File patch berikut belum ada:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host " - $_" }
    exit 1
}

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
    Remove-Item $nextDir -Recurse -Force
    Write-Host "Cache .next sudah dihapus." -ForegroundColor Green
}

Write-Host "Patch Alexia Home V2 terdeteksi dengan benar." -ForegroundColor Green
Write-Host "Sekarang jalankan: npm run dev" -ForegroundColor Cyan
Write-Host "Lalu buka http://localhost:3000 dan tekan Ctrl+F5." -ForegroundColor Cyan
