$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pagePath = Join-Path $root "app\messages\page.tsx"

if (-not (Test-Path $pagePath)) {
  Write-Host "ERROR: app\messages\page.tsx tidak ditemukan." -ForegroundColor Red
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$pagePath.before-loading-v15-$timestamp.bak"
Copy-Item $pagePath $backupPath -Force
Write-Host "Backup dibuat: $backupPath" -ForegroundColor DarkGray

$content = Get-Content $pagePath -Raw
$importLine = 'import MessagesLoadingOperatorV15 from "@/components/messages/MessagesLoadingOperatorV15";'

if ($content -notmatch [regex]::Escape($importLine)) {
  $content = $content -replace '"use client";\r?\n', "`"use client`";`r`n`r`n$importLine`r`n"
}

$pattern = '(?s)\s{2}if \(loading\) \{\s*return \(\s*<main[^>]*>.*?Loading ComePlayers servers\.\.\..*?</main>\s*\);\s*\}'
$replacement = @"
  if (loading) {
    return <MessagesLoadingOperatorV15 />;
  }
"@

if (-not [regex]::IsMatch($content, $pattern)) {
  Write-Host "ERROR: Blok loading lama tidak ditemukan. File asli dikembalikan." -ForegroundColor Red
  Copy-Item $backupPath $pagePath -Force
  exit 1
}

$content = [regex]::Replace($content, $pattern, $replacement, 1)
Set-Content -Path $pagePath -Value $content -Encoding UTF8

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Cache .next dihapus." -ForegroundColor DarkGray
}

Write-Host "MESSAGES LOADING OPERATOR V15 BERHASIL DIPASANG." -ForegroundColor Green
