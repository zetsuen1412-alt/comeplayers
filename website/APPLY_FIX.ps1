$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "ComePlayers - Memperbaiki tautan logo ke halaman utama" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js tidak ditemukan. Instal Node.js lalu jalankan ulang."
}

node ".\apply-logo-home-fix.mjs"
