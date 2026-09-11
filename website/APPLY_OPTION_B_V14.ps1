$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "_backup_home_before_option_b_v14_$stamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

foreach ($file in @("app\page.tsx", "app\HomeClient.tsx", "app\home.module.css")) {
  $source = Join-Path $root $file
  if (Test-Path $source) {
    $target = Join-Path $backup ([IO.Path]::GetFileName($file))
    Copy-Item $source $target -Force
  }
}

$nextDir = Join-Path $root ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
}

Write-Host "COMEPLAYERS OPTION B V14 BERHASIL DIPASANG." -ForegroundColor Green
Write-Host "Backup homepage disimpan di: $backup" -ForegroundColor DarkGray
