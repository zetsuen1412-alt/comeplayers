param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$DownloadUrl,

  [string]$Notes = "Pembaruan ComePlayers terbaru.",
  [string]$Architecture = "windows-x86_64"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $Root "apps\desktop"
$TauriConfig = Join-Path $Desktop "src-tauri\tauri.conf.json"
$DesktopPackage = Join-Path $Desktop "package.json"
$CargoToml = Join-Path $Desktop "src-tauri\Cargo.toml"
$KeyPath = Join-Path $env:USERPROFILE ".comeplayers\desktop-update.key"
$ReleaseDirectory = Join-Path $Root "release\desktop\$Version"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  [System.IO.File]::WriteAllText($Path, $Value, $Utf8NoBom)
}

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha256.ComputeHash($stream)
      return ([System.BitConverter]::ToString($bytes)).Replace("-", "")
    }
    finally {
      $sha256.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  throw @"
Kunci signing updater belum ditemukan:
$KeyPath

Generate sekali saja dari folder comeplayers-apps:
npm run tauri --workspace @comeplayers/desktop -- signer generate -w `"$KeyPath`"

Simpan private key dengan aman. Public key yang dipakai build harus sama dengan pubkey di tauri.conf.json.
"@
}

if ($Version -notmatch '^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$') {
  throw "Version harus berupa SemVer, contoh 0.5.1"
}

# Synchronize desktop version numbers before building.
$tauri = Get-Content -Raw -Encoding UTF8 -LiteralPath $TauriConfig | ConvertFrom-Json
$tauri.version = $Version
Write-Utf8NoBom -Path $TauriConfig -Value ($tauri | ConvertTo-Json -Depth 20)

$package = Get-Content -Raw -Encoding UTF8 -LiteralPath $DesktopPackage | ConvertFrom-Json
$package.version = $Version
Write-Utf8NoBom -Path $DesktopPackage -Value ($package | ConvertTo-Json -Depth 20)

$cargo = Get-Content -Raw -Encoding UTF8 -LiteralPath $CargoToml
$cargo = [regex]::Replace($cargo, '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`"", 1)
Write-Utf8NoBom -Path $CargoToml -Value $cargo

Push-Location $Root
try {
  npm.cmd install --package-lock-only --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw "package-lock.json gagal diselaraskan."
  }
}
finally {
  Pop-Location
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw -LiteralPath $KeyPath
$BuildStartedAt = (Get-Date).ToUniversalTime()
Push-Location $Desktop
try {
  npm.cmd run tauri:build
  if ($LASTEXITCODE -ne 0) {
    throw "Build installer desktop gagal."
  }
}
finally {
  Pop-Location
}

$BundleRoot = Join-Path $Desktop "src-tauri\target\release\bundle"
$Installer = Get-ChildItem -LiteralPath $BundleRoot -Recurse -File |
  Where-Object { $_.Name -like '*-setup.exe' } |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not $Installer) {
  throw "Installer NSIS tidak ditemukan di $BundleRoot"
}

if ($Installer.LastWriteTimeUtc -lt $BuildStartedAt.AddSeconds(-5)) {
  throw "Installer yang ditemukan bukan hasil build terbaru: $($Installer.FullName)"
}

$ProductVersion = ([string]$Installer.VersionInfo.ProductVersion).Trim()
if ($ProductVersion -ne $Version) {
  throw "Versi installer tidak cocok. Diharapkan $Version, ditemukan $ProductVersion di $($Installer.Name)."
}

$ExpectedNamePart = "_${Version}_"
if (-not $Installer.Name.Contains($ExpectedNamePart)) {
  throw "Nama installer tidak memuat versi ${Version}: $($Installer.Name)"
}

$DownloadFileName = [System.IO.Path]::GetFileName(([Uri]$DownloadUrl).AbsolutePath)
if ($DownloadFileName -ne $Installer.Name) {
  throw "Nama file pada DownloadUrl ($DownloadFileName) harus sama dengan installer ($($Installer.Name))."
}

$SignaturePath = "$($Installer.FullName).sig"
if (-not (Test-Path -LiteralPath $SignaturePath)) {
  throw "Signature updater tidak ditemukan: $SignaturePath"
}

New-Item -ItemType Directory -Path $ReleaseDirectory -Force | Out-Null
Copy-Item -LiteralPath $Installer.FullName -Destination $ReleaseDirectory -Force
Copy-Item -LiteralPath $SignaturePath -Destination $ReleaseDirectory -Force

$Signature = (Get-Content -Raw -LiteralPath $SignaturePath).Trim()
$PublishedAt = (Get-Date).ToUniversalTime().ToString('o')
$SafeNotes = $Notes.Replace("`r", " ").Replace("`n", " ")

$EnvLines = @(
  "COMEPLAYERS_DESKTOP_UPDATE_VERSION=$Version",
  "COMEPLAYERS_DESKTOP_UPDATE_URL=$DownloadUrl",
  "COMEPLAYERS_DESKTOP_UPDATE_SIGNATURE=$Signature",
  "COMEPLAYERS_DESKTOP_UPDATE_NOTES=$SafeNotes",
  "COMEPLAYERS_DESKTOP_UPDATE_PUB_DATE=$PublishedAt"
)
$EnvFile = Join-Path $ReleaseDirectory "vercel-updater-environment.txt"
Write-Utf8NoBom -Path $EnvFile -Value (($EnvLines -join [Environment]::NewLine) + [Environment]::NewLine)

$Manifest = [ordered]@{
  version = $Version
  notes = $Notes
  pub_date = $PublishedAt
  platforms = [ordered]@{
    $Architecture = [ordered]@{
      signature = $Signature
      url = $DownloadUrl
    }
  }
}
$ManifestPath = Join-Path $ReleaseDirectory "latest.json"
Write-Utf8NoBom -Path $ManifestPath -Value ($Manifest | ConvertTo-Json -Depth 10)

$Hash = Get-Sha256Hex -Path $Installer.FullName
$HashFile = Join-Path $ReleaseDirectory "SHA256SUMS.txt"
Write-Utf8NoBom -Path $HashFile -Value ("$Hash  $($Installer.Name)" + [Environment]::NewLine)

Write-Host ""
Write-Host "Desktop updater release siap:" -ForegroundColor Green
Write-Host $ReleaseDirectory
Write-Host ""
Write-Host "1. Upload installer ke URL berikut:" -ForegroundColor Cyan
Write-Host $DownloadUrl
Write-Host "2. Tambahkan semua nilai dari file berikut ke Environment Variables deployment website:" -ForegroundColor Cyan
Write-Host $EnvFile
Write-Host "3. Deploy ulang website. Aplikasi versi lama akan update otomatis saat dibuka." -ForegroundColor Cyan
