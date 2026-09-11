$ErrorActionPreference = "Stop"

$websiteRoot = Split-Path -Parent $PSScriptRoot
$pagePath = Join-Path $websiteRoot "app\admin\games\page.tsx"
$componentPath = Join-Path $websiteRoot "components\admin\GameCsvTools.tsx"
$routePath = Join-Path $websiteRoot "app\api\admin\games\csv\route.ts"

Write-Host "ComePlayers Game CSV Tools" -ForegroundColor Cyan
Write-Host "Website: $websiteRoot"

foreach ($requiredPath in @($pagePath, $componentPath, $routePath)) {
  if (!(Test-Path $requiredPath)) {
    throw "File tidak ditemukan: $requiredPath"
  }
}

$content = [System.IO.File]::ReadAllText($pagePath)
$backupPath = "$pagePath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $pagePath $backupPath -Force
Write-Host "Backup: $backupPath" -ForegroundColor DarkGray

$importLine = 'import GameCsvTools from "@/components/admin/GameCsvTools";'

if ($content -notmatch [regex]::Escape($importLine)) {
  if ($content -match '^\s*"use client";') {
    $replacement = '"use client";' + [Environment]::NewLine + [Environment]::NewLine + $importLine
    $content = $content -replace '^\s*"use client";', $replacement
  } else {
    $content = $importLine + [Environment]::NewLine + $content
  }
}

if ($content -notmatch '<GameCsvTools\s*/>') {
  $lastMainClose = $content.LastIndexOf("</main>")
  if ($lastMainClose -lt 0) {
    throw "Tag </main> tidak ditemukan di app/admin/games/page.tsx."
  }

  $insertion = "      <GameCsvTools />" + [Environment]::NewLine + "    "
  $content = $content.Insert($lastMainClose, $insertion)
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($pagePath, $content, $utf8NoBom)

Write-Host "CSV Import/Export berhasil dipasang." -ForegroundColor Green
Write-Host "Selanjutnya jalankan:" -ForegroundColor Yellow
Write-Host "  cd `"$websiteRoot`""
Write-Host "  npm run typecheck"
Write-Host "  npm run build"
