$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = [System.IO.Path]::GetFullPath((Join-Path $Root "apps\mobile"))
$Android = [System.IO.Path]::GetFullPath((Join-Path $Mobile "android"))
$Ios = [System.IO.Path]::GetFullPath((Join-Path $Mobile "ios"))
$ExpectedAndroid = "$Mobile\android"
$ExpectedIos = "$Mobile\ios"

if ($Android -ne $ExpectedAndroid) {
  throw "Lokasi Android generated tidak sesuai: $Android"
}

if ($Ios -ne $ExpectedIos) {
  throw "Lokasi iOS generated tidak sesuai: $Ios"
}

if (Test-Path -LiteralPath $Android) {
  Remove-Item -LiteralPath $Android -Recurse -Force
  Write-Host "[ComePlayers] Generated Android directory dibersihkan agar EAS menjalankan clean prebuild." -ForegroundColor DarkGray
}

if (Test-Path -LiteralPath $Ios) {
  Remove-Item -LiteralPath $Ios -Recurse -Force
  Write-Host "[ComePlayers] Generated iOS directory dibersihkan agar EAS menjalankan clean prebuild." -ForegroundColor DarkGray
}
