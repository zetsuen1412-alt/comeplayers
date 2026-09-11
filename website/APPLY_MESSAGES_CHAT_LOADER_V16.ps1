$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pagePath = Join-Path $root "app\messages\page.tsx"

if (-not (Test-Path $pagePath)) {
  Write-Host "ERROR: app\messages\page.tsx tidak ditemukan." -ForegroundColor Red
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$pagePath.before-loader-v16-$timestamp.bak"
Copy-Item $pagePath $backupPath -Force
Write-Host "Backup dibuat: $backupPath" -ForegroundColor DarkGray

$content = Get-Content $pagePath -Raw
$newImport = 'import MessagesChatLoaderV16 from "@/components/messages/MessagesChatLoaderV16";'

# Remove the previous V15 loader import when present.
$content = $content -replace '(?m)^import MessagesLoadingOperatorV15 from "@/components/messages/MessagesLoadingOperatorV15";\r?\n', ''

if ($content -notmatch [regex]::Escape($newImport)) {
  $content = $content -replace '"use client";\r?\n', "`"use client`";`r`n`r`n$newImport`r`n"
}

$replacement = @"
  if (loading) {
    return <MessagesChatLoaderV16 />;
  }
"@

$replaced = $false

# Supports projects that already installed V15.
$v15Pattern = '(?s)\s{2}if \(loading\) \{\s*return <MessagesLoadingOperatorV15\s*/>;\s*\}'
if ([regex]::IsMatch($content, $v15Pattern)) {
  $content = [regex]::Replace($content, $v15Pattern, $replacement, 1)
  $replaced = $true
}

# Supports the original text-only loader.
if (-not $replaced) {
  $oldPattern = '(?s)\s{2}if \(loading\) \{\s*return \(\s*<main[^>]*>.*?Loading ComePlayers servers\.\.\..*?</main>\s*\);\s*\}'
  if ([regex]::IsMatch($content, $oldPattern)) {
    $content = [regex]::Replace($content, $oldPattern, $replacement, 1)
    $replaced = $true
  }
}

# Idempotent re-install.
if (-not $replaced -and $content -match 'return <MessagesChatLoaderV16\s*/>;') {
  $replaced = $true
}

if (-not $replaced) {
  Write-Host "ERROR: Blok loading Messages tidak ditemukan. File asli dikembalikan." -ForegroundColor Red
  Copy-Item $backupPath $pagePath -Force
  exit 1
}

Set-Content -Path $pagePath -Value $content -Encoding UTF8

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "Cache .next dihapus." -ForegroundColor DarkGray
}

Write-Host "MESSAGES CHAT LOADER V16 BERHASIL DIPASANG." -ForegroundColor Green
